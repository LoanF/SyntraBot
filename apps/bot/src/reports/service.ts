import { randomUUID } from 'node:crypto';
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, PermissionFlagsBits,
  type GuildMember, type Message, type ThreadChannel,
} from 'discord.js';
import type { Prisma, Report } from '@syntra/db';
import type { ReportEvent, ReportPayload } from '@syntra/core';
import { AppError, ForbiddenError, NotFoundError, type PlayerSnapshot } from '@syntra/shared';
import type { BotContext } from '../context';
import { loadPlayerSnapshot } from '../snapshot';

const COMMAND_TTL_MS = 10 * 60_000; // un report doit survivre à un redémarrage du serveur de jeu

type ReportsConfig = { channelId: string; staffRoleIds: string[]; mentionRoleId?: string | undefined; teleportButton: boolean };

interface GameContext {
  serverId?: number;
  uid?: number;
  coords?: { x: number; y: number; z: number };
  health?: number;
  armor?: number;
  weapon?: string | null;
  vehicle?: string | null;
  nearby?: { serverId: number; name: string; distance: number }[];
}

/**
 * Reports : créés UNIQUEMENT en jeu (≠ tickets). Discord est le miroir (fil staff) + la télécommande
 * (claim / clôture / réponses relayées vers le panel en jeu). La source de vérité de l'état est le jeu.
 */
export class ReportService {
  constructor(private ctx: BotContext) {}

  // ------------------------------------------------------------------ config & droits

  private async moduleConfig(projectId: string): Promise<ReportsConfig | null> {
    const mod = await this.ctx.config.getModule(projectId, 'reports');
    return mod.enabled && mod.configured ? mod.config : null;
  }

  isStaff(member: GuildMember, cfg: ReportsConfig): boolean {
    return member.permissions.has(PermissionFlagsBits.Administrator) || cfg.staffRoleIds.some((r) => member.roles.cache.has(r));
  }

  async byId(id: string): Promise<Report> {
    const r = await this.ctx.prisma.report.findUnique({ where: { id } });
    if (!r) throw new NotFoundError('Report introuvable');
    return r;
  }

  byThread(threadId: string) {
    return this.ctx.prisma.report.findUnique({ where: { threadId } });
  }

  /** Vérifie que `member` peut agir sur ce report (module actif + rôle staff) et retourne la config */
  async authorize(report: Report, member: GuildMember): Promise<ReportsConfig> {
    const cfg = await this.moduleConfig(report.projectId);
    if (!cfg || !this.isStaff(member, cfg)) throw new ForbiddenError();
    return cfg;
  }

  // ------------------------------------------------------------------ création (jeu -> Discord)

  async create(projectId: string, p: ReportPayload): Promise<void> {
    const { prisma, client, config } = this.ctx;
    const cfg = await this.moduleConfig(projectId);
    if (!cfg) return void this.ctx.log.warn({ projectId }, 'module reports inactif : report ignoré');
    if (await prisma.report.findUnique({ where: { projectId_externalId: { projectId, externalId: p.externalId } } })) return; // rejeu du job

    const channel = await client.channels.fetch(cfg.channelId);
    if (!channel || (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)) {
      throw new AppError('Salon staff des reports introuvable', 'CHANNEL_NOT_FOUND', 409);
    }
    const guild = await config.resolveGuild(channel.guildId);
    if (!guild || guild.projectId !== projectId) throw new ForbiddenError('Le salon des reports n’appartient pas à ce projet');

    const identifiers = [...new Set([p.identifier, ...p.identifiers])];
    const discordId = p.discordId ?? (await prisma.playerLink.findFirst({ where: { projectId, identifier: { in: identifiers } } }))?.discordId;
    const ticketsCfg = guild ? await config.getModule(projectId, 'tickets', guild.guildId) : null;
    const snapshot = await loadPlayerSnapshot(this.ctx, {
      projectId, identifiers, ...(discordId ? { discordId } : {}),
      ...(ticketsCfg?.enabled && ticketsCfg.configured && ticketsCfg.config.playerSheetUrlTemplate ? { sheetUrlTemplate: ticketsCfg.config.playerSheetUrlTemplate } : {}),
    });

    const reporterName = (discordId ? (await client.users.fetch(discordId).catch(() => null))?.username : undefined) ?? `ID ${p.serverId}`;
    const report = await prisma.report.create({
      data: {
        projectId, guildId: guild.guildId, externalId: p.externalId, reason: p.reason, reporterName,
        reporterIdentifier: p.identifier, serverId: p.serverId,
        ...(discordId ? { reporterDiscordId: discordId } : {}),
        ...(p.uid ? { reporterUid: p.uid } : {}),
        gameContext: { coords: p.coords, health: p.health, armor: p.armor, weapon: p.weapon, vehicle: p.vehicle, nearby: p.nearby, serverId: p.serverId, ...(p.uid ? { uid: p.uid } : {}) },
        ...(snapshot ? { playerSnapshot: snapshot } : {}),
        messages: { create: { projectId, kind: 'PLAYER', source: 'GAME', authorName: reporterName, content: p.reason } },
      },
    });

    try {
      const view = await this.render(report, cfg);
      const main = await channel.send({
        ...view,
        ...(cfg.mentionRoleId ? { content: `<@&${cfg.mentionRoleId}>`, allowedMentions: { roles: [cfg.mentionRoleId] } } : {}),
      });
      const thread = await main.startThread({ name: `#${p.externalId} · ${reporterName}`.slice(0, 100), autoArchiveDuration: 1440 });
      await prisma.report.update({ where: { id: report.id }, data: { channelId: channel.id, mainMessageId: main.id, threadId: thread.id } });
    } catch (err) {
      await prisma.report.delete({ where: { id: report.id } }); // pas de report fantôme sans fil : le job sera rejoué
      throw err;
    }
  }

  // ------------------------------------------------------------------ rendu

  private async render(report: Report, cfg: ReportsConfig) {
    const { config } = this.ctx;
    const msg = (key: string, vars: Record<string, string | number> = {}) => config.message(report.projectId, key, vars);
    const game = report.gameContext as GameContext | null;
    const color = report.status === 'CLOSED' ? 0x6f6d85 : report.status === 'CLAIMED' ? 0x3ecf8e : 0xf2555a;

    const statusLine =
      report.status === 'CLOSED'
        ? await msg('report.status.closed', { staff: report.closedByName ?? '—', reason: report.resolution || '—' })
        : report.status === 'CLAIMED'
          ? await msg('report.status.claimed', { staff: report.claimedByName ?? '—' })
          : await msg('report.status.open');

    const embed = new EmbedBuilder()
      .setTitle(await msg('report.title', { externalId: report.externalId }))
      .setColor(color)
      .setDescription(statusLine)
      .addFields(
        { name: await msg('report.reporter'), value: [report.reporterName, report.reporterDiscordId ? `<@${report.reporterDiscordId}>` : null].filter(Boolean).join(' · '), inline: true },
        { name: await msg('ticket.game.ids', { uid: report.reporterUid ?? '—', serverId: report.serverId ?? '—' }), value: `\`${report.reporterIdentifier}\``.slice(0, 200), inline: true },
        { name: await msg('report.reason'), value: report.reason.slice(0, 1024) },
      );
    if (game?.coords) {
      embed.addFields(
        { name: await msg('ticket.game.position'), value: `${game.coords.x.toFixed(1)}, ${game.coords.y.toFixed(1)}, ${game.coords.z.toFixed(1)}`, inline: true },
        { name: await msg('ticket.game.vitals'), value: `${game.health ?? '—'} / ${game.armor ?? '—'}`, inline: true },
        { name: await msg('ticket.game.gear'), value: `${game.weapon ?? '—'} / ${game.vehicle ?? '—'}`, inline: true },
        { name: await msg('ticket.game.nearby'), value: (game.nearby ?? []).map((n) => `[${n.serverId}] ${n.name} (${Math.round(n.distance)}m)`).join('\n').slice(0, 1024) || '—' },
      );
    }
    const snap = report.playerSnapshot as PlayerSnapshot | null;
    if (snap) {
      const lines = [
        ...(await Promise.all(snap.characters.slice(0, 3).map((c) => msg('ticket.sheet.character', { name: c.name ?? '—', citizenId: c.citizenId, job: c.job ?? '—', cash: c.cash ?? 0, bank: c.bank ?? 0 })))),
        await msg('ticket.sheet.bans', { count: snap.activeBans }),
        await msg('ticket.sheet.warns', { count: snap.warns }),
        ...(snap.sheetUrl ? [await msg('ticket.sheet.link', { url: snap.sheetUrl })] : []),
      ];
      embed.addFields({ name: await msg('ticket.sheet.title'), value: lines.join('\n').slice(0, 1024) });
    }

    const btn = async (action: string, key: string, style: ButtonStyle) =>
      new ButtonBuilder().setCustomId(`r:${action}:${report.id}`).setLabel(await msg(key)).setStyle(style);
    const row =
      report.status === 'CLOSED'
        ? []
        : [
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              await btn(report.status === 'CLAIMED' ? 'release' : 'claim', report.status === 'CLAIMED' ? 'report.btn.release' : 'report.btn.claim', ButtonStyle.Primary),
              ...(cfg.teleportButton ? [await btn('tp', 'report.btn.teleport', ButtonStyle.Secondary)] : []),
              await btn('close', 'report.btn.close', ButtonStyle.Danger),
            ),
          ];
    return { embeds: [embed], components: row };
  }

  private async refresh(report: Report) {
    if (!report.channelId || !report.mainMessageId) return;
    const cfg = await this.moduleConfig(report.projectId);
    if (!cfg) return;
    const channel = await this.ctx.client.channels.fetch(report.channelId).catch(() => null);
    if (!channel?.isTextBased()) return;
    const main = await channel.messages.fetch(report.mainMessageId).catch(() => null);
    await main?.edit(await this.render(report, cfg)).catch(() => undefined);
  }

  private async thread(report: Report): Promise<ThreadChannel | null> {
    if (!report.threadId) return null;
    const t = await this.ctx.client.channels.fetch(report.threadId).catch(() => null);
    return t?.isThread() ? t : null;
  }

  private async say(report: Report, key: string, vars: Record<string, string | number>) {
    const t = await this.thread(report);
    await t?.send({ content: await this.ctx.config.message(report.projectId, key, vars), allowedMentions: { parse: [] } });
  }

  // ------------------------------------------------------------------ jeu -> Discord (événements)

  async onGameEvent(projectId: string, ev: ReportEvent): Promise<void> {
    const { prisma } = this.ctx;
    const report = await prisma.report.findUnique({ where: { projectId_externalId: { projectId, externalId: ev.externalId } } });
    // L'événement peut devancer le job de création : on laisse BullMQ rejouer (backoff exponentiel)
    if (!report) throw new Error(`report ${ev.externalId} pas encore créé`);
    if (report.status === 'CLOSED') return;

    if (ev.type === 'message') {
      if (ev.kind === 'system' || !ev.text.trim()) return;
      await prisma.reportMessage.create({ data: { reportId: report.id, projectId, kind: ev.kind === 'player' ? 'PLAYER' : 'STAFF', source: 'GAME', authorName: ev.author, content: ev.text } });
      await this.say(report, 'report.relay.game', { author: ev.author, content: ev.text.slice(0, 1800) });
      return;
    }

    if (ev.type === 'claim') {
      if (report.status === 'CLAIMED' && report.claimedByName === ev.author) return; // écho d'une action Discord
      const next = await prisma.report.update({ where: { id: report.id }, data: { status: 'CLAIMED', claimedByName: ev.author, claimedByDiscordId: null } });
      await this.refresh(next);
      return this.say(next, 'report.relay.system', { content: `${ev.author} ↳ claim` });
    }
    if (ev.type === 'release') {
      if (report.status === 'OPEN') return;
      const next = await prisma.report.update({ where: { id: report.id }, data: { status: 'OPEN', claimedByName: null, claimedByDiscordId: null } });
      await this.refresh(next);
      return;
    }
    // close
    await this.markClosed(report, ev.author, ev.text, null);
  }

  private async markClosed(report: Report, byName: string, resolution: string, byDiscordId: string | null) {
    const closed = await this.ctx.prisma.report.updateMany({
      where: { id: report.id, status: { not: 'CLOSED' } },
      data: { status: 'CLOSED', closedAt: new Date(), closedByName: byName, resolution: resolution || null, ...(byDiscordId ? { claimedByDiscordId: byDiscordId } : {}) },
    });
    if (closed.count === 0) return;
    const next = await this.byId(report.id);
    await this.refresh(next);
    const t = await this.thread(next);
    await t?.setLocked(true).catch(() => undefined);
    await t?.setArchived(true).catch(() => undefined);
  }

  // ------------------------------------------------------------------ Discord -> jeu (actions staff)

  private async pushToGame(report: Report, action: 'message' | 'claim' | 'release' | 'close', actor: GuildMember, text?: string) {
    await this.ctx.bridge.push(report.projectId, {
      id: randomUUID(), type: 'report', action, externalId: report.externalId,
      actor: { id: actor.id, name: actor.displayName }, ...(text ? { text } : {}), expiresAt: Date.now() + COMMAND_TTL_MS,
    });
  }

  async claim(reportId: string, member: GuildMember) {
    const report = await this.byId(reportId);
    await this.authorize(report, member);
    if (report.status === 'CLOSED') throw new AppError('Report déjà clôturé', 'CLOSED', 409);
    const res = await this.ctx.prisma.report.updateMany({
      where: { id: report.id, OR: [{ status: 'OPEN' }, { claimedByDiscordId: member.id }] },
      data: { status: 'CLAIMED', claimedByName: member.displayName, claimedByDiscordId: member.id },
    });
    if (res.count === 0) throw new AppError(`Déjà pris en charge par ${report.claimedByName ?? '—'}`, 'ALREADY_CLAIMED', 409);
    await this.pushToGame(report, 'claim', member);
    await this.refresh(await this.byId(report.id));
    await this.audit(report, member, 'report.claim');
  }

  async release(reportId: string, member: GuildMember) {
    const report = await this.byId(reportId);
    await this.authorize(report, member);
    if (report.status !== 'CLAIMED') return;
    await this.ctx.prisma.report.update({ where: { id: report.id }, data: { status: 'OPEN', claimedByName: null, claimedByDiscordId: null } });
    await this.pushToGame(report, 'release', member);
    await this.refresh(await this.byId(report.id));
    await this.audit(report, member, 'report.release');
  }

  async close(reportId: string, member: GuildMember, resolution: string) {
    const report = await this.byId(reportId);
    await this.authorize(report, member);
    if (report.status === 'CLOSED') return;
    await this.markClosed(report, member.displayName, resolution, member.id);
    await this.pushToGame(report, 'close', member, resolution);
    await this.audit(report, member, 'report.close', { resolution });
  }

  /** Message écrit par un staff dans le fil : enregistré, relayé dans le panel en jeu, auto-claim si libre. */
  async relayStaffMessage(report: Report, message: Message, member: GuildMember) {
    const cfg = await this.moduleConfig(report.projectId);
    if (!cfg || !this.isStaff(member, cfg) || report.status === 'CLOSED' || !message.content.trim()) return;
    await this.ctx.prisma.reportMessage.create({
      data: { reportId: report.id, projectId: report.projectId, kind: 'STAFF', source: 'DISCORD', authorName: member.displayName, authorDiscordId: member.id, content: message.content, discordMessageId: message.id },
    });
    if (report.status === 'OPEN') {
      const res = await this.ctx.prisma.report.updateMany({ where: { id: report.id, status: 'OPEN' }, data: { status: 'CLAIMED', claimedByName: member.displayName, claimedByDiscordId: member.id } });
      if (res.count) await this.refresh(await this.byId(report.id));
    }
    await this.pushToGame(report, 'message', member, message.content.slice(0, 600));
  }

  async teleport(reportId: string, member: GuildMember) {
    const report = await this.byId(reportId);
    const cfg = await this.authorize(report, member);
    if (!cfg.teleportButton) throw new ForbiddenError();
    const staffLink = await this.ctx.prisma.playerLink.findFirst({ where: { projectId: report.projectId, discordId: member.id } });
    if (!staffLink) throw new AppError('Votre compte Discord n’est pas lié à un joueur (connectez-vous une fois en jeu)', 'NO_LINK', 409);
    await this.ctx.bridge.push(report.projectId, {
      id: randomUUID(), type: 'teleport', staffIdentifier: staffLink.identifier, targetIdentifier: report.reporterIdentifier, expiresAt: Date.now() + 60_000,
    });
    await this.audit(report, member, 'report.teleport');
  }

  private audit(report: Report, member: GuildMember, action: string, after?: Prisma.InputJsonValue) {
    return this.ctx.audit.record({
      projectId: report.projectId, ...(report.guildId ? { guildId: report.guildId } : {}), actorType: 'USER', actorId: member.id, actorName: member.displayName,
      action, entityType: 'report', entityId: report.id, ...(after ? { after } : {}),
    });
  }
}
