import type { PrismaClient } from '@prisma/client';

/** Modèles portant `projectId` : le filtre est injecté automatiquement (impossible à oublier). */
const TENANT_MODELS = new Set([
  'ModuleInstance', 'AccessPolicy', 'ApiKey', 'TicketPole', 'TicketStatus', 'TicketSnippet', 'Ticket',
  'TicketMessage', 'PlayerLink', 'DouaneSession', 'WebhookDelivery', 'EmbedTemplate',
  'RoleSyncRule', 'MessageTemplate', 'ModuleRecord', 'AuditLog', 'Guild', 'Report', 'ReportMessage',
]);

const WHERE_OPS = new Set([
  'findMany', 'findFirst', 'findFirstOrThrow', 'findUnique', 'findUniqueOrThrow', 'count', 'aggregate', 'groupBy',
  'updateMany', 'deleteMany', 'update', 'delete', 'upsert',
]);

type Args = { where?: Record<string, unknown>; data?: unknown; create?: Record<string, unknown> };

/**
 * Client lié à un projet. Toute lecture/écriture sur un modèle tenant est restreinte à `projectId`.
 * Les services métier ne reçoivent JAMAIS le client brut, seulement celui-ci.
 */
export function forProject(prisma: PrismaClient, projectId: string) {
  return prisma.$extends({
    name: 'tenant-isolation',
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          if (!TENANT_MODELS.has(model)) return query(args);
          const a = (args ?? {}) as Args;
          if (WHERE_OPS.has(operation)) a.where = { ...(a.where ?? {}), projectId };
          if (operation === 'create') a.data = { ...(a.data as object), projectId };
          if (operation === 'createMany') {
            const rows = (a.data as Record<string, unknown>[] | Record<string, unknown>);
            a.data = Array.isArray(rows) ? rows.map((r) => ({ ...r, projectId })) : { ...rows, projectId };
          }
          if (operation === 'upsert') a.create = { ...(a.create ?? {}), projectId };
          return query(a as typeof args);
        },
      },
    },
  });
}

export type TenantClient = ReturnType<typeof forProject>;
