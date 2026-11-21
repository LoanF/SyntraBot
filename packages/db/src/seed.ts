import { prisma } from './client';
import { DEFAULT_MESSAGES, DEFAULT_POLES, DEFAULT_SNIPPETS, DEFAULT_STATUSES } from '@syntra/shared';

/** Enregistre le template par défaut en base (consultable/versionné depuis le dashboard admin). */
async function main() {
  await prisma.configTemplate.upsert({
    where: { key_version: { key: 'default', version: 1 } },
    update: {},
    create: {
      key: 'default', version: 1, name: 'Syntra — défaut (Qbox)', isDefault: true,
      data: JSON.parse(JSON.stringify({ statuses: DEFAULT_STATUSES, poles: DEFAULT_POLES, snippets: DEFAULT_SNIPPETS, messages: DEFAULT_MESSAGES })),
    },
  });
  console.log('Template par défaut enregistré.');
}

main().finally(() => prisma.$disconnect());
