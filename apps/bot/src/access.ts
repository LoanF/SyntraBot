import type { GuildMember } from 'discord.js';
import type { Permission } from '@syntra/shared';
import { resolveAccess } from '@syntra/security';
import type { BotContext } from './context';

/**
 * Même modèle de droits que le dashboard (AccessPolicy + rôles Discord réels), évalué côté bot pour les
 * commandes sensibles (/admin RCON). Les rôles pris en compte sont ceux détenus sur le serveur de l'interaction.
 */
export async function botCan(ctx: BotContext, member: GuildMember, projectId: string, guildInternalId: string, permission: Permission, target?: { guildId?: string }): Promise<boolean> {
  const [owner, policies] = await Promise.all([
    ctx.prisma.projectMember.findFirst({ where: { projectId, user: { discordId: member.id } } }),
    ctx.prisma.accessPolicy.findMany({ where: { projectId } }),
  ]);
  const access = resolveAccess({
    isOwner: Boolean(owner),
    memberRoles: new Map([[guildInternalId, new Set(member.roles.cache.keys())]]),
    policies: policies.map((p) => ({ roleGuildId: p.roleGuildId, discordRoleId: p.discordRoleId, targetGuildId: p.targetGuildId, permissions: p.permissions })),
  });
  return access.can(permission, target ?? {});
}
