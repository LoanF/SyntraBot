import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { prisma } from '@syntra/db';
import type { PlayerSnapshot } from '@syntra/shared';
import { requireProjectAccess } from '@/lib/access';
import { Mono, Panel, PanelHeader, relativeTime } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { Transcript, type TranscriptMessage } from '@/components/discord/transcript';

const fmt = new Intl.NumberFormat('fr-FR');

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await prisma.report.findUnique({ where: { id }, select: { externalId: true } });
  return { title: r ? `Report #${r.externalId}` : 'Report' };
}

export default async function ReportPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const access = await requireProjectAccess(slug);
  const report = await prisma.report.findFirst({ where: { id, projectId: access.project.id }, include: { messages: { orderBy: { createdAt: 'asc' } } } });
  if (!report || !access.ctx.can('reports:read', report.guildId ? { guildId: report.guildId } : {})) notFound();

  const messages: TranscriptMessage[] = report.messages.map((m) => ({
    id: m.id,
    kind: m.kind === 'PLAYER' ? 'player' : m.kind === 'STAFF' ? 'staff' : 'system',
    author: m.authorName,
    content: m.content,
    at: m.createdAt,
    origin: m.source === 'GAME' ? 'game' : 'discord',
  }));
  const game = report.gameContext as { coords?: { x: number; y: number; z: number }; health?: number; armor?: number; weapon?: string | null; vehicle?: string | null; nearby?: { serverId: number; name: string; distance: number }[] } | null;
  const snap = report.playerSnapshot as PlayerSnapshot | null;

  return (
    <div>
      <Link href={`/${slug}/reports`} className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-fg">
        <ArrowLeft className="size-3.5" aria-hidden />
        Reports
      </Link>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-x-3 text-xl font-semibold tracking-tight text-fg">
            <span className="text-balance">Report de {report.reporterName}</span>
            <Mono className="text-sm">#{report.externalId}</Mono>
          </h1>
          <p className="mt-1.5 text-[13px] text-muted">
            Créé en jeu {relativeTime(report.createdAt)}
            {report.claimedByName ? <> · pris en charge par <span className="text-fg">{report.claimedByName}</span></> : null}
          </p>
        </div>
        {report.status === 'CLOSED' ? <Badge>Clôturé{report.closedByName ? ` par ${report.closedByName}` : ''}</Badge> : report.status === 'CLAIMED' ? <Badge tone="success">Pris en charge</Badge> : <Badge tone="danger">Ouvert</Badge>}
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <Panel className="min-w-0 overflow-hidden">
          <PanelHeader title="Échanges" description="Panel en jeu et fil Discord, fusionnés dans l’ordre" />
          <Transcript messages={messages} />
          {report.resolution ? (
            <div className="border-t border-line px-4 py-3 text-[13px]">
              <p className="text-xs text-subtle">Résolution</p>
              <p className="mt-0.5 text-fg">{report.resolution}</p>
            </div>
          ) : null}
        </Panel>

        <div className="space-y-6">
          <Panel>
            <PanelHeader title="Joueur" />
            <dl className="space-y-2.5 px-4 py-3.5 text-[13px]">
              <div><dt className="text-xs text-subtle">UID / ID serveur</dt><dd className="text-fg">{report.reporterUid ?? '—'} / {report.serverId ?? '—'}</dd></div>
              <div><dt className="text-xs text-subtle">Identifiant FiveM</dt><dd className="break-all"><Mono>{report.reporterIdentifier}</Mono></dd></div>
              {report.reporterDiscordId ? <div><dt className="text-xs text-subtle">Discord</dt><dd><Mono>{report.reporterDiscordId}</Mono></dd></div> : null}
            </dl>
          </Panel>

          {game?.coords ? (
            <Panel>
              <PanelHeader title="Contexte à la création" />
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 px-4 py-3.5 text-[13px]">
                <div className="col-span-2"><dt className="text-xs text-subtle">Position</dt><dd><Mono>{game.coords.x.toFixed(1)}, {game.coords.y.toFixed(1)}, {game.coords.z.toFixed(1)}</Mono></dd></div>
                <div><dt className="text-xs text-subtle">Vie / Armure</dt><dd className="text-fg">{game.health ?? '—'} / {game.armor ?? '—'}</dd></div>
                <div><dt className="text-xs text-subtle">Arme / Véhicule</dt><dd className="text-fg">{game.weapon ?? '—'} / {game.vehicle ?? '—'}</dd></div>
                {game.nearby?.length ? (
                  <div className="col-span-2">
                    <dt className="text-xs text-subtle">Joueurs proches (≤ 50 m)</dt>
                    <dd className="mt-1 space-y-0.5 text-fg">{game.nearby.map((n) => <p key={n.serverId} className="flex justify-between"><span>[{n.serverId}] {n.name}</span><span className="text-xs text-subtle">{Math.round(n.distance)} m</span></p>)}</dd>
                  </div>
                ) : null}
              </dl>
            </Panel>
          ) : null}

          {snap ? (
            <Panel>
              <PanelHeader title="Fiche joueur" />
              <div className="space-y-3 px-4 py-3.5 text-[13px]">
                {snap.characters.map((c) => (
                  <div key={c.citizenId}>
                    <p className="font-medium text-fg">{c.name ?? '—'} <Mono>{c.citizenId}</Mono></p>
                    <p className="text-xs text-muted">{c.job ?? '—'} · {fmt.format(c.cash ?? 0)} $ · {fmt.format(c.bank ?? 0)} $</p>
                  </div>
                ))}
                <p className="flex gap-3">
                  <Badge tone={snap.activeBans ? 'danger' : 'neutral'}>{snap.activeBans} ban{snap.activeBans > 1 ? 's' : ''}</Badge>
                  <Badge tone={snap.warns ? 'warning' : 'neutral'}>{snap.warns} avertissement{snap.warns > 1 ? 's' : ''}</Badge>
                </p>
              </div>
            </Panel>
          ) : null}
        </div>
      </div>
    </div>
  );
}
