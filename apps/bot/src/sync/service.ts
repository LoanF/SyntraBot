import { diffRoles, type PlayerJob, type SyncRule } from '@syntra/core';
import type { BotContext } from '../context';

const TICK_MS = 60_000;
const MAX_PER_RUN = 300;
const PAUSE_MS = 250; // ménage l'API Discord

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Synchronise les rôles Discord depuis le métier/grade en jeu (BDD FiveM), pour les joueurs dont le compte est lié. */
export class SyncRolesService {
  private lastRun = new Map<string, number>();
  private cursor = new Map<string, number>();
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  constructor(private ctx: BotContext) {}

  start() {
    this.timer = setInterval(() => this.tick().catch((err) => this.ctx.log.warn({ err }, 'sync rôles : tick en échec')), TICK_MS);
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick() {
    if (this.running) return; // jamais deux passes en parallèle
    this.running = true;
    try {
      const rows = await this.ctx.prisma.moduleInstance.findMany({ where: { moduleKey: 'sync_roles', enabled: true, guildId: { not: null } }, include: { guild: true } });
      for (const row of rows) {
        const mod = await this.ctx.config.getModule(row.projectId, 'sync_roles', row.guildId!);
        if (!mod.enabled || !mod.configured || !row.guild) continue;
        if (Date.now() < (this.lastRun.get(row.id) ?? 0) + mod.config.intervalMinutes * 60_000) continue;
        this.lastRun.set(row.id, Date.now());
        await this.run(row.projectId, row.guild.id, row.guild.discordGuildId, row.id).catch((err) => this.ctx.log.warn({ err, projectId: row.projectId }, 'sync rôles : passe en échec'));
      }
    } finally {
      this.running = false;
    }
  }

  async run(projectId: string, guildId: string, discordGuildId: string, key: string) {
    const { prisma, client, players, log } = this.ctx;
    const guild = client.guilds.cache.get(discordGuildId);
    if (!guild) return;
    const rules: SyncRule[] = (await prisma.roleSyncRule.findMany({ where: { projectId, guildId, enabled: true } })).map((r) => ({
      source: r.source, matchValue: r.matchValue, discordRoleId: r.discordRoleId, removeWhenUnmatched: r.removeWhenUnmatched,
    }));
    if (rules.length === 0) return;

    const links = await prisma.playerLink.findMany({ where: { projectId }, orderBy: { discordId: 'asc' } });
    const byDiscord = new Map<string, string[]>();
    for (const l of links) byDiscord.set(l.discordId, [...(byDiscord.get(l.discordId) ?? []), l.identifier]);
    const ids = [...byDiscord.keys()];
    const start = this.cursor.get(key) ?? 0;
    const batch = ids.slice(start, start + MAX_PER_RUN);
    this.cursor.set(key, start + MAX_PER_RUN >= ids.length ? 0 : start + MAX_PER_RUN);

    let changed = 0;
    for (const discordId of batch) {
      const member = await guild.members.fetch(discordId).catch(() => null);
      if (!member) continue;
      const sheet = await players.lookup(projectId, byDiscord.get(discordId)!).catch(() => null);
      if (!sheet) continue;
      // Plusieurs personnages par licence : on prend l'union des métiers (meilleur effort, documenté)
      const jobs: PlayerJob[] = sheet.characters.filter((c) => c.jobName !== undefined).map((c) => ({ name: c.jobName!, grade: c.jobGrade ?? 0 }));
      const { add, remove } = diffRoles(rules, jobs, new Set(member.roles.cache.keys()));
      try {
        if (add.length) await member.roles.add(add, 'Synchro métier/grade');
        if (remove.length) await member.roles.remove(remove, 'Synchro métier/grade');
        if (add.length || remove.length) changed++;
      } catch (err) {
        log.warn({ err, discordId }, 'sync rôles : modification impossible (hiérarchie des rôles ?)');
      }
      await sleep(PAUSE_MS);
    }
    if (changed) log.info({ projectId, guildId, changed }, 'sync rôles : membres mis à jour');
  }
}
