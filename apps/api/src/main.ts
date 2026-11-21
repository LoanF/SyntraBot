import { Redis } from 'ioredis';
import { z } from 'zod';
import { prisma } from '@syntra/db';
import {
  AuditService, BullJobQueue, ConfigService, RedisBridgeCommands, RedisConfigBus, RedisNonceStore, RedisRateLimiter, RestDiscordActions,
} from '@syntra/core';
import { cipherFromEnv } from '@syntra/security';
import { buildServer } from './server';

const env = z
  .object({
    API_PORT: z.coerce.number().int().default(4000),
    REDIS_URL: z.string().url(),
    DISCORD_BOT_TOKEN: z.string().min(10),
  })
  .parse(process.env);

const redis = new Redis(env.REDIS_URL);
const bus = new RedisConfigBus(env.REDIS_URL);
const jobs = new BullJobQueue(env.REDIS_URL);

const app = await buildServer({
  prisma,
  config: new ConfigService(prisma, bus),
  discord: new RestDiscordActions(env.DISCORD_BOT_TOKEN),
  cipher: cipherFromEnv(),
  nonces: new RedisNonceStore(redis),
  limiter: new RedisRateLimiter(redis),
  jobs,
  bridge: new RedisBridgeCommands(redis),
  audit: new AuditService(prisma),
});

await app.listen({ port: env.API_PORT, host: '0.0.0.0' });

// Arrêt propre : on cesse d'accepter, on draine, on ferme les connexions
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.once(sig, async () => {
    app.log.info({ sig }, 'arrêt en cours');
    await app.close();
    await jobs.close();
    await bus.close();
    redis.disconnect();
    await prisma.$disconnect();
    process.exit(0);
  });
}
