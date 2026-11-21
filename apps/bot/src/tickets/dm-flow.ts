import {
  ActionRowBuilder, ModalBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle,
  type ButtonInteraction, type Message, type ModalSubmitInteraction, type StringSelectMenuInteraction,
} from 'discord.js';
import { AppError } from '@syntra/shared';
import type { BotContext } from '../context';

/** Projets où l'utilisateur est membre d'au moins un serveur et où un pôle est ouvrable. */
async function reachableProjects(ctx: BotContext, userId: string) {
  const found = new Map<string, string>(); // projectId -> name
  const guilds = await ctx.prisma.guild.findMany({ where: { botPresent: true }, include: { project: true } });
  for (const g of guilds) {
    if (found.has(g.projectId) || g.project.status !== 'ACTIVE') continue;
    const discordGuild = ctx.client.guilds.cache.get(g.discordGuildId);
    if (!discordGuild) continue;
    const member = await discordGuild.members.fetch(userId).catch(() => null);
    if (member) found.set(g.projectId, g.project.name);
  }
  return found;
}

async function openablePoles(ctx: BotContext, projectId: string) {
  const poles = await ctx.prisma.ticketPole.findMany({ where: { projectId, enabled: true }, orderBy: { position: 'asc' } });
  const out = [];
  for (const p of poles) {
    const mod = await ctx.config.getModule(projectId, 'tickets', p.guildId);
    if (mod.enabled && mod.configured) out.push(p);
  }
  return out;
}

async function poleMenu(ctx: BotContext, projectId: string) {
  const poles = await openablePoles(ctx, projectId);
  if (poles.length === 0) return null;
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`t:pole:${projectId}`)
    .setPlaceholder(await ctx.config.message(projectId, 'ticket.dm.pick_pole'))
    .addOptions(poles.slice(0, 25).map((p) => ({ label: p.label.slice(0, 100), value: p.id, ...(p.description ? { description: p.description.slice(0, 100) } : {}), ...(p.emoji ? { emoji: p.emoji } : {}) })));
  return { content: await ctx.config.message(projectId, 'ticket.dm.pick_pole'), components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)] };
}

/** Message privé sans ticket ouvert : démarre la sélection projet -> pôle. */
export async function startDmFlow(ctx: BotContext, message: Message) {
  const projects = await reachableProjects(ctx, message.author.id);
  if (projects.size === 0) {
    return; // aucun serveur partagé : on ignore silencieusement (aucune config de projet applicable)
    return;
  }
  if (projects.size === 1) {
    const [projectId] = [...projects.keys()] as [string];
    const menu = await poleMenu(ctx, projectId);
    if (menu) await message.reply(menu);
    else await message.reply(await ctx.config.message(projectId, 'ticket.dm.no_server'));
    return;
  }
  const first = [...projects.keys()][0]!;
  const menu = new StringSelectMenuBuilder()
    .setCustomId('t:proj')
    .setPlaceholder(await ctx.config.message(first, 'ticket.dm.pick_project'))
    .addOptions([...projects].slice(0, 25).map(([id, name]) => ({ label: name.slice(0, 100), value: id })));
  await message.reply({ content: await ctx.config.message(first, 'ticket.dm.pick_project'), components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)] });
}

export async function onProjectSelected(ctx: BotContext, i: StringSelectMenuInteraction) {
  const projectId = i.values[0]!;
  const reachable = await reachableProjects(ctx, i.user.id);
  if (!reachable.has(projectId)) return i.reply({ content: '—', ephemeral: true });
  const menu = await poleMenu(ctx, projectId);
  if (!menu) return i.update({ content: await ctx.config.message(projectId, 'ticket.dm.no_server'), components: [] });
  return i.update(menu);
}

export async function onPoleSelected(ctx: BotContext, i: StringSelectMenuInteraction) {
  return openPole(ctx, i, i.values[0]!);
}

/** Ouvre le formulaire d'un pôle (depuis un menu en MP ou un bouton d'embed sur un serveur). */
export async function openPole(ctx: BotContext, i: StringSelectMenuInteraction | ButtonInteraction, poleId: string) {
  const pole = await ctx.prisma.ticketPole.findUnique({ where: { id: poleId }, include: { questions: { orderBy: { position: 'asc' } } } });
  if (!pole || !pole.enabled) return i.reply({ content: '—', ephemeral: true });

  const modal = new ModalBuilder().setCustomId(`t:modal:${pole.id}`).setTitle(pole.label.slice(0, 45));
  const questions = pole.questions.slice(0, 5);
  if (questions.length === 0) {
    // Aucun formulaire configuré : création directe
    return submitTicket(ctx, i, pole.id, {});
  }
  modal.addComponents(
    questions.map((q) =>
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(q.key)
          .setLabel(q.label.slice(0, 45))
          .setStyle(q.style === 'PARAGRAPH' ? TextInputStyle.Paragraph : TextInputStyle.Short)
          .setRequired(q.required)
          .setMaxLength(q.maxLength ?? 1000)
          .setMinLength(q.minLength ?? 0)
          .setPlaceholder(q.placeholder ?? ''),
      ),
    ),
  );
  return i.showModal(modal);
}

export async function openPoleByKey(ctx: BotContext, i: ButtonInteraction, projectId: string, poleKey: string) {
  const pole = await ctx.prisma.ticketPole.findUnique({ where: { projectId_key: { projectId, key: poleKey } } });
  if (!pole || !pole.enabled) return i.reply({ content: await ctx.config.message(projectId, 'ticket.dm.no_server'), ephemeral: true });
  return openPole(ctx, i, pole.id);
}

export async function onModalSubmit(ctx: BotContext, i: ModalSubmitInteraction) {
  const poleId = i.customId.split(':')[2]!;
  const pole = await ctx.prisma.ticketPole.findUnique({ where: { id: poleId }, include: { questions: true } });
  if (!pole) return i.reply({ content: '—', ephemeral: true });
  const answers: Record<string, string> = {};
  for (const q of pole.questions.slice(0, 5)) answers[q.key] = i.fields.getTextInputValue(q.key);
  return submitTicket(ctx, i, poleId, answers);
}

async function submitTicket(ctx: BotContext, i: ModalSubmitInteraction | StringSelectMenuInteraction | ButtonInteraction, poleId: string, answers: Record<string, string>) {
  const { tickets } = ctx;
  const pole = await ctx.prisma.ticketPole.findUniqueOrThrow({ where: { id: poleId } });
  // Sur un serveur (bouton d'embed), la réponse reste privée : le salon de ticket est créé ailleurs
  await i.deferReply(i.inGuild() ? { ephemeral: true } : undefined);
  try {
    const subject = answers.subject ?? Object.values(answers)[0];
    const t = await tickets.create({
      projectId: pole.projectId, poleId, userDiscordId: i.user.id, username: i.user.username, answers, source: 'DISCORD_DM',
      ...(subject ? { subject: subject.slice(0, 100) } : {}),
    });
    await i.editReply({ content: await ctx.config.message(pole.projectId, 'ticket.dm.created', { 'ticket.number': t.number, pole: pole.label }), components: [] });
  } catch (err) {
    if (err instanceof AppError && err.code === 'TICKET_LIMIT') {
      const max = (err.details as { max: number }).max;
      await i.editReply({ content: await ctx.config.message(pole.projectId, 'ticket.dm.limit_reached', { max }) });
    } else {
      ctx.log.error({ err }, 'création de ticket échouée');
      await i.editReply({ content: await ctx.config.message(pole.projectId, 'ticket.dm.relay_failed') });
    }
  }
}
