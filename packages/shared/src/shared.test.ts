import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MESSAGES, DEFAULT_STATUSES, embedPayload, renderTemplate, ticketsConfig, unknownVariables,
} from './index';

describe('template', () => {
  it('rend les variables connues et laisse les autres', () => {
    expect(renderTemplate('Salut {user} {x}', { user: 'Bob' })).toBe('Salut Bob {x}');
  });
  it('tous les messages par défaut utilisent des variables connues', () => {
    for (const [key, m] of Object.entries(DEFAULT_MESSAGES)) {
      expect(unknownVariables(m.fr), key).toEqual([]);
      expect(unknownVariables(m.en), key).toEqual([]);
    }
  });
  it('un seul statut par trigger automatique', () => {
    const auto = DEFAULT_STATUSES.filter((s) => s.trigger !== 'MANUAL_ONLY').map((s) => s.trigger);
    expect(new Set(auto).size).toBe(auto.length);
  });
});

describe('schemas', () => {
  it('config tickets : défauts + pattern validé', () => {
    expect(ticketsConfig.parse({}).channelPattern).toBe('{emoji}・{pole}-{username}-{id}');
    expect(() => ticketsConfig.parse({ channelPattern: '{evil}' })).toThrow();
    expect(() => ticketsConfig.parse({ unknown: 1 })).toThrow();
  });
  it('embed : refuse javascript: dans les URLs', () => {
    expect(() => embedPayload.parse({ components: [{ type: 'link', label: 'x', url: 'javascript:alert(1)' }] })).toThrow();
    expect(embedPayload.parse({ components: [{ type: 'link', label: 'x', url: 'https://a.b' }] })).toBeTruthy();
  });
});
