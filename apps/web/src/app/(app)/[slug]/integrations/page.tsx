import { prisma } from '@syntra/db';
import { FIVEM_PRESETS, SYNTRA_MAPPING } from '@syntra/shared';
import { requirePermission } from '@/lib/access';
import { PageHeader } from '@/components/page';
import { FivemDbForm, RconForm } from './forms';

export const metadata = { title: 'Intégrations' };

export default async function IntegrationsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await requirePermission(slug, 'integrations:manage');
  const [db, rcon] = await Promise.all([
    prisma.fivemDatabase.findUnique({ where: { projectId: access.project.id } }),
    prisma.rconConnection.findUnique({ where: { projectId: access.project.id } }),
  ]);

  const presets = {
    QBOX: JSON.stringify(FIVEM_PRESETS.QBOX, null, 2),
    SYNTRA: JSON.stringify(SYNTRA_MAPPING, null, 2),
    QBCORE: JSON.stringify(FIVEM_PRESETS.QBCORE, null, 2),
    ESX: JSON.stringify(FIVEM_PRESETS.ESX, null, 2),
  };

  return (
    <div>
      <PageHeader title="Intégrations" description="Connexions chiffrées au serveur de jeu. Les mots de passe ne sont jamais renvoyés au navigateur : pour les changer, saisissez une nouvelle valeur." />
      <div className="space-y-6">
        <FivemDbForm
          slug={slug}
          presets={presets}
          initial={{
            configured: Boolean(db), framework: db?.framework ?? 'QBOX', allowPrivateNetwork: db?.allowPrivateNetwork ?? false,
            mapping: db ? JSON.stringify(db.mapping, null, 2) : presets.QBOX, lastCheckAt: db?.lastCheckAt?.toISOString() ?? null, lastCheckOk: db?.lastCheckOk ?? null,
          }}
        />
        <RconForm slug={slug} initial={{ configured: Boolean(rcon), host: rcon?.host ?? '', port: rcon?.port ?? 30120, allowedCommands: rcon?.allowedCommands ?? ['ban', 'kick', 'revive', 'announce'] }} />
      </div>
    </div>
  );
}
