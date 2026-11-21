import Link from 'next/link';
import { prisma } from '@syntra/db';
import { DEFAULT_MESSAGES } from '@syntra/shared';
import { requireProjectAccess } from '@/lib/access';
import { discord, hasDiscordToken } from '@/lib/discord';
import { visibleGuilds } from '@/lib/guild-param';
import { PageHeader } from '@/components/page';
import { cn } from '@/lib/cn';
import { PolesTab, type PoleRow } from './poles-tab';
import { StatusesTab } from './statuses-tab';
import { SnippetsTab } from './snippets-tab';
import { MessagesTab } from './messages-tab';
import { SyncTab, type RuleRow } from './sync-tab';
import { pickGuild } from '@/lib/guild-param';

export const metadata = { title: 'Configuration' };

const TABS = [
  { id: 'poles', label: 'Pôles' },
  { id: 'statuses', label: 'Statuts' },
  { id: 'snippets', label: 'Réponses rapides' },
  { id: 'messages', label: 'Textes du bot' },
  { id: 'sync', label: 'Synchro des rôles' },
] as const;

export default async function ConfigPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ tab?: string; g?: string }> }) {
  const { slug } = await params;
  const { tab = 'poles', g } = await searchParams;
  const access = await requireProjectAccess(slug);
  const projectWide = access.ctx.can('modules:manage');
  const guilds = visibleGuilds(access, ['modules:manage']);
  const tabs = TABS.filter((t) => t.id === 'poles' || t.id === 'sync' || projectWide);
  const active = tabs.find((t) => t.id === tab)?.id ?? 'poles';
  const pid = access.project.id;

  let body: React.ReactNode = null;
  if (active === 'poles') {
    const poles = await prisma.ticketPole.findMany({ where: { projectId: pid, guildId: { in: guilds.map((x) => x.id) } }, include: { questions: { orderBy: { position: 'asc' } }, guild: true }, orderBy: [{ position: 'asc' }, { label: 'asc' }] });
    const rolesByGuild: Record<string, { id: string; name: string }[]> = {};
    if (hasDiscordToken) {
      await Promise.all(guilds.map(async (x) => { try { rolesByGuild[x.id] = (await discord.listRoles(x.discordGuildId)).map((r) => ({ id: r.id, name: r.name })); } catch { /* saisie manuelle */ } }));
    }
    const rows: PoleRow[] = poles.map((p) => ({
      id: p.id, guildId: p.guildId, guildLabel: p.guild.label, key: p.key, label: p.label, emoji: p.emoji ?? '', description: p.description ?? '', categoryChannelId: p.categoryChannelId ?? '',
      staffRoleIds: p.staffRoleIds, anonymousName: p.anonymousName ?? '', channelPattern: p.channelPattern ?? '', defaultPriority: p.defaultPriority, enabled: p.enabled,
      questions: p.questions.map((q) => ({ key: q.key, label: q.label, placeholder: q.placeholder ?? undefined, style: q.style as 'SHORT' | 'PARAGRAPH', required: q.required, ...(q.minLength ? { minLength: q.minLength } : {}), ...(q.maxLength ? { maxLength: q.maxLength } : {}) })),
    }));
    body = <PolesTab slug={slug} rows={rows} guilds={guilds.map((x) => ({ id: x.id, label: x.label }))} defaultGuildId={guilds.find((x) => x.id === g)?.id ?? guilds[0]?.id ?? ''} rolesByGuild={rolesByGuild} />;
  } else if (active === 'statuses') {
    const statuses = await prisma.ticketStatus.findMany({ where: { projectId: pid }, orderBy: { position: 'asc' }, include: { _count: { select: { tickets: true } } } });
    body = <StatusesTab slug={slug} rows={statuses.map((s) => ({ id: s.id, key: s.key, label: s.label, emoji: s.emoji, color: s.color, trigger: s.trigger, lockAutoChange: s.lockAutoChange, isTerminal: s.isTerminal, tickets: s._count.tickets }))} />;
  } else if (active === 'snippets') {
    const [snippets, poles] = await Promise.all([
      prisma.ticketSnippet.findMany({ where: { projectId: pid }, orderBy: { title: 'asc' } }),
      prisma.ticketPole.findMany({ where: { projectId: pid }, select: { id: true, label: true } }),
    ]);
    body = <SnippetsTab slug={slug} rows={snippets.map((s) => ({ id: s.id, key: s.key, title: s.title, content: s.content, poleId: s.poleId }))} poles={poles} />;
  } else if (active === 'sync') {
    const guild = pickGuild(access, guilds, g);
    if (!guild) body = null;
    else {
      const rules = await prisma.roleSyncRule.findMany({ where: { projectId: pid, guildId: guild.id }, orderBy: { matchValue: 'asc' } });
      let roles: { id: string; name: string }[] | null = null;
      if (hasDiscordToken) roles = await discord.listRoles(guild.discordGuildId).then((r) => r.map((x) => ({ id: x.id, name: x.name }))).catch(() => null);
      body = <SyncTab slug={slug} guildId={guild.id} guildLabel={guild.label} roles={roles} rows={rules.map((r): RuleRow => ({ id: r.id, source: r.source, matchValue: r.matchValue, discordRoleId: r.discordRoleId, removeWhenUnmatched: r.removeWhenUnmatched, enabled: r.enabled }))} />;
    }
  } else {
    const rows = await prisma.messageTemplate.findMany({ where: { projectId: pid }, orderBy: { key: 'asc' } });
    const byKey = new Map<string, { fr?: string; en?: string }>();
    for (const r of rows) byKey.set(r.key, { ...byKey.get(r.key), [r.locale]: r.content });
    const items = [...byKey.entries()].map(([key, v]) => ({ key, fr: v.fr ?? '', en: v.en ?? '', hasDefault: key in DEFAULT_MESSAGES }));
    body = <MessagesTab slug={slug} items={items} />;
  }

  return (
    <div>
      <PageHeader title="Configuration" description="Pôles, pastilles de statut, réponses rapides et textes envoyés par le bot. Tout est modifiable ici : rien n’est figé dans le code." />
      <div className="mb-5 flex flex-wrap gap-1 rounded-md border border-line bg-surface-1 p-0.5" role="tablist" aria-label="Sections" style={{ width: 'fit-content' }}>
        {tabs.map((t) => (
          <Link key={t.id} href={`/${slug}/config?tab=${t.id}${g ? `&g=${g}` : ''}`} role="tab" aria-selected={active === t.id} className={cn('rounded px-3 py-1 text-[13px] transition-colors', active === t.id ? 'bg-surface-3 text-fg' : 'text-muted hover:text-fg')}>
            {t.label}
          </Link>
        ))}
      </div>
      {body}
    </div>
  );
}
