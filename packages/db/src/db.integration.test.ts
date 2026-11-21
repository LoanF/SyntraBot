import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createProjectFromTemplate, forProject, provisionGuild } from './index';

const url = process.env.DATABASE_URL ?? 'postgresql://syntra:syntra@localhost:5432/syntra';
const prisma = new PrismaClient({ datasources: { db: { url } } });
const run = Date.now().toString(36);
const snow = (n: number) => `${run.replace(/\D/g, '1')}${n}`.padEnd(18, '7').slice(0, 18);

afterAll(async () => {
  await prisma.project.deleteMany({ where: { slug: { startsWith: `t-${run}` } } });
  await prisma.$disconnect();
});

describe('provision + tenant isolation (Postgres réel)', () => {
  it('clone le template et rattache un serveur', async () => {
    const p = await createProjectFromTemplate(prisma, { name: 'A', slug: `t-${run}-a`, ownerDiscordId: snow(1), ownerUsername: 'owner' });
    expect(await prisma.ticketStatus.count({ where: { projectId: p.id } })).toBe(5);
    expect(await prisma.messageTemplate.count({ where: { projectId: p.id } })).toBeGreaterThan(10);

    const g = await provisionGuild(prisma, { projectId: p.id, discordGuildId: snow(2), label: 'Légal', kind: 'legal' });
    const mods = await prisma.moduleInstance.findMany({ where: { projectId: p.id, guildId: g.id } });
    expect(mods.map((m) => m.moduleKey).sort()).toEqual(['douane', 'embeds', 'sync_roles', 'tickets', 'whitelist']);
    expect(mods.every((m) => !m.enabled)).toBe(true);
    const poles = await prisma.ticketPole.findMany({ where: { guildId: g.id }, include: { questions: true } });
    expect(poles).toHaveLength(1);
    expect(poles[0]!.questions).toHaveLength(2);
  });

  it('forProject empêche toute lecture/écriture inter-projets', async () => {
    const a = await createProjectFromTemplate(prisma, { name: 'A2', slug: `t-${run}-a2`, ownerDiscordId: snow(3), ownerUsername: 'o3' });
    const b = await createProjectFromTemplate(prisma, { name: 'B2', slug: `t-${run}-b2`, ownerDiscordId: snow(4), ownerUsername: 'o4' });
    const dbA = forProject(prisma, a.id);

    const statuses = await dbA.ticketStatus.findMany();
    expect(statuses.length).toBe(5);
    expect(statuses.every((s) => s.projectId === a.id)).toBe(true);

    const bStatus = await prisma.ticketStatus.findFirstOrThrow({ where: { projectId: b.id } });
    // Un id appartenant au projet B est invisible depuis le client A
    expect(await dbA.ticketStatus.findFirst({ where: { id: bStatus.id } })).toBeNull();
    // et ne peut être modifié/supprimé
    expect((await dbA.ticketStatus.updateMany({ where: { id: bStatus.id }, data: { label: 'hack' } })).count).toBe(0);
    expect((await dbA.ticketStatus.deleteMany({ where: { id: bStatus.id } })).count).toBe(0);
    expect((await prisma.ticketStatus.findUniqueOrThrow({ where: { id: bStatus.id } })).label).not.toBe('hack');

    // create : projectId forcé même si l'appelant tente de viser B
    const snip = await dbA.ticketSnippet.create({ data: { key: 'x', title: 't', content: 'c', projectId: b.id } as never });
    expect(snip.projectId).toBe(a.id);
  });
});

describe('prise en charge atomique', () => {
  it('deux membres du staff en même temps : un seul obtient le ticket', async () => {
    const p = await createProjectFromTemplate(prisma, { name: 'C', slug: `t-${run}-claim`, ownerDiscordId: snow(5), ownerUsername: 'o5' });
    const g = await provisionGuild(prisma, { projectId: p.id, discordGuildId: snow(6), label: 'Staff', kind: 'staff' });
    const pole = await prisma.ticketPole.findFirstOrThrow({ where: { guildId: g.id } });
    const status = await prisma.ticketStatus.findFirstOrThrow({ where: { projectId: p.id, trigger: 'ON_CREATE' } });
    const t = await prisma.ticket.create({ data: { projectId: p.id, guildId: g.id, poleId: pole.id, number: 1, userDiscordId: snow(7), username: 'joueur', statusId: status.id } });

    // même condition que TicketService.claim : libre OU déjà à soi
    const claim = (staffId: string, name: string) =>
      prisma.ticket.updateMany({
        where: { id: t.id, closedAt: null, OR: [{ claimedByDiscordId: null }, { claimedByDiscordId: staffId }] },
        data: { claimedByDiscordId: staffId, claimedByName: name, claimedAt: new Date() },
      });
    const [a, b] = await Promise.all([claim('111111111111111111', 'Alice'), claim('222222222222222222', 'Bob')]);
    expect(a.count + b.count).toBe(1);

    const owner = (await prisma.ticket.findUniqueOrThrow({ where: { id: t.id } })).claimedByDiscordId!;
    // le responsable peut re-prendre (idempotent), l'autre est refusé
    expect((await claim(owner, 'x')).count).toBe(1);
    expect((await claim(owner === '111111111111111111' ? '222222222222222222' : '111111111111111111', 'y')).count).toBe(0);
  });
});
