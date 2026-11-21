import type { Prisma } from '@syntra/db';
import type { BotContext } from './context';

/**
 * Fiche joueur depuis la BDD FiveM. Ne bloque JAMAIS l'action appelante :
 * timeout court, toute erreur est absorbée (loggée) et renvoie undefined.
 */
export async function loadPlayerSnapshot(
  ctx: BotContext,
  p: { projectId: string; discordId?: string; identifiers?: string[]; sheetUrlTemplate?: string },
): Promise<Prisma.InputJsonValue | undefined> {
  const opts = { ...(p.discordId ? { discordId: p.discordId } : {}), ...(p.sheetUrlTemplate ? { sheetUrlTemplate: p.sheetUrlTemplate } : {}) };
  const lookup = p.identifiers?.length
    ? ctx.players.lookup(p.projectId, p.identifiers, opts)
    : p.discordId
      ? ctx.players.lookupByDiscord(p.projectId, p.discordId, p.sheetUrlTemplate)
      : Promise.resolve(null);
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3500));
  try {
    const sheet = await Promise.race([lookup, timeout]);
    return (sheet ?? undefined) as Prisma.InputJsonValue | undefined;
  } catch (err) {
    ctx.log.warn({ err, projectId: p.projectId }, 'fiche joueur indisponible');
    return undefined;
  }
}
