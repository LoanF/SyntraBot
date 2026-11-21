import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { prisma } from '@syntra/db';
import type { PlayerSnapshot } from '@syntra/shared';
import { requireProjectAccess } from '@/lib/access';
import { Mono, Panel, PanelHeader, relativeTime } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { Transcript, type TranscriptMessage } from '@/components/discord/transcript';

const KIND = { PLAYER: 'player', STAFF_PUBLIC: 'staff', STAFF_ANONYMOUS: 'staff_anon', INTERNAL_NOTE: 'note', SYSTEM: 'system' } as const;
const fmt = new Intl.NumberFormat('fr-FR');

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await prisma.ticket.findUnique({ where: { id }, select: { number: true } });
  return { title: t ? `Ticket #${t.number}` : 'Ticket' };
}

export default async function TicketPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const access = await requireProjectAccess(slug);

  const ticket = await prisma.ticket.findFirst({
    where: { id, projectId: access.project.id },
    include: {
      pole: { include: { questions: { orderBy: { position: 'asc' } } } },
      status: true,
      messages: { orderBy: { createdAt: 'asc' } },
      transfers: { orderBy: { createdAt: 'asc' } },
    },
  });
  // Même 404 pour « inexistant » et « interdit » : on ne révèle pas l'existence d'un dossier hors périmètre
  if (!ticket || !access.ctx.can('transcripts:read', { guildId: ticket.guildId })) notFound();

  const messages: TranscriptMessage[] = ticket.messages
    .filter((m) => !m.deletedAt)
    .map((m) => ({
      id: m.id,
      kind: KIND[m.kind],
      author: m.kind === 'STAFF_ANONYMOUS' ? (ticket.pole.anonymousName ?? ticket.pole.label) : (m.authorName ?? 'Inconnu'),
      avatar: m.authorAvatar,
      content: m.content,
      at: m.createdAt,
      ...(m.kind === 'STAFF_ANONYMOUS' ? { label: `Au nom de ${ticket.pole.label}` } : {}),
    }));

  const answers = ticket.answers as Record<string, string>;
  const game = ticket.gameContext as { coords?: { x: number; y: number; z: number }; health?: number; armor?: number; weapon?: string | null; vehicle?: string | null } | null;
  const snap = ticket.playerSnapshot as PlayerSnapshot | null;

  return (
    <div>
      <Link href={`/${slug}/tickets?g=${ticket.guildId}`} className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-fg">
        <ArrowLeft className="size-3.5" aria-hidden />
        Tickets
      </Link>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xl font-semibold tracking-tight text-fg">
            <span className="text-balance">{ticket.subject ?? `Ticket #${ticket.number}`}</span>
            <Mono className="text-sm">#{ticket.number}</Mono>
          </h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
            <span className="inline-flex items-center gap-1.5 text-fg">
              <span aria-hidden className="size-2 rounded-full" style={{ background: ticket.status.color }} />
              {ticket.status.label}
            </span>
            <span>{ticket.pole.label}</span>
            <span>ouvert {relativeTime(ticket.createdAt)}</span>
            {ticket.claimedByDiscordId ? <span>pris en charge par <span className="text-fg">{ticket.claimedByName ?? 'un membre du staff'}</span></span> : <Badge tone="warning">Non pris en charge</Badge>}
          </p>
        </div>
        {ticket.closedAt ? <Badge>Clôturé {relativeTime(ticket.closedAt)}</Badge> : <Badge tone="success">Ouvert</Badge>}
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <Panel className="min-w-0 overflow-hidden">
          <PanelHeader title="Conversation" description={`${messages.length} message${messages.length > 1 ? 's' : ''} · les notes internes ne sont jamais envoyées au joueur`} />
          <Transcript messages={messages} />
        </Panel>

        <div className="min-w-0 space-y-6">
          <Panel>
            <PanelHeader title="Joueur" />
            <dl className="space-y-2.5 px-4 py-3.5 text-[13px]">
              <div><dt className="text-xs text-subtle">Pseudo Discord</dt><dd className="text-fg">{ticket.username}</dd></div>
              <div><dt className="text-xs text-subtle">Identifiant Discord</dt><dd><Mono>{ticket.userDiscordId}</Mono></dd></div>
              {Object.entries(answers).map(([k, v]) => {
                const q = ticket.pole.questions.find((x) => x.key === k);
                return (
                  <div key={k}>
                    <dt className="text-xs text-subtle">{q?.label ?? k}</dt>
                    <dd className="whitespace-pre-wrap break-words text-fg">{v}</dd>
                  </div>
                );
              })}
            </dl>
          </Panel>

          {snap ? (
            <Panel>
              <PanelHeader title="Fiche joueur" description="Instantané à l’ouverture du ticket" />
              <div className="space-y-3 px-4 py-3.5 text-[13px]">
                {snap.characters.length === 0 ? <p className="text-subtle">Aucun personnage trouvé.</p> : null}
                {snap.characters.map((c) => (
                  <div key={c.citizenId}>
                    <p className="font-medium text-fg">{c.name ?? '—'} <Mono>{c.citizenId}</Mono></p>
                    <p className="text-xs leading-relaxed text-muted">
                      {c.job ?? '—'} · {fmt.format(c.cash ?? 0)} $ en poche · {fmt.format(c.bank ?? 0)} $ en banque
                    </p>
                  </div>
                ))}
                <p className="flex gap-3 text-xs">
                  <Badge tone={snap.activeBans ? 'danger' : 'neutral'}>{snap.activeBans} ban{snap.activeBans > 1 ? 's' : ''} actif{snap.activeBans > 1 ? 's' : ''}</Badge>
                  <Badge tone={snap.warns ? 'warning' : 'neutral'}>{snap.warns} avertissement{snap.warns > 1 ? 's' : ''}</Badge>
                </p>
                {snap.sheetUrl ? <a href={snap.sheetUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-brand underline decoration-brand/40 hover:decoration-brand">Ouvrir la fiche sur le site</a> : null}
              </div>
            </Panel>
          ) : null}

          {game?.coords ? (
            <Panel>
              <PanelHeader title="Contexte en jeu" />
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 px-4 py-3.5 text-[13px]">
                <div className="col-span-2"><dt className="text-xs text-subtle">Position</dt><dd><Mono>{game.coords.x.toFixed(1)}, {game.coords.y.toFixed(1)}, {game.coords.z.toFixed(1)}</Mono></dd></div>
                <div><dt className="text-xs text-subtle">Vie / Armure</dt><dd className="text-fg">{game.health ?? '—'} / {game.armor ?? '—'}</dd></div>
                <div><dt className="text-xs text-subtle">Arme / Véhicule</dt><dd className="text-fg">{game.weapon ?? '—'} / {game.vehicle ?? '—'}</dd></div>
              </dl>
            </Panel>
          ) : null}

          {ticket.transfers.length > 0 ? (
            <Panel>
              <PanelHeader title="Transferts" />
              <ol className="divide-y divide-line text-[13px]">
                {ticket.transfers.map((t) => (
                  <li key={t.id} className="px-4 py-2.5 text-muted">
                    Transféré {relativeTime(t.createdAt)}{t.note ? <> — <span className="text-fg">{t.note}</span></> : null}
                  </li>
                ))}
              </ol>
            </Panel>
          ) : null}
        </div>
      </div>
    </div>
  );
}
