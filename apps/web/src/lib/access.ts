import { cache } from 'react';
import { notFound, redirect } from 'next/navigation';
import { prisma, type Guild, type Project } from '@syntra/db';
import { ForbiddenError, type Permission } from '@syntra/shared';
import { resolveAccess, type AccessContext } from '@syntra/security';
import { auth } from '@/auth';
import { memberRoles } from './discord';

export interface Viewer {
  discordId: string;
  name: string;
  image: string | null;
}

/** Session obligatoire : redirige vers /login sinon. */
export const requireViewer = cache(async (): Promise<Viewer> => {
  const session = await auth();
  if (!session?.discordId) redirect('/login');
  return { discordId: session.discordId, name: session.user?.name ?? 'Utilisateur', image: session.user?.image ?? null };
});

export interface ProjectAccess {
  viewer: Viewer;
  project: Project;
  guilds: Guild[];
  isOwner: boolean;
  ctx: AccessContext;
  /** Permission accordée sur au moins un serveur (ou au niveau projet) */
  canAny(permission: Permission): boolean;
  /** Serveurs du projet sur lesquels la permission (non sensible) est accordée */
  guildsWith(permission: Permission): Guild[];
}

async function build(viewer: Viewer, project: Project & { guilds: Guild[] }): Promise<ProjectAccess> {
  const membership = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId: project.id, userId: (await prisma.user.findUnique({ where: { discordId: viewer.discordId } }))?.id ?? '' } } });
  const isOwner = membership?.role === 'OWNER' || membership?.role === 'ADMIN';
  const policies = await prisma.accessPolicy.findMany({ where: { projectId: project.id } });

  // Rôles réels sur chaque serveur Discord du projet (le propriétaire n'en a pas besoin)
  const memberRolesMap = new Map<string, ReadonlySet<string>>();
  if (!isOwner) {
    const rolesNeeded = new Set(policies.map((p) => p.roleGuildId));
    await Promise.all(
      project.guilds
        .filter((g) => rolesNeeded.has(g.id))
        .map(async (g) => memberRolesMap.set(g.id, await memberRoles(g.discordGuildId, viewer.discordId))),
    );
  }
  const ctx = resolveAccess({
    isOwner,
    memberRoles: memberRolesMap,
    policies: policies.map((p) => ({ roleGuildId: p.roleGuildId, discordRoleId: p.discordRoleId, targetGuildId: p.targetGuildId, permissions: p.permissions })),
  });
  const { guilds, ...rest } = project;
  const guildsWith = (permission: Permission) => guilds.filter((g) => ctx.can(permission, { guildId: g.id }));
  return {
    viewer, project: rest, guilds, isOwner, ctx, guildsWith,
    canAny: (permission) => ctx.can(permission) || guildsWith(permission).length > 0,
  };
}

/** Accès au projet pour le visiteur courant, ou null s'il n'a aucun droit (→ 404 : on ne révèle pas l'existence). */
export const getProjectAccess = cache(async (slug: string): Promise<ProjectAccess | null> => {
  const viewer = await requireViewer();
  const project = await prisma.project.findUnique({ where: { slug }, include: { guilds: { orderBy: [{ isPrimary: 'desc' }, { label: 'asc' }] } } });
  if (!project || project.status === 'ARCHIVED') return null;
  const access = await build(viewer, project);
  const any = access.isOwner || access.canAny('tickets:read') || access.canAny('modules:manage') || access.canAny('reports:read')
    || access.canAny('embeds:read') || access.canAny('audit:read') || access.canAny('apikeys:manage') || access.canAny('douane:manage');
  return any ? access : null;
});

export async function requireProjectAccess(slug: string): Promise<ProjectAccess> {
  const a = await getProjectAccess(slug);
  if (!a) notFound();
  return a;
}

/**
 * Garde pour pages et Server Actions : vérifie TOUJOURS côté serveur, jamais sur l'état du client.
 * Lève ForbiddenError (403) si la permission manque. L'`guildId` fourni doit appartenir au projet (anti-IDOR).
 */
export async function requirePermission(slug: string, permission: Permission, guildId?: string): Promise<ProjectAccess> {
  const a = await getProjectAccess(slug);
  if (!a) throw new ForbiddenError();
  if (guildId && !a.guilds.some((g) => g.id === guildId)) throw new ForbiddenError();
  if (!a.ctx.can(permission, guildId ? { guildId } : {})) throw new ForbiddenError();
  return a;
}

/** Projets accessibles au visiteur (propriétaire / membre, ou par rôle Discord via une policy). */
export async function listAccessibleProjects(viewer: Viewer) {
  const projects = await prisma.project.findMany({
    where: { status: { not: 'ARCHIVED' } },
    include: { guilds: { orderBy: [{ isPrimary: 'desc' }, { label: 'asc' }] }, _count: { select: { tickets: true, reports: true } } },
    orderBy: { updatedAt: 'desc' },
    take: 50,
  });
  const out = [];
  for (const p of projects) {
    const access = await build(viewer, p);
    if (access.isOwner || access.canAny('tickets:read') || access.canAny('modules:manage') || access.canAny('reports:read') || access.canAny('embeds:read')) {
      out.push({ project: p, access });
    }
  }
  return out;
}
