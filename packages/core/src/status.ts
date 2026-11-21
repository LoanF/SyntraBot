/** Lecture des endpoints publics d'un serveur FiveM (info.json + players.json) — logique pure, testée. */
export interface ServerStatus {
  online: boolean;
  players: number;
  maxPlayers: number | null;
  hostname: string | null;
}

export function parseServerStatus(info: unknown, players: unknown): ServerStatus {
  const vars = (info as { vars?: Record<string, string> } | null)?.vars ?? {};
  const max = Number(vars.sv_maxClients);
  const name = typeof vars.sv_projectName === 'string' ? vars.sv_projectName : typeof vars.sv_hostname === 'string' ? vars.sv_hostname : null;
  return {
    online: true,
    players: Array.isArray(players) ? players.length : 0,
    maxPlayers: Number.isFinite(max) && max > 0 ? max : null,
    // Les codes couleur FiveM (^1…^9) sont retirés du nom
    hostname: name ? name.replace(/\^\d/g, '').trim().slice(0, 100) : null,
  };
}

export const OFFLINE: ServerStatus = { online: false, players: 0, maxPlayers: null, hostname: null };

/** Lien de connexion direct cfx.re (le code est validé par le schéma de config) */
export const cfxJoinUrl = (code: string) => `https://cfx.re/join/${code}`;
