import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { SIGNATURE_HEADERS } from '@syntra/shared';

export const MAX_SKEW_SECONDS = 300;
export const NONCE_TTL_SECONDS = 600;

/** Trie les paramètres de query pour une forme canonique */
export function canonicalPathQuery(pathQuery: string): string {
  const q = pathQuery.indexOf('?');
  if (q === -1) return pathQuery;
  const params = new URLSearchParams(pathQuery.slice(q + 1));
  const sorted = [...params.entries()].sort(([a, av], [b, bv]) => (a === b ? av.localeCompare(bv) : a.localeCompare(b)));
  const qs = new URLSearchParams(sorted).toString();
  return qs ? `${pathQuery.slice(0, q)}?${qs}` : pathQuery.slice(0, q);
}

export interface SignInput {
  timestamp: number;
  nonce: string;
  method: string;
  pathQuery: string;
  body: Buffer | string;
}

export function sign(secret: string, input: SignInput): string {
  const bodyHash = createHash('sha256').update(input.body).digest('hex');
  const message = [input.timestamp, input.nonce, input.method.toUpperCase(), canonicalPathQuery(input.pathQuery), bodyHash].join('\n');
  return createHmac('sha256', secret).update(message).digest('hex');
}

export function safeEqualHex(a: string, b: string): boolean {
  if (!/^[0-9a-f]+$/i.test(a) || !/^[0-9a-f]+$/i.test(b)) return false;
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Génère une paire clé API : keyId public + secret (affiché une seule fois) */
export function generateApiCredentials(): { keyId: string; secret: string } {
  return { keyId: `sk_${randomBytes(9).toString('base64url')}`, secret: randomBytes(32).toString('base64url') };
}

export interface NonceStore {
  /** true si le nonce n'avait jamais été vu (et le mémorise `ttlSeconds`) */
  claim(key: string, ttlSeconds: number): Promise<boolean>;
}

export interface ApiKeyRecord {
  keyId: string;
  projectId: string;
  secret: string; // déjà déchiffré
  scopes: string[];
  revokedAt: Date | null;
  expiresAt: Date | null;
  graceUntil: Date | null;
  ipAllowlist: string[];
  rateLimitPerMin: number;
}

export type VerifyFailure = 'missing_headers' | 'bad_timestamp' | 'unknown_key' | 'inactive_key' | 'ip_denied' | 'bad_signature' | 'replay' | 'scope_denied';

export type VerifyResult = { ok: true; key: ApiKeyRecord } | { ok: false; reason: VerifyFailure };

export interface VerifyParams {
  headers: Record<string, string | string[] | undefined>;
  method: string;
  pathQuery: string;
  body: Buffer | string;
  ip: string;
  requiredScope?: string;
  now?: Date;
  loadKey(keyId: string): Promise<ApiKeyRecord | null>;
  nonces: NonceStore;
}

function header(h: VerifyParams['headers'], name: string): string | undefined {
  const v = h[name];
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Vérifie une requête signée. Les raisons d'échec sont destinées aux logs internes :
 * côté HTTP, répondre systématiquement 401 uniforme (ne rien révéler).
 */
export async function verifySignedRequest(p: VerifyParams): Promise<VerifyResult> {
  const keyId = header(p.headers, SIGNATURE_HEADERS.keyId);
  const ts = header(p.headers, SIGNATURE_HEADERS.timestamp);
  const nonce = header(p.headers, SIGNATURE_HEADERS.nonce);
  const signature = header(p.headers, SIGNATURE_HEADERS.signature);
  if (!keyId || !ts || !nonce || !signature || nonce.length > 64) return { ok: false, reason: 'missing_headers' };

  const now = p.now ?? new Date();
  const timestamp = Number(ts);
  if (!Number.isInteger(timestamp) || Math.abs(now.getTime() / 1000 - timestamp) > MAX_SKEW_SECONDS) {
    return { ok: false, reason: 'bad_timestamp' };
  }

  const key = await p.loadKey(keyId);
  if (!key) return { ok: false, reason: 'unknown_key' };
  if (key.revokedAt && (!key.graceUntil || key.graceUntil <= now)) return { ok: false, reason: 'inactive_key' };
  if (key.expiresAt && key.expiresAt <= now) return { ok: false, reason: 'inactive_key' };
  if (key.ipAllowlist.length > 0 && !key.ipAllowlist.includes(p.ip)) return { ok: false, reason: 'ip_denied' };

  const expected = sign(key.secret, { timestamp, nonce, method: p.method, pathQuery: p.pathQuery, body: p.body });
  if (!safeEqualHex(expected, signature)) return { ok: false, reason: 'bad_signature' };

  // Le nonce n'est consommé qu'après une signature valide (un attaquant ne peut pas "brûler" des nonces)
  if (!(await p.nonces.claim(`nonce:${key.keyId}:${nonce}`, NONCE_TTL_SECONDS))) return { ok: false, reason: 'replay' };

  if (p.requiredScope && !key.scopes.includes(p.requiredScope)) return { ok: false, reason: 'scope_denied' };
  return { ok: true, key };
}

export class InMemoryNonceStore implements NonceStore {
  private seen = new Map<string, number>();
  async claim(key: string, ttlSeconds: number): Promise<boolean> {
    const now = Date.now();
    for (const [k, exp] of this.seen) if (exp <= now) this.seen.delete(k);
    if (this.seen.has(key)) return false;
    this.seen.set(key, now + ttlSeconds * 1000);
    return true;
  }
}
