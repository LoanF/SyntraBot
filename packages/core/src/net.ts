import dns from 'node:dns/promises';
import { isIP } from 'node:net';
import { SsrfError } from '@syntra/shared';
import { isPrivateAddress } from '@syntra/security';

/**
 * Résout un hôte fourni par un client et refuse les réseaux privés (SSRF), sauf si l'opérateur du produit
 * l'autorise explicitement (ALLOW_PRIVATE_RCON=1, pour un déploiement où le jeu est sur le même réseau).
 * Retourne l'IP validée : on se connecte à cette IP, pas au nom (pas de DNS rebinding).
 */
export async function assertPublicHost(host: string, env: NodeJS.ProcessEnv = process.env): Promise<string> {
  const allowPrivate = env.ALLOW_PRIVATE_RCON === '1';
  const addrs = isIP(host) ? [{ address: host, family: isIP(host) }] : await dns.lookup(host, { all: true });
  if (addrs.length === 0) throw new SsrfError('Hôte introuvable');
  if (!allowPrivate && addrs.some((a) => isPrivateAddress(a.address))) throw new SsrfError('Hôte en réseau privé interdit');
  return addrs[0]!.address;
}
