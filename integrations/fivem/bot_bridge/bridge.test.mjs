import { describe, expect, it } from 'vitest';
import { sign as apiSign, verifySignedRequest, InMemoryNonceStore } from '@syntra/security';
import lib from './lib.js';

const secret = 'topsecret';

describe('compatibilité de signature bridge <-> API', () => {
  it('le bridge produit la même signature que @syntra/security', () => {
    const input = { timestamp: 1_700_000_000, nonce: 'abc', method: 'post', pathQuery: '/v1/x?b=2&a=1', body: '{"a":1}' };
    expect(lib.sign(secret, input)).toBe(apiSign(secret, input));
  });

  it("une requête du bridge est acceptée par la vérification de l'API", async () => {
    const body = JSON.stringify({ reason: 'x' });
    const headers = lib.signedHeaders({ keyId: 'sk_1', secret, method: 'POST', pathQuery: '/v1/bridge/report', body });
    const res = await verifySignedRequest({
      headers, method: 'POST', pathQuery: '/v1/bridge/report', body, ip: '1.1.1.1', requiredScope: 'bridge:report',
      nonces: new InMemoryNonceStore(),
      loadKey: async () => ({ keyId: 'sk_1', projectId: 'p', secret, scopes: ['bridge:report'], revokedAt: null, expiresAt: null, graceUntil: null, ipAllowlist: [], rateLimitPerMin: 10 }),
    });
    expect(res.ok).toBe(true);
  });

  it("vérifie la signature de réponse de l'API, rejette l'altération et la réponse tardive", () => {
    const ts = Math.floor(Date.now() / 1000);
    const body = '{"commands":[]}';
    const signature = apiSign(secret, { timestamp: ts, nonce: 'n1', method: 'RESPONSE', pathQuery: '/v1/bridge/poll?wait=20', body });
    const base = { secret, nonce: 'n1', pathQuery: '/v1/bridge/poll?wait=20', body, timestamp: String(ts), signature };
    expect(lib.verifyResponse(base)).toBe(true);
    expect(lib.verifyResponse({ ...base, body: '{"commands":[{"type":"teleport"}]}' })).toBe(false);
    expect(lib.verifyResponse({ ...base, nonce: 'autre' })).toBe(false);
    expect(lib.verifyResponse({ ...base, now: Date.now() + 3_600_000 })).toBe(false);
  });
});

describe('helpers de collecte', () => {
  it('nearbyPlayers filtre par rayon et trie par distance', () => {
    const out = lib.nearbyPlayers({ x: 0, y: 0, z: 0 }, [
      { serverId: 1, name: 'loin', x: 100, y: 0, z: 0 },
      { serverId: 2, name: 'près', x: 3, y: 4, z: 0 },
      { serverId: 3, name: 'moyen', x: 30, y: 0, z: 0 },
    ], 50);
    expect(out.map((p) => p.serverId)).toEqual([2, 3]);
    expect(out[0].distance).toBe(5);
  });
  it('weaponName : poings = null', () => {
    expect(lib.weaponName(-1569615261)).toBeNull();
    expect(lib.weaponName(453432689)).toBe('453432689');
  });
});

describe('anti-écho et ordre des événements', () => {
  it('suppressor : une marque ne sert qu’une fois et expire', () => {
    let t = 0;
    const s = lib.createSuppressor(1000, () => t);
    s.mark('k');
    expect(s.consume('k')).toBe(true);
    expect(s.consume('k')).toBe(false);
    s.mark('k2');
    t = 2000;
    expect(s.consume('k2')).toBe(false);
  });
  it('eventKey est insensible aux espaces de fin', () => {
    expect(lib.eventKey(7, 'staff', 'salut ')).toBe(lib.eventKey(7, 'staff', 'salut'));
  });
  it('serial queue : exécute dans l’ordre même si une tâche échoue', async () => {
    const run = lib.createSerialQueue();
    const out = [];
    run(async () => { await new Promise((r) => setTimeout(r, 20)); out.push(1); });
    run(async () => { throw new Error('boom'); });
    await run(async () => { out.push(3); });
    expect(out).toEqual([1, 3]);
  });
});
