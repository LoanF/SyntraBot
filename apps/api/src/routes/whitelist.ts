import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { Prisma } from '@syntra/db';
import { AppError, ValidationError, whitelistWebhook } from '@syntra/shared';
import { signedAuth } from '../auth';
import type { AppDeps } from '../deps';

type Body = z.infer<typeof whitelistWebhook>;

async function handleWhitelist(deps: AppDeps, projectId: string, keyId: string, body: Body) {
  const guild = await deps.prisma.guild.findFirst({ where: { projectId, isPrimary: true } });
  if (!guild) throw new AppError('Aucun serveur principal configuré', 'NO_PRIMARY_GUILD', 409);

  const mod = await deps.config.getModule(projectId, 'whitelist', guild.id);
  if (!mod.enabled) throw new AppError('Module whitelist désactivé', 'MODULE_DISABLED', 409);
  if (!mod.configured) throw new AppError('Module whitelist mal configuré', 'MODULE_MISCONFIGURED', 409);

  const member = await deps.discord.getMember(guild.discordGuildId, body.discordId);
  if (!member) throw new AppError('Membre absent du serveur Discord', 'MEMBER_NOT_FOUND', 404);

  const reason = `Whitelist ${body.decision} (clé ${keyId})`;
  let rolesApplied = 0;
  if (body.decision === 'accepted') {
    await deps.discord.addRoles(guild.discordGuildId, body.discordId, mod.config.acceptRoleIds, reason);
    await deps.discord.removeRoles(guild.discordGuildId, body.discordId, mod.config.removeRoleIdsOnAccept, reason);
    rolesApplied = mod.config.acceptRoleIds.length;
  } else {
    await deps.discord.addRoles(guild.discordGuildId, body.discordId, mod.config.refuseRoleIds, reason);
    rolesApplied = mod.config.refuseRoleIds.length;
  }

  let dmSent = false;
  if (mod.config.sendDm) {
    const content = await deps.config.message(projectId, body.decision === 'accepted' ? 'whitelist.accepted' : 'whitelist.refused', {
      user: `<@${body.discordId}>`,
      reason: body.reason ?? '—',
    });
    try {
      await deps.discord.sendDm(body.discordId, { content });
      dmSent = true;
    } catch {
      dmSent = false; // MP fermés : ne doit pas faire échouer la whitelist
    }
  }

  await deps.audit.record({
    projectId, guildId: guild.id, actorType: 'API_KEY', actorId: keyId, action: 'whitelist.decision',
    entityType: 'discordUser', entityId: body.discordId, after: { decision: body.decision, rolesApplied, dmSent },
  });
  return { ok: true as const, decision: body.decision, rolesApplied, dmSent };
}

export function whitelistRoutes(app: FastifyInstance, deps: AppDeps) {
  app.withTypeProvider<ZodTypeProvider>().post(
    '/v1/webhooks/whitelist',
    {
      preValidation: signedAuth(deps, 'webhooks:whitelist'),
      schema: {
        tags: ['webhooks'],
        summary: 'Notifie une décision de whitelist (acceptée/refusée)',
        description: 'Requête signée HMAC. En-tête `Idempotency-Key` obligatoire.',
        body: whitelistWebhook,
      },
    },
    async (req, reply) => {
      const { projectId, keyId } = req.auth!;
      const idem = req.headers['idempotency-key'];
      if (typeof idem !== 'string' || idem.length < 8 || idem.length > 128) throw new ValidationError('En-tête Idempotency-Key requis (8-128 caractères)');
      const payloadHash = createHash('sha256').update(req.rawBody).digest('hex');
      const endpoint = 'whitelist';

      try {
        await deps.prisma.webhookDelivery.create({ data: { projectId, apiKeyId: keyId, endpoint, idempotencyKey: idem, payloadHash } });
      } catch (e) {
        if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== 'P2002') throw e;
        const existing = await deps.prisma.webhookDelivery.findUniqueOrThrow({
          where: { projectId_endpoint_idempotencyKey: { projectId, endpoint, idempotencyKey: idem } },
        });
        if (existing.payloadHash !== payloadHash) throw new AppError('Idempotency-Key déjà utilisée avec un autre contenu', 'IDEMPOTENCY_CONFLICT', 409);
        if (existing.status !== 'FAILED') return reply.send({ ok: true, duplicate: true, status: existing.status });
        await deps.prisma.webhookDelivery.update({ where: { id: existing.id }, data: { status: 'RECEIVED', error: null } });
      }

      try {
        const result = await handleWhitelist(deps, projectId, keyId, req.body);
        await deps.prisma.webhookDelivery.updateMany({
          where: { projectId, endpoint, idempotencyKey: idem }, data: { status: 'PROCESSED', processedAt: new Date() },
        });
        return reply.send(result);
      } catch (err) {
        await deps.prisma.webhookDelivery.updateMany({
          where: { projectId, endpoint, idempotencyKey: idem },
          data: { status: 'FAILED', error: err instanceof Error ? err.message.slice(0, 500) : 'erreur' },
        });
        throw err;
      }
    },
  );
}
