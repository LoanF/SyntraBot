import type { Guild } from '@syntra/db';
import type { ProjectAccess } from './access';

/** Serveur Discord sélectionné via ?g=, restreint à ceux que la personne a le droit de voir. */
export function pickGuild(access: ProjectAccess, visible: Guild[], g?: string | string[]): Guild | null {
  const id = Array.isArray(g) ? g[0] : g;
  return visible.find((x) => x.id === id) ?? visible[0] ?? null;
}

export function visibleGuilds(access: ProjectAccess, permissions: Parameters<ProjectAccess['guildsWith']>[0][]): Guild[] {
  if (access.isOwner) return access.guilds;
  const ids = new Set(permissions.flatMap((p) => access.guildsWith(p).map((g) => g.id)));
  // Une permission accordée au niveau projet voit tous les serveurs
  if (permissions.some((p) => access.ctx.can(p))) return access.guilds;
  return access.guilds.filter((g) => ids.has(g.id));
}
