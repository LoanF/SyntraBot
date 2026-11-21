import dns from 'node:dns';
import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';
import { Agent, fetch as undiciFetch } from 'undici';
import { SsrfError } from '@syntra/shared';

/** true si l'adresse n'est PAS une adresse unicast publique (loopback, privée, link-local, metadata, CGNAT…) */
export function isPrivateAddress(address: string): boolean {
  if (!ipaddr.isValid(address)) return true; // dans le doute, on bloque
  const parsed = ipaddr.process(address); // déplie ::ffff:a.b.c.d en IPv4
  return parsed.range() !== 'unicast';
}

const BLOCKED_HOSTNAMES = /(^|\.)(localhost|local|internal|localdomain)$/i;

export interface UrlPolicy {
  protocols?: string[]; // défaut ['https:']
  allowPrivate?: boolean;
}

/** Validation syntaxique synchrone (schéma, hôte littéral). La résolution DNS est vérifiée au connect. */
export function assertSafeUrl(raw: string, policy: UrlPolicy = {}): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SsrfError('URL invalide');
  }
  if (!(policy.protocols ?? ['https:']).includes(url.protocol)) throw new SsrfError('Schéma non autorisé');
  if (url.username || url.password) throw new SsrfError('Identifiants dans l’URL interdits');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!policy.allowPrivate) {
    if (BLOCKED_HOSTNAMES.test(host)) throw new SsrfError('Hôte interdit');
    if (isIP(host) && isPrivateAddress(host)) throw new SsrfError('Adresse privée interdite');
  }
  return url;
}

/** Résolution DNS validée AU MOMENT de la connexion (pas de TOCTOU / DNS rebinding). */
export function makeSafeLookup(allowPrivate = false): typeof dns.lookup {
  return ((hostname: string, options: dns.LookupOptions, cb: (...a: unknown[]) => void) => {
    dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return cb(err);
      const list = addresses as dns.LookupAddress[];
      if (!allowPrivate && list.some((a) => isPrivateAddress(a.address))) {
        return cb(new SsrfError('Résolution vers une adresse privée interdite'));
      }
      if (options.all) return cb(null, list);
      const first = list[0]!;
      return cb(null, first.address, first.family);
    });
  }) as unknown as typeof dns.lookup;
}

export interface SafeFetchOptions extends UrlPolicy {
  timeoutMs?: number;
  maxBytes?: number;
  allowedContentTypes?: RegExp;
  headers?: Record<string, string>;
}

/** GET sans redirection automatique, taille et durée bornées. */
export async function safeFetchBuffer(raw: string, opts: SafeFetchOptions = {}): Promise<{ body: Buffer; contentType: string }> {
  const url = assertSafeUrl(raw, opts);
  const maxBytes = opts.maxBytes ?? 8 * 1024 * 1024;
  const agent = new Agent({ connect: { lookup: makeSafeLookup(opts.allowPrivate) } });
  try {
    const res = await undiciFetch(url, {
      method: 'GET',
      redirect: 'manual',
      dispatcher: agent,
      headers: opts.headers ?? {},
      signal: AbortSignal.timeout(opts.timeoutMs ?? 5000),
    });
    if (res.status >= 300 && res.status < 400) throw new SsrfError('Redirections interdites');
    if (!res.ok) throw new SsrfError(`Réponse HTTP ${res.status}`);
    const contentType = res.headers.get('content-type') ?? '';
    if (opts.allowedContentTypes && !opts.allowedContentTypes.test(contentType)) throw new SsrfError('Type de contenu non autorisé');
    const declared = Number(res.headers.get('content-length') ?? 0);
    if (declared > maxBytes) throw new SsrfError('Contenu trop volumineux');
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of res.body as AsyncIterable<Uint8Array>) {
      total += chunk.byteLength;
      if (total > maxBytes) throw new SsrfError('Contenu trop volumineux');
      chunks.push(Buffer.from(chunk));
    }
    return { body: Buffer.concat(chunks), contentType };
  } finally {
    await agent.close();
  }
}
