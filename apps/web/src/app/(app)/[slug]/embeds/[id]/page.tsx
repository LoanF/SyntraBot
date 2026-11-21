import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { prisma } from '@syntra/db';
import { requireProjectAccess } from '@/lib/access';
import { discord, hasDiscordToken } from '@/lib/discord';
import { pickGuild, visibleGuilds } from '@/lib/guild-param';
import { EmbedEditor, type EditorInitial } from './editor';

export const metadata = { title: 'Éditeur d’embed' };

export default async function EmbedEditorPage({ params, searchParams }: { params: Promise<{ slug: string; id: string }>; searchParams: Promise<{ g?: string }> }) {
  const { slug, id } = await params;
  const { g } = await searchParams;
  const access = await requireProjectAccess(slug);

  let initial: EditorInitial;
  let guildId: string;
  if (id === 'new') {
    const guild = pickGuild(access, visibleGuilds(access, ['embeds:write']), g);
    if (!guild || !access.ctx.can('embeds:write', { guildId: guild.id })) notFound();
    guildId = guild.id;
    initial = { id: null, name: 'Nouveau message', channelId: '', published: false, payload: { content: '', embeds: [{ title: '', description: '', color: '#9057ff', fields: [] }], components: [] } };
  } else {
    const tpl = await prisma.embedTemplate.findFirst({ where: { id, projectId: access.project.id } });
    if (!tpl || !access.ctx.can('embeds:read', { guildId: tpl.guildId })) notFound();
    guildId = tpl.guildId;
    initial = { id: tpl.id, name: tpl.name, channelId: tpl.channelId ?? '', published: Boolean(tpl.messageId), payload: tpl.payload as EditorInitial['payload'] };
  }
  const guild = access.guilds.find((x) => x.id === guildId)!;
  const canWrite = access.ctx.can('embeds:write', { guildId });

  const [poles, channels] = await Promise.all([
    prisma.ticketPole.findMany({ where: { projectId: access.project.id, enabled: true }, select: { key: true, label: true }, orderBy: { position: 'asc' } }),
    hasDiscordToken ? discord.listChannels(guild.discordGuildId).catch(() => null) : Promise.resolve(null),
  ]);

  return (
    <div>
      <Link href={`/${slug}/embeds?g=${guildId}`} className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-fg">
        <ArrowLeft className="size-3.5" aria-hidden />
        Embeds
      </Link>
      <EmbedEditor slug={slug} guildId={guildId} guildLabel={guild.label} initial={initial} poles={poles} channels={channels} readOnly={!canWrite} />
    </div>
  );
}
