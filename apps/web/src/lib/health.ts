import { PermissionFlagsBits } from 'discord-api-types/v10';
import { MODULE_MANIFESTS } from '@syntra/core/web';
import type { Guild } from '@syntra/db';
import type { ModuleKey } from '@syntra/shared';

const NAME_BY_BIT = new Map(Object.entries(PermissionFlagsBits).map(([name, bit]) => [bit, name]));

export interface GuildHealthView {
  /** null = jamais vérifié (le bot n'a pas encore écrit de rapport) */
  ok: boolean | null;
  botPresent: boolean;
  missing: string[];
  checkedAt: Date | null;
}

export function guildHealth(g: Guild): GuildHealthView {
  const r = g.healthReport as { ok?: boolean; missing?: string[] } | null;
  return { ok: r?.ok ?? null, botPresent: g.botPresent, missing: r?.missing ?? [], checkedAt: g.healthCheckedAt };
}

/** Permissions Discord manquantes qui concernent précisément ce module (intersection avec le rapport du bot) */
export function missingForModule(key: ModuleKey, health: GuildHealthView): string[] {
  const needed = new Set(MODULE_MANIFESTS[key].discordPermissions.map((b) => NAME_BY_BIT.get(b)).filter(Boolean) as string[]);
  return health.missing.filter((m) => needed.has(m));
}

/** « ManageChannels » → « Gérer les salons » (les libellés exacts de Discord, en français) */
const FR: Record<string, string> = {
  ViewChannel: 'Voir les salons', ManageChannels: 'Gérer les salons', SendMessages: 'Envoyer des messages', ManageRoles: 'Gérer les rôles',
  EmbedLinks: 'Intégrer des liens', AttachFiles: 'Joindre des fichiers', ReadMessageHistory: 'Voir les anciens messages', Connect: 'Se connecter (vocal)',
  BotNotInGuild: 'Le bot n’est pas présent sur ce serveur',
};
export const permissionLabel = (name: string) => FR[name] ?? name;
