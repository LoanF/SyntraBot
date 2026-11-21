'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createProjectFromTemplate, prisma, provisionGuild, Prisma } from '@syntra/db';
import { embedPayload, ForbiddenError, isPermission, isSensitive, MODULE_CONFIG_SCHEMAS, snowflake, type ModuleKey } from '@syntra/shared';
import { aad, assertSafeUrl, cipherFromEnv, generateApiCredentials } from '@syntra/security';
import { MODULE_MANAGE_PERMISSION, MODULE_UI } from '@/lib/modules-ui';
import { discord, hasDiscordToken } from '@/lib/discord';
import { requirePermission, requireViewer } from '@/lib/access';
import { API_SCOPES } from '@/lib/api-scopes';
import { toDiscordBody } from '@/lib/embed-body';
import { fail, publishConfigChange, recordAudit, type ActionResult } from '@/lib/server';

const msg = (e: unknown) => (e instanceof ForbiddenError ? 'Vous n’avez pas la permission pour cette action.' : e instanceof Error ? e.message : 'Erreur inattendue.');

/** Retire les champs vides d'un formulaire (l'absence = valeur par défaut du schéma) */
function clean(values: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    if (v === '' || v === null || v === undefined) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out;
}

async function loadModule(slug: string, moduleId: string) {
  const row = await prisma.moduleInstance.findUnique({ where: { id: moduleId } });
  // Même réponse pour « inexistant » et « autre projet » : pas d'oracle d'existence (anti-IDOR)
  if (!row) throw new ForbiddenError();
  const access = await requirePermission(slug, MODULE_MANAGE_PERMISSION[row.moduleKey as ModuleKey], row.guildId ?? undefined);
  if (row.projectId !== access.project.id) throw new ForbiddenError();
  return { row, access, key: row.moduleKey as ModuleKey };
}

// ------------------------------------------------------------------------------- modules

export async function toggleModule(slug: string, moduleId: string, enabled: boolean): Promise<ActionResult> {
  try {
    const { row, access, key } = await loadModule(slug, moduleId);
    if (enabled) {
      const parsed = MODULE_CONFIG_SCHEMAS[key].safeParse(row.config);
      if (!parsed.success) return fail('Complétez la configuration avant d’activer ce module.');
    }
    await prisma.moduleInstance.update({ where: { id: row.id }, data: { enabled } });
    await recordAudit(access, { action: enabled ? 'module.enable' : 'module.disable', guildId: row.guildId, entityType: 'module', entityId: key, before: { enabled: row.enabled }, after: { enabled } });
    await publishConfigChange(access.project.id);
    revalidatePath(`/${slug}`, 'layout');
    return { ok: true };
  } catch (e) {
    return fail(msg(e));
  }
}

export async function saveModuleConfig(slug: string, moduleId: string, values: Record<string, unknown>): Promise<ActionResult> {
  try {
    const { row, access, key } = await loadModule(slug, moduleId);
    const parsed = MODULE_CONFIG_SCHEMAS[key].safeParse(clean(values));
    if (!parsed.success) {
      const labels = new Map(MODULE_UI[key].fields.map((f) => [f.key, f.label]));
      return fail(
        parsed.error.issues
          .map((i) => `${labels.get(String(i.path[0])) ?? (i.path.join('.') || 'Configuration')} : ${i.message === 'Required' ? 'champ obligatoire' : i.message}`)
          .join(' · '),
      );
    }
    await prisma.moduleInstance.update({ where: { id: row.id }, data: { config: parsed.data as Prisma.InputJsonValue, configVersion: { increment: 1 } } });
    await recordAudit(access, { action: 'module.config', guildId: row.guildId, entityType: 'module', entityId: key, before: row.config, after: parsed.data });
    await publishConfigChange(access.project.id);
    revalidatePath(`/${slug}`, 'layout');
    return { ok: true };
  } catch (e) {
    return fail(msg(e));
  }
}

// ------------------------------------------------------------------------------- projets & serveurs

const slugRe = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;

export async function createProject(_prev: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  const viewer = await requireViewer();
  const name = String(form.get('name') ?? '').trim();
  const slug = String(form.get('slug') ?? '').trim().toLowerCase();
  const locale = form.get('locale') === 'en' ? 'en' : 'fr';
  if (name.length < 2 || name.length > 60) return fail('Le nom doit faire entre 2 et 60 caractères.');
  if (!slugRe.test(slug)) return fail('Identifiant invalide : 3 à 32 caractères, minuscules, chiffres et tirets.');
  if (await prisma.project.findUnique({ where: { slug } })) return fail('Cet identifiant est déjà pris.');
  await createProjectFromTemplate(prisma, { name, slug, ownerDiscordId: viewer.discordId, ownerUsername: viewer.name, locale });
  redirect(`/${slug}`);
}

const linkGuildInput = z.object({
  discordGuildId: snowflake,
  label: z.string().trim().min(1).max(60),
  kind: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{1,24}$/, 'Type : lettres minuscules, chiffres, _'),
});

/**
 * Rattache un serveur Discord à un projet. Sécurité : l'utilisateur doit être propriétaire ou ADMINISTRATOR
 * de ce serveur (sinon n'importe qui pourrait « revendiquer » le serveur d'un autre où le bot est présent).
 */
export async function linkGuild(slug: string, input: unknown): Promise<ActionResult> {
  try {
    const access = await requirePermission(slug, 'project:admin');
    const p = linkGuildInput.safeParse(input);
    if (!p.success) return fail(p.error.issues[0]?.message ?? 'Saisie invalide.');
    if (!hasDiscordToken) return fail('Le token du bot n’est pas configuré sur le dashboard : impossible de vérifier vos droits.');
    if (!(await discord.isGuildAdmin(p.data.discordGuildId, access.viewer.discordId))) {
      return fail('Vous devez être propriétaire ou administrateur de ce serveur Discord (et le bot doit y être présent).');
    }
    if (await prisma.guild.findUnique({ where: { discordGuildId: p.data.discordGuildId } })) return fail('Ce serveur est déjà rattaché à un projet.');
    const guild = await provisionGuild(prisma, { projectId: access.project.id, ...p.data, isPrimary: access.guilds.length === 0 });
    await recordAudit(access, { action: 'guild.link', guildId: guild.id, entityType: 'guild', entityId: guild.discordGuildId, after: p.data });
    await publishConfigChange(access.project.id);
    revalidatePath(`/${slug}`, 'layout');
    return { ok: true };
  } catch (e) {
    return fail(msg(e));
  }
}

// ------------------------------------------------------------------------------- clés API


const keyInput = z.object({
  name: z.string().trim().min(2).max(60),
  scopes: z.array(z.enum(API_SCOPES.map((s) => s.id) as [string, ...string[]])).min(1, 'Choisissez au moins un scope.'),
  rateLimitPerMin: z.number().int().min(10).max(2000).default(120),
});

/** Le secret n'est retourné QU'UNE FOIS ici (il est ensuite stocké chiffré, jamais relu côté navigateur). */
export async function createApiKey(slug: string, input: unknown): Promise<ActionResult<{ keyId: string; secret: string }>> {
  try {
    const access = await requirePermission(slug, 'apikeys:manage');
    const p = keyInput.safeParse(input);
    if (!p.success) return fail(p.error.issues[0]?.message ?? 'Saisie invalide.');
    const { keyId, secret } = generateApiCredentials();
    await prisma.apiKey.create({
      data: {
        projectId: access.project.id, keyId, name: p.data.name, scopes: p.data.scopes, rateLimitPerMin: p.data.rateLimitPerMin,
        secretEnc: cipherFromEnv().encrypt(secret, aad.apiKey(access.project.id, keyId)), createdById: access.viewer.discordId,
      },
    });
    await recordAudit(access, { action: 'apikey.create', entityType: 'apikey', entityId: keyId, after: { name: p.data.name, scopes: p.data.scopes } });
    revalidatePath(`/${slug}/api-keys`);
    return { ok: true, keyId, secret };
  } catch (e) {
    return fail(msg(e));
  }
}

export async function revokeApiKey(slug: string, id: string): Promise<ActionResult> {
  try {
    const access = await requirePermission(slug, 'apikeys:manage');
    const key = await prisma.apiKey.findFirst({ where: { id, projectId: access.project.id, revokedAt: null } });
    if (!key) return fail('Clé introuvable ou déjà révoquée.');
    await prisma.apiKey.update({ where: { id: key.id }, data: { revokedAt: new Date() } });
    await recordAudit(access, { action: 'apikey.revoke', entityType: 'apikey', entityId: key.keyId });
    revalidatePath(`/${slug}/api-keys`);
    return { ok: true };
  } catch (e) {
    return fail(msg(e));
  }
}

/** Rotation : nouvelle clé immédiatement, l'ancienne reste valide 24 h pour laisser le temps de redéployer. */
export async function rotateApiKey(slug: string, id: string): Promise<ActionResult<{ keyId: string; secret: string }>> {
  try {
    const access = await requirePermission(slug, 'apikeys:manage');
    const old = await prisma.apiKey.findFirst({ where: { id, projectId: access.project.id, revokedAt: null } });
    if (!old) return fail('Clé introuvable ou déjà révoquée.');
    const { keyId, secret } = generateApiCredentials();
    await prisma.$transaction([
      prisma.apiKey.create({
        data: {
          projectId: access.project.id, keyId, name: old.name, scopes: old.scopes, rateLimitPerMin: old.rateLimitPerMin, ipAllowlist: old.ipAllowlist,
          secretEnc: cipherFromEnv().encrypt(secret, aad.apiKey(access.project.id, keyId)), createdById: access.viewer.discordId,
        },
      }),
      prisma.apiKey.update({ where: { id: old.id }, data: { revokedAt: new Date(), graceUntil: new Date(Date.now() + 24 * 3600_000) } }),
    ]);
    await recordAudit(access, { action: 'apikey.rotate', entityType: 'apikey', entityId: old.keyId, after: { newKeyId: keyId } });
    revalidatePath(`/${slug}/api-keys`);
    return { ok: true, keyId, secret };
  } catch (e) {
    return fail(msg(e));
  }
}

// ------------------------------------------------------------------------------- embeds

const embedInput = z.object({
  id: z.string().optional(),
  guildId: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  channelId: snowflake.optional().or(z.literal('')),
  payload: embedPayload,
});

/** Les images d'embed sont récupérées par Discord, mais on refuse déjà les hôtes privés / schémas dangereux. */
function assertEmbedUrls(p: z.infer<typeof embedPayload>) {
  for (const e of p.embeds) for (const u of [e.image, e.thumbnail, e.url]) if (u) assertSafeUrl(u, { protocols: ['https:'] });
  for (const c of p.components) if (c.type === 'link') assertSafeUrl(c.url, { protocols: ['https:'] });
}

export async function saveEmbed(slug: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const p = embedInput.safeParse(input);
    if (!p.success) return fail(p.error.issues[0]?.message ?? 'Saisie invalide.');
    const access = await requirePermission(slug, 'embeds:write', p.data.guildId);
    assertEmbedUrls(p.data.payload);
    const data = { name: p.data.name, guildId: p.data.guildId, channelId: p.data.channelId || null, payload: p.data.payload as Prisma.InputJsonValue };
    let id = p.data.id;
    if (id) {
      const existing = await prisma.embedTemplate.findFirst({ where: { id, projectId: access.project.id } });
      if (!existing) return fail('Embed introuvable.');
      await prisma.embedTemplate.update({ where: { id }, data });
    } else {
      id = (await prisma.embedTemplate.create({ data: { ...data, projectId: access.project.id, createdById: access.viewer.discordId } })).id;
    }
    await recordAudit(access, { action: p.data.id ? 'embed.update' : 'embed.create', guildId: p.data.guildId, entityType: 'embed', entityId: id });
    revalidatePath(`/${slug}/embeds`);
    return { ok: true, id };
  } catch (e) {
    return fail(msg(e));
  }
}

/** Publie le message dans Discord, ou édite en direct (`message.edit`) s'il a déjà été publié. */
export async function publishEmbed(slug: string, embedId: string): Promise<ActionResult<{ messageId: string; edited: boolean }>> {
  try {
    const tpl = await prisma.embedTemplate.findUnique({ where: { id: embedId } });
    if (!tpl) return fail('Embed introuvable.');
    const access = await requirePermission(slug, 'embeds:write', tpl.guildId);
    if (tpl.projectId !== access.project.id) throw new ForbiddenError();
    if (!tpl.channelId) return fail('Choisissez un salon de destination.');
    if (!hasDiscordToken) return fail('Le token du bot n’est pas configuré sur le dashboard.');

    const parsed = embedPayload.safeParse(tpl.payload);
    if (!parsed.success) return fail('Le contenu de l’embed est invalide.');
    assertEmbedUrls(parsed.data);

    // Le salon DOIT appartenir au serveur Discord de l'embed (sinon publication dans le serveur d'un autre projet)
    const guild = access.guilds.find((g) => g.id === tpl.guildId);
    if (!guild || (await discord.getChannelGuildId(tpl.channelId)) !== guild.discordGuildId) return fail('Ce salon n’appartient pas au serveur Discord choisi.');

    const body = toDiscordBody(parsed.data);
    let messageId = tpl.messageId;
    const edited = Boolean(messageId);
    if (messageId) await discord.editMessage(tpl.channelId, messageId, body);
    else messageId = await discord.postMessage(tpl.channelId, body);

    await prisma.embedTemplate.update({ where: { id: tpl.id }, data: { messageId, status: 'PUBLISHED', publishedAt: new Date() } });
    await recordAudit(access, { action: edited ? 'embed.edit_live' : 'embed.publish', guildId: tpl.guildId, entityType: 'embed', entityId: tpl.id, after: { channelId: tpl.channelId, messageId } });
    revalidatePath(`/${slug}/embeds`);
    return { ok: true, messageId: messageId!, edited };
  } catch (e) {
    return fail(msg(e));
  }
}


// ------------------------------------------------------------------------------- droits par rôle Discord

const policyInput = z.object({
  roleGuildId: z.string().min(1),
  discordRoleId: snowflake,
  /** null = projet entier */
  targetGuildId: z.string().min(1).nullable(),
  permissions: z.array(z.string()).min(1, 'Choisissez au moins une permission.'),
  label: z.string().trim().max(60).optional(),
});

/**
 * Crée une règle « les membres ayant ce rôle Discord obtiennent ces permissions ».
 * Garde-fous : on ne peut accorder que ce que l'on possède soi-même, et une règle limitée à un serveur
 * ne peut jamais contenir de permission sensible (RCON, clés API, accès, audit, intégrations).
 */
export async function createAccessPolicy(slug: string, input: unknown): Promise<ActionResult> {
  try {
    const access = await requirePermission(slug, 'access:manage');
    const p = policyInput.safeParse(input);
    if (!p.success) return fail(p.error.issues[0]?.message ?? 'Saisie invalide.');
    const ids = new Set(access.guilds.map((g) => g.id));
    if (!ids.has(p.data.roleGuildId) || (p.data.targetGuildId && !ids.has(p.data.targetGuildId))) throw new ForbiddenError();

    const perms = p.data.permissions.filter(isPermission);
    if (perms.length !== p.data.permissions.length) return fail('Permission inconnue.');
    for (const perm of perms) {
      if (p.data.targetGuildId && isSensitive(perm)) return fail(`« ${perm} » est sensible : elle ne peut être accordée qu’au niveau du projet entier.`);
      if (!access.isOwner && !access.ctx.can(perm, p.data.targetGuildId ? { guildId: p.data.targetGuildId } : {})) {
        return fail(`Vous ne pouvez pas accorder « ${perm} » : vous ne la possédez pas.`);
      }
    }
    try {
      const row = await prisma.accessPolicy.create({
        data: {
          projectId: access.project.id, roleGuildId: p.data.roleGuildId, discordRoleId: p.data.discordRoleId, targetGuildId: p.data.targetGuildId,
          targetScopeKey: p.data.targetGuildId ?? 'project', permissions: perms, ...(p.data.label ? { label: p.data.label } : {}),
        },
      });
      await recordAudit(access, { action: 'access.create', entityType: 'access', entityId: row.id, after: { role: p.data.discordRoleId, target: p.data.targetGuildId ?? 'project', permissions: perms } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return fail('Une règle existe déjà pour ce rôle et cette cible : supprimez-la d’abord.');
      throw e;
    }
    revalidatePath(`/${slug}/access`);
    return { ok: true };
  } catch (e) {
    return fail(msg(e));
  }
}

export async function deleteAccessPolicy(slug: string, id: string): Promise<ActionResult> {
  try {
    const access = await requirePermission(slug, 'access:manage');
    const row = await prisma.accessPolicy.findFirst({ where: { id, projectId: access.project.id } });
    if (!row) return fail('Règle introuvable.');
    await prisma.accessPolicy.delete({ where: { id: row.id } });
    await recordAudit(access, { action: 'access.delete', entityType: 'access', entityId: id, before: { role: row.discordRoleId, permissions: row.permissions } });
    revalidatePath(`/${slug}/access`);
    return { ok: true };
  } catch (e) {
    return fail(msg(e));
  }
}
