import { SlashCommandBuilder, type ChatInputCommandInteraction, type GuildMember } from 'discord.js';
import { AppError, ForbiddenError } from '@syntra/shared';
import { cipherFromEnv } from '@syntra/security';
import { RconService } from '@syntra/core';
import type { BotContext } from '../context';
import { botCan } from '../access';

export const adminCommand = new SlashCommandBuilder()
  .setName('admin')
  .setDescription('Commandes d’administration du serveur de jeu (RCON)')
  .setDMPermission(false)
  .addSubcommand((s) => s.setName('ban').setDescription('Bannir un joueur').addIntegerOption((o) => o.setName('id').setDescription('ID serveur du joueur').setRequired(true).setMinValue(1)).addStringOption((o) => o.setName('raison').setDescription('Motif').setRequired(true).setMaxLength(150)))
  .addSubcommand((s) => s.setName('kick').setDescription('Expulser un joueur').addIntegerOption((o) => o.setName('id').setDescription('ID serveur du joueur').setRequired(true).setMinValue(1)).addStringOption((o) => o.setName('raison').setDescription('Motif').setRequired(true).setMaxLength(150)))
  .addSubcommand((s) => s.setName('revive').setDescription('Réanimer un joueur').addIntegerOption((o) => o.setName('id').setDescription('ID serveur du joueur').setRequired(true).setMinValue(1)))
  .addSubcommand((s) => s.setName('announce').setDescription('Annonce globale en jeu').addStringOption((o) => o.setName('message').setDescription('Message').setRequired(true).setMaxLength(200)));

let service: RconService | null = null;

/**
 * Sécurité en profondeur : module actif, permission `rcon:execute` AU NIVEAU PROJET (jamais héritée d'un seul serveur),
 * commande issue d'un gabarit de la configuration + liste blanche de la connexion, arguments assainis, audit systématique.
 */
export async function handleAdminCommand(ctx: BotContext, i: ChatInputCommandInteraction) {
  if (!i.guildId || !i.member) throw new ForbiddenError();
  const guild = await ctx.config.resolveGuild(i.guildId);
  if (!guild) throw new ForbiddenError();
  const member = i.member as GuildMember;
  if (!(await botCan(ctx, member, guild.projectId, guild.guildId, 'rcon:execute'))) throw new ForbiddenError();

  const mod = await ctx.config.getModule(guild.projectId, 'rcon');
  if (!mod.enabled || !mod.configured) throw new AppError('Le module RCON n’est pas activé.', 'MODULE_DISABLED', 409);

  const sub = i.options.getSubcommand();
  const template = mod.config.commands[sub];
  if (!template) throw new AppError('Commande non configurée.', 'NOT_CONFIGURED', 409);

  await i.deferReply({ ephemeral: true });
  service ??= new RconService(ctx.prisma, cipherFromEnv());
  const args: Record<string, string | number> = {
    ...(i.options.getInteger('id') !== null ? { id: i.options.getInteger('id')! } : {}),
    ...(i.options.getString('raison') ? { reason: i.options.getString('raison')! } : {}),
    ...(i.options.getString('message') ? { message: i.options.getString('message')! } : {}),
  };
  try {
    const output = await service.execute(guild.projectId, template, args);
    await ctx.audit.record({ projectId: guild.projectId, guildId: guild.guildId, actorType: 'USER', actorId: member.id, actorName: member.displayName, action: 'rcon.execute', entityType: 'rcon', entityId: sub, after: { args } });
    const text = await ctx.config.message(guild.projectId, 'rcon.success');
    return i.editReply(output ? `${text}\n\`\`\`\n${output.slice(0, 1500)}\n\`\`\`` : text);
  } catch (err) {
    await ctx.audit.record({ projectId: guild.projectId, guildId: guild.guildId, actorType: 'USER', actorId: member.id, actorName: member.displayName, action: 'rcon.failed', entityType: 'rcon', entityId: sub, after: { args, error: err instanceof Error ? err.message : 'erreur' } });
    ctx.log.warn({ err, sub }, 'RCON échoué');
    return i.editReply(await ctx.config.message(guild.projectId, 'rcon.failure'));
  }
}
