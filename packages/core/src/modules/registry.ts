import { PermissionFlagsBits } from 'discord-api-types/v10';
import type { ModuleKey, Permission } from '@syntra/shared';

/**
 * Métadonnées déclaratives d'un module. Le dashboard s'en sert pour les cartes de modules
 * (alerte de permission Discord manquante) ; le bot pour savoir quoi charger.
 * Ajouter une brique (ex. "factions") = ajouter une entrée ici + un dossier dans packages/modules.
 */
export interface ModuleManifest {
  key: ModuleKey;
  scope: 'guild' | 'project';
  /** Permissions Discord requises par le bot sur le serveur */
  discordPermissions: bigint[];
  /** Permissions RBAC dashboard pour gérer ce module */
  manageBy: Permission;
}

const P = PermissionFlagsBits;

export const MODULE_MANIFESTS: Record<ModuleKey, ModuleManifest> = {
  tickets: { key: 'tickets', scope: 'guild', discordPermissions: [P.ViewChannel, P.ManageChannels, P.SendMessages, P.ManageRoles, P.EmbedLinks, P.AttachFiles, P.ReadMessageHistory], manageBy: 'modules:manage' },
  reports: { key: 'reports', scope: 'project', discordPermissions: [P.ViewChannel, P.ManageChannels, P.SendMessages], manageBy: 'modules:manage' },
  douane: { key: 'douane', scope: 'guild', discordPermissions: [P.ViewChannel, P.Connect, P.SendMessages, P.ManageRoles], manageBy: 'douane:manage' },
  rcon: { key: 'rcon', scope: 'project', discordPermissions: [], manageBy: 'rcon:execute' },
  status: { key: 'status', scope: 'project', discordPermissions: [P.ViewChannel, P.SendMessages, P.EmbedLinks], manageBy: 'status:manage' },
  sync_roles: { key: 'sync_roles', scope: 'guild', discordPermissions: [P.ManageRoles], manageBy: 'sync_roles:manage' },
  whitelist: { key: 'whitelist', scope: 'guild', discordPermissions: [P.ManageRoles, P.SendMessages], manageBy: 'modules:manage' },
  embeds: { key: 'embeds', scope: 'guild', discordPermissions: [P.ViewChannel, P.SendMessages, P.EmbedLinks], manageBy: 'embeds:write' },
};

export interface GuildHealth {
  ok: boolean;
  /** Noms des permissions manquantes (ex: "ManageChannels") */
  missing: string[];
}

const NAMES = new Map(Object.entries(PermissionFlagsBits).map(([name, bit]) => [bit, name]));

/** Compare les permissions du bot aux besoins des modules ACTIVÉS. Administrator couvre tout. */
export function computeGuildHealth(botPermissions: bigint | null, enabledModules: readonly ModuleKey[]): GuildHealth {
  if (botPermissions === null) return { ok: false, missing: ['BotNotInGuild'] };
  if (botPermissions & P.Administrator) return { ok: true, missing: [] };
  const needed = new Set(enabledModules.flatMap((k) => MODULE_MANIFESTS[k].discordPermissions));
  const missing = [...needed].filter((bit) => !(botPermissions & bit)).map((bit) => NAMES.get(bit) ?? String(bit));
  return { ok: missing.length === 0, missing };
}
