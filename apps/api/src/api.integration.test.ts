import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AuditService, ConfigService, LocalConfigBus, type ActionJob, type DiscordActions } from '@syntra/core';
import { PrismaClient, createProjectFromTemplate, provisionGuild } from '@syntra/db';
import { InMemoryNonceStore, aad, createCipher, generateApiCredentials, sign } from '@syntra/security';
import { buildServer } from './server';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL ?? 'postgresql://syntra:syntra@localhost:5432/syntra' } } });
const cipher = createCipher({ keys: { k1: randomBytes(32).toString('base64') }, current: 'k1' });
const run = Date.now().toString(36);
const sf = (n: number) => `${Date.now()}${n}`.replace(/\D/g, '').padEnd(18, '5').slice(0, 18);

const GUILD = sf(1), ROLE_OK = sf(2), USER = sf(3);
const discord = {
  getMember: vi.fn(async (_g: string, id: string) => (id === USER ? { id, username: 'bob', roles: ['r1'] } : null)),
  addRoles: vi.fn(async () => {}),
  removeRoles: vi.fn(async () => {}),
  sendDm: vi.fn(async () => {}),
} as unknown as DiscordActions & { addRoles: ReturnType<typeof vi.fn>; sendDm: ReturnType<typeof vi.fn> };
const jobs: ActionJob[] = [];

let app: Awaited<ReturnType<typeof buildServer>>;
let projectId: string;
let creds: { keyId: string; secret: string };

async function makeKey(scopes: string[]) {
  const c = generateApiCredentials();
  await prisma.apiKey.create({ data: { projectId, keyId: c.keyId, name: 'test', secretEnc: cipher.encrypt(c.secret, aad.apiKey(projectId, c.keyId)), scopes } });
  return c;
}

function signed(c: { keyId: string; secret: string }, method: string, url: string, body = '', extra: Record<string, string> = {}) {
  const ts = Math.floor(Date.now() / 1000);
  const nonce = randomBytes(8).toString('hex');
  return {
    method: method as 'GET' | 'POST', url, payload: body,
    headers: {
      'content-type': 'application/json', 'x-syntra-key-id': c.keyId, 'x-syntra-timestamp': String(ts), 'x-syntra-nonce': nonce,
      'x-syntra-signature': sign(c.secret, { timestamp: ts, nonce, method, pathQuery: url, body }), ...extra,
    },
  };
}

beforeAll(async () => {
  const p = await createProjectFromTemplate(prisma, { name: 'API', slug: `t-${run}-api`, ownerDiscordId: sf(9), ownerUsername: 'o' });
  projectId = p.id;
  const g = await provisionGuild(prisma, { projectId, discordGuildId: GUILD, label: 'Main', kind: 'main', isPrimary: true });
  await prisma.moduleInstance.update({
    where: { projectId_moduleKey_scopeKey: { projectId, moduleKey: 'whitelist', scopeKey: g.id } },
    data: { enabled: true, config: { acceptRoleIds: [ROLE_OK], removeRoleIdsOnAccept: [], refuseRoleIds: [], sendDm: true } },
  });
  creds = await makeKey(['webhooks:whitelist', 'members:check', 'bridge:report', 'bridge:link']);
  app = await buildServer(
    {
      prisma, config: new ConfigService(prisma, new LocalConfigBus()), discord, cipher, nonces: new InMemoryNonceStore(),
      limiter: { allow: async () => true }, jobs: { enqueue: async (j) => void jobs.push(j) },
      bridge: { push: async () => {}, pop: async () => [] }, audit: new AuditService(prisma),
    },
    { logger: false },
  );
});

afterAll(async () => {
  await app.close();
  await prisma.project.deleteMany({ where: { slug: { startsWith: `t-${run}` } } });
  await prisma.$disconnect();
});

describe('POST /v1/webhooks/whitelist', () => {
  const body = JSON.stringify({ discordId: USER, decision: 'accepted' });

  it('401 sans signature', async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/webhooks/whitelist', payload: body, headers: { 'content-type': 'application/json' } });
    expect(res.statusCode).toBe(401);
  });

  it('accepte : attribue le rôle, envoie le MP, journalise', async () => {
    const res = await app.inject(signed(creds, 'POST', '/v1/webhooks/whitelist', body, { 'idempotency-key': 'idem-key-0001' }));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, rolesApplied: 1, dmSent: true });
    expect(discord.addRoles).toHaveBeenCalledWith(GUILD, USER, [ROLE_OK], expect.any(String));
    expect(discord.sendDm).toHaveBeenCalledOnce();
    expect(await prisma.auditLog.count({ where: { projectId, action: 'whitelist.decision' } })).toBe(1);
  });

  it('idempotent : un rejeu avec la même clé ne ré-exécute pas', async () => {
    const res = await app.inject(signed(creds, 'POST', '/v1/webhooks/whitelist', body, { 'idempotency-key': 'idem-key-0001' }));
    expect(res.json()).toMatchObject({ duplicate: true });
    expect(discord.addRoles).toHaveBeenCalledTimes(1);
  });

  it('409 si la même clé est réutilisée avec un autre contenu', async () => {
    const other = JSON.stringify({ discordId: USER, decision: 'refused' });
    const res = await app.inject(signed(creds, 'POST', '/v1/webhooks/whitelist', other, { 'idempotency-key': 'idem-key-0001' }));
    expect(res.statusCode).toBe(409);
  });

  it('400 sans Idempotency-Key ; 400 si champ inconnu', async () => {
    expect((await app.inject(signed(creds, 'POST', '/v1/webhooks/whitelist', body))).statusCode).toBe(400);
    const bad = JSON.stringify({ discordId: USER, decision: 'accepted', extra: 1 });
    expect((await app.inject(signed(creds, 'POST', '/v1/webhooks/whitelist', bad, { 'idempotency-key': 'idem-key-0002' }))).statusCode).toBe(400);
  });

  it('404 si le membre est absent du Discord', async () => {
    const b = JSON.stringify({ discordId: sf(77), decision: 'accepted' });
    expect((await app.inject(signed(creds, 'POST', '/v1/webhooks/whitelist', b, { 'idempotency-key': 'idem-key-0003' }))).statusCode).toBe(404);
  });

  it('403/401 : une clé sans le bon scope est refusée', async () => {
    const limited = await makeKey(['members:check']);
    const res = await app.inject(signed(limited, 'POST', '/v1/webhooks/whitelist', body, { 'idempotency-key': 'idem-key-0004' }));
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /v1/guilds/:guildId/members/:userId/check', () => {
  it('présent / absent', async () => {
    const ok = await app.inject(signed(creds, 'GET', `/v1/guilds/${GUILD}/members/${USER}/check`));
    expect(ok.json()).toEqual({ present: true, roles: ['r1'] });
    const no = await app.inject(signed(creds, 'GET', `/v1/guilds/${GUILD}/members/${sf(55)}/check`));
    expect(no.json()).toEqual({ present: false, roles: [] });
  });
  it('404 pour un serveur qui n’appartient pas au projet', async () => {
    const res = await app.inject(signed(creds, 'GET', `/v1/guilds/${sf(66)}/members/${USER}/check`));
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /v1/bridge/report', () => {
  it('202 et job mis en file', async () => {
    const report = { identifier: 'license:abc', externalId: '42', serverId: 12, reason: 'cheater', coords: { x: 1, y: 2, z: 3 }, health: 200, armor: 0, weapon: null, vehicle: null, nearby: [] };
    const res = await app.inject(signed(creds, 'POST', '/v1/bridge/report', JSON.stringify(report)));
    expect(res.statusCode).toBe(202);
    expect(jobs[0]).toMatchObject({ type: 'report.create', projectId });
  });
  it('rejette un rejeu exact (anti-replay)', async () => {
    const req = signed(creds, 'GET', `/v1/guilds/${GUILD}/members/${USER}/check`);
    expect((await app.inject(req)).statusCode).toBe(200);
    expect((await app.inject(req)).statusCode).toBe(401);
  });
});

describe('POST /v1/bridge/link', () => {
  it('enregistre la liaison Discord <-> identifiants, le dernier compte fait foi', async () => {
    const D1 = sf(31), D2 = sf(32);
    const link = (discordId: string) => JSON.stringify({ discordId, identifiers: ['license:zzz', 'license2:zzz'] });
    expect((await app.inject(signed(creds, 'POST', '/v1/bridge/link', link(D1)))).json()).toEqual({ linked: 2 });
    await app.inject(signed(creds, 'POST', '/v1/bridge/link', link(D2)));
    const rows = await prisma.playerLink.findMany({ where: { projectId, identifier: { in: ['license:zzz', 'license2:zzz'] } } });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.discordId === D2)).toBe(true);
  });
});

describe('POST /v1/bridge/report/event', () => {
  it('202 et job report.event', async () => {
    const ev = { externalId: '42', type: 'message', kind: 'player', author: 'Bob', text: 'bonjour' };
    const res = await app.inject(signed(creds, 'POST', '/v1/bridge/report/event', JSON.stringify(ev)));
    expect(res.statusCode).toBe(202);
    expect(jobs.at(-1)).toMatchObject({ type: 'report.event', projectId, event: { externalId: '42', type: 'message' } });
  });
  it('400 sur un type inconnu', async () => {
    const res = await app.inject(signed(creds, 'POST', '/v1/bridge/report/event', JSON.stringify({ externalId: '1', type: 'delete', author: 'x' })));
    expect(res.statusCode).toBe(400);
  });
});
