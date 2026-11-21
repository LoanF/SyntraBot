import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { reportEvent, reportPayload, SIGNATURE_HEADERS, snowflake } from '@syntra/shared';
import { sign } from '@syntra/security';
import { signedAuth } from '../auth';
import type { AppDeps } from '../deps';

export function bridgeRoutes(app: FastifyInstance, deps: AppDeps) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    '/v1/bridge/report',
    {
      preValidation: signedAuth(deps, 'bridge:report'),
      schema: { tags: ['bridge'], summary: 'Nouveau report créé en jeu — ouvre un fil dans le salon staff (≠ ticket)', body: reportPayload },
    },
    async (req, reply) => {
      const { projectId } = req.auth!;
      await deps.jobs.enqueue({ type: 'report.create', projectId, report: req.body });
      return reply.code(202).send({ queued: true });
    },
  );

  typed.post(
    '/v1/bridge/report/event',
    {
      preValidation: signedAuth(deps, 'bridge:report'),
      schema: {
        tags: ['bridge'],
        summary: 'Événement d’un report existant en jeu (message, claim, release, close) — miroir vers le fil Discord',
        body: reportEvent,
      },
    },
    async (req, reply) => {
      await deps.jobs.enqueue({ type: 'report.event', projectId: req.auth!.projectId, event: req.body });
      return reply.code(202).send({ queued: true });
    },
  );

  typed.post(
    '/v1/bridge/link',
    {
      preValidation: signedAuth(deps, 'bridge:link'),
      schema: {
        tags: ['bridge'],
        summary: 'Associe un compte Discord aux identifiants FiveM du joueur connecté (appelé à la connexion)',
        body: z.object({ discordId: snowflake, identifiers: z.array(z.string().min(1).max(128)).min(1).max(10) }).strict(),
      },
    },
    async (req) => {
      const { projectId } = req.auth!;
      const { discordId, identifiers } = req.body;
      // Le dernier compte Discord vu pour un identifiant fait foi
      await deps.prisma.$transaction(
        identifiers.map((identifier) =>
          deps.prisma.playerLink.upsert({
            where: { projectId_identifier: { projectId, identifier } },
            update: { discordId },
            create: { projectId, identifier, discordId },
          }),
        ),
      );
      return { linked: identifiers.length };
    },
  );

  typed.get(
    '/v1/bridge/poll',
    {
      preValidation: signedAuth(deps, 'bridge:poll'),
      schema: {
        tags: ['bridge'],
        summary: 'Long-polling des commandes pour le bridge (ex. téléportation). Réponse signée.',
        querystring: z.object({ wait: z.coerce.number().int().min(0).max(25).default(20) }),
      },
    },
    async (req, reply) => {
      const { projectId, secret, nonce } = req.auth!;
      await deps.prisma.bridgeLink.upsert({
        where: { projectId },
        update: { lastSeenAt: new Date() },
        create: { projectId, lastSeenAt: new Date() },
      });
      const commands = await deps.bridge.pop(projectId, req.query.wait);
      const body = JSON.stringify({ commands });
      // Le bridge authentifie le serveur : même schéma de signature, lié au nonce de la requête
      const ts = Math.floor(Date.now() / 1000);
      const signature = sign(secret, { timestamp: ts, nonce, method: 'RESPONSE', pathQuery: req.url, body });
      return reply
        .header('x-syntra-response-timestamp', String(ts))
        .header('x-syntra-response-signature', signature)
        .header(SIGNATURE_HEADERS.nonce, nonce)
        .type('application/json')
        .send(body);
    },
  );
}
