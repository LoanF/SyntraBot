import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mysql from 'mysql2/promise';
import { PrismaClient, createProjectFromTemplate } from '@syntra/db';
import { FIVEM_PRESETS, SYNTRA_MAPPING } from '@syntra/shared';
import { aad, createCipher } from '@syntra/security';
import { assertReadOnlyGrants, buildQueries, parseConnectionString, PlayerLookupService, shapeCharacter, sheetUrlFor } from './fivem/player-lookup';

describe('parseConnectionString', () => {
  it('gère un mot de passe avec @ et % bruts (cas réel d\'un server.cfg)', () => {
    const t = parseConnectionString('mysql://syntra:p@ss%word!@10.0.0.5:3307/syntradb?charset=utf8mb4');
    expect(t).toMatchObject({ user: 'syntra', password: 'p@ss%word!', host: '10.0.0.5', port: 3307, database: 'syntradb', ssl: false });
  });
  it('port par défaut et ssl', () => {
    expect(parseConnectionString('mysql://u:p@db.example.com/x?ssl=true')).toMatchObject({ port: 3306, ssl: true });
  });
  it('refuse un format invalide', () => {
    expect(() => parseConnectionString('postgres://x')).toThrow();
  });
});

describe('buildQueries', () => {
  it('requêtes paramétrées pour le preset Qbox', () => {
    const { characters, bans } = buildQueries(FIVEM_PRESETS.QBOX, ['license:a', 'license2:b']);
    expect(characters.sql).toBe('SELECT `citizenid`, `name`, `charinfo`, `job`, `money`, `phone_number` FROM `players` WHERE `license` IN (?,?) LIMIT 10');
    expect(characters.params).toEqual(['license:a', 'license2:b']);
    expect(bans?.sql).toContain('FROM `bans`');
  });
  it('refuse toute tentative d\'injection dans le mapping', () => {
    const evil = { players: { ...FIVEM_PRESETS.QBOX!.players, table: 'players`; DROP TABLE players; --' } };
    expect(() => buildQueries(evil, ['x'])).toThrow();
  });
  it('une valeur d\'identifiant malveillante reste un paramètre', () => {
    const { characters } = buildQueries(FIVEM_PRESETS.QBOX, ["x' OR '1'='1"]);
    expect(characters.sql).not.toContain('OR');
    expect(characters.params).toEqual(["x' OR '1'='1"]);
  });
});

describe('assertReadOnlyGrants', () => {
  it('SELECT seul = OK', () => {
    expect(assertReadOnlyGrants(["GRANT SELECT ON `fivem`.* TO `ro`@`%`", 'GRANT USAGE ON *.* TO `ro`@`%`'])).toEqual([]);
  });
  it('détecte les droits d\'écriture', () => {
    expect(assertReadOnlyGrants(['GRANT ALL PRIVILEGES ON `fivem`.* TO `x`@`%`']).length).toBeGreaterThan(0);
    expect(assertReadOnlyGrants(['GRANT SELECT, INSERT, UPDATE ON *.* TO `x`@`%`']).sort()).toEqual(['INSERT', 'UPDATE']);
  });
});

describe('shapeCharacter / sheetUrlFor', () => {
  it('lit les JSON Qbox (charinfo/job/money en texte)', () => {
    const row = {
      citizenid: 'ABC123', name: 'Steam', phone_number: '5551234',
      charinfo: JSON.stringify({ firstname: 'Jean', lastname: 'Dupont' }),
      job: JSON.stringify({ name: 'police', label: 'LSPD', grade: { level: 2, name: 'Officier' } }),
      money: JSON.stringify({ cash: 120, bank: 5000, crypto: 0 }),
    };
    expect(shapeCharacter(row, FIVEM_PRESETS.QBOX!)).toEqual({ citizenId: 'ABC123', name: 'Jean Dupont', job: 'LSPD (Officier)', jobName: 'police', jobGrade: 2, cash: 120, bank: 5000, phone: '5551234' });
  });
  it('JSON corrompu ne casse rien', () => {
    expect(shapeCharacter({ citizenid: 'X', charinfo: '{oops', job: 'null', money: '' }, FIVEM_PRESETS.QBOX!)).toMatchObject({ citizenId: 'X' });
  });
  it('construit le lien de fiche web', () => {
    expect(sheetUrlFor('https://site.tld/joueur/{identifier}', ['license:abc'])).toBe('https://site.tld/joueur/license%3Aabc');
  });
});

// --------------------------------- intégration : MariaDB réelle (docker compose --profile test) ---------------------------------

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL ?? 'postgresql://syntra:syntra@localhost:5432/syntra' } } });
const cipher = createCipher({ keys: { k1: randomBytes(32).toString('base64') }, current: 'k1' });
const run = Date.now().toString(36);
let projectId: string;
let root: mysql.Connection;

beforeAll(async () => {
  root = await mysql.createConnection({ host: '127.0.0.1', port: 3307, user: 'root', password: 'root', multipleStatements: true });
  await root.query(`
    CREATE DATABASE IF NOT EXISTS fivem_${run};
    USE fivem_${run};
    CREATE TABLE players (citizenid varchar(50) PRIMARY KEY, license varchar(255), name varchar(255), money text, charinfo text, job text, phone_number varchar(20));
    CREATE TABLE bans (id int AUTO_INCREMENT PRIMARY KEY, license varchar(50), reason text, expire int);
    INSERT INTO players VALUES
      ('AAA111','license2:abc','Bob','{"cash":10,"bank":200}','{"firstname":"Jean","lastname":"Dupont"}','{"label":"Police","grade":{"name":"Chef"}}','555'),
      ('BBB222','license:abc','Bob','{"cash":1,"bank":2}','{"firstname":"Paul","lastname":"Martin"}','{"label":"Chômeur","grade":{"name":"-"}}',NULL),
      ('CCC333','license:other','Eve','{}','{}','{}',NULL);
    INSERT INTO bans (license, reason, expire) VALUES ('license:abc','old',1), ('license:abc','perm',0), ('license:abc','future',2000000000);
    DROP USER IF EXISTS 'ro_${run}'@'%';
    CREATE USER 'ro_${run}'@'%' IDENTIFIED BY 'p@ss%1';
    GRANT SELECT ON fivem_${run}.* TO 'ro_${run}'@'%';
  `);
  const p = await createProjectFromTemplate(prisma, { name: 'PL', slug: `t-${run}-pl`, ownerDiscordId: `1${Date.now()}`.slice(0, 18), ownerUsername: 'o' });
  projectId = p.id;
  await prisma.fivemDatabase.create({
    data: {
      projectId, framework: 'QBOX', mapping: FIVEM_PRESETS.QBOX as never, allowPrivateNetwork: true,
      connectionEnc: cipher.encrypt(`mysql://ro_${run}:p@ss%1@127.0.0.1:3307/fivem_${run}`, aad.fivemDb(projectId)),
    },
  });
});

afterAll(async () => {
  await root.query(`DROP DATABASE IF EXISTS fivem_${run}; DROP USER IF EXISTS 'ro_${run}'@'%'`);
  await root.end();
  await prisma.project.deleteMany({ where: { slug: { startsWith: `t-${run}` } } });
  await prisma.$disconnect();
});

describe('PlayerLookupService (MariaDB réelle)', () => {
  const svc = () => new PlayerLookupService(prisma, cipher);

  it('retrouve les personnages via license ET license2, et compte les bans actifs', async () => {
    const s = await svc().lookup(projectId, ['license:abc', 'license2:abc'], { sheetUrlTemplate: 'https://site.tld/p/{identifier}' });
    expect(s?.characters.map((c) => c.citizenId).sort()).toEqual(['AAA111', 'BBB222']);
    expect(s?.characters.find((c) => c.citizenId === 'AAA111')).toMatchObject({ name: 'Jean Dupont', job: 'Police (Chef)', cash: 10, bank: 200, phone: '555' });
    expect(s?.activeBans).toBe(2); // 'old' expiré ignoré ; permanent (0) et futur comptés
    expect(s?.sheetUrl).toBe('https://site.tld/p/license%3Aabc');
  });

  it('joueur inconnu : aucune fiche, pas d\'erreur', async () => {
    const s = await svc().lookup(projectId, ['license:nobody']);
    expect(s?.characters).toEqual([]);
  });

  it('via la liaison Discord -> identifiants', async () => {
    await prisma.playerLink.create({ data: { projectId, discordId: '123456789012345678', identifier: 'license:other' } });
    const s = await svc().lookupByDiscord(projectId, '123456789012345678');
    expect(s?.characters[0]?.citizenId).toBe('CCC333');
    expect(await svc().lookupByDiscord(projectId, '999999999999999999')).toBeNull();
  });

  it('refuse un hôte privé quand allowPrivateNetwork=false (SSRF)', async () => {
    await prisma.fivemDatabase.update({ where: { projectId }, data: { allowPrivateNetwork: false } });
    await expect(svc().lookup(projectId, ['license:abc'])).rejects.toThrow(/privé/);
    await prisma.fivemDatabase.update({ where: { projectId }, data: { allowPrivateNetwork: true } });
  });

  it('testConnection : compte en lecture seule accepté, compte root refusé', async () => {
    expect(await svc().testConnection(projectId)).toEqual({ ok: true, problems: [] });
    await prisma.fivemDatabase.update({ where: { projectId }, data: { connectionEnc: cipher.encrypt(`mysql://root:root@127.0.0.1:3307/fivem_${run}`, aad.fivemDb(projectId)) } });
    const r = await svc().testConnection(projectId);
    expect(r.ok).toBe(false);
    expect(r.problems[0]).toMatch(/écriture/);
  });
});

describe('mapping syntra-admin (syntra_sanctions)', () => {
  it('compte uniquement les warns non révoqués, valeur du type en paramètre', () => {
    const { warns } = buildQueries(SYNTRA_MAPPING, ['license2:x']);
    expect(warns?.sql).toBe('SELECT COUNT(*) AS `n` FROM `syntra_sanctions` WHERE `license` IN (?) AND `kind` = ? AND `revoked` = 0');
    expect(warns?.params).toEqual(['license2:x', 'warn']);
  });
});
