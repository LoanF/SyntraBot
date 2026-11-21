/**
 * Données de DÉMONSTRATION (fictives) pour développer et vérifier le dashboard sans Discord ni serveur de jeu.
 *   pnpm --filter @syntra/web seed:demo
 * Idempotent : recrée le projet « demo » à chaque exécution.
 */
import { prisma, createProjectFromTemplate, provisionGuild } from '@syntra/db';
import { aad, cipherFromEnv, generateApiCredentials } from '@syntra/security';

const OWNER = process.env.AUTH_DEV_DISCORD_ID ?? '100000000000000001';
const sf = (n: number) => `9${String(n).padStart(17, '0')}`;
const ago = (min: number) => new Date(Date.now() - min * 60_000);

await prisma.project.deleteMany({ where: { slug: 'demo' } });
const project = await createProjectFromTemplate(prisma, { name: 'Los Santos RP (démo)', slug: 'demo', ownerDiscordId: OWNER, ownerUsername: process.env.AUTH_DEV_USERNAME ?? 'dev' });
const pid = project.id;

// --- Serveurs Discord (fictifs), avec rapport de santé du bot
const main = await provisionGuild(prisma, { projectId: pid, discordGuildId: sf(1), label: 'Serveur principal', kind: 'main', isPrimary: true });
const staff = await provisionGuild(prisma, { projectId: pid, discordGuildId: sf(2), label: 'Staff', kind: 'staff' });
const legal = await provisionGuild(prisma, { projectId: pid, discordGuildId: sf(3), label: 'Pôle Légal', kind: 'legal' });
const illegal = await provisionGuild(prisma, { projectId: pid, discordGuildId: sf(4), label: 'Pôle Illégal', kind: 'illegal' });
await prisma.guild.update({ where: { id: main.id }, data: { botPresent: true, healthReport: { ok: true, missing: [] }, healthCheckedAt: ago(3) } });
await prisma.guild.update({ where: { id: staff.id }, data: { botPresent: true, healthReport: { ok: true, missing: [] }, healthCheckedAt: ago(3) } });
await prisma.guild.update({ where: { id: legal.id }, data: { botPresent: true, healthReport: { ok: false, missing: ['ManageChannels', 'AttachFiles'] }, healthCheckedAt: ago(3) } });
await prisma.guild.update({ where: { id: illegal.id }, data: { botPresent: false, healthReport: { ok: false, missing: ['BotNotInGuild'] }, healthCheckedAt: ago(11) } });

// --- Modules : tickets actifs sur Staff et Légal, reports et whitelist actifs, douane incomplète
const mod = (guildId: string | null, moduleKey: string) =>
  prisma.moduleInstance.findFirstOrThrow({ where: { projectId: pid, moduleKey, ...(guildId ? { guildId } : { guildId: null }) } });
for (const g of [staff, legal]) {
  const m = await mod(g.id, 'tickets');
  await prisma.moduleInstance.update({ where: { id: m.id }, data: { enabled: true, config: { channelPattern: '{emoji}・{pole}-{username}-{id}', renameDebounceMs: 10000, maxOpenTicketsPerUser: 3, internalNotes: true, deleteChannelOnClose: true, closeDeleteDelaySeconds: 10 } } });
}
await prisma.moduleInstance.update({ where: { id: (await mod(null, 'reports')).id }, data: { enabled: true, config: { channelId: sf(500), staffRoleIds: [sf(600)], teleportButton: true } } });
await prisma.moduleInstance.update({ where: { id: (await mod(main.id, 'whitelist')).id }, data: { enabled: true, config: { acceptRoleIds: [sf(601)], removeRoleIdsOnAccept: [], refuseRoleIds: [], sendDm: true } } });
await prisma.moduleInstance.update({ where: { id: (await mod(main.id, 'douane')).id }, data: { enabled: true } }); // activé sans config = « incomplète »

// --- Tickets
const statuses = await prisma.ticketStatus.findMany({ where: { projectId: pid } });
const st = (key: string) => statuses.find((s) => s.key === key)!.id;
const poleStaff = await prisma.ticketPole.findFirstOrThrow({ where: { projectId: pid, key: 'staff' } });
const poleLegal = await prisma.ticketPole.findFirstOrThrow({ where: { projectId: pid, key: 'legal' } });

const people = [
  ['Jade Moreau', 'Demande de déban suite à un malentendu en ville', 'waiting_staff', 'HIGH', 12],
  ['Karim Benali', 'Question sur la licence entreprise', 'waiting_user', 'NORMAL', 55],
  ['Lina Duval', 'Bug de véhicule après le dernier patch', 'new', 'NORMAL', 140],
  ['Mathis Roux', 'Plainte contre un joueur (RDM)', 'waiting_staff', 'URGENT', 190],
  ['Inès Garnier', 'Création d’une entreprise de dépannage', 'on_hold', 'LOW', 2900],
  ['Hugo Lambert', 'Remboursement véhicule perdu', 'closed', 'NORMAL', 4400],
] as const;
let n = 0;
const tickets = [];
for (const [name, subject, status, priority, min] of people) {
  n++;
  const closed = status === 'closed';
  const pole = n % 2 === 0 ? poleLegal : poleStaff;
  tickets.push(await prisma.ticket.create({
    data: {
      projectId: pid, guildId: pole.guildId, poleId: pole.id, number: n, userDiscordId: sf(1000 + n), username: name, statusId: st(status),
      priority, subject, answers: { subject, details: 'Bonjour, voici le détail de ma demande. Merci de votre aide.' },
      claimedByDiscordId: status === 'new' ? null : sf(7),
      createdAt: ago(min + 30), updatedAt: ago(min), ...(closed ? { closedAt: ago(min), channelId: null } : { channelId: sf(2000 + n) }),
      ...(n === 1 ? {
        playerSnapshot: { identifiers: ['license2:a1b2c3'], characters: [{ citizenId: 'ABC12345', name: 'Jade Moreau', job: 'LSPD (Officier)', cash: 1240, bank: 18500, phone: '5550142' }], activeBans: 0, warns: 2, sheetUrl: 'https://exemple.test/joueur/license2%3Aa1b2c3' },
      } : {}),
    },
  }));
}
await prisma.ticketCounter.update({ where: { projectId: pid }, data: { last: n } });

// Conversation détaillée du ticket n°1 : joueur / staff / anonyme / note interne / système
const t1 = tickets[0]!;
const conv: [string, string, string, string, number][] = [
  ['PLAYER', 'Jade Moreau', 'Bonjour, j’ai été banni hier soir alors que je n’ai rien fait. Je pense à un malentendu avec **Kévin** devant le commissariat.', '', 125],
  ['PLAYER', 'Jade Moreau', 'J’ai des clips pour le prouver : https://exemple.test/clips/42', '', 124],
  ['INTERNAL_NOTE', 'Camille (Staff)', 'Vérifié dans les logs : 2 avertissements RDM ce mois-ci. À voir avec l’équipe modération avant de répondre.', '', 80],
  ['STAFF_PUBLIC', 'Camille (Staff)', 'Bonjour Jade, merci pour votre message. Nous regardons vos clips et revenons vers vous rapidement.', '', 78],
  ['STAFF_ANONYMOUS', 'Camille (Staff)', 'Pouvez-vous nous indiquer l’heure approximative de l’incident ?\n> Vers 22h ?', '', 60],
  ['PLAYER', 'Jade Moreau', 'C’était vers 22h15, juste après la fin du service.', '', 30],
  ['INTERNAL_NOTE', 'Camille (Staff)', '22h15 : cohérent avec le log de ban. Je propose un déban conditionnel.', '', 14],
];
for (const [kind, author, content, , min] of conv) {
  await prisma.ticketMessage.create({ data: { ticketId: t1.id, projectId: pid, kind: kind as never, authorName: author, authorDiscordId: kind === 'PLAYER' ? sf(1001) : sf(7), content, createdAt: ago(min) } });
}
await prisma.ticketMessage.create({ data: { ticketId: t1.id, projectId: pid, kind: 'SYSTEM', content: 'Ticket pris en charge par Camille', createdAt: ago(100) } });
for (const t of tickets.slice(1)) {
  await prisma.ticketMessage.create({ data: { ticketId: t.id, projectId: pid, kind: 'PLAYER', authorName: t.username, authorDiscordId: t.userDiscordId, content: t.subject ?? '', createdAt: ago(60) } });
}

// --- Reports en jeu (≠ tickets) avec échanges panel / Discord
const report = await prisma.report.create({
  data: {
    projectId: pid, guildId: staff.id, externalId: '1042', status: 'CLAIMED', reason: 'Un joueur me tire dessus sans raison devant la banque', reporterName: 'Inès Garnier', reporterIdentifier: 'license2:ff00aa', reporterDiscordId: sf(1005),
    reporterUid: 2381, serverId: 17, claimedByName: 'Camille', claimedByDiscordId: sf(7), createdAt: ago(9), updatedAt: ago(2),
    gameContext: { coords: { x: 149.4, y: -1040.2, z: 29.4 }, health: 142, armor: 20, weapon: '453432689', vehicle: 'SY4821', nearby: [{ serverId: 23, name: 'Noah Perrin', distance: 6.4 }, { serverId: 41, name: 'Léa Fontaine', distance: 21.8 }] },
    playerSnapshot: { identifiers: ['license2:ff00aa'], characters: [{ citizenId: 'QWE98765', name: 'Inès Garnier', job: 'Chômeur (-)', cash: 85, bank: 4200 }], activeBans: 0, warns: 0 },
    messages: { create: [
      { projectId: pid, kind: 'PLAYER', source: 'GAME', authorName: 'Inès Garnier', content: 'Un joueur me tire dessus sans raison devant la banque', createdAt: ago(9) },
      { projectId: pid, kind: 'SYSTEM', source: 'DISCORD', authorName: 'Camille', content: 'Camille a pris en charge le report', createdAt: ago(7) },
      { projectId: pid, kind: 'STAFF', source: 'DISCORD', authorName: 'Camille', authorDiscordId: sf(7), content: 'Bonjour, je regarde ça. Il est encore près de vous ?', createdAt: ago(6) },
      { projectId: pid, kind: 'PLAYER', source: 'GAME', authorName: 'Inès Garnier', content: 'Oui, c’est le n°23, il continue de me suivre.', createdAt: ago(5) },
      { projectId: pid, kind: 'STAFF', source: 'DISCORD', authorName: 'Camille', authorDiscordId: sf(7), content: 'Je me téléporte sur vous.', createdAt: ago(2) },
    ] },
  },
});
await prisma.report.create({ data: { projectId: pid, guildId: staff.id, externalId: '1041', status: 'OPEN', reason: 'Véhicule bloqué sous la carte au garage central', reporterName: 'Mathis Roux', reporterIdentifier: 'license2:12ab34', reporterUid: 977, serverId: 8, createdAt: ago(25), updatedAt: ago(25), messages: { create: [{ projectId: pid, kind: 'PLAYER', source: 'GAME', authorName: 'Mathis Roux', content: 'Véhicule bloqué sous la carte au garage central', createdAt: ago(25) }] } } });
await prisma.report.create({ data: { projectId: pid, guildId: staff.id, externalId: '1037', status: 'CLOSED', reason: 'Joueur AFK dans le hall de la banque', reporterName: 'Karim Benali', reporterIdentifier: 'license2:99ee11', serverId: 3, closedByName: 'Camille', closedAt: ago(600), resolution: 'Joueur renvoyé à la sélection de personnage.', createdAt: ago(640), updatedAt: ago(600), messages: { create: [{ projectId: pid, kind: 'PLAYER', source: 'GAME', authorName: 'Karim Benali', content: 'Joueur AFK dans le hall de la banque', createdAt: ago(640) }] } } });
void report;

// --- Embeds
await prisma.embedTemplate.create({
  data: {
    projectId: pid, guildId: main.id, name: 'Règlement du serveur', channelId: sf(300), messageId: sf(9001), status: 'PUBLISHED', publishedAt: ago(3000),
    payload: {
      content: '',
      embeds: [{ title: 'Règlement — Los Santos RP', description: 'Bienvenue ! Avant de jouer, lisez attentivement ces règles.\n\n**1.** Respect de tous les joueurs\n**2.** Pas de RDM / VDM\n**3.** Le fair-play avant tout', color: '#9057ff', footer: 'Dernière mise à jour : cette semaine', fields: [{ name: 'Besoin d’aide ?', value: 'Ouvrez un ticket avec le bouton ci-dessous.', inline: false }] }],
      components: [{ type: 'open_ticket', label: 'Ouvrir un ticket', poleKey: 'staff' }, { type: 'link', label: 'Site du serveur', url: 'https://exemple.test' }],
    },
  },
});
await prisma.embedTemplate.create({ data: { projectId: pid, guildId: main.id, name: 'Annonce de maintenance', payload: { content: '', embeds: [{ title: 'Maintenance ce soir', description: 'Redémarrage à **03h00**. Durée estimée : 20 minutes.', color: '#f5b544', fields: [] }], components: [] } } });

// --- Clés API (secrets fictifs, chiffrés comme en production)
const cipher = cipherFromEnv();
for (const [name, scopes, used] of [['Bridge serveur de jeu', ['bridge:report', 'bridge:poll', 'bridge:link'], 1], ['Site de whitelist', ['webhooks:whitelist', 'members:check'], 340]] as const) {
  const c = generateApiCredentials();
  await prisma.apiKey.create({ data: { projectId: pid, keyId: c.keyId, name, scopes: [...scopes], secretEnc: cipher.encrypt(c.secret, aad.apiKey(pid, c.keyId)), lastUsedAt: ago(used) } });
}

// --- Audit
const audit: [string, string, string, unknown, unknown, number][] = [
  ['module.enable', 'module', 'tickets', { enabled: false }, { enabled: true }, 4000],
  ['module.config', 'module', 'tickets', { maxOpenTicketsPerUser: 2 }, { maxOpenTicketsPerUser: 3 }, 3900],
  ['apikey.create', 'apikey', 'sk_demo', undefined, { name: 'Bridge serveur de jeu', scopes: ['bridge:report', 'bridge:poll'] }, 3000],
  ['embed.publish', 'embed', 'Règlement', undefined, { channelId: sf(300) }, 2900],
  ['module.disable', 'module', 'status', { enabled: true }, { enabled: false }, 1200],
  ['embed.edit_live', 'embed', 'Règlement', undefined, { messageId: sf(9001) }, 300],
  ['module.config', 'module', 'reports', { teleportButton: false }, { teleportButton: true }, 40],
];
for (const [action, entityType, entityId, before, after, min] of audit) {
  await prisma.auditLog.create({ data: { projectId: pid, actorType: 'USER', actorId: OWNER, actorName: process.env.AUTH_DEV_USERNAME ?? 'dev', action, entityType, entityId, ...(before ? { before } : {}), ...(after ? { after } : {}), createdAt: ago(min) } as never });
}

console.log('Projet de démonstration prêt : /demo');
await prisma.$disconnect();
