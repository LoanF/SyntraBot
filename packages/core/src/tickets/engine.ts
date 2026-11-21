import type { TicketStatus } from '@syntra/db';

export type StatusEvent = 'ON_CREATE' | 'ON_USER_REPLY' | 'ON_STAFF_REPLY';

/**
 * Détermine la pastille cible pour un événement. null = ne rien changer.
 * Règles : statut courant verrouillé (lockAutoChange) ou terminal => jamais de changement automatique.
 */
export function pickAutoStatus(statuses: readonly TicketStatus[], current: TicketStatus | null, event: StatusEvent): TicketStatus | null {
  if (current && (current.lockAutoChange || current.isTerminal)) return null;
  const target = statuses.find((s) => s.trigger === event);
  if (!target || target.id === current?.id) return null;
  return target;
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');

/** Applique le pattern configurable et produit un nom de salon valide (≤100, sans caractères interdits). */
export function buildChannelName(pattern: string, vars: { emoji: string; pole: string; username: string; id: string | number }): string {
  const out = pattern
    .replace('{emoji}', vars.emoji)
    .replace('{pole}', slug(vars.pole) || 'ticket')
    .replace('{username}', slug(vars.username) || 'joueur')
    .replace('{id}', String(vars.id));
  return [...out.replace(/\s+/g, '-')].slice(0, 100).join('');
}

export interface RenameQueueOptions {
  debounceMs: number;
  /** Discord : 2 renommages / 10 min / salon */
  windowMs?: number;
  maxPerWindow?: number;
  now?: () => number;
  onError?: (channelId: string, err: unknown) => void;
}

/**
 * File de renommage anti rate-limit : coalesce les demandes (seul le dernier nom compte),
 * debounce, et respecte le quota Discord en repoussant l'exécution si nécessaire.
 */
export class RenameQueue {
  private state = new Map<string, { pending: string; timer: ReturnType<typeof setTimeout>; last?: string }>();
  private history = new Map<string, number[]>();
  private windowMs: number;
  private max: number;
  private now: () => number;

  constructor(
    private apply: (channelId: string, name: string) => Promise<void>,
    private opts: RenameQueueOptions,
  ) {
    this.windowMs = opts.windowMs ?? 600_000;
    this.max = opts.maxPerWindow ?? 2;
    this.now = opts.now ?? Date.now;
  }

  schedule(channelId: string, name: string, debounceMs = this.opts.debounceMs) {
    const prev = this.state.get(channelId);
    if (prev) clearTimeout(prev.timer);
    const hist = (this.history.get(channelId) ?? []).filter((t) => t > this.now() - this.windowMs);
    this.history.set(channelId, hist);
    const allowedAt = hist.length >= this.max ? hist[hist.length - this.max]! + this.windowMs : 0;
    const delay = Math.max(debounceMs, allowedAt - this.now());
    const timer = setTimeout(() => void this.run(channelId), delay);
    this.state.set(channelId, { pending: name, timer, ...(prev?.last !== undefined ? { last: prev.last } : {}) });
  }

  private async run(channelId: string) {
    const s = this.state.get(channelId);
    if (!s) return;
    if (s.pending !== s.last) {
      try {
        await this.apply(channelId, s.pending);
        this.history.get(channelId)?.push(this.now());
        this.state.set(channelId, { ...s, last: s.pending });
        return;
      } catch (err) {
        this.state.delete(channelId);
        this.opts.onError?.(channelId, err);
        return;
      }
    }
    this.state.delete(channelId);
  }

  dispose() {
    for (const s of this.state.values()) clearTimeout(s.timer);
    this.state.clear();
  }
}
