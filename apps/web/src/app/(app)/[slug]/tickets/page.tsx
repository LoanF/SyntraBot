import Link from 'next/link';
import { Ticket } from 'lucide-react';
import { prisma } from '@syntra/db';
import { requireProjectAccess } from '@/lib/access';
import { pickGuild, visibleGuilds } from '@/lib/guild-param';
import { EmptyState, Mono, PageHeader, Panel, relativeTime } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';

export const metadata = { title: 'Tickets' };

const FILTERS = [
  { id: 'open', label: 'Ouverts' },
  { id: 'unclaimed', label: 'Non pris en charge' },
  { id: 'closed', label: 'Clôturés' },
  { id: 'all', label: 'Tous' },
] as const;

const PRIORITY: Record<string, { label: string; tone: 'neutral' | 'warning' | 'danger' }> = {
  LOW: { label: 'Basse', tone: 'neutral' }, NORMAL: { label: 'Normale', tone: 'neutral' }, HIGH: { label: 'Haute', tone: 'warning' }, URGENT: { label: 'Urgente', tone: 'danger' },
};

export default async function TicketsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ g?: string; s?: string }> }) {
  const { slug } = await params;
  const { g, s = 'open' } = await searchParams;
  const access = await requireProjectAccess(slug);
  const guilds = visibleGuilds(access, ['tickets:read']);
  const selected = pickGuild(access, guilds, g);
  const filter = FILTERS.find((f) => f.id === s)?.id ?? 'open';

  const tickets = selected
    ? await prisma.ticket.findMany({
        where: { projectId: access.project.id, guildId: selected.id, ...(filter === 'open' ? { closedAt: null } : filter === 'unclaimed' ? { closedAt: null, claimedByDiscordId: null } : filter === 'closed' ? { closedAt: { not: null } } : {}) },
        include: { pole: { select: { label: true, emoji: true } }, status: true },
        orderBy: { updatedAt: 'desc' },
        take: 100,
      })
    : [];
  const qs = (f: string) => `?${new URLSearchParams({ ...(selected ? { g: selected.id } : {}), s: f })}`;

  return (
    <div>
      <PageHeader title="Tickets" description={selected ? `Dossiers du serveur « ${selected.label} ». Ouvrez un ticket pour lire sa conversation complète.` : undefined} />

      <div className="mb-4 flex gap-1 rounded-md border border-line bg-surface-1 p-0.5" role="tablist" aria-label="Filtrer par état" style={{ width: 'fit-content' }}>
        {FILTERS.map((f) => (
          <Link
            key={f.id} href={`/${slug}/tickets${qs(f.id)}`} role="tab" aria-selected={filter === f.id}
            className={cn('rounded px-3 py-1 text-[13px] transition-colors', filter === f.id ? 'bg-surface-3 text-fg' : 'text-muted hover:text-fg')}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <Panel className="overflow-hidden">
        {tickets.length === 0 ? (
          <EmptyState title={filter === 'open' ? 'Aucun ticket ouvert' : 'Aucun ticket'} icon={Ticket}>
            Les tickets arrivent quand un joueur écrit en message privé au bot et choisit un pôle. Vérifiez que le module Tickets est activé dans Modules.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[50rem] text-left text-[13px]">
              <thead className="border-b border-line text-xs text-subtle">
                <tr>
                  <th scope="col" className="w-14 px-4 py-2.5 font-medium">N°</th>
                  <th scope="col" className="px-2 py-2.5 font-medium">Joueur</th>
                  <th scope="col" className="px-2 py-2.5 font-medium">Pôle</th>
                  <th scope="col" className="px-2 py-2.5 font-medium">Statut</th>
                  <th scope="col" className="px-2 py-2.5 font-medium">Responsable</th>
                  <th scope="col" className="px-2 py-2.5 font-medium">Priorité</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Activité</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {tickets.map((t) => (
                  <tr key={t.id} className="group relative transition-colors hover:bg-hover">
                    <td className="px-4 py-3"><Mono>#{t.number}</Mono></td>
                    <td className="px-2 py-3">
                      <Link href={`/${slug}/tickets/${t.id}`} className="font-medium text-fg after:absolute after:inset-0 hover:underline">
                        {t.username}
                      </Link>
                      {t.subject ? <p className="mt-0.5 max-w-[34ch] truncate text-xs text-subtle">{t.subject}</p> : null}
                    </td>
                    <td className="px-2 py-3 text-muted">{t.pole.label}</td>
                    <td className="px-2 py-3">
                      <span className="inline-flex items-center gap-1.5 text-fg">
                        <span aria-hidden className="size-2 rounded-full" style={{ background: t.status.color }} />
                        {t.status.label}
                      </span>
                    </td>
                    <td className="px-2 py-3 text-muted">{t.claimedByName ?? <span className="text-subtle">—</span>}</td>
                    <td className="px-2 py-3"><Badge tone={PRIORITY[t.priority]?.tone}>{PRIORITY[t.priority]?.label}</Badge></td>
                    <td className="px-4 py-3 text-right text-xs text-subtle">{relativeTime(t.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
