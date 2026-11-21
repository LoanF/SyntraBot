import { Server } from 'lucide-react';
import { prisma } from '@syntra/db';
import { requirePermission } from '@/lib/access';
import { guildHealth, permissionLabel } from '@/lib/health';
import { EmptyState, Mono, PageHeader, Panel, relativeTime } from '@/components/page';
import { Badge, Dot } from '@/components/ui/badge';
import { LinkGuild } from './link-guild';

export const metadata = { title: 'Serveurs Discord' };

export default async function ServersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await requirePermission(slug, 'project:admin');
  const counts = await prisma.moduleInstance.groupBy({ by: ['guildId'], where: { projectId: access.project.id, enabled: true }, _count: true });

  return (
    <div>
      <PageHeader title="Serveurs Discord" description="Un projet regroupe plusieurs serveurs : principal, staff, pôle légal, pôle illégal, event… Chaque serveur a ses propres modules et ses propres droits." actions={<LinkGuild slug={slug} />} />
      <Panel className="overflow-hidden">
        {access.guilds.length === 0 ? (
          <EmptyState title="Aucun serveur rattaché" icon={Server}>Invitez d’abord le bot sur votre serveur Discord, puis rattachez-le avec son identifiant. Vous devez en être propriétaire ou administrateur.</EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {access.guilds.map((g) => {
              const h = guildHealth(g);
              const active = counts.find((c) => c.guildId === g.id)?._count ?? 0;
              return (
                <li key={g.id} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3.5">
                  <div className="min-w-0 flex-1 basis-56">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-medium text-fg">{g.label}</span>
                      <Mono>{g.kind}</Mono>
                      {g.isPrimary ? <Badge tone="brand">Principal</Badge> : null}
                    </div>
                    <p className="mt-0.5 text-xs text-subtle"><Mono>{g.discordGuildId}</Mono> · {active} module{active > 1 ? 's' : ''} actif{active > 1 ? 's' : ''}</p>
                  </div>
                  <div className="flex items-center gap-1.5 text-[13px] text-muted">
                    <Dot tone={h.ok === false ? 'warning' : h.ok ? 'success' : 'neutral'} />
                    {h.ok === false ? (h.botPresent ? `Permissions manquantes : ${h.missing.map(permissionLabel).join(', ')}` : 'Bot absent') : h.ok ? 'Bot opérationnel' : 'Pas encore vérifié'}
                  </div>
                  {h.checkedAt ? <span className="text-xs text-subtle">{relativeTime(h.checkedAt)}</span> : null}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
