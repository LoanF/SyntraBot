import { Server } from 'lucide-react';
import { prisma } from '@syntra/db';
import { MODULE_CONFIG_SCHEMAS, type ModuleKey } from '@syntra/shared';
import { requireProjectAccess } from '@/lib/access';
import { discord, hasDiscordToken } from '@/lib/discord';
import { guildHealth, missingForModule, permissionLabel } from '@/lib/health';
import { pickGuild, visibleGuilds } from '@/lib/guild-param';
import { MODULE_MANAGE_PERMISSION, MODULE_UI } from '@/lib/modules-ui';
import { EmptyState, PageHeader, Panel, PanelHeader } from '@/components/page';
import { ModuleRow, type ModuleRowData } from './module-row';

export const metadata = { title: 'Modules' };

async function discordOptions(discordGuildId: string) {
  if (!hasDiscordToken) return null;
  try {
    const [channels, roles] = await Promise.all([discord.listChannels(discordGuildId), discord.listRoles(discordGuildId)]);
    return { channels, roles };
  } catch {
    return null; // repli : saisie manuelle des identifiants
  }
}

export default async function ModulesPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ g?: string }> }) {
  const { slug } = await params;
  const { g } = await searchParams;
  const access = await requireProjectAccess(slug);
  const guilds = visibleGuilds(access, ['modules:manage', 'douane:manage', 'status:manage', 'sync_roles:manage', 'embeds:write']);
  const selected = pickGuild(access, guilds, g);

  if (!selected) {
    return (
      <>
        <PageHeader title="Modules" />
        <Panel>
          <EmptyState title="Aucun serveur Discord disponible" icon={Server}>Rattachez un serveur au projet, ou demandez à un administrateur de vous donner accès à un serveur.</EmptyState>
        </Panel>
      </>
    );
  }

  const [rows, options] = await Promise.all([
    prisma.moduleInstance.findMany({ where: { projectId: access.project.id, OR: [{ guildId: selected.id }, { guildId: null }] } }),
    discordOptions(selected.discordGuildId),
  ]);
  const health = guildHealth(selected);

  const toRow = (m: (typeof rows)[number]): ModuleRowData => {
    const key = m.moduleKey as ModuleKey;
    const parsed = MODULE_CONFIG_SCHEMAS[key].safeParse(m.config);
    return {
      id: m.id, key, enabled: m.enabled, configured: parsed.success,
      config: m.config as Record<string, unknown>,
      canManage: access.ctx.can(MODULE_MANAGE_PERMISSION[key], m.guildId ? { guildId: m.guildId } : {}),
      missingPermissions: m.enabled ? missingForModule(key, health).map(permissionLabel) : [],
    };
  };
  const order = (a: ModuleRowData, b: ModuleRowData) => MODULE_UI[a.key].label.localeCompare(MODULE_UI[b.key].label, 'fr');
  const guildRows = rows.filter((m) => m.guildId).map(toRow).sort(order);
  const projectRows = rows.filter((m) => !m.guildId).map(toRow).sort(order);

  return (
    <div>
      <PageHeader
        title="Modules"
        description={`Activez et réglez les fonctions du bot sur « ${selected.label} ». Les changements sont appliqués au bot en quelques secondes.`}
      />
      <div className="space-y-6">
        <Panel>
          <PanelHeader title={selected.label} description="Modules de ce serveur Discord" />
          <ul className="divide-y divide-line">
            {guildRows.map((r) => <ModuleRow key={r.id} slug={slug} row={r} options={options} />)}
          </ul>
        </Panel>
        {projectRows.length > 0 ? (
          <Panel>
            <PanelHeader title="Projet entier" description="Modules partagés par tous les serveurs du projet" />
            <ul className="divide-y divide-line">
              {projectRows.map((r) => <ModuleRow key={r.id} slug={slug} row={r} options={options} />)}
            </ul>
          </Panel>
        ) : null}
      </div>
    </div>
  );
}
