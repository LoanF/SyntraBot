import Link from 'next/link';
import { AlertTriangle, CheckCircle2, ChevronRight, Server } from 'lucide-react';
import { prisma } from '@syntra/db';
import { MODULE_CONFIG_SCHEMAS, MODULE_KEYS, type ModuleKey } from '@syntra/shared';
import { requireProjectAccess } from '@/lib/access';
import { guildHealth, permissionLabel } from '@/lib/health';
import { pickGuild, visibleGuilds } from '@/lib/guild-param';
import { MODULE_UI } from '@/lib/modules-ui';
import { actionLabel } from '@/lib/audit-labels';
import { Badge, Dot } from '@/components/ui/badge';
import { buttonStyles } from '@/components/ui/button';
import { EmptyState, Mono, PageHeader, Panel, PanelHeader, relativeTime } from '@/components/page';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return { title: 'Vue d’ensemble' + (slug ? '' : '') };
}

export default async function OverviewPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ g?: string }> }) {
  const { slug } = await params;
  const { g } = await searchParams;
  const access = await requireProjectAccess(slug);
  const guilds = visibleGuilds(access, ['tickets:read', 'modules:manage', 'embeds:read', 'reports:read']);
  const selected = pickGuild(access, guilds, g);

  const projectId = access.project.id;
  const guildIds = guilds.map((x) => x.id);
  const [modules, openTickets, openReports, activity] = await Promise.all([
    prisma.moduleInstance.findMany({ where: { projectId, OR: [{ guildId: selected?.id ?? '__none' }, { guildId: null }] } }),
    access.canAny('tickets:read') ? prisma.ticket.count({ where: { projectId, closedAt: null, guildId: { in: guildIds } } }) : Promise.resolve(null),
    access.canAny('reports:read') ? prisma.report.count({ where: { projectId, status: { not: 'CLOSED' } } }) : Promise.resolve(null),
    access.ctx.can('audit:read') ? prisma.auditLog.findMany({ where: { projectId }, orderBy: { createdAt: 'desc' }, take: 8 }) : Promise.resolve(null),
  ]);

  const healths = guilds.map((x) => ({ guild: x, health: guildHealth(x) }));
  const problems = healths.filter((h) => h.health.ok === false);
  const enabled = modules.filter((m) => m.enabled).length;
  const miswired = modules.filter((m) => m.enabled && !MODULE_CONFIG_SCHEMAS[m.moduleKey as ModuleKey].safeParse(m.config).success);
  const issues = problems.length + miswired.length;

  return (
    <div>
      <PageHeader
        title={access.project.name}
        description={
          guilds.length === 0
            ? 'Aucun serveur Discord n’est encore rattaché à ce projet.'
            : issues === 0
              ? 'Tout est opérationnel.'
              : `${issues} point${issues > 1 ? 's' : ''} à régler pour que le bot fonctionne pleinement.`
        }
        actions={
          <Link href={`/${slug}/modules${selected ? `?g=${selected.id}` : ''}`} className={buttonStyles({ variant: 'secondary' })}>
            Gérer les modules
          </Link>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="min-w-0 space-y-6">
          <Panel>
            <PanelHeader title="Serveurs Discord" description="Santé du bot sur chaque serveur du projet" />
            {healths.length === 0 ? (
              <EmptyState
                title="Rattachez votre premier serveur"
                icon={Server}
                action={access.ctx.can('project:admin') ? <Link href={`/${slug}/servers`} className={buttonStyles({ variant: 'primary' })}>Ajouter un serveur Discord</Link> : undefined}
              >
                Invitez le bot sur votre serveur Discord, puis rattachez-le ici : les modules et les pôles par défaut sont créés automatiquement.
              </EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {healths.map(({ guild, health }) => (
                  <li key={guild.id} className="flex items-start gap-3 px-4 py-3">
                    <span className="mt-0.5">
                      {health.ok === false ? <AlertTriangle className="size-4 text-warning" aria-hidden /> : <CheckCircle2 className={health.ok ? 'size-4 text-success' : 'size-4 text-subtle'} aria-hidden />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="text-[13px] font-medium text-fg">{guild.label}</span>
                        <Mono>{guild.kind}</Mono>
                        {guild.isPrimary ? <Badge tone="brand">Principal</Badge> : null}
                      </div>
                      {health.ok === false ? (
                        <p className="mt-1 text-[13px] leading-snug text-muted">
                          {health.botPresent === false || health.missing.includes('BotNotInGuild')
                            ? 'Le bot n’est pas présent sur ce serveur.'
                            : <>Permissions manquantes au bot : {health.missing.map((m) => permissionLabel(m)).join(', ')}.</>}
                          {access.ctx.can('project:admin') ? <> <Link href={`/${slug}/servers`} className="text-brand underline decoration-brand/40 hover:decoration-brand">Voir le serveur</Link></> : null}
                        </p>
                      ) : (
                        <p className="mt-1 text-xs text-subtle">
                          {health.ok ? 'Permissions complètes' : 'Pas encore vérifié'}
                          {health.checkedAt ? ` · vérifié ${relativeTime(health.checkedAt)}` : ''}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {selected ? (
            <Panel>
              <PanelHeader
                title={`Modules · ${selected.label}`}
                description={`${enabled} activé${enabled > 1 ? 's' : ''} sur ${MODULE_KEYS.length}`}
                actions={<Link href={`/${slug}/modules?g=${selected.id}`} className="text-xs text-muted transition-colors hover:text-fg">Tout voir</Link>}
              />
              <ul className="divide-y divide-line">
                {modules.sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.moduleKey.localeCompare(b.moduleKey)).map((m) => {
                  const ui = MODULE_UI[m.moduleKey as ModuleKey];
                  const broken = miswired.some((x) => x.id === m.id);
                  return (
                    <li key={m.id}>
                      <Link href={`/${slug}/modules?g=${selected.id}`} className="flex items-center gap-3 px-4 py-2.5 text-[13px] transition-colors hover:bg-hover">
                        <Dot tone={broken ? 'warning' : m.enabled ? 'success' : 'neutral'} />
                        <span className="flex-1 text-fg">{ui.label}</span>
                        <span className={broken ? 'text-xs text-warning' : 'text-xs text-subtle'}>{broken ? 'Configuration incomplète : compléter' : m.enabled ? 'Actif' : 'Désactivé'}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          ) : null}
        </div>

        <div className="min-w-0 space-y-6">
          {(openTickets !== null || openReports !== null) && (
            <Panel>
              <PanelHeader title="À traiter" />
              <ul className="divide-y divide-line text-[13px]">
                {openTickets !== null ? (
                  <li>
                    <Link href={`/${slug}/tickets`} className="group flex items-center justify-between px-4 py-3 transition-colors hover:bg-hover">
                      <span className="text-muted group-hover:text-fg"><span className="font-medium text-fg">{openTickets}</span> ticket{openTickets > 1 ? 's' : ''} ouvert{openTickets > 1 ? 's' : ''}</span>
                      <ChevronRight className="size-4 text-subtle" aria-hidden />
                    </Link>
                  </li>
                ) : null}
                {openReports !== null ? (
                  <li>
                    <Link href={`/${slug}/reports`} className="group flex items-center justify-between px-4 py-3 transition-colors hover:bg-hover">
                      <span className="text-muted group-hover:text-fg"><span className="font-medium text-fg">{openReports}</span> report{openReports > 1 ? 's' : ''} en cours</span>
                      <ChevronRight className="size-4 text-subtle" aria-hidden />
                    </Link>
                  </li>
                ) : null}
              </ul>
            </Panel>
          )}

          {activity ? (
            <Panel>
              <PanelHeader title="Activité récente" actions={<Link href={`/${slug}/audit`} className="text-xs text-muted transition-colors hover:text-fg">Journal complet</Link>} />
              {activity.length === 0 ? (
                <p className="px-4 py-8 text-center text-[13px] text-subtle">Les modifications de configuration apparaîtront ici.</p>
              ) : (
                <ol className="divide-y divide-line">
                  {activity.map((a) => (
                    <li key={a.id} className="px-4 py-2.5">
                      <p className="text-[13px] leading-snug text-muted">
                        <span className="font-medium text-fg">{a.actorName ?? (a.actorType === 'API_KEY' ? 'Clé API' : 'Système')}</span>{' '}
                        {actionLabel(a.action)}
                        {a.entityType === 'module' && a.entityId ? <> <span className="text-fg">{MODULE_UI[a.entityId as ModuleKey]?.label ?? a.entityId}</span></> : null}
                      </p>
                      <p className="mt-0.5 text-xs text-subtle">{relativeTime(a.createdAt)}</p>
                    </li>
                  ))}
                </ol>
              )}
            </Panel>
          ) : null}
        </div>
      </div>
    </div>
  );
}
