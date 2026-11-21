import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { jsonSchemaTransform, serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { AppError, RateLimitedError } from '@syntra/shared';
import type { AppDeps } from './deps';
import { bridgeRoutes } from './routes/bridge';
import { memberRoutes } from './routes/members';
import { whitelistRoutes } from './routes/whitelist';

export async function buildServer(deps: AppDeps, opts: { logger?: boolean } = {}) {
  const app = Fastify({ logger: opts.logger ?? true, bodyLimit: 256 * 1024, trustProxy: true });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(helmet);
  await app.register(swagger, {
    openapi: {
      info: { title: 'Syntra API', version: '1.0.0', description: 'API externe signée HMAC-SHA256 (sites vitrines, bot_bridge FiveM).' },
      components: {
        securitySchemes: {
          hmac: { type: 'apiKey', in: 'header', name: 'X-Syntra-Signature', description: 'Voir en-têtes X-Syntra-Key-Id / Timestamp / Nonce / Signature' },
        },
      },
      security: [{ hmac: [] }],
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  // Corps JSON gardé en brut : la signature porte sur les octets exacts reçus
  app.decorateRequest('rawBody');
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body: Buffer, done) => {
    req.rawBody = body;
    if (body.length === 0) return done(null, undefined);
    try {
      done(null, JSON.parse(body.toString('utf8')));
    } catch {
      done(Object.assign(new Error('JSON invalide'), { statusCode: 400 }), undefined);
    }
  });
  app.addHook('onRequest', async (req) => {
    req.rawBody = Buffer.alloc(0);
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof RateLimitedError) return reply.header('retry-after', err.retryAfterSec).code(429).send({ error: err.code, message: err.message });
    if (err instanceof AppError) {
      // Les 401 restent opaques
      return reply.code(err.status).send({ error: err.code, message: err.message, ...(err.status === 400 ? { details: err.details } : {}) });
    }
    const e = err as { validation?: unknown; statusCode?: number; message: string };
    if (e.validation) return reply.code(400).send({ error: 'VALIDATION_ERROR', message: 'Requête invalide', details: e.validation });
    if (e.statusCode && e.statusCode < 500) return reply.code(e.statusCode).send({ error: 'BAD_REQUEST', message: e.message });
    req.log.error({ err }, 'erreur non gérée');
    return reply.code(500).send({ error: 'INTERNAL', message: 'Erreur interne' });
  });

  app.get('/healthz', async () => ({ ok: true }));
  whitelistRoutes(app, deps);
  memberRoutes(app, deps);
  bridgeRoutes(app, deps);
  return app;
}
