import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, PermissionFlagsBits,
  type GuildMember, type Message, type TextChannel,
} from 'discord.js';
import type { Ticket, TicketPole, TicketStatus, TicketMessageKind, Prisma } from '@syntra/db';
import { buildChannelName, pickAutoStatus, type StatusEvent } from '@syntra/core';
import { AppError, ForbiddenError, NotFoundError, type PlayerSnapshot } from '@syntra/shared';
import type { BotContext } from '../context';

export type TicketWithRefs = Ticket & { pole: TicketPole; status: TicketStatus };

const STAFF_PERMS = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles];
const BOT_PERMS = [...STAFF_PERMS, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.EmbedLinks];

export interface CreateTicketInput {
  projectId: string;
  poleId: string;
  userDiscordId: string;
  username: string;
  answers: Record<string, string>;
  source: 'DISCORD_DM' | 'INGAME_REPORT';
  priority?: 'NORMAL' | 'HIGH' | 'URGENT';
  subject?: string;
  gameContext?: Prisma.InputJsonValue;
  /** license / license2 du joueur (report en jeu) ; sinon résolus via la liaison Discord */
  identifiers?: string[];
  playerSnapshot?: Prisma.InputJsonValue;
}

export class TicketService {
  constructor(private ctx: BotContext) {}

  // ----------------------------------------------------------------- lecture

  findByChannel(channelId: string): Promise<TicketWithRefs | null> {
    return this.ctx.prisma.ticket.findFirst({ where: { channelId }, include: { pole: true, status: true } });
  }

  async getOrThrow(id: string): Promise<TicketWithRefs> {
    const t = await this.ctx.prisma.ticket.findUnique({ where: { id }, include: { pole: true, status: true } });
    if (!t) throw new NotFoundError('Ticket introuvable');
    return t;
  }

  /** Ticket ouvert le plus récent d'un joueur (les MP y sont relayés) */
  latestOpenForUser(userDiscordId: string): Promise<TicketWithRefs | null> {
    return this.ctx.prisma.ticket.findFirst({
      where: { userDiscordId, closedAt: null, channelId: { not: null } },
      orderBy: { updatedAt: 'desc' },
      include: { pole: true, status: true },
    });
  }

  countOpenForUser(projectId: string, userDiscordId: string) {
    return this.ctx.prisma.ticket.count({ where: { projectId, userDiscordId, closedAt: null } });
  }

  // ----------------------------------------------------------------- création

  async create(input: CreateTicketInput): Promise<TicketWithRefs> {
    const { prisma, config, client } = this.ctx;
    const pole = await prisma.ticketPole.findUniqueOrThrow({ where: { id: input.poleId }, include: { guild: true, questions: true } });
    if (pole.projectId !== input.projectId || !pole.enabled) throw new ForbiddenError('Pôle indisponible');

    const mod = await config.getModule(input.projectId, 'tickets', pole.guildId);
    if (!mod.enabled || !mod.configured) throw new AppError('Module tickets inactif sur ce serveur', 'MODULE_DISABLED', 409);
    if ((await this.countOpenForUser(input.projectId, input.userDiscordId)) >= mod.config.maxOpenTicketsPerUser) {
      throw new AppError('limit_reached', 'TICKET_LIMIT', 429, { max: mod.config.maxOpenTicketsPerUser });
    }

    const snapshot = input.playerSnapshot ?? (await this.snapshotFor(input, mod.config.playerSheetUrlTemplate));
    const statuses = await config.getStatuses(input.projectId);
    const initial = statuses.find((s) => s.trigger === 'ON_CREATE') ?? statuses[0];
    if (!initial) throw new AppError('Aucun statut configuré', 'NO_STATUS', 409);

    const counter = await prisma.ticketCounter.update({ where: { projectId: input.projectId }, data: { last: { increment: 1 } } });
    const ticket = await prisma.ticket.create({
      data: {
        projectId: input.projectId, guildId: pole.guildId, poleId: pole.id, number: counter.last,
        userDiscordId: input.userDiscordId, username: input.username, statusId: initial.id,
        priority: input.priority ?? pole.defaultPriority, source: input.source, answers: input.answers,
        ...(input.subject ? { subject: input.subject } : {}),
        ...(input.gameContext ? { gameContext: input.gameContext } : {}),
        ...(snapshot ? { playerSnapshot: snapshot } : {}),
      },
    });

    try {
      const guild = await client.guilds.fetch(pole.guild.discordGuildId);
      const pattern = pole.channelPattern ?? mod.config.channelPattern;
      const channel = await guild.channels.create({
        name: buildChannelName(pattern, { emoji: initial.emoji, pole: pole.key, username: input.username, id: counter.last }),
        type: ChannelType.GuildText,
        topic: `ticket:${ticket.id}`,
        ...(pole.categoryChannelId ? { parent: pole.categoryChannelId } : {}),
        permissionOverwrites: [
          { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: client.user.id, allow: BOT_PERMS },
          ...pole.staffRoleIds.map((id) => ({ id, allow: STAFF_PERMS })),
        ],
      });
      const pinned = await channel.send(await this.openingMessage(ticket, pole, initial, input.answers));
      await pinned.pin().catch(() => undefined);
      await prisma.ticket.update({ where: { id: ticket.id }, data: { channelId: channel.id, pinnedMessageId: pinned.id } });
      await channel.send({ content: await config.message(input.projectId, 'ticket.channel.note_hint') });
    } catch (err) {
      await prisma.ticket.delete({ where: { id: ticket.id } }); // pas de ticket fantôme sans salon
      throw err;
    }

    await prisma.ticketStatusChange.create({ data: { ticketId: ticket.id, toStatusId: initial.id, actorType: 'SYSTEM', cause: 'ON_CREATE' } });
    return this.getOrThrow(ticket.id);
  }

  /** Fiche joueur depuis la BDD FiveM. Ne bloque JAMAIS l'ouverture d'un ticket (timeout + erreurs absorbées). */
  private async snapshotFor(input: CreateTicketInput, sheetUrlTemplate?: string): Promise<Prisma.InputJsonValue | undefined> {
    const opts = { discordId: input.userDiscordId, ...(sheetUrlTemplate ? { sheetUrlTemplate } : {}) };
    const lookup = input.identifiers?.length
      ? this.ctx.players.lookup(input.projectId, input.identifiers, opts)
      : this.ctx.players.lookupByDiscord(input.projectId, input.userDiscordId, sheetUrlTemplate);
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3500));
    try {
      const sheet = await Promise.race([lookup, timeout]);
      return (sheet ?? undefined) as Prisma.InputJsonValue | undefined;
    } catch (err) {
      this.ctx.log.warn({ err, projectId: input.projectId }, 'fiche joueur indisponible');
      return undefined;
    }
  }

  private async openingMessage(ticket: Ticket, pole: TicketPole & { questions: { key: string; label: string }[] }, status: TicketStatus, answers: Record<string, string>) {
    const { config, client } = this.ctx;
    const head = (key: string, vars: Record<string, string | number> = {}) => config.message(ticket.projectId, key, vars);
    const user = await client.users.fetch(ticket.userDiscordId).catch(() => null);
    const claimed = Boolean(ticket.claimedByDiscordId);
    const embed = new EmbedBuilder()
      .setTitle(`${status.emoji} #${ticket.number} · ${pole.emoji ? `${pole.emoji} ` : ''}${pole.label}`.slice(0, 256))
      .setColor(status.color as `#${string}`)
      .setDescription(await head('ticket.embed.opened', { when: `<t:${Math.floor(ticket.createdAt.getTime() / 1000)}:R>`, user: `<@${ticket.userDiscordId}>` }))
      .setFooter({ text: `${ticket.username} · ${ticket.userDiscordId}` })
      .setTimestamp(ticket.createdAt);
    if (user) embed.setThumbnail(user.displayAvatarURL({ size: 128 }));
    embed.addFields(
      { name: await head('ticket.embed.status'), value: `${status.emoji} ${status.label}`, inline: true },
      { name: await head('ticket.embed.priority'), value: await head(`ticket.priority.${ticket.priority}`), inline: true },
      { name: await head('ticket.embed.owner'), value: claimed ? `<@${ticket.claimedByDiscordId}>` : await head('ticket.embed.unclaimed'), inline: true },
      ...pole.questions.filter((q) => answers[q.key]).map((q) => ({ name: q.label.slice(0, 256), value: answers[q.key]!.slice(0, 1024) })),
    );
    const ctxGame = ticket.gameContext as { serverId?: number; uid?: number; coords?: { x: number; y: number; z: number }; health?: number; armor?: number; weapon?: string | null; vehicle?: string | null; nearby?: { serverId: number; name: string; distance: number }[] } | null;
    const msg = (key: string, vars: Record<string, string | number> = {}) => config.message(ticket.projectId, key, vars);
    if (ctxGame) {
      embed.addFields(
        { name: await msg('ticket.game.ids', { uid: ctxGame.uid ?? '—', serverId: ctxGame.serverId ?? '—' }), value: ticket.userDiscordId ? `<@${ticket.userDiscordId}>` : '—', inline: true },
        { name: await msg('ticket.game.position'), value: ctxGame.coords ? `${ctxGame.coords.x.toFixed(1)}, ${ctxGame.coords.y.toFixed(1)}, ${ctxGame.coords.z.toFixed(1)}` : '—', inline: true },
        { name: await msg('ticket.game.vitals'), value: `${ctxGame.health ?? '—'} / ${ctxGame.armor ?? '—'}`, inline: true },
        { name: await msg('ticket.game.gear'), value: `${ctxGame.weapon ?? '—'} / ${ctxGame.vehicle ?? '—'}`, inline: true },
        { name: await msg('ticket.game.nearby'), value: (ctxGame.nearby ?? []).map((n) => `[${n.serverId}] ${n.name} (${Math.round(n.distance)}m)`).join('\n').slice(0, 1024) || '—' },
      );
    }
    const snap = ticket.playerSnapshot as PlayerSnapshot | null;
    if (snap) {
      const lines = [
        ...(await Promise.all(snap.characters.slice(0, 5).map((c) => msg('ticket.sheet.character', { name: c.name ?? '—', citizenId: c.citizenId, job: c.job ?? '—', cash: c.cash ?? 0, bank: c.bank ?? 0 })))),
        await msg('ticket.sheet.bans', { count: snap.activeBans }),
        await msg('ticket.sheet.warns', { count: snap.warns }),
        ...(snap.sheetUrl ? [await msg('ticket.sheet.link', { url: snap.sheetUrl })] : []),
      ];
      embed.addFields({ name: await msg('ticket.sheet.title'), value: lines.join('\n').slice(0, 1024) });
    }

    const mk = async (id: string, key: string, style: ButtonStyle) =>
      new ButtonBuilder().setCustomId(`t:${id}:${ticket.id}`).setLabel(await config.message(ticket.projectId, key)).setStyle(style);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      claimed ? await mk('release', 'ticket.btn.release', ButtonStyle.Secondary) : await mk('claim', 'ticket.btn.claim', ButtonStyle.Primary),
      await mk('close', 'ticket.btn.close', ButtonStyle.Danger),
      ...(ctxGame ? [await mk('tp', 'ticket.btn.teleport', ButtonStyle.Secondary)] : []),
    );
    return { embeds: [embed], components: [row], allowedMentions: { parse: [] as never[] } };
  }

  // ----------------------------------------------------------------- messages

  /** Enregistre un message (texte uniquement : les fichiers sont interdits, les joueurs fournissent des liens). */
  async recordMessage(
    ticket: TicketWithRefs,
    kind: TicketMessageKind,
    msg: { content: string; authorId: string; authorName: string; authorAvatar?: string | null; discordMessageId?: string },
  ) {
    return this.ctx.prisma.ticketMessage.create({
      data: {
        ticketId: ticket.id, projectId: ticket.projectId, kind, content: msg.content, authorDiscordId: msg.authorId,
        authorName: msg.authorName, ...(msg.authorAvatar ? { authorAvatar: msg.authorAvatar } : {}),
        ...(msg.discordMessageId ? { discordMessageId: msg.discordMessageId } : {}), ...(ticket.channelId ? { channelId: ticket.channelId } : {}),
      },
    });
  }

  /** Joueur (MP) -> salon staff */
  async relayUserMessage(ticket: TicketWithRefs, message: Message) {
    // Fichiers interdits : on prévient le joueur et on ne relaie que le texte (il peut renvoyer un lien)
    if (message.attachments.size > 0) {
      await message.reply({ content: await this.ctx.config.message(ticket.projectId, 'ticket.dm.files_blocked'), allowedMentions: { parse: [] } }).catch(() => undefined);
      if (!message.content.trim()) return;
    }
    const channel = await this.channelOf(ticket);
    await channel.send({ content: `**${message.author.username}** : ${message.content}`.slice(0, 2000), allowedMentions: { parse: [] } });
    await this.recordMessage(ticket, 'PLAYER', {
      content: message.content, authorId: message.author.id, authorName: message.author.username,
      authorAvatar: message.author.displayAvatarURL(), discordMessageId: message.id,
    });
    await this.applyAutoStatus(ticket, 'ON_USER_REPLY');
    await this.ctx.prisma.ticket.update({ where: { id: ticket.id }, data: { updatedAt: new Date() } });
  }

  /** Staff -> joueur (public ou anonyme au nom du pôle) */
  async replyToPlayer(ticket: TicketWithRefs, staff: GuildMember, content: string, anonymous: boolean) {
    const { client, config } = this.ctx;
    const user = await client.users.fetch(ticket.userDiscordId);
    const text = await config.message(ticket.projectId, anonymous ? 'ticket.dm.anonymous_reply' : 'ticket.dm.staff_reply', {
      staff: staff.displayName, pole: ticket.pole.anonymousName ?? ticket.pole.label, content,
    });
    await user.send({ content: text.slice(0, 2000), allowedMentions: { parse: [] } });
    await this.recordMessage(ticket, anonymous ? 'STAFF_ANONYMOUS' : 'STAFF_PUBLIC', {
      content, authorId: staff.id, authorName: staff.displayName, authorAvatar: staff.displayAvatarURL(),
    });
    await this.applyAutoStatus(ticket, 'ON_STAFF_REPLY');
  }

  async recordInternalNote(ticket: TicketWithRefs, message: Message) {
    await this.recordMessage(ticket, 'INTERNAL_NOTE', {
      content: message.content, authorId: message.author.id, authorName: message.member?.displayName ?? message.author.username,
      authorAvatar: message.author.displayAvatarURL(), discordMessageId: message.id,
    });
  }

  // ----------------------------------------------------------------- statuts

  async applyAutoStatus(ticket: TicketWithRefs, event: StatusEvent) {
    const statuses = await this.ctx.config.getStatuses(ticket.projectId);
    const target = pickAutoStatus(statuses, ticket.status, event);
    if (target) await this.setStatus(ticket, target, 'BOT', null, event);
  }

  async setStatus(ticket: TicketWithRefs, target: TicketStatus, actorType: 'BOT' | 'USER', actorId: string | null, cause: string) {
    await this.ctx.prisma.ticket.update({ where: { id: ticket.id }, data: { statusId: target.id } });
    await this.ctx.prisma.ticketStatusChange.create({
      data: { ticketId: ticket.id, fromStatusId: ticket.statusId, toStatusId: target.id, actorType, actorId, cause },
    });
    if (ticket.channelId) {
      const mod = await this.ctx.config.getModule(ticket.projectId, 'tickets', ticket.guildId);
      if (mod.enabled && mod.configured) {
        const pattern = ticket.pole.channelPattern ?? mod.config.channelPattern;
        this.ctx.renames.schedule(
          ticket.channelId,
          buildChannelName(pattern, { emoji: target.emoji, pole: ticket.pole.key, username: ticket.username, id: ticket.number }),
          mod.config.renameDebounceMs,
        );
      }
    }
    await this.refreshOpening(ticket.id).catch(() => undefined); // statut et couleur de l'embed à jour
  }

  // ----------------------------------------------------------------- actions staff

  private isAdmin(staff: GuildMember) {
    return staff.permissions.has(PermissionFlagsBits.Administrator);
  }

  /** Ligne d'historique visible dans la conversation du dashboard (pas envoyée au joueur) */
  private systemLine(ticket: Ticket, content: string) {
    return this.ctx.prisma.ticketMessage.create({ data: { ticketId: ticket.id, projectId: ticket.projectId, kind: 'SYSTEM', content } });
  }

  /** Met à jour en place le message d'ouverture (responsable, statut, boutons). */
  async refreshOpening(ticketId: string) {
    const t = await this.getOrThrow(ticketId);
    if (!t.channelId || !t.pinnedMessageId) return;
    const channel = await this.channelOf(t).catch(() => null);
    const message = await channel?.messages.fetch(t.pinnedMessageId).catch(() => null);
    if (!message) return;
    const questions = await this.ctx.prisma.ticketQuestion.findMany({ where: { poleId: t.poleId } });
    await message.edit(await this.openingMessage(t, { ...t.pole, questions }, t.status, t.answers as Record<string, string>)).catch(() => undefined);
  }

  /**
   * Prise en charge : un seul responsable à la fois (mise à jour atomique, aucune course possible entre deux membres du staff).
   * Réservée à un ticket ouvert ; reprendre un ticket déjà à soi ne fait rien.
   */
  async claim(ticket: TicketWithRefs, staff: GuildMember) {
    const { prisma, config } = this.ctx;
    const cur = await this.getOrThrow(ticket.id);
    if (cur.closedAt) throw new AppError(await config.message(cur.projectId, 'ticket.err.closed'), 'CLOSED', 409);
    const res = await prisma.ticket.updateMany({
      where: { id: cur.id, closedAt: null, OR: [{ claimedByDiscordId: null }, { claimedByDiscordId: staff.id }] },
      data: { claimedByDiscordId: staff.id, claimedByName: staff.displayName, claimedAt: new Date() },
    });
    if (res.count === 0) {
      const fresh = await this.getOrThrow(cur.id);
      throw new AppError(await config.message(cur.projectId, 'ticket.err.claimed_by', { staff: fresh.claimedByName ?? '—' }), 'ALREADY_CLAIMED', 409);
    }
    if (cur.claimedByDiscordId === staff.id) return; // déjà à vous

    const channel = await this.channelOf(cur).catch(() => null);
    await channel?.send({ content: await config.message(cur.projectId, 'ticket.channel.claimed', { staff: `<@${staff.id}>` }), allowedMentions: { parse: [] } });
    await this.systemLine(cur, `${staff.displayName} a pris en charge le ticket`);
    // Le joueur est prévenu au nom du pôle (l'identité du membre du staff reste privée)
    const user = await this.ctx.client.users.fetch(cur.userDiscordId).catch(() => null);
    await user?.send(await config.message(cur.projectId, 'ticket.dm.claimed', { 'ticket.number': cur.number, pole: cur.pole.anonymousName ?? cur.pole.label })).catch(() => undefined);
    await this.refreshOpening(cur.id);
    await this.ctx.audit.record({ projectId: cur.projectId, guildId: cur.guildId, actorType: 'USER', actorId: staff.id, actorName: staff.displayName, action: 'ticket.claim', entityType: 'ticket', entityId: cur.id });
  }

  /** Relâcher : le responsable (ou un administrateur) rend le ticket disponible. */
  async release(ticket: TicketWithRefs, staff: GuildMember) {
    const { prisma, config } = this.ctx;
    const cur = await this.getOrThrow(ticket.id);
    if (!cur.claimedByDiscordId) return;
    if (cur.claimedByDiscordId !== staff.id && !this.isAdmin(staff)) {
      throw new AppError(await config.message(cur.projectId, 'ticket.err.not_owner', { staff: cur.claimedByName ?? '—' }), 'NOT_OWNER', 403);
    }
    await prisma.ticket.update({ where: { id: cur.id }, data: { claimedByDiscordId: null, claimedByName: null, claimedAt: null } });
    const channel = await this.channelOf(cur).catch(() => null);
    await channel?.send({ content: await config.message(cur.projectId, 'ticket.channel.released', { staff: `<@${staff.id}>` }), allowedMentions: { parse: [] } });
    await this.systemLine(cur, `${staff.displayName} a relâché le ticket`);
    await this.refreshOpening(cur.id);
    await this.ctx.audit.record({ projectId: cur.projectId, guildId: cur.guildId, actorType: 'USER', actorId: staff.id, actorName: staff.displayName, action: 'ticket.release', entityType: 'ticket', entityId: cur.id });
  }

  /**
   * Droit de répondre au joueur. Avec « un seul responsable » : la 1re réponse sur un ticket libre le prend en charge,
   * et si un autre membre l'a déjà, la réponse est refusée (sauf administrateur).
   */
  async ensureCanReply(ticket: TicketWithRefs, staff: GuildMember) {
    const mod = await this.ctx.config.getModule(ticket.projectId, 'tickets', ticket.guildId);
    if (mod.enabled && mod.configured && !mod.config.enforceClaim) return;
    const cur = await this.getOrThrow(ticket.id);
    if (cur.closedAt) throw new AppError(await this.ctx.config.message(cur.projectId, 'ticket.err.closed'), 'CLOSED', 409);
    if (!cur.claimedByDiscordId) return this.claim(cur, staff);
    if (cur.claimedByDiscordId !== staff.id && !this.isAdmin(staff)) {
      throw new AppError(await this.ctx.config.message(cur.projectId, 'ticket.err.claimed_by', { staff: cur.claimedByName ?? '—' }), 'ALREADY_CLAIMED', 409);
    }
  }

  async close(ticket: TicketWithRefs, staff: GuildMember, reason?: string) {
    const { prisma, config, client } = this.ctx;
    const statuses = await config.getStatuses(ticket.projectId);
    const terminal = statuses.find((s) => s.isTerminal);
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { closedAt: new Date(), closedByDiscordId: staff.id, ...(reason ? { closeReason: reason } : {}), ...(terminal ? { statusId: terminal.id } : {}) },
    });
    if (terminal) await prisma.ticketStatusChange.create({ data: { ticketId: ticket.id, fromStatusId: ticket.statusId, toStatusId: terminal.id, actorType: 'USER', actorId: staff.id, cause: 'close' } });

    // MP de clôture
    try {
      const user = await client.users.fetch(ticket.userDiscordId);
      await user.send({ content: await config.message(ticket.projectId, 'ticket.dm.closed', { 'ticket.number': ticket.number }) });
    } catch (err) {
      this.ctx.log.info({ err, ticket: ticket.id }, 'MP de clôture impossible (MP fermés ?)');
    }
    await this.ctx.audit.record({ projectId: ticket.projectId, guildId: ticket.guildId, actorType: 'USER', actorId: staff.id, action: 'ticket.close', entityType: 'ticket', entityId: ticket.id, after: { reason } });

    const mod = await config.getModule(ticket.projectId, 'tickets', ticket.guildId);
    const channel = await this.channelOf(ticket).catch(() => null);
    if (channel) {
      await channel.send({ content: await config.message(ticket.projectId, 'ticket.channel.closing', { staff: `<@${staff.id}>` }), allowedMentions: { parse: [] } });
      if (!mod.enabled || !mod.configured || mod.config.deleteChannelOnClose) {
        const delay = (mod.enabled && mod.configured ? mod.config.closeDeleteDelaySeconds : 10) * 1000;
        setTimeout(() => void channel.delete('Ticket clôturé').catch(() => undefined), delay);
        await prisma.ticket.update({ where: { id: ticket.id }, data: { channelId: null } });
      }
    }
  }

  /** Transfert inter-pôles / inter-serveurs : nouveau salon, historique conservé en base. */
  async transfer(ticket: TicketWithRefs, toPoleId: string, staff: GuildMember, note?: string) {
    const { prisma, config, client } = this.ctx;
    const to = await prisma.ticketPole.findUniqueOrThrow({ where: { id: toPoleId }, include: { guild: true } });
    if (to.projectId !== ticket.projectId || !to.enabled) throw new ForbiddenError('Pôle cible indisponible');
    if (to.id === ticket.poleId) throw new AppError('Le ticket est déjà dans ce pôle', 'SAME_POLE', 400);
    const mod = await config.getModule(ticket.projectId, 'tickets', to.guildId);
    if (!mod.enabled || !mod.configured) throw new AppError('Module tickets inactif sur le serveur cible', 'MODULE_DISABLED', 409);

    const oldChannelId = ticket.channelId;
    const guild = await client.guilds.fetch(to.guild.discordGuildId);
    const channel = await guild.channels.create({
      name: buildChannelName(to.channelPattern ?? mod.config.channelPattern, { emoji: ticket.status.emoji, pole: to.key, username: ticket.username, id: ticket.number }),
      type: ChannelType.GuildText,
      topic: `ticket:${ticket.id}`,
      ...(to.categoryChannelId ? { parent: to.categoryChannelId } : {}),
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: client.user.id, allow: BOT_PERMS },
        ...to.staffRoleIds.map((id) => ({ id, allow: STAFF_PERMS })),
      ],
    });
    const questions = await prisma.ticketQuestion.findMany({ where: { poleId: ticket.poleId } });
    const moved = { ...ticket, guildId: to.guildId, poleId: to.id, pole: to as TicketPole, claimedByDiscordId: null, claimedByName: null, claimedAt: null };
    const pinned = await channel.send(await this.openingMessage(moved, { ...to, questions }, ticket.status, ticket.answers as Record<string, string>));
    await pinned.pin().catch(() => undefined);
    await prisma.$transaction([
      prisma.ticket.update({ where: { id: ticket.id }, data: { guildId: to.guildId, poleId: to.id, channelId: channel.id, pinnedMessageId: pinned.id, claimedByDiscordId: null, claimedByName: null, claimedAt: null } }),
      prisma.ticketTransfer.create({ data: { ticketId: ticket.id, fromPoleId: ticket.poleId, toPoleId: to.id, fromGuildId: ticket.guildId, toGuildId: to.guildId, byDiscordId: staff.id, ...(note ? { note } : {}) } }),
    ]);
    if (oldChannelId) {
      const old = await client.channels.fetch(oldChannelId).catch(() => null);
      await old?.delete('Ticket transféré').catch(() => undefined);
    }
    await this.ctx.audit.record({ projectId: ticket.projectId, guildId: to.guildId, actorType: 'USER', actorId: staff.id, action: 'ticket.transfer', entityType: 'ticket', entityId: ticket.id, after: { from: ticket.poleId, to: to.id } });
  }

  // ----------------------------------------------------------------- utilitaires

  async channelOf(ticket: Ticket): Promise<TextChannel> {
    if (!ticket.channelId) throw new NotFoundError('Salon du ticket introuvable');
    const ch = await this.ctx.client.channels.fetch(ticket.channelId);
    if (!ch || ch.type !== ChannelType.GuildText) throw new NotFoundError('Salon du ticket introuvable');
    return ch;
  }

  /** Staff = détient un rôle du pôle, ou Administrator */
  isStaff(member: GuildMember, pole: TicketPole): boolean {
    return member.permissions.has(PermissionFlagsBits.Administrator) || pole.staffRoleIds.some((r) => member.roles.cache.has(r));
  }
}
