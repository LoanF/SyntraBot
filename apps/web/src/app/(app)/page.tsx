import Link from 'next/link';
import { ChevronRight, Plus, FolderPlus } from 'lucide-react';
import { listAccessibleProjects, requireViewer } from '@/lib/access';
import { Wordmark } from '@/components/brand';
import { Badge, Dot } from '@/components/ui/badge';
import { buttonStyles } from '@/components/ui/button';
import { EmptyState, PageHeader, Panel } from '@/components/page';

export const metadata = { title: 'Projets' };

export default async function ProjectsPage() {
  const viewer = await requireViewer();
  const projects = await listAccessibleProjects(viewer);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <Wordmark className="mb-10" />
      <PageHeader
        title="Vos projets"
        description="Un projet correspond à un serveur FiveM et regroupe ses serveurs Discord."
        actions={
          <Link href="/new" className={buttonStyles({ variant: 'primary' })}>
            <Plus className="size-3.5" aria-hidden />
            Nouveau projet
          </Link>
        }
      />

      <Panel>
        {projects.length === 0 ? (
          <EmptyState
            title="Aucun projet pour l’instant"
            icon={FolderPlus}
            action={
              <Link href="/new" className={buttonStyles({ variant: 'primary' })}>
                Créer un projet
              </Link>
            }
          >
            Créez votre premier projet pour rattacher vos serveurs Discord et activer les modules. Si on vous a invité, demandez à l’administrateur de vérifier vos rôles Discord.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {projects.map(({ project, access }) => {
              const unhealthy = project.guilds.filter((g) => g.healthReport && (g.healthReport as { ok?: boolean }).ok === false).length;
              return (
                <li key={project.id}>
                  <Link href={`/${project.slug}`} className="group flex items-center gap-4 px-4 py-3.5 transition-colors first:rounded-t-lg last:rounded-b-lg hover:bg-hover">
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[14px] font-medium text-fg">{project.name}</span>
                        {access.isOwner ? <Badge tone="brand">Propriétaire</Badge> : <Badge>Accès par rôles</Badge>}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-subtle">
                        <span className="font-mono">{project.slug}</span> · {project.guilds.length} serveur{project.guilds.length > 1 ? 's' : ''} Discord · {project._count.tickets} ticket{project._count.tickets > 1 ? 's' : ''}
                      </span>
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-muted">
                      <Dot tone={unhealthy ? 'warning' : project.guilds.length ? 'success' : 'neutral'} />
                      {unhealthy ? `${unhealthy} à régler` : project.guilds.length ? 'Opérationnel' : 'À configurer'}
                    </span>
                    <ChevronRight className="size-4 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-muted" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
