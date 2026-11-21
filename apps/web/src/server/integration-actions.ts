'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@syntra/db';
import { fivemMapping, ForbiddenError } from '@syntra/shared';
import { aad, cipherFromEnv } from '@syntra/security';
import { parseConnectionString, PlayerLookupService, assertPublicHost } from '@syntra/core/web';
import { requirePermission } from '@/lib/access';
import { fail, recordAudit, type ActionResult } from '@/lib/server';

const msg = (e: unknown) => (e instanceof ForbiddenError ? 'Vous n’avez pas la permission pour cette action.' : e instanceof Error ? e.message : 'Erreur inattendue.');

const dbInput = z.object({
  framework: z.enum(['ESX', 'QBCORE', 'QBOX', 'CUSTOM']),
  /** Vide = conserver la chaîne déjà enregistrée (le secret ne revient jamais au navigateur) */
  connectionString: z.string().trim().max(500).optional(),
  mapping: z.string().min(2).max(4000),
  allowPrivateNetwork: z.boolean(),
});

export async function saveFivemDb(slug: string, input: unknown): Promise<ActionResult> {
  try {
    const access = await requirePermission(slug, 'integrations:manage');
    const p = dbInput.safeParse(input);
    if (!p.success) return fail(p.error.issues[0]?.message ?? 'Saisie invalide.');

    let mapping;
    try {
      mapping = fivemMapping.parse(JSON.parse(p.data.mapping));
    } catch (e) {
      return fail(e instanceof z.ZodError ? `Mapping invalide : ${e.issues[0]?.path.join('.')} ${e.issues[0]?.message}` : 'Mapping invalide : JSON mal formé.');
    }
    const existing = await prisma.fivemDatabase.findUnique({ where: { projectId: access.project.id } });
    let connectionEnc = existing?.connectionEnc;
    if (p.data.connectionString) {
      try {
        parseConnectionString(p.data.connectionString); // validation du format avant chiffrement
      } catch (e) {
        return fail(msg(e));
      }
      connectionEnc = cipherFromEnv().encrypt(p.data.connectionString, aad.fivemDb(access.project.id));
    }
    if (!connectionEnc) return fail('Saisissez la chaîne de connexion (mysql://utilisateur:mot_de_passe@hôte:3306/base).');

    await prisma.fivemDatabase.upsert({
      where: { projectId: access.project.id },
      update: { framework: p.data.framework, connectionEnc, mapping, allowPrivateNetwork: p.data.allowPrivateNetwork, lastCheckOk: null },
      create: { projectId: access.project.id, framework: p.data.framework, connectionEnc, mapping, allowPrivateNetwork: p.data.allowPrivateNetwork },
    });
    // La chaîne de connexion n'est jamais écrite dans l'audit
    await recordAudit(access, { action: 'integration.fivemdb', entityType: 'integration', entityId: 'fivem_db', after: { framework: p.data.framework, allowPrivateNetwork: p.data.allowPrivateNetwork, connectionReplaced: Boolean(p.data.connectionString) } });
    revalidatePath(`/${slug}/integrations`);
    return { ok: true };
  } catch (e) {
    return fail(msg(e));
  }
}

export async function testFivemDb(slug: string): Promise<ActionResult<{ problems: string[] }>> {
  try {
    const access = await requirePermission(slug, 'integrations:manage');
    const res = await new PlayerLookupService(prisma, cipherFromEnv()).testConnection(access.project.id);
    revalidatePath(`/${slug}/integrations`);
    return res.ok ? { ok: true, problems: [] } : { ok: false, error: res.problems.join(' · ') };
  } catch (e) {
    return fail(msg(e));
  }
}

const rconInput = z.object({
  host: z.string().trim().min(1).max(253),
  port: z.number().int().min(1).max(65535),
  password: z.string().max(200).optional(),
  allowedCommands: z.array(z.string().regex(/^[a-z_]{1,32}$/)).max(20),
});

export async function saveRcon(slug: string, input: unknown): Promise<ActionResult> {
  try {
    const access = await requirePermission(slug, 'integrations:manage');
    const p = rconInput.safeParse(input);
    if (!p.success) return fail(p.error.issues[0]?.message ?? 'Saisie invalide.');
    try {
      await assertPublicHost(p.data.host); // SSRF : jamais d'hôte privé (sauf opérateur : ALLOW_PRIVATE_RCON=1)
    } catch (e) {
      return fail(msg(e));
    }
    const existing = await prisma.rconConnection.findUnique({ where: { projectId: access.project.id } });
    let passwordEnc = existing?.passwordEnc;
    if (p.data.password) passwordEnc = cipherFromEnv().encrypt(p.data.password, aad.rcon(access.project.id));
    if (!passwordEnc) return fail('Saisissez le mot de passe RCON.');
    await prisma.rconConnection.upsert({
      where: { projectId: access.project.id },
      update: { host: p.data.host, port: p.data.port, passwordEnc, allowedCommands: p.data.allowedCommands },
      create: { projectId: access.project.id, host: p.data.host, port: p.data.port, passwordEnc, allowedCommands: p.data.allowedCommands },
    });
    await recordAudit(access, { action: 'integration.rcon', entityType: 'integration', entityId: 'rcon', after: { host: p.data.host, port: p.data.port, allowedCommands: p.data.allowedCommands, passwordReplaced: Boolean(p.data.password) } });
    revalidatePath(`/${slug}/integrations`);
    return { ok: true };
  } catch (e) {
    return fail(msg(e));
  }
}
