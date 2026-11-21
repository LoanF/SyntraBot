import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, SlashCommandBuilder,
  type ButtonInteraction, type ChatInputCommandInteraction, type GuildMember, type VoiceState,
} from 'discord.js';
import { AppError, ForbiddenError } from '@syntra/shared';
import { sheetUrlFor } from '@syntra/core';
import type { BotContext } from '../context';

export const douaneCommand = new SlashCommandBuilder()
  .setName('douane')
  .setDescription('Décision sur un candidat de la douane vocale')
  .setDMPermission(false)
  .addSubcommand((s) => s.setName('accept').setDescription('Accepter un candidat').addUserOption((o) => o.setName('membre').setDescription('Candidat').setRequired(true)))
  .addSubcommand((s) => s.setName('refuse').setDescription('Refuser un candidat').addUserOption((o) => o.setName('membre').setDescription('Candidat').setRequired(true)));

type DouaneCfg = { waitingVoiceChannelIds: string[]; notifyChannelId: string; notifyRoleId?: string | undefined; candidateSheetUrlTemplate?: string | undefined; acceptRoleIds: string[]; removeRoleIds: string[] };

/**
 * Douane vocale : un candidat rejoint la salle d'attente -> notification aux douaniers avec lien vers sa fiche,
 * boutons Accepter / Refuser (ou /douane accept|refuse). Les douaniers = détenteurs du rôle de notification.
 */
export class DouaneService {
  constructor(private ctx: BotContext) {}

  private isDouanier(member: GuildMember, cfg: DouaneCfg) {
    return member.permissions.has(PermissionFlagsBits.Administrator) || (cfg.notifyRoleId ? member.roles.cache.has(cfg.notifyRoleId) : false);
  }

  private async config(discordGuildId: string) {
    const guild = await this.ctx.config.resolveGuild(discordGuildId);
    if (!guild) return null;
    const mod = await this.ctx.config.getModule(guild.projectId, 'douane', guild.guildId);
    return mod.enabled && mod.configured ? { guild, cfg: mod.config } : null;
  }

  // ------------------------------------------------------------------ arrivée / départ dans la salle d'attente

  async onVoiceState(oldS: VoiceState, newS: VoiceState) {
    const guildId = newS.guild.id;
    const found = await this.config(guildId);
    if (!found || !newS.member || newS.member.user.bot) return;
    const { guild, cfg } = found;
    const { prisma, client, config } = this.ctx;

    const joined = newS.channelId && cfg.waitingVoiceChannelIds.includes(newS.channelId) && oldS.channelId !== newS.channelId;
    const left = oldS.channelId && cfg.waitingVoiceChannelIds.includes(oldS.channelId) && newS.channelId !== oldS.channelId;

    if (left) {
      await prisma.douaneSession.updateMany({ where: { projectId: guild.projectId, candidateDiscordId: newS.member.id, decision: 'PENDING', leftAt: null }, data: { leftAt: new Date(), decision: 'ABANDONED' } });
    }
    if (!joined) return;

    const session = await prisma.douaneSession.create({ data: { projectId: guild.projectId, candidateDiscordId: newS.member.id, voiceChannelId: newS.channelId! } });
    const channel = await client.channels.fetch(cfg.notifyChannelId).catch(() => null);
    if (!channel?.isTextBased() || channel.isDMBased()) return;
    const sheetUrl = sheetUrlFor(cfg.candidateSheetUrlTemplate, [], newS.member.id) ?? '—';
    const text = await config.message(guild.projectId, 'douane.candidate_waiting', { user: `<@${newS.member.id}>`, sheetUrl });
    await channel.send({
      content: `${cfg.notifyRoleId ? `<@&${cfg.notifyRoleId}> ` : ''}${text}`,
      allowedMentions: { users: [], roles: cfg.notifyRoleId ? [cfg.notifyRoleId] : [] },
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`d:accept:${session.id}`).setLabel(await config.message(guild.projectId, 'douane.btn.accept')).setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`d:refuse:${session.id}`).setLabel(await config.message(guild.projectId, 'douane.btn.refuse')).setStyle(ButtonStyle.Danger),
      )],
    });
  }

  // ------------------------------------------------------------------ décision

  private async decide(guildId: string, candidateId: string, decision: 'ACCEPTED' | 'REFUSED', actor: GuildMember, sessionId?: string) {
    const found = await this.config(guildId);
    if (!found) throw new AppError('Module douane inactif', 'MODULE_DISABLED', 409);
    const { guild, cfg } = found;
    if (!this.isDouanier(actor, cfg)) throw new ForbiddenError();
    const { prisma, client, config } = this.ctx;

    const session = await prisma.douaneSession.findFirst({
      where: { projectId: guild.projectId, decision: 'PENDING', ...(sessionId ? { id: sessionId } : { candidateDiscordId: candidateId }) },
      orderBy: { joinedAt: 'desc' },
    });
    // Décision possible même sans session (candidat déjà parti ou commande manuelle) : on la trace quand même
    const target = session?.candidateDiscordId ?? candidateId;
    const dg = client.guilds.cache.get(guildId);
    const member = await dg?.members.fetch(target).catch(() => null);
    if (member) {
      if (decision === 'ACCEPTED') {
        if (cfg.acceptRoleIds.length) await member.roles.add(cfg.acceptRoleIds, `Douane : accepté par ${actor.displayName}`);
        if (cfg.removeRoleIds.length) await member.roles.remove(cfg.removeRoleIds, `Douane : accepté par ${actor.displayName}`);
      }
      await member.send(await config.message(guild.projectId, decision === 'ACCEPTED' ? 'douane.accepted' : 'douane.refused', { user: `<@${target}>` })).catch(() => undefined);
    }
    if (session) await prisma.douaneSession.update({ where: { id: session.id }, data: { decision, decidedAt: new Date(), handledByDiscordId: actor.id } });
    else await prisma.douaneSession.create({ data: { projectId: guild.projectId, candidateDiscordId: target, voiceChannelId: '', decision, decidedAt: new Date(), handledByDiscordId: actor.id } });
    await this.ctx.audit.record({ projectId: guild.projectId, guildId: guild.guildId, actorType: 'USER', actorId: actor.id, actorName: actor.displayName, action: `douane.${decision.toLowerCase()}`, entityType: 'discordUser', entityId: target });
  }

  async onCommand(i: ChatInputCommandInteraction) {
    if (!i.guildId) throw new ForbiddenError();
    await i.deferReply({ ephemeral: true });
    const user = i.options.getUser('membre', true);
    const accepted = i.options.getSubcommand() === 'accept';
    await this.decide(i.guildId, user.id, accepted ? 'ACCEPTED' : 'REFUSED', i.member as GuildMember);
    const guild = await this.ctx.config.resolveGuild(i.guildId);
    await i.editReply(guild ? await this.ctx.config.message(guild.projectId, accepted ? 'douane.done.accepted' : 'douane.done.refused', { user: `<@${user.id}>` }) : 'OK');
  }

  async onButton(i: ButtonInteraction) {
    const [, action, sessionId] = i.customId.split(':') as [string, 'accept' | 'refuse', string];
    if (!i.guildId) throw new ForbiddenError();
    const session = await this.ctx.prisma.douaneSession.findUnique({ where: { id: sessionId } });
    if (!session) return i.reply({ content: '—', ephemeral: true });
    await i.deferUpdate();
    await this.decide(i.guildId, session.candidateDiscordId, action === 'accept' ? 'ACCEPTED' : 'REFUSED', i.member as GuildMember, sessionId);
    await i.editReply({ components: [] }); // la décision est prise : on retire les boutons
  }
}
