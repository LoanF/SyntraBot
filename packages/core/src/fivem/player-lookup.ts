import dns from 'node:dns/promises';
import mysql from 'mysql2/promise';
import type { PrismaClient } from '@syntra/db';
import { fivemMapping, SsrfError, ValidationError, type FivemMapping, type PlayerSnapshot } from '@syntra/shared';
import { aad, isPrivateAddress, type Cipher } from '@syntra/security';

// --------------------------------------------------------------------------- connexion

export interface DbTarget {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl: boolean;
}

/**
 * Parse `mysql://user:pass@host:port/db?ssl=true`. Tolère les mots de passe contenant `@` ou `%` non encodés
 * (cas fréquent dans un server.cfg) : le dernier `@` sépare les identifiants de l'hôte.
 */
export function parseConnectionString(raw: string): DbTarget {
  const m = /^mysql:\/\/([^:/@]+):(.*)@([^@/:?]+)(?::(\d{1,5}))?\/([^?]+)(?:\?(.*))?$/.exec(raw.trim());
  if (!m) throw new ValidationError('Chaîne de connexion invalide (attendu : mysql://user:pass@host:port/base)');
  const [, user, pass, host, port, database, query] = m as unknown as [string, string, string, string, string | undefined, string, string | undefined];
  let password = pass;
  try {
    password = decodeURIComponent(pass);
  } catch {
    /* mot de passe brut avec % littéral : on le garde tel quel */
  }
  return { host, port: port ? Number(port) : 3306, user: decodeURIComponent(user), password, database, ssl: new URLSearchParams(query ?? '').get('ssl') === 'true' };
}

/** Résout l'hôte ET valide l'IP (anti-SSRF) ; on se connecte ensuite à l'IP résolue (pas de rebinding). */
async function resolveHost(host: string, allowPrivate: boolean): Promise<string> {
  const addrs = await dns.lookup(host, { all: true });
  if (addrs.length === 0) throw new SsrfError('Hôte introuvable');
  if (!allowPrivate && addrs.some((a) => isPrivateAddress(a.address))) throw new SsrfError('Hôte en réseau privé interdit');
  return addrs[0]!.address;
}

const WRITE_PRIVS = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|GRANT OPTION|FILE|SUPER|ALL PRIVILEGES|PROCESS|SHUTDOWN)\b/i;

/** Refuse un compte BDD qui n'est pas strictement en lecture seule. Retourne la liste des privilèges problématiques. */
export function assertReadOnlyGrants(grants: readonly string[]): string[] {
  const bad = new Set<string>();
  for (const g of grants) {
    const privs = /^GRANT (.+?) ON /i.exec(g)?.[1] ?? '';
    for (const m of privs.matchAll(new RegExp(WRITE_PRIVS, 'gi'))) bad.add(m[1]!.toUpperCase());
  }
  return [...bad];
}

// --------------------------------------------------------------------------- requêtes (paramétrées)

const q = (id: string) => `\`${id}\``; // les identifiants ont déjà été validés par Zod ([A-Za-z0-9_]+)

export interface BuiltQuery {
  sql: string;
  params: string[];
}

export function buildQueries(mappingInput: unknown, identifiers: readonly string[]) {
  const mapping = fivemMapping.parse(mappingInput);
  const ids = identifiers.slice(0, 10);
  if (ids.length === 0) throw new ValidationError('Aucun identifiant joueur');
  const marks = ids.map(() => '?').join(',');
  const p = mapping.players;

  const cols = [p.idColumn, p.nameColumn, p.charinfo, p.job, p.money, p.phone].filter((c): c is string => !!c);
  const characters: BuiltQuery = {
    sql: `SELECT ${[...new Set(cols)].map(q).join(', ')} FROM ${q(p.table)} WHERE ${q(p.licenseColumn)} IN (${marks}) LIMIT 10`,
    params: [...ids],
  };

  let bans: BuiltQuery | undefined;
  if (mapping.bans) {
    const b = mapping.bans;
    const expire = b.expireColumn ? `, ${q(b.expireColumn)}` : '';
    const reason = b.reasonColumn ? `, ${q(b.reasonColumn)}` : '';
    bans = { sql: `SELECT 1 AS ${q('_')}${expire}${reason} FROM ${q(b.table)} WHERE ${q(b.licenseColumn)} IN (${marks}) LIMIT 50`, params: [...ids] };
  }
  let warns: BuiltQuery | undefined;
  if (mapping.warns) {
    const w = mapping.warns;
    const extra = [w.kindColumn && w.kindValue ? `${q(w.kindColumn)} = ?` : null, w.revokedColumn ? `${q(w.revokedColumn)} = 0` : null].filter(Boolean);
    warns = {
      sql: `SELECT COUNT(*) AS ${q('n')} FROM ${q(w.table)} WHERE ${q(w.licenseColumn)} IN (${marks})${extra.map((e) => ` AND ${e}`).join('')}`,
      params: [...ids, ...(w.kindColumn && w.kindValue ? [w.kindValue] : [])],
    };
  }
  return { mapping, characters, bans, warns };
}

// --------------------------------------------------------------------------- mise en forme

const json = (v: unknown): Record<string, unknown> => {
  let value = v;
  if (typeof v === 'string') {
    try {
      value = JSON.parse(v);
    } catch {
      return {};
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
};
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

export function shapeCharacter(row: Record<string, unknown>, mapping: FivemMapping): PlayerSnapshot['characters'][number] {
  const p = mapping.players;
  const info = p.charinfo ? json(row[p.charinfo]) : {};
  const job = p.job ? json(row[p.job]) : {};
  const money = p.money ? json(row[p.money]) : {};
  const grade = json(job.grade);
  const fullName = [info.firstname, info.lastname].filter((x): x is string => typeof x === 'string').join(' ');
  const name = fullName || (p.nameColumn ? String(row[p.nameColumn] ?? '') : '');
  const jobLabel = typeof job.label === 'string' ? `${job.label}${typeof grade.name === 'string' ? ` (${grade.name})` : ''}` : undefined;
  const cash = num(money.cash);
  const bank = num(money.bank);
  const phone = p.phone ? row[p.phone] : undefined;
  return {
    citizenId: String(row[p.idColumn]),
    ...(name ? { name } : {}),
    ...(jobLabel ? { job: jobLabel } : {}),
    ...(typeof job.name === 'string' ? { jobName: job.name } : {}),
    ...(typeof grade.level === 'number' ? { jobGrade: grade.level } : {}),
    ...(cash !== undefined ? { cash } : {}),
    ...(bank !== undefined ? { bank } : {}),
    ...(typeof phone === 'string' && phone ? { phone } : {}),
  };
}

export function sheetUrlFor(template: string | undefined, identifiers: readonly string[], discordId?: string): string | undefined {
  if (!template) return undefined;
  const first = identifiers[0] ?? '';
  return template.replace('{identifier}', encodeURIComponent(first)).replace('{discordId}', encodeURIComponent(discordId ?? ''));
}

// --------------------------------------------------------------------------- service

export class PlayerLookupService {
  constructor(
    private prisma: PrismaClient,
    private cipher: Cipher,
    private timeoutMs = 3000,
  ) {}

  private async connect(projectId: string) {
    const row = await this.prisma.fivemDatabase.findUnique({ where: { projectId } });
    if (!row) return null;
    const target = parseConnectionString(this.cipher.decrypt(row.connectionEnc, aad.fivemDb(projectId)));
    const host = await resolveHost(target.host, row.allowPrivateNetwork);
    const conn = await mysql.createConnection({
      host, port: target.port, user: target.user, password: target.password, database: target.database,
      connectTimeout: this.timeoutMs, multipleStatements: false, ...(target.ssl ? { ssl: { rejectUnauthorized: true, servername: target.host } as mysql.SslOptions } : {}),
    });
    return { conn, row };
  }

  /** Fiche joueur à partir de ses identifiants FiveM (license, license2…). null si BDD non configurée. */
  async lookup(projectId: string, identifiers: readonly string[], opts: { sheetUrlTemplate?: string; discordId?: string } = {}): Promise<PlayerSnapshot | null> {
    const c = await this.connect(projectId);
    if (!c) return null;
    try {
      const { mapping, characters, bans, warns } = buildQueries(c.row.mapping, identifiers);
      const run = async (b: BuiltQuery) => (await c.conn.query({ sql: b.sql, values: b.params, timeout: this.timeoutMs }))[0] as Record<string, unknown>[];

      const chars = (await run(characters)).map((r) => shapeCharacter(r, mapping));
      const now = Math.floor(Date.now() / 1000);
      const activeBans = bans
        ? (await run(bans)).filter((r) => {
            const exp = mapping.bans?.expireColumn ? Number(r[mapping.bans.expireColumn]) : NaN;
            return !Number.isFinite(exp) || exp === 0 || exp > now; // pas d'expiration (ou permanent) = actif
          }).length
        : 0;
      const warnCount = warns ? Number((await run(warns))[0]?.n ?? 0) : 0;
      const sheetUrl = sheetUrlFor(opts.sheetUrlTemplate, identifiers, opts.discordId);
      return { identifiers: [...identifiers], characters: chars, activeBans, warns: warnCount, ...(sheetUrl ? { sheetUrl } : {}) };
    } finally {
      await c.conn.end().catch(() => undefined);
    }
  }

  async lookupByDiscord(projectId: string, discordId: string, sheetUrlTemplate?: string): Promise<PlayerSnapshot | null> {
    const links = await this.prisma.playerLink.findMany({ where: { projectId, discordId }, select: { identifier: true } });
    if (links.length === 0) return null;
    return this.lookup(projectId, links.map((l) => l.identifier), { discordId, ...(sheetUrlTemplate ? { sheetUrlTemplate } : {}) });
  }

  /** Test de connexion (dashboard) : joignable, mapping valide, compte en lecture seule. */
  async testConnection(projectId: string): Promise<{ ok: boolean; problems: string[] }> {
    const problems: string[] = [];
    const c = await this.connect(projectId);
    if (!c) return { ok: false, problems: ['Aucune base configurée'] };
    try {
      const [grants] = (await c.conn.query('SHOW GRANTS FOR CURRENT_USER()')) as [Record<string, string>[], unknown];
      const bad = assertReadOnlyGrants(grants.map((g) => Object.values(g)[0]!));
      if (bad.length) problems.push(`Le compte BDD possède des droits d'écriture : ${bad.join(', ')}`);
      const { characters } = buildQueries(c.row.mapping, ['probe']);
      await c.conn.query({ sql: characters.sql, values: characters.params, timeout: this.timeoutMs });
    } catch (e) {
      problems.push(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      await c.conn.end().catch(() => undefined);
    }
    await this.prisma.fivemDatabase.update({ where: { projectId }, data: { lastCheckAt: new Date(), lastCheckOk: problems.length === 0 } });
    return { ok: problems.length === 0, problems };
  }
}
