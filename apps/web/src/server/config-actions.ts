'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma, Prisma } from '@syntra/db';
import { channelPattern, DEFAULT_MESSAGES, ForbiddenError, snowflake, ticketQuestionInput, ticketStatusInput, unknownVariables } from '@syntra/shared';
import { requirePermission } from '@/lib/access';
import { fail, publishConfigChange, recordAudit, type ActionResult } from '@/lib/server';

const msg = (e: unknown) => (e instanceof ForbiddenError ? 'Vous n’avez pas la permission pour cette action.' : e instanceof Error ? e.message : 'Erreur inattendue.');
const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

// ------------------------------------------------------------------------------- pôles

const poleInput = z.object({
  id: z.string().optional(),
  guildId: z.string().min(1),
  key: z.string().regex(/^[a-z0-9_]{1,32}$/, 'Clé : minuscules, chiffres, _ (32 max).'),
  label: z.string().trim().min(1).max(50),
  emoji: z.string().trim().max(16).optional(),
  description: z.string().trim().max(100).optional(),
  categoryChannelId: snowflake.optional().or(z.literal('')),
  staffRoleIds: z.array(snowflake).max(20),
  anonymousName: z.string().trim().max(60).optional(),
  channelPattern: channelPattern.optional().or(z.literal('')),
  defaultPriority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']),
  enabled: z.boolean(),
  questions: z.array(ticketQuestionInput).max(5, 'Discord limite un formulaire à 5 questions.'),
});

export async function savePole(slug: string, input: unknown): Promise<ActionResult> {
  try {
    const p = poleInput.safeParse(input);
    if (!p.success) return fail(p.error.issues.map((i) => i.message).join(' · '));
    const access = await requirePermission(slug, 'modules:manage', p.data.guildId);
    const d = p.data;
    const common = {
      guildId: d.guildId, key: d.key, label: d.label, emoji: d.emoji || null, description: d.description || null,
      categoryChannelId: d.categoryChannelId || null, staffRoleIds: d.staffRoleIds, anonymousName: d.anonymousName || null,
      channelPattern: d.channelPattern || null, defaultPriority: d.defaultPriority, enabled: d.enabled,
    };
    const questions = d.questions.map((q, i) => ({
      key: q.key, label: q.label, placeholder: q.placeholder ?? null, style: q.style, required: q.required,
      minLength: q.minLength ?? null, maxLength: q.maxLength ?? null, position: i,
    }));
    try {
      const id = await prisma.$transaction(async (tx) => {
        if (d.id) {
          const existing = await tx.ticketPole.findFirst({ where: { id: d.id, projectId: access.project.id } });
          if (!existing) throw new ForbiddenError();
          await tx.ticketQuestion.deleteMany({ where: { poleId: existing.id } });
          await tx.ticketPole.update({ where: { id: existing.id }, data: { ...common, questions: { create: questions } } });
          return existing.id;
        }
        return (await tx.ticketPole.create({ data: { ...common, projectId: access.project.id, questions: { create: questions } } })).id;
      });
      await recordAudit(access, { action: d.id ? 'pole.update' : 'pole.create', guildId: d.guildId, entityType: 'pole', entityId: id, after: { key: d.key, label: d.label, enabled: d.enabled } });
    } catch (e) {
      if (isUnique(e)) return fail('Un pôle utilise déjà cette clé.');
      throw e;
    }
    await publishConfigChange(access.project.id);
    revalidatePath(`/${slug}/config`);
    return { ok: true };
  } catch (e) {
    return fail(msg(e));
  }
}

export async function deletePole(slug: string, id: string): Promise<ActionResult> {
  try {
    const pole = await prisma.ticketPole.findUnique({ where: { id } });
    if (!pole) return fail('Pôle introuvable.');
    const access = await requirePermission(slug, 'modules:manage', pole.guildId);
    if (pole.projectId !== access.project.id) throw new ForbiddenError();
    if ((await prisma.ticket.count({ where: { poleId: id } })) > 0) return fail('Ce pôle a des tickets : désactivez-le plutôt que de le supprimer.');
    await prisma.ticketPole.delete({ where: { id } });
    await recordAudit(access, { action: 'pole.delete', guildId: pole.guildId, entityType: 'pole', entityId: pole.key });
    await publishConfigChange(access.project.id);
    revalidatePath(`/${slug}/config`);
    return { ok: true };
  } catch (e) {
    return fail(msg(e));
  }
}

// ------------------------------------------------------------------------------- statuts (pastilles)

const statusInput = ticketStatusInput.extend({ id: z.string().optional() });

export async function saveStatus(slug: string, input: unknown): Promise<ActionResult> {
  try {
    const access = await requirePermission(slug, 'modules:manage'); // niveau projet : les statuts sont partagés
    const p = statusInput.safeParse(input);
    if (!p.success) return fail(p.error.issues.map((i) => i.message).join(' · '));
    const { id, ...d } = p.data;
    if (d.trigger !== 'MANUAL_ONLY') {
      // Un seul statut par déclencheur automatique : sinon le choix serait ambigu
      const clash = await prisma.ticketStatus.findFirst({ where: { projectId: access.project.id, trigger: d.trigger, ...(id ? { id: { not: id } } : {}) } });
      if (clash) return fail(`Le statut « ${clash.label} » utilise déjà ce déclencheur. Passez-le en « Manuel » d’abord.`);
    }
    try {
      const saved = id
        ? await prisma.ticketStatus.update({ where: { id, projectId: access.project.id }, data: d })
        : await prisma.ticketStatus.create({ data: { ...d, projectId: access.project.id, position: await prisma.ticketStatus.count({ where: { projectId: access.project.id } }) } });
      await recordAudit(access, { action: id ? 'status.update' : 'status.create', entityType: 'status', entityId: saved.key, after: d });
    } catch (e) {
      if (isUnique(e)) return fail('Un statut utilise déjà cette clé.');
      throw e;
    }
    await publishConfigChange(access.project.id);
    revalidatePath(`/${slug}/config`);
    return { ok: true };
  } catch (e) {
    return fail(msg(e));
  }
}

export async function deleteStatus(slug: string, id: string): Promise<ActionResult> {
  try {
    const access = await requirePermission(slug, 'modules:manage');
    const s = await prisma.ticketStatus.findFirst({ where: { id, projectId: access.project.id } });
    if (!s) return fail('Statut introuvable.');
    if (s.trigger === 'ON_CREATE') return fail('Le statut d’ouverture est indispensable : modifiez-le plutôt que de le supprimer.');
    if ((await prisma.ticket.count({ where: { statusId: id } })) > 0) return fail('Des tickets utilisent ce statut.');
    await prisma.ticketStatus.delete({ where: { id } });
    await recordAudit(access, { action: 'status.delete', entityType: 'status', entityId: s.key });
    await publishConfigChange(access.project.id);
    revalidatePath(`/${slug}/config`);
    return { ok: true };
  } catch (e) {
    return fail(msg(e));
  }
}

// ------------------------------------------------------------------------------- snippets

const snippetInput = z.object({
  id: z.string().optional(),
  key: z.string().regex(/^[a-z0-9_]{1,32}$/, 'Clé : minuscules, chiffres, _.'),
  title: z.string().trim().min(1).max(60),
  content: z.string().trim().min(1).max(1800),
  poleId: z.string().nullable(),
});

export async function saveSnippet(slug: string, input: unknown): Promise<ActionResult> {
  try {
    const access = await requirePermission(slug, 'modules:manage');
    const p = snippetInput.safeParse(input);
    if (!p.success) return fail(p.error.issues.map((i) => i.message).join(' · '));
    const { id, ...d } = p.data;
    if (d.poleId && !(await prisma.ticketPole.findFirst({ where: { id: d.poleId, projectId: access.project.id } }))) throw new ForbiddenError();
    try {
      if (id) await prisma.ticketSnippet.update({ where: { id, projectId: access.project.id }, data: d });
      else await prisma.ticketSnippet.create({ data: { ...d, projectId: access.project.id } });
      await recordAudit(access, { action: id ? 'snippet.update' : 'snippet.create', entityType: 'snippet', entityId: d.key });
    } catch (e) {
      if (isUnique(e)) return fail('Un snippet utilise déjà cette clé.');
      throw e;
    }
    await publishConfigChange(access.project.id);
    revalidatePath(`/${slug}/config`);
    return { ok: true };
  } catch (e) {
    return fail(msg(e));
  }
}

export async function deleteSnippet(slug: string, id: string): Promise<ActionResult> {
  try {
    const access = await requirePermission(slug, 'modules:manage');
    const res = await prisma.ticketSnippet.deleteMany({ where: { id, projectId: access.project.id } });
    if (res.count === 0) return fail('Snippet introuvable.');
    await recordAudit(access, { action: 'snippet.delete', entityType: 'snippet', entityId: id });
    await publishConfigChange(access.project.id);
    revalidatePath(`/${slug}/config`);
    return { ok: true };
  } catch (e) {
    return fail(msg(e));
  }
}

// ------------------------------------------------------------------------------- textes du bot (FR / EN)

/** Les variables inconnues sont refusées : un texte ne peut pas afficher « {truc} » en clair aux joueurs. */
export async function saveMessage(slug: string, key: string, locale: string, content: string): Promise<ActionResult> {
  try {
    const access = await requirePermission(slug, 'modules:manage');
    if (!['fr', 'en'].includes(locale) || !/^[a-z0-9_.]{1,64}$/.test(key)) return fail('Texte inconnu.');
    const text = content.trim();
    if (text.length === 0 || text.length > 1800) return fail('Le texte doit faire entre 1 et 1800 caractères.');
    const unknown = unknownVariables(text);
    if (unknown.length) return fail(`Variable inconnue : ${unknown.map((v) => `{${v}}`).join(', ')}.`);
    await prisma.messageTemplate.upsert({
      where: { projectId_key_locale: { projectId: access.project.id, key, locale } },
      update: { content: text },
      create: { projectId: access.project.id, key, locale, content: text },
    });
    await recordAudit(access, { action: 'message.update', entityType: 'message', entityId: `${key}:${locale}` });
    await publishConfigChange(access.project.id);
    revalidatePath(`/${slug}/config`);
    return { ok: true };
  } catch (e) {
    return fail(msg(e));
  }
}

export async function resetMessage(slug: string, key: string, locale: string): Promise<ActionResult<{ content: string }>> {
  try {
    const access = await requirePermission(slug, 'modules:manage');
    const def = DEFAULT_MESSAGES[key]?.[locale === 'en' ? 'en' : 'fr'];
    if (!def) return fail('Pas de valeur par défaut pour ce texte.');
    await prisma.messageTemplate.upsert({
      where: { projectId_key_locale: { projectId: access.project.id, key, locale } },
      update: { content: def },
      create: { projectId: access.project.id, key, locale, content: def },
    });
    await recordAudit(access, { action: 'message.reset', entityType: 'message', entityId: `${key}:${locale}` });
    await publishConfigChange(access.project.id);
    revalidatePath(`/${slug}/config`);
    return { ok: true, content: def };
  } catch (e) {
    return fail(msg(e));
  }
}
