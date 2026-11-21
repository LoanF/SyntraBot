import { KeyRound } from 'lucide-react';
import { prisma } from '@syntra/db';
import { requirePermission } from '@/lib/access';
import { API_SCOPES } from '@/lib/api-scopes';
import { EmptyState, PageHeader, Panel } from '@/components/page';
import { KeysClient, type KeyRow } from './keys-client';

export const metadata = { title: 'Clés API' };

export default async function ApiKeysPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await requirePermission(slug, 'apikeys:manage');
  const keys = await prisma.apiKey.findMany({ where: { projectId: access.project.id }, orderBy: { createdAt: 'desc' } });
  const now = Date.now();

  const rows: KeyRow[] = keys.map((k) => ({
    id: k.id, name: k.name, keyId: k.keyId, scopes: k.scopes, rateLimitPerMin: k.rateLimitPerMin,
    createdAt: k.createdAt.toISOString(), lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
    state: !k.revokedAt ? 'active' : k.graceUntil && k.graceUntil.getTime() > now ? 'grace' : 'revoked',
    graceUntil: k.graceUntil?.toISOString() ?? null,
  }));

  return (
    <div>
      <PageHeader
        title="Clés API"
        description="Une clé par intégration : le site vitrine, le bridge FiveM. Chaque requête est signée en HMAC-SHA256 avec un horodatage ; le secret n’est affiché qu’une seule fois."
      />
      {rows.length === 0 ? (
        <Panel>
          <EmptyState title="Aucune clé API" icon={KeyRound} action={<KeysClient slug={slug} rows={[]} scopes={[...API_SCOPES]} onlyCreate />}>Créez une clé pour connecter le bridge du serveur de jeu ou le site de whitelist. Choisissez uniquement les accès dont l’intégration a besoin.</EmptyState>
        </Panel>
      ) : (
        <KeysClient slug={slug} rows={rows} scopes={[...API_SCOPES]} />
      )}
    </div>
  );
}
