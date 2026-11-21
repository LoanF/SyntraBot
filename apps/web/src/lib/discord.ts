import { RestDiscordActions } from '@syntra/core/web';

const g = globalThis as unknown as { __discord?: RestDiscordActions; __roleCache?: Map<string, { roles: ReadonlySet<string>; exp: number }> };

/** Client REST du bot (rôles, salons). Sans token (dev), les appels échouent proprement et sont absorbés. */
export const discord: RestDiscordActions = (g.__discord ??= new RestDiscordActions(process.env.DISCORD_BOT_TOKEN || 'unset-token'));
export const hasDiscordToken = Boolean(process.env.DISCORD_BOT_TOKEN);

const cache = (g.__roleCache ??= new Map());
const TTL_MS = 60_000;

/** Rôles réels d'un utilisateur sur un serveur Discord (cache 60 s). Échec = aucun rôle (jamais de droit par défaut). */
export async function memberRoles(discordGuildId: string, userId: string): Promise<ReadonlySet<string>> {
  const key = `${discordGuildId}:${userId}`;
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.roles;
  let roles: ReadonlySet<string> = new Set();
  if (hasDiscordToken) {
    try {
      roles = new Set((await discord.getMember(discordGuildId, userId))?.roles ?? []);
    } catch {
      roles = new Set();
    }
  }
  cache.set(key, { roles, exp: Date.now() + TTL_MS });
  return roles;
}
