import type { PrismaClient, TicketStatus } from '@syntra/db';
import { MODULE_CONFIG_SCHEMAS, renderTemplate, type Locale, type ModuleKey } from '@syntra/shared';
import type { z } from 'zod';
import type { ConfigBus } from './bus';

interface Entry {
  projectId: string;
  value: unknown;
  expires: number;
}

export interface ResolvedGuild {
  projectId: string;
  guildId: string; // id interne
  discordGuildId: string;
  kind: string;
}

export type ModuleState<K extends ModuleKey> =
  | { enabled: false; configured: boolean }
  | { enabled: true; configured: true; config: z.infer<(typeof MODULE_CONFIG_SCHEMAS)[K]> }
  | { enabled: true; configured: false; error: string };

/**
 * Accès en lecture à la configuration avec cache RAM (TTL court) et invalidation temps réel.
 * Toute valeur métier (textes, statuts, modules) passe par ici : rien n'est lu en dur.
 */
export class ConfigService {
  private cache = new Map<string, Entry>();

  constructor(
    private prisma: PrismaClient,
    bus?: ConfigBus,
    private ttlMs = 60_000,
  ) {
    void bus?.subscribe((projectId) => this.invalidate(projectId));
  }

  invalidate(projectId: string) {
    for (const [k, e] of this.cache) if (e.projectId === projectId) this.cache.delete(k);
  }

  private async memo<T>(key: string, projectId: string, load: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.value as T;
    const value = await load();
    this.cache.set(key, { projectId, value, expires: Date.now() + this.ttlMs });
    return value;
  }

  /** guild Discord -> projet. null = serveur inconnu (événement à ignorer). */
  async resolveGuild(discordGuildId: string): Promise<ResolvedGuild | null> {
    const hit = this.cache.get(`g:${discordGuildId}`);
    if (hit && hit.expires > Date.now()) return hit.value as ResolvedGuild | null;
    const g = await this.prisma.guild.findUnique({ where: { discordGuildId } });
    const value: ResolvedGuild | null = g ? { projectId: g.projectId, guildId: g.id, discordGuildId, kind: g.kind } : null;
    // Pas de cache négatif long : un serveur peut être rattaché à tout moment
    this.cache.set(`g:${discordGuildId}`, { projectId: g?.projectId ?? '', value, expires: Date.now() + (g ? this.ttlMs : 5_000) });
    return value;
  }

  async getModule<K extends ModuleKey>(projectId: string, key: K, guildId?: string): Promise<ModuleState<K>> {
    const scopeKey = guildId ?? 'project';
    const row = await this.memo(`m:${projectId}:${key}:${scopeKey}`, projectId, () =>
      this.prisma.moduleInstance.findUnique({ where: { projectId_moduleKey_scopeKey: { projectId, moduleKey: key, scopeKey } } }),
    );
    if (!row?.enabled) return { enabled: false, configured: !!row };
    const parsed = MODULE_CONFIG_SCHEMAS[key].safeParse(row.config);
    return parsed.success
      ? { enabled: true, configured: true, config: parsed.data as z.infer<(typeof MODULE_CONFIG_SCHEMAS)[K]> }
      : { enabled: true, configured: false, error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
  }

  getStatuses(projectId: string): Promise<TicketStatus[]> {
    return this.memo(`s:${projectId}`, projectId, () =>
      this.prisma.ticketStatus.findMany({ where: { projectId }, orderBy: { position: 'asc' } }),
    );
  }

  async getProjectLocale(projectId: string): Promise<Locale> {
    const p = await this.memo(`p:${projectId}`, projectId, () => this.prisma.project.findUnique({ where: { id: projectId }, select: { locale: true } }));
    return p?.locale === 'en' ? 'en' : 'fr';
  }

  /** Texte configurable. Repli : locale demandée -> locale du projet -> clé brute (jamais d'exception). */
  async message(projectId: string, key: string, vars: Record<string, string | number> = {}, locale?: Locale): Promise<string> {
    const wanted = locale ?? (await this.getProjectLocale(projectId));
    const rows = await this.memo(`t:${projectId}:${key}`, projectId, () =>
      this.prisma.messageTemplate.findMany({ where: { projectId, key } }),
    );
    const row = rows.find((r) => r.locale === wanted) ?? rows[0];
    return row ? renderTemplate(row.content, vars) : key;
  }
}
