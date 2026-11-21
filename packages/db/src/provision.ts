import type { Prisma, PrismaClient } from '@prisma/client';
import {
  DEFAULT_MESSAGES, DEFAULT_POLES, DEFAULT_SNIPPETS, DEFAULT_STATUSES, MODULE_KEYS, MODULE_SCOPE,
  defaultModuleConfig, type ModuleKey,
} from '@syntra/shared';

export interface CreateProjectInput {
  name: string;
  slug: string;
  ownerDiscordId: string;
  ownerUsername: string;
  locale?: 'fr' | 'en';
}

/**
 * Crée un projet en clonant le template par défaut (statuts, snippets, textes, modules de portée projet).
 * Les modules/pôles de portée serveur sont créés par `provisionGuild` quand un serveur Discord est rattaché.
 */
export async function createProjectFromTemplate(prisma: PrismaClient, input: CreateProjectInput) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { discordId: input.ownerDiscordId },
      update: { username: input.ownerUsername },
      create: { discordId: input.ownerDiscordId, username: input.ownerUsername },
    });
    const project = await tx.project.create({
      data: { name: input.name, slug: input.slug, ownerId: user.id, locale: input.locale ?? 'fr' },
    });
    await tx.projectMember.create({ data: { projectId: project.id, userId: user.id, role: 'OWNER' } });
    await tx.ticketCounter.create({ data: { projectId: project.id } });

    await tx.ticketStatus.createMany({
      data: DEFAULT_STATUSES.map((s, i) => ({ ...s, projectId: project.id, position: i })),
    });
    await tx.ticketSnippet.createMany({ data: DEFAULT_SNIPPETS.map((s) => ({ ...s, projectId: project.id })) });
    await tx.messageTemplate.createMany({
      data: Object.entries(DEFAULT_MESSAGES).flatMap(([key, m]) => [
        { projectId: project.id, key, locale: 'fr', content: m.fr },
        { projectId: project.id, key, locale: 'en', content: m.en },
      ]),
    });
    await tx.moduleInstance.createMany({
      data: MODULE_KEYS.filter((k) => MODULE_SCOPE[k] === 'project').map((k) => ({
        projectId: project.id, moduleKey: k, scopeKey: 'project', enabled: false,
        config: defaultModuleConfig(k) as Prisma.InputJsonValue,
      })),
    });
    return project;
  });
}

/** Rattache un serveur Discord : crée ses modules (désactivés) et les pôles dont `guildKind` correspond. */
export async function provisionGuild(
  prisma: PrismaClient,
  input: { projectId: string; discordGuildId: string; label: string; kind: string; isPrimary?: boolean },
) {
  return prisma.$transaction(async (tx) => {
    const guild = await tx.guild.create({
      data: { projectId: input.projectId, discordGuildId: input.discordGuildId, label: input.label, kind: input.kind, isPrimary: input.isPrimary ?? false },
    });
    const guildModules = MODULE_KEYS.filter((k: ModuleKey) => MODULE_SCOPE[k] === 'guild');
    await tx.moduleInstance.createMany({
      data: guildModules.map((k) => ({
        projectId: input.projectId, guildId: guild.id, moduleKey: k, scopeKey: guild.id, enabled: false,
        config: defaultModuleConfig(k) as Prisma.InputJsonValue,
      })),
    });
    for (const [i, pole] of DEFAULT_POLES.filter((p) => p.guildKind === input.kind).entries()) {
      await tx.ticketPole.create({
        data: {
          projectId: input.projectId, guildId: guild.id, key: pole.key, label: pole.label,
          ...(pole.emoji ? { emoji: pole.emoji } : {}),
          ...(pole.description ? { description: pole.description } : {}),
          position: i,
          questions: {
            create: pole.questions.map((q, qi) => ({
              key: q.key, label: q.label, style: q.style, required: q.required, position: qi,
              placeholder: q.placeholder ?? null, minLength: q.minLength ?? null, maxLength: q.maxLength ?? null,
            })),
          },
        },
      });
    }
    return guild;
  });
}
