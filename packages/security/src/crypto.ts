import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { CryptoError } from '@syntra/shared';

/**
 * AES-256-GCM. Format : v1:<keyId>:<iv b64>:<tag b64>:<ct b64>
 * L'AAD lie le chiffré à son emplacement (ex: "projectId|FivemDatabase.connectionEnc").
 */
export interface Cipher {
  encrypt(plain: string, aad: string): string;
  decrypt(payload: string, aad: string): string;
  /** true si le chiffré n'utilise pas la clé courante (à rechiffrer paresseusement) */
  needsRotation(payload: string): boolean;
}

export function createCipher(config: { keys: Record<string, string>; current: string }): Cipher {
  const keys = new Map<string, Buffer>();
  for (const [id, b64] of Object.entries(config.keys)) {
    if (!/^[A-Za-z0-9_-]{1,16}$/.test(id)) throw new CryptoError(`keyId invalide: ${id}`);
    const buf = Buffer.from(b64, 'base64');
    if (buf.length !== 32) throw new CryptoError(`La clé ${id} doit faire 32 octets (base64)`);
    keys.set(id, buf);
  }
  if (!keys.has(config.current)) throw new CryptoError(`Clé courante introuvable: ${config.current}`);

  return {
    encrypt(plain, aad) {
      const key = keys.get(config.current)!;
      const iv = randomBytes(12);
      const c = createCipheriv('aes-256-gcm', key, iv);
      c.setAAD(Buffer.from(aad, 'utf8'));
      const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
      return ['v1', config.current, iv.toString('base64'), c.getAuthTag().toString('base64'), ct.toString('base64')].join(':');
    },
    decrypt(payload, aad) {
      const parts = payload.split(':');
      if (parts.length !== 5 || parts[0] !== 'v1') throw new CryptoError('Format chiffré invalide');
      const [, keyId, iv, tag, ct] = parts as [string, string, string, string, string];
      const key = keys.get(keyId);
      if (!key) throw new CryptoError('Clé de chiffrement inconnue');
      try {
        const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
        d.setAAD(Buffer.from(aad, 'utf8'));
        d.setAuthTag(Buffer.from(tag, 'base64'));
        return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8');
      } catch {
        throw new CryptoError('Déchiffrement impossible (données altérées ou mauvais contexte)');
      }
    },
    needsRotation(payload) {
      return payload.split(':')[1] !== config.current;
    },
  };
}

/** MASTER_KEYS="k1:base64,k2:base64" + MASTER_KEY_CURRENT="k1" */
export function cipherFromEnv(env: NodeJS.ProcessEnv = process.env): Cipher {
  const raw = env.MASTER_KEYS;
  const current = env.MASTER_KEY_CURRENT;
  if (!raw || !current) throw new CryptoError('MASTER_KEYS / MASTER_KEY_CURRENT manquants');
  const keys: Record<string, string> = {};
  for (const entry of raw.split(',')) {
    const idx = entry.indexOf(':');
    if (idx < 1) throw new CryptoError('MASTER_KEYS mal formé');
    keys[entry.slice(0, idx).trim()] = entry.slice(idx + 1).trim();
  }
  return createCipher({ keys, current });
}

export const aad = {
  fivemDb: (projectId: string) => `${projectId}|FivemDatabase.connectionEnc`,
  rcon: (projectId: string) => `${projectId}|RconConnection.passwordEnc`,
  apiKey: (projectId: string, keyId: string) => `${projectId}|ApiKey.secretEnc|${keyId}`,
};
