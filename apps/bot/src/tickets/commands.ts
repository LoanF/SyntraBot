import {
  SlashCommandBuilder, type AutocompleteInteraction, type ChatInputCommandInteraction, type GuildMember,
} from 'discord.js';
import { AppError, ForbiddenError } from '@syntra/shared';
import type { BotContext } from '../context';
import type { TicketWithRefs } from './service';

export const ticketCommand = new SlashCommandBuilder()
  .setName('ticket')
  .setDescription('Outils staff pour le ticket courant')
  .setDMPermission(false)
  .addSubcommand((s) => s.setName('reply').setDescription('Répondre au joueur (public)').addStringOption((o) => o.setName('message').setDescription('Message').setRequired(true).setMaxLength(1800)))
  .addSubcommand((s) => s.setName('anonymous').setDescription('Répondre au nom du pôle').addStringOption((o) => o.setName('message').setDescription('Message').setRequired(true).setMaxLength(1800)))
  .addSubcommand((s) => s.setName('claim').setDescription('Prendre en charge ce ticket'))
  .addSubcommand((s) => s.setName('release').setDescription('Relâcher ce ticket (le rendre disponible)'))
  .addSubcommand((s) => s.setName('close').setDescription('Clôturer ce ticket').addStringOption((o) => o.setName('raison').setDescription('Raison').setMaxLength(500)))
  .addSubcommand((s) => s.setName('status').setDescription('Changer la pastille').addStringOption((o) => o.setName('statut').setDescription('Statut').setRequired(true).setAutocomplete(true)))
  .addSubcommand((s) => s.setName('snippet').setDescription('Envoyer une réponse pré-enregistrée').addStringOption((o) => o.setName('nom').setDescription('Snippet').setRequired(true).setAutocomplete(true)).addBooleanOption((o) => o.setName('anonyme').setDescription('Au nom du pôle')))
  .addSubcommand((s) => s.setName('transfer').setDescription('Transférer vers un autre pôle').addStringOption((o) => o.setName('pole').setDescription('Pôle').setRequired(true).setAutocomplete(true)).addStringOption((o) => o.setName('note').setDescription('Note interne').setMaxLength(500)));

async function context(ctx: BotContext, channelId: string, member: GuildMember): Promise<TicketWithRefs> {
  const ticket = await ctx.tickets.findByChannel(channelId);
  if (!ticket) throw new AppError('Cette commande doit être utilisée dans un salon de ticket', 'NOT_A_TICKET', 400);
  if (!ctx.tickets.isStaff(member, ticket.pole)) throw new ForbiddenError();
  return ticket;
}

export async function handleTicketCommand(ctx: BotContext, i: ChatInputCommandInteraction) {
  const member = i.member as GuildMember;
  const ticket = await context(ctx, i.channelId, member);
  const sub = i.options.getSubcommand();
  await i.deferReply({ ephemeral: true });
  // L'effet est déjà visible dans le salon : on retire la réponse privée au lieu d'afficher un « ✓ » inutile
  const done = () => i.deleteReply().catch(() => undefined);

  switch (sub) {
    case 'reply':
    case 'anonymous': {
      await ctx.tickets.ensureCanReply(ticket, member);
      await ctx.tickets.replyToPlayer(ticket, member, i.options.getString('message', true), sub === 'anonymous');
      const channel = await ctx.tickets.channelOf(ticket);
      await channel.send({ content: `**${member.displayName}**${sub === 'anonymous' ? ' (anonyme)' : ''} → ${i.options.getString('message', true)}`.slice(0, 2000), allowedMentions: { parse: [] } });
      return done();
    }
    case 'claim':
      await ctx.tickets.claim(ticket, member);
      return done();
    case 'release':
      await ctx.tickets.release(ticket, member);
      return done();
    case 'close':
      await ctx.tickets.close(ticket, member, i.options.getString('raison') ?? undefined);
      return done();
    case 'status': {
      const status = (await ctx.config.getStatuses(ticket.projectId)).find((s) => s.key === i.options.getString('statut', true));
      if (!status) throw new AppError('Statut inconnu', 'UNKNOWN_STATUS', 400);
      await ctx.tickets.setStatus(ticket, status, 'USER', member.id, 'manual');
      return i.editReply(`${status.emoji} ${status.label} (le nom du salon se met à jour dans quelques secondes)`);
    }
    case 'snippet': {
      const snippet = await ctx.prisma.ticketSnippet.findFirst({
        where: { projectId: ticket.projectId, key: i.options.getString('nom', true), OR: [{ poleId: null }, { poleId: ticket.poleId }] },
      });
      if (!snippet) throw new AppError('Snippet inconnu', 'UNKNOWN_SNIPPET', 400);
      const anonymous = i.options.getBoolean('anonyme') ?? false;
      await ctx.tickets.ensureCanReply(ticket, member);
      await ctx.tickets.replyToPlayer(ticket, member, snippet.content, anonymous);
      const channel = await ctx.tickets.channelOf(ticket);
      await channel.send({ content: `**${member.displayName}**${anonymous ? ' (anonyme)' : ''} → ${snippet.content}`.slice(0, 2000), allowedMentions: { parse: [] } });
      return done();
    }
    case 'transfer':
      await ctx.tickets.transfer(ticket, i.options.getString('pole', true), member, i.options.getString('note') ?? undefined);
      return done(); // le salon d'origine est supprimé : rien à confirmer
  }
}

export async function handleTicketAutocomplete(ctx: BotContext, i: AutocompleteInteraction) {
  if (!i.guildId || !i.channelId) return i.respond([]);
  const ticket = await ctx.tickets.findByChannel(i.channelId);
  if (!ticket) return i.respond([]);
  const focused = i.options.getFocused(true);
  const q = focused.value.toLowerCase();
  let choices: { name: string; value: string }[] = [];
  if (focused.name === 'statut') choices = (await ctx.config.getStatuses(ticket.projectId)).map((s) => ({ name: `${s.emoji} ${s.label}`, value: s.key }));
  else if (focused.name === 'nom') choices = (await ctx.prisma.ticketSnippet.findMany({ where: { projectId: ticket.projectId, OR: [{ poleId: null }, { poleId: ticket.poleId }] } })).map((s) => ({ name: s.title, value: s.key }));
  else if (focused.name === 'pole') choices = (await ctx.prisma.ticketPole.findMany({ where: { projectId: ticket.projectId, enabled: true } })).filter((p) => p.id !== ticket.poleId).map((p) => ({ name: p.label, value: p.id }));
  return i.respond(choices.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 25).map((c) => ({ name: c.name.slice(0, 100), value: c.value })));
}
