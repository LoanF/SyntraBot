/**
 * Synchronisation métier/grade -> rôles Discord (logique pure, testée).
 *   JOB        matchValue "police"        -> métier égal
 *   JOB_GRADE  matchValue "police:3"      -> métier + grade exact
 *              matchValue "police:3+"     -> métier + grade ≥ 3
 */
export interface SyncRule {
  source: 'JOB' | 'JOB_GRADE' | 'GROUP' | 'CUSTOM_QUERY_KEY';
  matchValue: string;
  discordRoleId: string;
  removeWhenUnmatched: boolean;
}
export interface PlayerJob {
  name: string;
  grade: number;
}

export function ruleMatches(rule: SyncRule, jobs: readonly PlayerJob[]): boolean {
  if (rule.source === 'JOB') return jobs.some((j) => j.name === rule.matchValue);
  if (rule.source === 'JOB_GRADE') {
    const m = /^([A-Za-z0-9_]+):(\d+)(\+)?$/.exec(rule.matchValue);
    if (!m) return false;
    const [, name, grade, plus] = m as unknown as [string, string, string, string | undefined];
    return jobs.some((j) => j.name === name && (plus ? j.grade >= Number(grade) : j.grade === Number(grade)));
  }
  return false; // GROUP / CUSTOM_QUERY_KEY : non pris en charge pour l'instant (ignorés, jamais appliqués)
}

/**
 * Calcule les rôles à ajouter / retirer. Un rôle voulu par AU MOINS UNE règle n'est jamais retiré, même si une autre
 * règle sur le même rôle ne correspond plus (évite les va-et-vient).
 */
export function diffRoles(rules: readonly SyncRule[], jobs: readonly PlayerJob[], currentRoles: ReadonlySet<string>): { add: string[]; remove: string[] } {
  const wanted = new Set<string>();
  const removable = new Set<string>();
  for (const r of rules) {
    if (r.source !== 'JOB' && r.source !== 'JOB_GRADE') continue;
    if (ruleMatches(r, jobs)) wanted.add(r.discordRoleId);
    else if (r.removeWhenUnmatched) removable.add(r.discordRoleId);
  }
  return {
    add: [...wanted].filter((id) => !currentRoles.has(id)),
    remove: [...removable].filter((id) => !wanted.has(id) && currentRoles.has(id)),
  };
}
