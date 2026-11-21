import { afterEach, describe, expect, it, vi } from 'vitest';
import { PermissionFlagsBits } from 'discord-api-types/v10';
import type { TicketStatus } from '@syntra/db';
import { RenameQueue, buildChannelName, computeGuildHealth, pickAutoStatus } from './index';

const st = (key: string, trigger: TicketStatus['trigger'], extra: Partial<TicketStatus> = {}): TicketStatus => ({
  id: key, projectId: 'p', key, label: key, emoji: '•', color: '#000000', trigger, lockAutoChange: false, isTerminal: false, position: 0, ...extra,
});
const statuses = [st('new', 'ON_CREATE'), st('wait_staff', 'ON_USER_REPLY'), st('wait_user', 'ON_STAFF_REPLY'), st('hold', 'MANUAL_ONLY', { lockAutoChange: true }), st('closed', 'MANUAL_ONLY', { isTerminal: true })];

describe('pickAutoStatus', () => {
  it('bascule selon le trigger', () => {
    expect(pickAutoStatus(statuses, statuses[0]!, 'ON_STAFF_REPLY')?.key).toBe('wait_user');
    expect(pickAutoStatus(statuses, statuses[2]!, 'ON_USER_REPLY')?.key).toBe('wait_staff');
  });
  it('respecte lockAutoChange et terminal', () => {
    expect(pickAutoStatus(statuses, statuses[3]!, 'ON_USER_REPLY')).toBeNull();
    expect(pickAutoStatus(statuses, statuses[4]!, 'ON_USER_REPLY')).toBeNull();
  });
  it('ne change rien si déjà sur le bon statut ou aucun trigger configuré', () => {
    expect(pickAutoStatus(statuses, statuses[1]!, 'ON_USER_REPLY')).toBeNull();
    expect(pickAutoStatus(statuses.filter((s) => s.trigger !== 'ON_STAFF_REPLY'), statuses[0]!, 'ON_STAFF_REPLY')).toBeNull();
  });
});

describe('buildChannelName', () => {
  it('applique le pattern et nettoie', () => {
    expect(buildChannelName('{emoji}・{pole}-{username}-{id}', { emoji: '🟡', pole: 'Pôle Légal', username: 'Jean Émile!', id: 42 })).toBe('🟡・pole-legal-jean-emile-42');
  });
  it('limite à 100 caractères', () => {
    expect([...buildChannelName('{username}', { emoji: '', pole: 'a', username: 'x'.repeat(300), id: 1 })].length).toBe(100);
  });
});

describe('RenameQueue', () => {
  afterEach(() => vi.useRealTimers());
  it('coalesce : seul le dernier nom est appliqué', async () => {
    vi.useFakeTimers();
    const apply = vi.fn(async () => {});
    const q = new RenameQueue(apply, { debounceMs: 1000 });
    q.schedule('c', 'a'); q.schedule('c', 'b'); q.schedule('c', 'c');
    await vi.advanceTimersByTimeAsync(1000);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith('c', 'c');
  });
  it('respecte 2 renommages / 10 min', async () => {
    vi.useFakeTimers();
    const apply = vi.fn(async () => {});
    const q = new RenameQueue(apply, { debounceMs: 1000 });
    for (const n of ['a', 'b', 'c']) { q.schedule('c', n); await vi.advanceTimersByTimeAsync(1000); }
    expect(apply).toHaveBeenCalledTimes(2); // le 3e attend la fenêtre
    await vi.advanceTimersByTimeAsync(600_000);
    expect(apply).toHaveBeenCalledTimes(3);
  });
  it('n’applique pas deux fois le même nom', async () => {
    vi.useFakeTimers();
    const apply = vi.fn(async () => {});
    const q = new RenameQueue(apply, { debounceMs: 1000 });
    q.schedule('c', 'a'); await vi.advanceTimersByTimeAsync(1000);
    q.schedule('c', 'a'); await vi.advanceTimersByTimeAsync(1000);
    expect(apply).toHaveBeenCalledTimes(1);
  });
});

describe('computeGuildHealth', () => {
  it('liste les permissions manquantes des modules activés', () => {
    const h = computeGuildHealth(PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages, ['tickets']);
    expect(h.ok).toBe(false);
    expect(h.missing).toContain('ManageChannels');
  });
  it('Administrator couvre tout ; bot absent = KO', () => {
    expect(computeGuildHealth(PermissionFlagsBits.Administrator, ['tickets', 'douane']).ok).toBe(true);
    expect(computeGuildHealth(null, ['tickets']).ok).toBe(false);
  });
});
