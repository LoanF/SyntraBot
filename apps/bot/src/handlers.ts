import { ActionRowBuilder, ChannelType, Events, ModalBuilder, TextInputBuilder, TextInputStyle, type GuildMember, type Interaction, type Message, type VoiceState } from 'discord.js';
import { AppError } from '@syntra/shared';
import type { BotContext } from './context';
import { onModalSubmit, onPoleSelected, onProjectSelected, startDmFlow } from './tickets/dm-flow';
import { onAutoRole, onOpenTicket } from './embeds/buttons';
import { handleAdminCommand } from './rcon/commands';
import { handleTicketAutocomplete, handleTicketCommand } from './tickets/commands';

async function onMessage(ctx: BotContext, message: Message) {
  if (message.author.bot) return;

  // --- MP joueur ---
  if (message.channel.type === ChannelType.DM) {
    const open = await ctx.tickets.latestOpenForUser(message.author.id);
    if (open) {
      try {
        await ctx.tickets.relayUserMessage(open, message);
      } catch (err) {
        ctx.log.error({ err }, 'relais MP échoué');
        await message.reply(await ctx.config.message(open.projectId, 'ticket.dm.relay_failed')).catch(() => undefined);
      }
      return;
    }
    return startDmFlow(ctx, message);
  }

  // --- Fil de report : les messages du staff sont relayés dans le panel en jeu ---
  if (message.channel.isThread() && message.member) {
    const report = await ctx.reports.byThread(message.channelId);
    if (report) return ctx.reports.relayStaffMessage(report, message, message.member);
  }

  // --- Salon de ticket : tout message sans commande = note interne (invisible du joueur) ---
  if (message.guildId && message.channel.type === ChannelType.GuildText) {
    const guild = await ctx.config.resolveGuild(message.guildId);
    if (!guild) return;
    const ticket = await ctx.tickets.findByChannel(message.channelId);
    if (!ticket || !message.member || !ctx.tickets.isStaff(message.member, ticket.pole)) return;
    // Les fichiers ne sont ni conservés ni transmis au joueur : on le dit au staff, qui peut mettre un lien
    if (message.attachments.size > 0) {
      await message.reply({ content: await ctx.config.message(ticket.projectId, 'ticket.channel.files_blocked'), allowedMentions: { parse: [] } }).catch(() => undefined);
    }
    await ctx.tickets.recordInternalNote(ticket, message);
  }
}

async function onInteraction(ctx: BotContext, i: Interaction) {
  if (i.isAutocomplete() && i.commandName === 'ticket') return handleTicketAutocomplete(ctx, i);
  if (i.isChatInputCommand() && i.commandName === 'ticket') return handleTicketCommand(ctx, i);

  if (i.isStringSelectMenu()) {
    if (i.customId === 't:proj') return onProjectSelected(ctx, i);
    if (i.customId.startsWith('t:pole:')) return onPoleSelected(ctx, i);
  }
  if (i.isModalSubmit() && i.customId.startsWith('t:modal:')) return onModalSubmit(ctx, i);

  // --- RCON / douane ---
  if (i.isChatInputCommand() && i.commandName === 'admin') return handleAdminCommand(ctx, i);
  if (i.isChatInputCommand() && i.commandName === 'douane') return ctx.douane.onCommand(i);
  if (i.isButton() && i.customId.startsWith('d:')) return ctx.douane.onButton(i);

  // --- Boutons d'embeds publiés depuis le dashboard ---
  if (i.isButton() && i.customId.startsWith('ar:')) return onAutoRole(ctx, i);
  if (i.isButton() && i.customId.startsWith('ot:')) return onOpenTicket(ctx, i);

  // --- Reports (créés en jeu uniquement) ---
  if (i.isModalSubmit() && i.customId.startsWith('r:closem:')) {
    await i.deferReply({ ephemeral: true });
    await ctx.reports.close(i.customId.split(':')[2]!, i.member as GuildMember, i.fields.getTextInputValue('resolution').slice(0, 300));
    return void i.deleteReply().catch(() => undefined);
  }
  if (i.isButton() && i.customId.startsWith('r:')) {
    const [, action, reportId] = i.customId.split(':') as [string, string, string];
    const member = i.member as GuildMember;
    if (action === 'claim' || action === 'release') {
      await i.deferUpdate();
      return action === 'claim' ? ctx.reports.claim(reportId, member) : ctx.reports.release(reportId, member);
    }
    if (action === 'tp') {
      await i.deferReply({ ephemeral: true });
      await ctx.reports.teleport(reportId, member);
      return void i.editReply(await ctx.config.message((await ctx.reports.byId(reportId)).projectId, 'common.teleport_sent'));
    }
    if (action === 'close') {
      const report = await ctx.reports.byId(reportId);
      await ctx.reports.authorize(report, member);
      const modal = new ModalBuilder()
        .setCustomId(`r:closem:${reportId}`)
        .setTitle((await ctx.config.message(report.projectId, 'report.modal.title')).slice(0, 45))
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('resolution')
              .setLabel((await ctx.config.message(report.projectId, 'report.modal.resolution')).slice(0, 45))
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(false)
              .setMaxLength(300),
          ),
        );
      return i.showModal(modal);
    }
  }

  if (i.isButton() && i.customId.startsWith('t:')) {
    const [, action, ticketId] = i.customId.split(':') as [string, string, string];
    const ticket = await ctx.tickets.getOrThrow(ticketId);

    const member = i.member as GuildMember | null;
    if (!member || !ctx.tickets.isStaff(member, ticket.pole)) return i.reply({ content: await ctx.config.message(ticket.projectId, 'common.no_permission'), ephemeral: true });

    if (action === 'claim' || action === 'release') {
      // Réponse privée (jamais deferUpdate : une erreur remplacerait l'embed d'ouverture) ; l'embed est mis à jour par le service
      await i.deferReply({ ephemeral: true });
      await (action === 'claim' ? ctx.tickets.claim(ticket, member) : ctx.tickets.release(ticket, member));
      return void i.deleteReply().catch(() => undefined);
    }
    if (action === 'close') {
      await i.deferReply({ ephemeral: true });
      await ctx.tickets.close(ticket, member);
      return void i.deleteReply().catch(() => undefined);
    }
    if (action === 'tp') return teleport(ctx, i, ticket.id, member);
  }
}

async function teleport(ctx: BotContext, i: Interaction & { reply: Function }, ticketId: string, staff: GuildMember) {
  const ticket = await ctx.tickets.getOrThrow(ticketId);
  const links = await ctx.prisma.playerLink.findMany({ where: { projectId: ticket.projectId, discordId: { in: [staff.id, ticket.userDiscordId] } } });
  const staffId = links.find((l) => l.discordId === staff.id)?.identifier;
  const targetId = links.find((l) => l.discordId === ticket.userDiscordId)?.identifier;
  if (!staffId || !targetId) return i.reply({ content: 'Identifiants FiveM introuvables (liaison Discord ↔ joueur manquante).', ephemeral: true });
  await ctx.bridge.push(ticket.projectId, { id: crypto.randomUUID(), type: 'teleport', staffIdentifier: staffId, targetIdentifier: targetId, expiresAt: Date.now() + 60_000 });
  await ctx.audit.record({ projectId: ticket.projectId, guildId: ticket.guildId, actorType: 'USER', actorId: staff.id, action: 'ticket.teleport', entityType: 'ticket', entityId: ticket.id });
  return i.reply({ content: await ctx.config.message(ticket.projectId, 'common.teleport_sent'), ephemeral: true });
}

export function registerHandlers(ctx: BotContext) {
  const safe = <A extends unknown[]>(name: string, fn: (...a: A) => Promise<unknown>) => (...a: A) => {
    fn(...a).catch(async (err: unknown) => {
      ctx.log.error({ err, event: name }, 'handler en erreur');
      const i = a[0] as Interaction | undefined;
      if (i && 'isRepliable' in i && i.isRepliable()) {
        const text = err instanceof AppError && err.status < 500 ? err.message : 'Erreur interne';
        if (i.deferred || i.replied) await i.editReply({ content: text }).catch(() => undefined);
        else await i.reply({ content: text, ephemeral: true }).catch(() => undefined);
      }
    });
  };
  ctx.client.on(Events.MessageCreate, safe('messageCreate', (m: Message) => onMessage(ctx, m)));
  ctx.client.on(Events.VoiceStateUpdate, safe('voiceStateUpdate', (o: VoiceState, n: VoiceState) => ctx.douane.onVoiceState(o, n)));
  ctx.client.on(Events.InteractionCreate, safe('interactionCreate', (i: Interaction) => onInteraction(ctx, i)));
}
