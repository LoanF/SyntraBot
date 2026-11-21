import type { ActorType, Prisma, PrismaClient } from '@syntra/db';
import { redactSecrets } from '@syntra/security';

export interface AuditEntry {
  projectId: string;
  guildId?: string | null;
  actorType: ActorType;
  actorId?: string | null;
  actorName?: string | null;
  action: string; // "module.update", "rcon.execute", "apikey.rotate"…
  entityType?: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
  userAgent?: string;
}

export class AuditService {
  constructor(private prisma: PrismaClient) {}

  async record(e: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        projectId: e.projectId,
        guildId: e.guildId ?? null,
        actorType: e.actorType,
        actorId: e.actorId ?? null,
        actorName: e.actorName ?? null,
        action: e.action,
        entityType: e.entityType ?? null,
        entityId: e.entityId ?? null,
        ...(e.before === undefined ? {} : { before: redactSecrets(e.before) as Prisma.InputJsonValue }),
        ...(e.after === undefined ? {} : { after: redactSecrets(e.after) as Prisma.InputJsonValue }),
        ip: e.ip ?? null,
        userAgent: e.userAgent ?? null,
      },
    });
  }
}
