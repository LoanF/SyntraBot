import { Suspense } from 'react';
import { listAccessibleProjects, requireProjectAccess, requireViewer } from '@/lib/access';
import { Frame } from '@/components/shell/frame';
import type { NavItem } from '@/components/shell/sidebar';

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await requireProjectAccess(slug);
  const viewer = await requireViewer();
  const projects = await listAccessibleProjects(viewer);

  // La navigation ne montre que ce que la personne peut réellement faire (la vérification reste côté serveur sur chaque page)
  const nav: (NavItem & { show: boolean })[] = [
    { href: '', label: 'Vue d’ensemble', icon: 'overview', guildScoped: true, show: true },
    { href: '/modules', label: 'Modules', icon: 'modules', guildScoped: true, show: access.canAny('modules:manage') || access.canAny('douane:manage') || access.canAny('status:manage') },
    { href: '/tickets', label: 'Tickets', icon: 'tickets', guildScoped: true, show: access.canAny('tickets:read') },
    { href: '/reports', label: 'Reports', icon: 'reports', guildScoped: false, show: access.canAny('reports:read') },
    { href: '/embeds', label: 'Embeds', icon: 'embeds', guildScoped: true, show: access.canAny('embeds:read') },
    { href: '/config', label: 'Configuration', icon: 'config', guildScoped: true, show: access.canAny('modules:manage') },
    { href: '/servers', label: 'Serveurs Discord', icon: 'servers', guildScoped: false, show: access.ctx.can('project:admin') },
    { href: '/access', label: 'Accès', icon: 'access', guildScoped: false, show: access.ctx.can('access:manage') },
    { href: '/integrations', label: 'Intégrations', icon: 'integrations', guildScoped: false, show: access.ctx.can('integrations:manage') },
    { href: '/api-keys', label: 'Clés API', icon: 'keys', guildScoped: false, show: access.ctx.can('apikeys:manage') },
    { href: '/audit', label: 'Audit', icon: 'audit', guildScoped: false, show: access.ctx.can('audit:read') },
  ];

  const visibleGuilds = access.isOwner ? access.guilds : access.guilds.filter((g) => access.ctx.can('tickets:read', { guildId: g.id }) || access.ctx.can('modules:manage', { guildId: g.id }) || access.ctx.can('embeds:read', { guildId: g.id }) || access.ctx.can('reports:read'));

  return (
    <Suspense>
      <Frame
        slug={slug}
        projectName={access.project.name}
        projects={projects.map((p) => ({ slug: p.project.slug, name: p.project.name }))}
        guilds={visibleGuilds.map((g) => ({
          id: g.id, label: g.label, kind: g.kind,
          healthy: g.healthReport ? ((g.healthReport as { ok?: boolean }).ok ?? null) : null,
        }))}
        nav={nav.filter((n) => n.show).map(({ show: _s, ...n }) => n)}
        viewer={{ name: viewer.name, image: viewer.image }}
      >
        {children}
      </Frame>
    </Suspense>
  );
}
