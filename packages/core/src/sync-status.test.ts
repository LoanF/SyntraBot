import { describe, expect, it } from 'vitest';
import { diffRoles, ruleMatches, type SyncRule } from './sync-roles';
import { OFFLINE, cfxJoinUrl, parseServerStatus } from './status';

const rule = (source: SyncRule['source'], matchValue: string, role: string, remove = true): SyncRule => ({ source, matchValue, discordRoleId: role, removeWhenUnmatched: remove });

describe('sync des rôles', () => {
  it('JOB et JOB_GRADE (exact et ≥)', () => {
    expect(ruleMatches(rule('JOB', 'police', 'r'), [{ name: 'police', grade: 0 }])).toBe(true);
    expect(ruleMatches(rule('JOB_GRADE', 'police:3', 'r'), [{ name: 'police', grade: 3 }])).toBe(true);
    expect(ruleMatches(rule('JOB_GRADE', 'police:3', 'r'), [{ name: 'police', grade: 4 }])).toBe(false);
    expect(ruleMatches(rule('JOB_GRADE', 'police:3+', 'r'), [{ name: 'police', grade: 4 }])).toBe(true);
    expect(ruleMatches(rule('JOB_GRADE', 'police:3+', 'r'), [{ name: 'ems', grade: 9 }])).toBe(false);
  });
  it('ajoute les rôles manquants, retire ceux qui ne correspondent plus', () => {
    const rules = [rule('JOB', 'police', 'R_POLICE'), rule('JOB', 'ems', 'R_EMS')];
    const d = diffRoles(rules, [{ name: 'police', grade: 1 }], new Set(['R_EMS', 'R_OTHER']));
    expect(d).toEqual({ add: ['R_POLICE'], remove: ['R_EMS'] });
  });
  it('removeWhenUnmatched=false conserve le rôle', () => {
    expect(diffRoles([rule('JOB', 'ems', 'R_EMS', false)], [], new Set(['R_EMS']))).toEqual({ add: [], remove: [] });
  });
  it('un rôle voulu par une règle n’est pas retiré par une autre règle du même rôle', () => {
    const rules = [rule('JOB', 'police', 'R'), rule('JOB', 'sheriff', 'R')];
    expect(diffRoles(rules, [{ name: 'sheriff', grade: 0 }], new Set(['R']))).toEqual({ add: [], remove: [] });
  });
  it('ignore GROUP / CUSTOM (jamais appliqués)', () => {
    expect(diffRoles([rule('GROUP', 'x', 'R')], [], new Set(['R']))).toEqual({ add: [], remove: [] });
  });
});

describe('statut serveur', () => {
  it('lit info.json et players.json, retire les codes couleur', () => {
    const s = parseServerStatus({ vars: { sv_maxClients: '64', sv_projectName: '^1Los ^7Santos' } }, [{ id: 1 }, { id: 2 }]);
    expect(s).toEqual({ online: true, players: 2, maxPlayers: 64, hostname: 'Los Santos' });
  });
  it('réponses inattendues = valeurs sûres', () => {
    expect(parseServerStatus(null, null)).toEqual({ online: true, players: 0, maxPlayers: null, hostname: null });
    expect(OFFLINE.online).toBe(false);
    expect(cfxJoinUrl('abc123')).toBe('https://cfx.re/join/abc123');
  });
});
