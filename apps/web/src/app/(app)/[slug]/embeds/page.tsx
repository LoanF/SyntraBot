import Link from 'next/link';
import { Plus, LayoutTemplate } from 'lucide-react';
import { prisma } from '@syntra/db';
import { requireProjectAccess } from '@/lib/access';
import { pickGuild, visibleGuilds } from '@/lib/guild-param';
import { EmptyState, Mono, PageHeader, Panel, relativeTime } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { buttonStyles } from '@/components/ui/button';

export const metadata = { title: 'Embeds' };

export default async function EmbedsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ g?: string }> }) {
  const { slug } = await params;
  const { g } = await searchParams;
  const access = await requireProjectAccess(slug);
  const guilds = visibleGuilds(access, ['embeds:read']);
  const selected = pickGuild(access, guilds, g);
  const canWrite = selected ? access.ctx.can('embeds:write', { guildId: selected.id }) : false;

  const embeds = selected ? await prisma.embedTemplate.findMany({ where: { projectId: access.project.id, guildId: selected.id }, orderBy: { updatedAt: 'desc' } }) : [];
  const q = selected ? `?g=${selected.id}` : '';

  return (
    <div>
      <PageHeader
        title="Embeds"
        description="Composez les messages du bot avec un aperçu fidèle à Discord, publiez-les, puis modifiez-les en direct sans les reposter."
        actions={canWrite ? <Link href={`/${slug}/embeds/new${q}`} className={buttonStyles({ variant: 'primary' })}><Plus className="size-3.5" aria-hidden />Nouvel embed</Link> : undefined}
      />
      <Panel className="overflow-hidden">
        {embeds.length === 0 ? (
          <EmptyState
            title="Aucun embed pour ce serveur"
            icon={LayoutTemplate}
            action={canWrite ? <Link href={`/${slug}/embeds/new${q}`} className={buttonStyles({ variant: 'primary' })}>Créer un embed</Link> : undefined}
          >
            Règlement, annonces, panneau d’ouverture de tickets, auto-rôles : composez le message à gauche, vérifiez le rendu Discord à droite.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {embeds.map((e) => {
              const p = e.payload as { embeds?: { title?: string }[] };
              return (
                <li key={e.id}>
                  <Link href={`/${slug}/embeds/${e.id}${q}`} className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-hover">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-fg">{e.name}</span>
                      <span className="block truncate text-xs text-subtle">{p.embeds?.[0]?.title ?? 'Sans titre'}</span>
                    </span>
                    {e.channelId ? <Mono className="hidden sm:inline">{e.channelId}</Mono> : null}
                    <Badge tone={e.status === 'PUBLISHED' ? 'success' : 'neutral'}>{e.status === 'PUBLISHED' ? 'Publié' : 'Brouillon'}</Badge>
                    <span className="w-24 text-right text-xs text-subtle">{relativeTime(e.updatedAt)}</span>
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
