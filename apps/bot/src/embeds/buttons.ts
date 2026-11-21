import { PermissionFlagsBits, type ButtonInteraction, type GuildMember } from 'discord.js';
import { embedPayload } from '@syntra/shared';
import type { BotContext } from '../context';
import { openPoleByKey } from '../tickets/dm-flow';

/** Le bouton doit appartenir à un embed PUBLIÉ de ce projet (un custom_id forgé n'est jamais obéi). */
async function templateOf(ctx: BotContext, i: ButtonInteraction) {
  if (!i.guildId) return null;
  const guild = await ctx.config.resolveGuild(i.guildId);
  if (!guild) return null;
  const tpl = await ctx.prisma.embedTemplate.findFirst({ where: { projectId: guild.projectId, messageId: i.message.id, status: 'PUBLISHED' } });
  if (!tpl) return null;
  const parsed = embedPayload.safeParse(tpl.payload);
  return parsed.success ? { guild, payload: parsed.data } : null;
}

/** `ar:<roleId>:<toggle|add>` — auto-rôle. Refuse les rôles à pouvoirs d'administration (anti-escalade). */
export async function onAutoRole(ctx: BotContext, i: ButtonInteraction) {
  const [, roleId, mode] = i.customId.split(':') as [string, string, 'toggle' | 'add'];
  const found = await templateOf(ctx, i);
  const declared = found?.payload.components.some((c) => c.type === 'auto_role' && c.roleId === roleId);
  if (!found || !declared || !i.inGuild()) return i.reply({ content: '—', ephemeral: true });
  const msg = (key: string, vars?: Record<string, string | number>) => ctx.config.message(found.guild.projectId, key, vars);

  const role = await i.guild?.roles.fetch(roleId).catch(() => null);
  const dangerous = PermissionFlagsBits.Administrator | PermissionFlagsBits.ManageGuild | PermissionFlagsBits.ManageRoles | PermissionFlagsBits.ManageChannels | PermissionFlagsBits.BanMembers | PermissionFlagsBits.KickMembers;
  if (!role || role.managed || (role.permissions.bitfield & dangerous) !== 0n) return i.reply({ content: await msg('embed.role.forbidden'), ephemeral: true });

  const member = i.member as GuildMember;
  try {
    if (member.roles.cache.has(roleId) && mode === 'toggle') {
      await member.roles.remove(role, 'Auto-rôle (embed)');
      return i.reply({ content: await msg('embed.role.removed', { role: role.name }), ephemeral: true });
    }
    await member.roles.add(role, 'Auto-rôle (embed)');
    return i.reply({ content: await msg('embed.role.added', { role: role.name }), ephemeral: true });
  } catch (err) {
    ctx.log.warn({ err, roleId }, 'auto-rôle impossible (hiérarchie des rôles ?)');
    return i.reply({ content: await msg('embed.role.failed'), ephemeral: true });
  }
}

/** `ot:<poleKey>` — ouvre le formulaire du pôle depuis un message du serveur. */
export async function onOpenTicket(ctx: BotContext, i: ButtonInteraction) {
  const poleKey = i.customId.split(':')[1]!;
  const found = await templateOf(ctx, i);
  const declared = found?.payload.components.some((c) => c.type === 'open_ticket' && c.poleKey === poleKey);
  if (!found || !declared) return i.reply({ content: '—', ephemeral: true });
  return openPoleByKey(ctx, i, found.guild.projectId, poleKey);
}
