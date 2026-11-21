import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  InMemoryNonceStore, assertSafeUrl, canonicalPathQuery, createCipher, isPrivateAddress,
  redactSecrets, resolveAccess, sign, verifySignedRequest, type ApiKeyRecord,
} from './index';

const k = () => randomBytes(32).toString('base64');

describe('crypto AES-256-GCM', () => {
  const c = createCipher({ keys: { k1: k(), k2: k() }, current: 'k1' });
  it('chiffre/déchiffre', () => {
    const enc = c.encrypt('mot-de-passe', 'p1|rcon');
    expect(enc.startsWith('v1:k1:')).toBe(true);
    expect(c.decrypt(enc, 'p1|rcon')).toBe('mot-de-passe');
  });
  it('IV aléatoire', () => {
    expect(c.encrypt('x', 'a')).not.toBe(c.encrypt('x', 'a'));
  });
  it('refuse un mauvais AAD (copie vers un autre projet)', () => {
    const enc = c.encrypt('secret', 'p1|rcon');
    expect(() => c.decrypt(enc, 'p2|rcon')).toThrow();
  });
  it('détecte une altération', () => {
    const parts = c.encrypt('secret', 'a').split(':');
    parts[4] = Buffer.from('tampered-data').toString('base64');
    expect(() => c.decrypt(parts.join(':'), 'a')).toThrow();
  });
  it('rejette une clé de mauvaise taille', () => {
    expect(() => createCipher({ keys: { k1: 'AAAA' }, current: 'k1' })).toThrow();
  });
});

describe('crypto rotation', () => {
  it('déchiffre avec l’ancienne clé après changement de clé courante', () => {
    const keys = { k1: k(), k2: k() };
    const enc = createCipher({ keys, current: 'k1' }).encrypt('v', 'a');
    const next = createCipher({ keys, current: 'k2' });
    expect(next.decrypt(enc, 'a')).toBe('v');
    expect(next.needsRotation(enc)).toBe(true);
  });
});

describe('HMAC signed requests', () => {
  const secret = 'topsecret';
  const key: ApiKeyRecord = {
    keyId: 'sk_test', projectId: 'p1', secret, scopes: ['webhooks:whitelist'],
    revokedAt: null, expiresAt: null, graceUntil: null, ipAllowlist: [], rateLimitPerMin: 100,
  };
  const base = { method: 'POST', pathQuery: '/v1/webhooks/whitelist', body: '{"a":1}', ip: '1.2.3.4' };
  const mk = (over: Partial<{ ts: number; nonce: string; body: string }> = {}) => {
    const ts = over.ts ?? Math.floor(Date.now() / 1000);
    const nonce = over.nonce ?? randomBytes(8).toString('hex');
    const body = over.body ?? base.body;
    return {
      headers: {
        'x-syntra-key-id': 'sk_test', 'x-syntra-timestamp': String(ts), 'x-syntra-nonce': nonce,
        'x-syntra-signature': sign(secret, { timestamp: ts, nonce, method: base.method, pathQuery: base.pathQuery, body: base.body }),
      },
      body,
    };
  };
  const run = (req: ReturnType<typeof mk>, nonces = new InMemoryNonceStore(), extra = {}) =>
    verifySignedRequest({ ...base, ...req, nonces, loadKey: async () => key, requiredScope: 'webhooks:whitelist', ...extra });

  it('accepte une requête valide', async () => {
    expect((await run(mk())).ok).toBe(true);
  });
  it('rejette un corps modifié', async () => {
    expect(await run(mk({ body: '{"a":2}' }))).toEqual({ ok: false, reason: 'bad_signature' });
  });
  it('rejette un timestamp périmé', async () => {
    expect(await run(mk({ ts: Math.floor(Date.now() / 1000) - 3600 }))).toEqual({ ok: false, reason: 'bad_timestamp' });
  });
  it('rejette un rejeu', async () => {
    const nonces = new InMemoryNonceStore();
    const req = mk();
    expect((await run(req, nonces)).ok).toBe(true);
    expect(await run(req, nonces)).toEqual({ ok: false, reason: 'replay' });
  });
  it('rejette un scope manquant', async () => {
    expect(await run(mk(), new InMemoryNonceStore(), { requiredScope: 'bridge:poll' })).toEqual({ ok: false, reason: 'scope_denied' });
  });
  it('rejette une clé révoquée sauf période de grâce', async () => {
    const revoked = { ...key, revokedAt: new Date(Date.now() - 1000) };
    expect(await run(mk(), new InMemoryNonceStore(), { loadKey: async () => revoked })).toEqual({ ok: false, reason: 'inactive_key' });
    const grace = { ...revoked, graceUntil: new Date(Date.now() + 60_000) };
    expect((await run(mk(), new InMemoryNonceStore(), { loadKey: async () => grace })).ok).toBe(true);
  });
  it('canonicalise la query', () => {
    expect(canonicalPathQuery('/x?b=2&a=1')).toBe('/x?a=1&b=2');
  });
});

describe('SSRF', () => {
  it.each(['127.0.0.1', '10.0.0.5', '192.168.1.1', '172.16.0.1', '169.254.169.254', '::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1', '100.64.0.1'])(
    'bloque %s', (ip) => expect(isPrivateAddress(ip)).toBe(true));
  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111'])('autorise %s', (ip) => expect(isPrivateAddress(ip)).toBe(false));
  it('refuse http, localhost, IP privée, credentials', () => {
    for (const u of ['http://example.com/a.png', 'https://localhost/a', 'https://127.0.0.1/a', 'https://[::1]/a', 'https://user:pw@example.com/', 'file:///etc/passwd', 'https://svc.internal/a'])
      expect(() => assertSafeUrl(u)).toThrow();
  });
  it('accepte une URL https publique', () => {
    expect(assertSafeUrl('https://cdn.example.com/img.png').hostname).toBe('cdn.example.com');
  });
});

describe('RBAC', () => {
  const roles = new Map([['staffGuild', new Set(['respIllegal'])]]);
  const policies = [
    { roleGuildId: 'staffGuild', discordRoleId: 'respIllegal', targetGuildId: 'illegalGuild', permissions: ['tickets:read', 'transcripts:read', 'rcon:execute'] },
  ];
  it('Resp. Illégal : lit son Discord, jamais ailleurs, jamais le RCON', () => {
    const a = resolveAccess({ isOwner: false, memberRoles: roles, policies });
    expect(a.can('tickets:read', { guildId: 'illegalGuild' })).toBe(true);
    expect(a.can('tickets:read', { guildId: 'staffGuild' })).toBe(false);
    expect(a.can('transcripts:read', { guildId: 'staffGuild' })).toBe(false);
    expect(a.can('rcon:execute')).toBe(false); // sensible : non hérité d'une policy par serveur
  });
  it('policy projet entier accorde les sensibles', () => {
    const a = resolveAccess({ isOwner: false, memberRoles: roles, policies: [{ ...policies[0]!, targetGuildId: null }] });
    expect(a.can('rcon:execute')).toBe(true);
  });
  it('rôle non détenu = rien ; owner = tout', () => {
    expect(resolveAccess({ isOwner: false, memberRoles: new Map(), policies }).can('tickets:read', { guildId: 'illegalGuild' })).toBe(false);
    expect(resolveAccess({ isOwner: true, memberRoles: new Map(), policies: [] }).can('rcon:execute')).toBe(true);
  });
});

describe('redact', () => {
  it('masque les secrets imbriqués', () => {
    expect(redactSecrets({ a: 1, secretEnc: 'x', nested: { password: 'p', ok: 2 }, list: [{ token: 't' }] })).toEqual({
      a: 1, secretEnc: '[REDACTED]', nested: { password: '[REDACTED]', ok: 2 }, list: [{ token: '[REDACTED]' }],
    });
  });
});
