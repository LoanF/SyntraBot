import { ScrollText } from 'lucide-react';
import Link from 'next/link';
import { prisma } from '@syntra/db';
import { requirePermission } from '@/lib/access';
import { redactSecrets } from '@syntra/security';
import { EmptyState, Mono, PageHeader, Panel } from '@/components/page';
import { Input } from '@/components/ui/input';
import { actionLabel } from '@/lib/audit-labels';
import { Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';

export const metadata = { title: 'Audit' };

const PAGE = 50;
const fmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'medium' });

const TONE: Record<string, 'brand' | 'danger' | 'warning' | 'success' | 'neutral'> = {
  'module.enable': 'success', 'module.disable': 'warning', 'module.config': 'brand', 'apikey.revoke': 'danger', 'apikey.create': 'brand', 'apikey.rotate': 'warning',
};

/** Ligne de différence avant/après sur les clés modifiées uniquement */
function diff(before: unknown, after: unknown): { key: string; before: string; after: string }[] {
  const b = (before && typeof before === 'object' ? before : {}) as Record<string, unknown>;
  const a = (after && typeof after === 'object' ? after : {}) as Record<string, unknown>;
  return [...new Set([...Object.keys(b), ...Object.keys(a)])]
    .filter((k) => JSON.stringify(b[k]) !== JSON.stringify(a[k]))
    .map((k) => ({ key: k, before: b[k] === undefined ? '—' : JSON.stringify(b[k]), after: a[k] === undefined ? '—' : JSON.stringify(a[k]) }));
}

export default async function AuditPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string; q?: string }> }) {
  const { slug } = await params;
  const { page: p, q } = await searchParams;
  const access = await requirePermission(slug, 'audit:read');
  const page = Math.max(1, Number(p) || 1);
  const where = { projectId: access.project.id, ...(q ? { action: { startsWith: q } } : {}) };

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * PAGE, take: PAGE }),
    prisma.auditLog.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const href = (n: number) => `/${slug}/audit?${new URLSearchParams({ ...(q ? { q } : {}), page: String(n) })}`;

  return (
    <div>
      <PageHeader title="Journal d’audit" description="Chaque modification de configuration et chaque action sensible : qui, quoi, avant et après. Les secrets sont masqués et les entrées ne peuvent pas être modifiées." />
      <form action={`/${slug}/audit`} method="get" className="mb-4 flex max-w-sm items-center gap-2" role="search">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2 size-4 text-subtle" aria-hidden />
          <Input name="q" defaultValue={q ?? ''} placeholder="Filtrer par action (ex. module, apikey)" aria-label="Filtrer par action" className="pl-8" />
        </div>
      </form>
      <Panel className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState title="Aucune entrée" icon={ScrollText}>Les activations de modules, modifications de configuration, clés API et publications d’embeds seront tracées ici.</EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((r) => {
              const changes = diff(redactSecrets(r.before), redactSecrets(r.after));
              return (
                <li key={r.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <time className="w-36 shrink-0 font-mono text-xs text-subtle" dateTime={r.createdAt.toISOString()}>{fmt.format(r.createdAt)}</time>
                    <Badge tone={TONE[r.action] ?? 'neutral'}>{actionLabel(r.action)}</Badge>
                    <span className="text-[13px] text-fg">{r.actorName ?? (r.actorType === 'API_KEY' ? 'Clé API' : 'Système')}</span>
                    {r.actorId ? <Mono>{r.actorId}</Mono> : null}
                    {r.entityType ? <span className="text-xs text-subtle">{r.entityType}{r.entityId ? ` · ${r.entityId}` : ''}</span> : null}
                    <Mono className="text-[11px] text-subtle">{r.action}</Mono>
                  </div>
                  {changes.length > 0 ? (
                    <dl className="mt-2 ml-0 space-y-1 rounded-md border border-line bg-surface-2/50 p-2.5 font-mono text-[12px] leading-relaxed sm:ml-[9.75rem]">
                      {changes.slice(0, 8).map((c) => (
                        <div key={c.key} className="grid gap-x-3 sm:grid-cols-[10rem_1fr]">
                          <dt className="truncate text-subtle">{c.key}</dt>
                          <dd className="min-w-0 break-words"><span className="text-danger/90 line-through decoration-danger/40">{c.before}</span> <span className="text-subtle">→</span> <span className="text-success">{c.after}</span></dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {pages > 1 ? (
        <nav className="mt-4 flex items-center justify-between text-[13px] text-muted" aria-label="Pagination">
          <Link aria-disabled={page <= 1} href={href(Math.max(1, page - 1))} className={cn('rounded-md px-3 py-1.5 transition-colors hover:bg-hover hover:text-fg', page <= 1 && 'pointer-events-none opacity-40')}>Précédent</Link>
          <span>Page {page} sur {pages} · {total} entrées</span>
          <Link aria-disabled={page >= pages} href={href(Math.min(pages, page + 1))} className={cn('rounded-md px-3 py-1.5 transition-colors hover:bg-hover hover:text-fg', page >= pages && 'pointer-events-none opacity-40')}>Suivant</Link>
        </nav>
      ) : null}
    </div>
  );
}
