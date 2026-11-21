import { ALL_PERMISSIONS, isPermission, isSensitive, type Permission } from '@syntra/shared';

export interface PolicyRow {
  roleGuildId: string;
  discordRoleId: string;
  /** null = projet entier */
  targetGuildId: string | null;
  permissions: string[];
}

export interface AccessInput {
  isOwner: boolean;
  /** Rôles Discord détenus par l'utilisateur : guildId -> ensemble de roleIds */
  memberRoles: ReadonlyMap<string, ReadonlySet<string>>;
  policies: readonly PolicyRow[];
}

export interface AccessContext {
  can(permission: Permission, target?: { guildId?: string | null }): boolean;
  /** Serveurs sur lesquels la permission (non sensible) est accordée — pour filtrer les listes du dashboard */
  guildsWith(permission: Permission, allGuildIds: readonly string[]): string[];
}

/**
 * Règles :
 *  - OWNER : tout.
 *  - Policy projet entier (targetGuildId=null) : accorde ses permissions partout, sensibles incluses.
 *  - Policy ciblant un serveur : accorde uniquement les permissions NON sensibles, uniquement sur ce serveur.
 *  - Permission sensible demandée => seule une policy/projet ou OWNER suffit (target ignorée).
 */
export function resolveAccess(input: AccessInput): AccessContext {
  const projectWide = new Set<Permission>();
  const perGuild = new Map<string, Set<Permission>>();

  if (!input.isOwner) {
    for (const p of input.policies) {
      if (!input.memberRoles.get(p.roleGuildId)?.has(p.discordRoleId)) continue;
      for (const raw of p.permissions) {
        if (!isPermission(raw)) continue;
        if (p.targetGuildId === null) projectWide.add(raw);
        else if (!isSensitive(raw)) {
          const set = perGuild.get(p.targetGuildId) ?? new Set<Permission>();
          set.add(raw);
          perGuild.set(p.targetGuildId, set);
        }
      }
    }
  }

  const can: AccessContext['can'] = (permission, target) => {
    if (input.isOwner) return true;
    if (projectWide.has(permission)) return true;
    if (isSensitive(permission)) return false;
    const guildId = target?.guildId;
    return guildId ? (perGuild.get(guildId)?.has(permission) ?? false) : false;
  };

  return {
    can,
    guildsWith: (permission, allGuildIds) => allGuildIds.filter((g) => can(permission, { guildId: g })),
  };
}

export { ALL_PERMISSIONS };
