import { UserCog } from 'lucide-react';
import { prisma } from '@syntra/db';
import { requirePermission } from '@/lib/access';
import { discord, hasDiscordToken } from '@/lib/discord';
import { PageHeader, Panel, EmptyState } from '@/components/page';
import { AccessClient, type PolicyRow } from './access-client';

export const metadata = { title: 'Accès' };

export default async function AccessPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await requirePermission(slug, 'access:manage');
  const policies = await prisma.accessPolicy.findMany({ where: { projectId: access.project.id }, orderBy: { createdAt: 'asc' } });

  // Noms de rôles Discord (affichage) ; sans token, on garde les identifiants
  const roleNames = new Map<string, string>();
  const rolesByGuild: Record<string, { id: string; name: string }[]> = {};
  if (hasDiscordToken) {
    await Promise.all(access.guilds.map(async (g) => {
      try {
        const roles = await discord.listRoles(g.discordGuildId);
        rolesByGuild[g.id] = roles.map((r) => ({ id: r.id, name: r.name }));
        for (const r of roles) roleNames.set(`${g.id}:${r.id}`, r.name);
      } catch { /* repli : identifiants */ }
    }));
  }
  const label = (id: string | null) => (id ? access.guilds.find((g) => g.id === id)?.label ?? '—' : null);
  const rows: PolicyRow[] = policies.map((p) => ({
    id: p.id, roleId: p.discordRoleId, roleName: roleNames.get(`${p.roleGuildId}:${p.discordRoleId}`) ?? null,
    roleGuild: label(p.roleGuildId) ?? '—', target: label(p.targetGuildId), permissions: p.permissions, label: p.label,
  }));

  return (
    <div>
      <PageHeader
        title="Accès"
        description="Qui peut faire quoi, selon ses rôles Discord réels. Un responsable du pôle Illégal ne voit que le Discord Illégal : jamais le RCON ni le serveur Staff, sauf règle explicite au niveau du projet."
      />
      {rows.length === 0 ? (
        <Panel>
          <EmptyState title="Aucune règle d’accès" icon={UserCog} action={<AccessClient slug={slug} rows={[]} guilds={access.guilds.map((g) => ({ id: g.id, label: g.label }))} rolesByGuild={rolesByGuild} onlyCreate />}>
            Seuls les propriétaires du projet ont accès à la console. Ajoutez une règle pour donner à un rôle Discord un périmètre précis.
          </EmptyState>
        </Panel>
      ) : (
        <AccessClient slug={slug} rows={rows} guilds={access.guilds.map((g) => ({ id: g.id, label: g.label }))} rolesByGuild={rolesByGuild} />
      )}
    </div>
  );
}
