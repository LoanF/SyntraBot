import type { FastifyRequest } from 'fastify';
import { RateLimitedError, SIGNATURE_HEADERS, UnauthorizedError } from '@syntra/shared';
import { aad, verifySignedRequest, type ApiKeyRecord } from '@syntra/security';
import type { AppDeps } from './deps';

async function loadKey(deps: AppDeps, keyId: string): Promise<ApiKeyRecord | null> {
  const row = await deps.prisma.apiKey.findUnique({ where: { keyId } });
  if (!row) return null;
  return {
    keyId: row.keyId,
    projectId: row.projectId,
    secret: deps.cipher.decrypt(row.secretEnc, aad.apiKey(row.projectId, row.keyId)),
    scopes: row.scopes,
    revokedAt: row.revokedAt,
    expiresAt: row.expiresAt,
    graceUntil: row.graceUntil,
    ipAllowlist: row.ipAllowlist,
    rateLimitPerMin: row.rateLimitPerMin,
  };
}

/**
 * Hook `preValidation` : authentifie la requête signée AVANT toute validation de schéma
 * (un appelant non authentifié ne doit rien apprendre sur les schémas). 401 uniforme.
 */
export function signedAuth(deps: AppDeps, scope: string) {
  return async (req: FastifyRequest): Promise<void> => {
    const result = await verifySignedRequest({
      headers: req.headers,
      method: req.method,
      pathQuery: req.url,
      body: req.rawBody,
      ip: req.ip,
      requiredScope: scope,
      nonces: deps.nonces,
      loadKey: (id) => loadKey(deps, id),
    });
    if (!result.ok) {
      req.log.warn({ reason: result.reason, ip: req.ip }, 'requête signée rejetée');
      throw new UnauthorizedError();
    }
    if (!(await deps.limiter.allow(`key:${result.key.keyId}`, result.key.rateLimitPerMin))) throw new RateLimitedError(60);
    req.auth = {
      projectId: result.key.projectId,
      keyId: result.key.keyId,
      secret: result.key.secret,
      nonce: String(req.headers[SIGNATURE_HEADERS.nonce]),
    };
    void deps.prisma.apiKey.update({ where: { keyId: result.key.keyId }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
  };
}
