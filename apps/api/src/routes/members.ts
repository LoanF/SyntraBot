import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { NotFoundError, snowflake } from '@syntra/shared';
import { signedAuth } from '../auth';
import type { AppDeps } from '../deps';

export function memberRoutes(app: FastifyInstance, deps: AppDeps) {
  app.withTypeProvider<ZodTypeProvider>().get(
    '/v1/guilds/:guildId/members/:userId/check',
    {
      preValidation: signedAuth(deps, 'members:check'),
      schema: {
        tags: ['members'],
        summary: 'Vérifie la présence d’un membre sur un serveur Discord du projet',
        params: z.object({ guildId: snowflake, userId: snowflake }),
      },
    },
    async (req) => {
      const { guildId, userId } = req.params;
      const g = await deps.config.resolveGuild(guildId);
      // 404 uniforme : on ne révèle pas l'existence d'un serveur appartenant à un autre projet
      if (!g || g.projectId !== req.auth!.projectId) throw new NotFoundError('Serveur inconnu');
      const m = await deps.discord.getMember(guildId, userId);
      return { present: m !== null, roles: m?.roles ?? [] };
    },
  );
}
