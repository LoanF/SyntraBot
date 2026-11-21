'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@syntra/db';
import { ForbiddenError, snowflake } from '@syntra/shared';
import { requirePermission } from '@/lib/access';
import { fail, publishConfigChange, recordAudit, type ActionResult } from '@/lib/server';

const msg = (e: unknown) => (e instanceof ForbiddenError ? 'Vous n’avez pas la permission pour cette action.' : e instanceof Error ? e.message : 'Erreur inattendue.');

const ruleInput = z
  .object({
    id: z.string().optional(),
    guildId: z.string().min(1),
    source: z.enum(['JOB', 'JOB_GRADE']),
    matchValue: z.string().trim().min(1).max(64),
    discordRoleId: snowflake,
    removeWhenUnmatched: z.boolean(),
    enabled: z.boolean(),
  })
  .superRefine((v, ctx) => {
    const ok = v.source === 'JOB' ? /^[A-Za-z0-9_]+$/.test(v.matchValue) : /^[A-Za-z0-9_]+:\d+\+?$/.test(v.matchValue);
    if (!ok) ctx.addIssue({ code: 'custom', path: ['matchValue'], message: v.source === 'JOB' ? 'Nom de métier : lettres, chiffres, _ (ex. police).' : 'Format métier:grade, ou métier:grade+ pour « ce grade et au-dessus » (ex. police:3+).' });
  });

export async function saveSyncRule(slug: string, input: unknown): Promise<ActionResult> {
  try {
    const p = ruleInput.safeParse(input);
    if (!p.success) return fail(p.error.issues[0]?.message ?? 'Saisie invalide.');
    const access = await requirePermission(slug, 'sync_roles:manage', p.data.guildId);
    const { id, ...d } = p.data;
    if (id) {
      const res = await prisma.roleSyncRule.updateMany({ where: { id, projectId: access.project.id, guildId: d.guildId }, data: d });
      if (res.count === 0) return fail('Règle introuvable.');
    } else {
      await prisma.roleSyncRule.create({ data: { ...d, projectId: access.project.id } });
    }
    await recordAudit(access, { action: id ? 'syncrule.update' : 'syncrule.create', guildId: d.guildId, entityType: 'syncrule', entityId: d.matchValue, after: d });
    await publishConfigChange(access.project.id);
    revalidatePath(`/${slug}/config`);
    return { ok: true };
  } catch (e) {
    return fail(msg(e));
  }
}

export async function deleteSyncRule(slug: string, id: string): Promise<ActionResult> {
  try {
    const rule = await prisma.roleSyncRule.findUnique({ where: { id } });
    if (!rule) return fail('Règle introuvable.');
    const access = await requirePermission(slug, 'sync_roles:manage', rule.guildId);
    if (rule.projectId !== access.project.id) throw new ForbiddenError();
    await prisma.roleSyncRule.delete({ where: { id } });
    await recordAudit(access, { action: 'syncrule.delete', guildId: rule.guildId, entityType: 'syncrule', entityId: rule.matchValue });
    await publishConfigChange(access.project.id);
    revalidatePath(`/${slug}/config`);
    return { ok: true };
  } catch (e) {
    return fail(msg(e));
  }
}
