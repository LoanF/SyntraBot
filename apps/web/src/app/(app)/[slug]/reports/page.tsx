import { Flag } from 'lucide-react';
import Link from 'next/link';
import { prisma } from '@syntra/db';
import { requireProjectAccess } from '@/lib/access';
import { EmptyState, Mono, PageHeader, Panel, relativeTime } from '@/components/page';
import { Dot } from '@/components/ui/badge';
import { cn } from '@/lib/cn';

export const metadata = { title: 'Reports' };

const FILTERS = [
  { id: 'active', label: 'En cours' },
  { id: 'closed', label: 'Clôturés' },
  { id: 'all', label: 'Tous' },
] as const;

export default async function ReportsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ s?: string }> }) {
  const { slug } = await params;
  const { s = 'active' } = await searchParams;
  const access = await requireProjectAccess(slug);
  const filter = FILTERS.find((f) => f.id === s)?.id ?? 'active';

  const rows = await prisma.report.findMany({
    where: { projectId: access.project.id, ...(filter === 'active' ? { status: { not: 'CLOSED' } } : filter === 'closed' ? { status: 'CLOSED' } : {}) },
    orderBy: [{ updatedAt: 'desc' }],
    take: 100,
  });
  // Visibles : permission accordée sur le serveur du salon staff (ou projet entier)
  const reports = rows.filter((r) => access.ctx.can('reports:read', r.guildId ? { guildId: r.guildId } : {}));

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Créés en jeu par les joueurs, traités dans un fil du salon staff. Ici : l’historique complet de chaque report."
      />
      <div className="mb-4 flex gap-1 rounded-md border border-line bg-surface-1 p-0.5" role="tablist" aria-label="Filtrer par état" style={{ width: 'fit-content' }}>
        {FILTERS.map((f) => (
          <Link
            key={f.id} href={`/${slug}/reports?s=${f.id}`} role="tab" aria-selected={filter === f.id}
            className={cn('rounded px-3 py-1 text-[13px] transition-colors', filter === f.id ? 'bg-surface-3 text-fg' : 'text-muted hover:text-fg')}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <Panel className="overflow-hidden">
        {reports.length === 0 ? (
          <EmptyState title="Aucun report" icon={Flag}>Les reports apparaissent quand un joueur en crée un en jeu. Le module Reports doit être activé et le bridge FiveM connecté.</EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {reports.map((r) => (
              <li key={r.id}>
                <Link href={`/${slug}/reports/${r.id}`} className="grid gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-hover sm:grid-cols-[4rem_minmax(0,1fr)_auto_6.5rem] sm:items-center">
                  <Mono>#{r.externalId}</Mono>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium text-fg">{r.reporterName}</span>
                    <span className="block truncate text-xs text-subtle">{r.reason}</span>
                  </span>
                  <span className="flex items-center gap-1.5 text-[13px] text-muted">
                    <Dot tone={r.status === 'OPEN' ? 'danger' : r.status === 'CLAIMED' ? 'success' : 'neutral'} />
                    {r.status === 'OPEN' ? 'Ouvert' : r.status === 'CLAIMED' ? `Pris en charge${r.claimedByName ? ` · ${r.claimedByName}` : ''}` : 'Clôturé'}
                  </span>
                  <span className="text-xs text-subtle sm:text-right">{relativeTime(r.updatedAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

