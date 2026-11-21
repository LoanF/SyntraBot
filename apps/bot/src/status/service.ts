import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { OFFLINE, cfxJoinUrl, parseServerStatus, type ServerStatus } from '@syntra/core';
import { safeFetchBuffer } from '@syntra/security';
import type { BotContext } from '../context';

const TICK_MS = 15_000;

async function fetchJson(url: string): Promise<unknown> {
  const { body } = await safeFetchBuffer(url, { protocols: ['http:', 'https:'], allowPrivate: process.env.ALLOW_PRIVATE_STATUS === '1', timeoutMs: 4000, maxBytes: 512 * 1024 });
  return JSON.parse(body.toString('utf8'));
}

/** Embed de statut du serveur de jeu, édité en place à la fréquence configurée. */
export class StatusService {
  private lastRun = new Map<string, number>();
  private timer?: ReturnType<typeof setInterval>;
  constructor(private ctx: BotContext) {}

  start() {
    this.timer = setInterval(() => this.tick().catch((err) => this.ctx.log.warn({ err }, 'statut serveur : tick en échec')), TICK_MS);
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick() {
    const rows = await this.ctx.prisma.moduleInstance.findMany({ where: { moduleKey: 'status', enabled: true } });
    for (const row of rows) {
      const mod = await this.ctx.config.getModule(row.projectId, 'status');
      if (!mod.enabled || !mod.configured) continue;
      const due = (this.lastRun.get(row.id) ?? 0) + mod.config.refreshSeconds * 1000;
      if (Date.now() < due) continue;
      this.lastRun.set(row.id, Date.now());
      await this.refresh(row.projectId, mod.config).catch((err) => this.ctx.log.warn({ err, projectId: row.projectId }, 'statut serveur : mise à jour impossible'));
    }
  }

  private async read(base?: string): Promise<ServerStatus> {
    if (!base) return OFFLINE;
    try {
      const root = base.replace(/\/+$/, '');
      const [info, players] = await Promise.all([fetchJson(`${root}/info.json`), fetchJson(`${root}/players.json`)]);
      return parseServerStatus(info, players);
    } catch {
      return OFFLINE;
    }
  }

  private async refresh(projectId: string, cfg: { channelId: string; cfxJoinCode?: string | undefined; endpointBaseUrl?: string | undefined }) {
    const { config, prisma, client } = this.ctx;
    const s = await this.read(cfg.endpointBaseUrl);
    const msg = (key: string, vars: Record<string, string | number> = {}) => config.message(projectId, key, vars);

    const embed = new EmbedBuilder()
      .setTitle(s.hostname ?? (await msg('status.title')))
      .setColor(s.online ? 0x3ecf8e : 0xf2555a)
      .setDescription(s.online ? await msg('status.online') : await msg('status.offline'))
      .setTimestamp();
    if (s.online) embed.addFields({ name: await msg('status.players'), value: s.maxPlayers ? `${s.players} / ${s.maxPlayers}` : String(s.players), inline: true });
    const components = cfg.cfxJoinCode
      ? [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(await msg('status.join')).setURL(cfxJoinUrl(cfg.cfxJoinCode)))]
      : [];

    const channel = await client.channels.fetch(cfg.channelId).catch(() => null);
    if (!channel?.isTextBased() || channel.isDMBased()) return;

    const record = await prisma.moduleRecord.findFirst({ where: { projectId, moduleKey: 'status', collection: 'message' } });
    const saved = record?.data as { channelId?: string; messageId?: string } | undefined;
    if (saved?.channelId === cfg.channelId && saved.messageId) {
      const existing = await channel.messages.fetch(saved.messageId).catch(() => null);
      if (existing) return void (await existing.edit({ embeds: [embed], components }));
    }
    const sent = await channel.send({ embeds: [embed], components });
    const data = { channelId: cfg.channelId, messageId: sent.id };
    if (record) await prisma.moduleRecord.update({ where: { id: record.id }, data: { data } });
    else await prisma.moduleRecord.create({ data: { projectId, moduleKey: 'status', collection: 'message', data } });
  }
}
