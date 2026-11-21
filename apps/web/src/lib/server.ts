import { AuditService, RedisConfigBus, type ConfigBus } from '@syntra/core/web';
import { prisma } from '@syntra/db';
import type { ProjectAccess } from './access';

const g = globalThis as unknown as { __bus?: ConfigBus | null; __audit?: AuditService };

export const auditService = (g.__audit ??= new AuditService(prisma));

function bus(): ConfigBus | null {
  if (g.__bus !== undefined) return g.__bus;
  g.__bus = process.env.REDIS_URL ? new RedisConfigBus(process.env.REDIS_URL) : null;
  return g.__bus;
}

/** Après toute écriture de configuration : incrémente la révision et prévient bot + API (invalidation de cache temps réel). */
export async function publishConfigChange(projectId: string): Promise<void> {
  await prisma.project.update({ where: { id: projectId }, data: { configRevision: { increment: 1 } } });
  try {
    await bus()?.publish(projectId);
  } catch {
    /* Redis indisponible : le cache du bot expire de toute façon sous 60 s */
  }
}

export function recordAudit(
  a: ProjectAccess,
  e: { action: string; guildId?: string | null; entityType?: string; entityId?: string; before?: unknown; after?: unknown },
) {
  return auditService.record({
    projectId: a.project.id,
    guildId: e.guildId ?? null,
    actorType: 'USER',
    actorId: a.viewer.discordId,
    actorName: a.viewer.name,
    action: e.action,
    ...(e.entityType ? { entityType: e.entityType } : {}),
    ...(e.entityId ? { entityId: e.entityId } : {}),
    ...(e.before !== undefined ? { before: e.before } : {}),
    ...(e.after !== undefined ? { after: e.after } : {}),
  });
}

export type ActionResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

export const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
