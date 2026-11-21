import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { Redis } from 'ioredis';
import pino from 'pino';
import { z } from 'zod';
import { prisma } from '@syntra/db';
import { cipherFromEnv } from '@syntra/security';
import { AuditService, ConfigService, PlayerLookupService, RedisBridgeCommands, RedisConfigBus, RenameQueue, computeGuildHealth } from '@syntra/core';
import type { ModuleKey } from '@syntra/shared';
import { registerHandlers } from './handlers';
import type { BotContext } from './context';
import { TicketService } from './tickets/service';
import { ReportService } from './reports/service';
import { DouaneService } from './douane/service';
import { StatusService } from './status/service';
import { SyncRolesService } from './sync/service';
import { startWorker } from './worker';

const env = z
  .object({
    DISCORD_BOT_TOKEN: z.string().min(10),
    REDIS_URL: z.string().url(),
    LOG_LEVEL: z.string().default('info'),
  })
  .parse(process.env);

const log = pino({ level: env.LOG_LEVEL });

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages, GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Channel, Partials.Message],
  allowedMentions: { parse: [] }, // aucune mention automatique par défaut
});

await client.login(env.DISCORD_BOT_TOKEN);
await new Promise<void>((res) => (client.isReady() ? res() : client.once('clientReady', () => res())));

const redis = new Redis(env.REDIS_URL);
const bus = new RedisConfigBus(env.REDIS_URL);

const ctx = {
  client: client as Client<true>,
  prisma,
  config: new ConfigService(prisma, bus),
  audit: new AuditService(prisma),
  bridge: new RedisBridgeCommands(redis),
  players: new PlayerLookupService(prisma, cipherFromEnv()),
  log,
  renames: new RenameQueue(
    async (channelId, name) => {
      const ch = await client.channels.fetch(channelId);
      if (ch && 'setName' in ch) await ch.setName(name);
    },
    { debounceMs: 10_000, onError: (channelId, err) => log.warn({ err, channelId }, 'renommage de salon échoué') },
  ),
} as unknown as BotContext;
ctx.tickets = new TicketService(ctx);
ctx.reports = new ReportService(ctx);
ctx.douane = new DouaneService(ctx);

registerHandlers(ctx);
const worker = startWorker(ctx, env.REDIS_URL);
const status = new StatusService(ctx);
const syncRoles = new SyncRolesService(ctx);
status.start();
syncRoles.start();

/** Rapport de santé des permissions du bot par serveur (affiché dans le dashboard) */
async function refreshHealth() {
  const guilds = await prisma.guild.findMany();
  for (const g of guilds) {
    const present = client.guilds.cache.get(g.discordGuildId);
    const modules = await prisma.moduleInstance.findMany({ where: { OR: [{ guildId: g.id }, { projectId: g.projectId, guildId: null }], enabled: true } });
    const perms = present?.members.me?.permissions.bitfield ?? null;
    const report = computeGuildHealth(perms, modules.map((m) => m.moduleKey as ModuleKey));
    await prisma.guild.update({ where: { id: g.id }, data: { botPresent: !!present, healthReport: { ok: report.ok, missing: report.missing }, healthCheckedAt: new Date() } });
  }
}
await refreshHealth();
const healthTimer = setInterval(() => refreshHealth().catch((err) => log.warn({ err }, 'health check échoué')), 5 * 60_000);
client.on('guildCreate', () => void refreshHealth());
client.on('guildDelete', () => void refreshHealth());

log.info({ tag: client.user?.tag, guilds: client.guilds.cache.size }, 'bot prêt');

// Arrêt propre : on cesse de consommer, on draine les renommages, on ferme les connexions
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.once(sig, async () => {
    log.info({ sig }, 'arrêt en cours');
    clearInterval(healthTimer);
    status.stop();
    syncRoles.stop();
    await worker.close();
    ctx.renames.dispose();
    await client.destroy();
    await bus.close();
    redis.disconnect();
    await prisma.$disconnect();
    process.exit(0);
  });
}
