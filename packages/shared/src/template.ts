import type { FivemMapping, ModuleKey, TicketStatusInput } from './schemas';
import { MODULE_CONFIG_SCHEMAS, ticketPoleTemplate } from './schemas';
import { z } from 'zod';

/**
 * Template par défaut cloné à la création d'un projet. C'est la SEULE source de valeurs par défaut :
 * le code ne contient aucun texte/emoji/format métier en dur en dehors de ce fichier de données.
 */

export const DEFAULT_STATUSES: TicketStatusInput[] = [
  { key: 'new', label: 'Nouveau', emoji: '🟡', color: '#f5b544', trigger: 'ON_CREATE', lockAutoChange: false, isTerminal: false },
  { key: 'waiting_staff', label: 'En attente du staff', emoji: '🔴', color: '#f2555a', trigger: 'ON_USER_REPLY', lockAutoChange: false, isTerminal: false },
  { key: 'waiting_user', label: 'En attente du joueur', emoji: '🟢', color: '#3ecf8e', trigger: 'ON_STAFF_REPLY', lockAutoChange: false, isTerminal: false },
  { key: 'on_hold', label: 'En pause', emoji: '⏸️', color: '#a3a1b8', trigger: 'MANUAL_ONLY', lockAutoChange: true, isTerminal: false },
  { key: 'closed', label: 'Clôturé', emoji: '🔒', color: '#6f6d85', trigger: 'MANUAL_ONLY', lockAutoChange: true, isTerminal: true },
];

export const DEFAULT_POLES: z.infer<typeof ticketPoleTemplate>[] = [
  {
    key: 'staff', label: 'Staff', emoji: '🛡️', description: 'Question générale, plainte, aide', guildKind: 'staff',
    questions: [
      { key: 'subject', label: 'Sujet', style: 'SHORT', required: true },
      { key: 'details', label: 'Détails', style: 'PARAGRAPH', required: true },
    ],
  },
  {
    key: 'legal', label: 'Pôle Légal', emoji: '⚖️', description: 'Métiers et entreprises légales', guildKind: 'legal',
    questions: [
      { key: 'subject', label: 'Sujet', style: 'SHORT', required: true },
      { key: 'details', label: 'Détails', style: 'PARAGRAPH', required: true },
    ],
  },
  {
    key: 'illegal', label: 'Pôle Illégal', emoji: '🕶️', description: 'Organisations et activités illégales', guildKind: 'illegal',
    questions: [
      { key: 'subject', label: 'Sujet', style: 'SHORT', required: true },
      { key: 'details', label: 'Détails', style: 'PARAGRAPH', required: true },
    ],
  },
];

export const DEFAULT_SNIPPETS = [
  { key: 'received', title: 'Demande reçue', content: 'Bonjour, nous avons bien reçu votre demande et allons la traiter rapidement.' },
  { key: 'more_info', title: 'Plus d’informations', content: 'Pouvez-vous nous fournir plus de détails (dates, noms, preuves) ?' },
];

/** Textes i18n. Variables disponibles listées dans MESSAGE_VARIABLES. */
export const DEFAULT_MESSAGES: Record<string, { fr: string; en: string }> = {
  'ticket.dm.created': { fr: 'Votre ticket **#{ticket.number}** a été ouvert dans le pôle **{pole}**.', en: 'Your ticket **#{ticket.number}** has been opened in **{pole}**.' },
  'ticket.dm.closed': { fr: 'Votre ticket **#{ticket.number}** est clôturé.', en: 'Your ticket **#{ticket.number}** is closed.' },
  'ticket.dm.staff_reply': { fr: '**{staff}** : {content}', en: '**{staff}**: {content}' },
  'ticket.dm.anonymous_reply': { fr: '**{pole}** : {content}', en: '**{pole}**: {content}' },
  'ticket.dm.limit_reached': { fr: 'Vous avez atteint le maximum de tickets ouverts ({max}).', en: 'You reached the maximum number of open tickets ({max}).' },
  'whitelist.accepted': { fr: 'Félicitations {user}, votre candidature a été **acceptée** !', en: 'Congratulations {user}, your application was **accepted**!' },
  'whitelist.refused': { fr: 'Bonjour {user}, votre candidature a été **refusée**. Motif : {reason}', en: 'Hello {user}, your application was **refused**. Reason: {reason}' },
  'douane.candidate_waiting': { fr: '{user} attend en douane. Fiche : {sheetUrl}', en: '{user} is waiting at customs. Sheet: {sheetUrl}' },
  'report.created': { fr: 'Report de **{username}** : {reason}', en: 'Report from **{username}**: {reason}' },
  'rcon.success': { fr: 'Commande exécutée.', en: 'Command executed.' },
  'rcon.failure': { fr: 'Échec de la commande RCON.', en: 'RCON command failed.' },
  'ticket.dm.no_server': { fr: 'Je ne trouve aucun serveur partagé avec vous où ouvrir un ticket.', en: 'I could not find a shared server where you can open a ticket.' },
  'ticket.dm.pick_project': { fr: 'Sur quel serveur souhaitez-vous ouvrir un ticket ?', en: 'On which server do you want to open a ticket?' },
  'ticket.dm.pick_pole': { fr: 'Quel pôle souhaitez-vous contacter ?', en: 'Which team do you want to contact?' },
  'ticket.dm.relay_failed': { fr: 'Votre message n’a pas pu être transmis, réessayez.', en: 'Your message could not be delivered, please retry.' },
  'ticket.channel.note_hint': { fr: 'Les messages écrits ici sont des **notes internes** (invisibles du joueur). Utilisez `/ticket reply` pour répondre.', en: 'Messages written here are **internal notes** (hidden from the player). Use `/ticket reply` to answer.' },
  'ticket.channel.claimed': { fr: '{staff} a pris en charge ce ticket.', en: '{staff} claimed this ticket.' },
  'ticket.channel.released': { fr: '{staff} a relâché ce ticket : il est de nouveau disponible.', en: '{staff} released this ticket: it is available again.' },
  'ticket.dm.claimed': { fr: 'Votre ticket **#{ticket.number}** est pris en charge par l’équipe **{pole}**.', en: 'Your ticket **#{ticket.number}** is being handled by the **{pole}** team.' },
  'ticket.err.claimed_by': { fr: 'Ce ticket est déjà pris en charge par {staff}. Demandez-lui de le relâcher.', en: 'This ticket is already handled by {staff}. Ask them to release it.' },
  'ticket.err.not_owner': { fr: 'Seul {staff} (ou un administrateur) peut relâcher ce ticket.', en: 'Only {staff} (or an administrator) can release this ticket.' },
  'ticket.err.closed': { fr: 'Ce ticket est clôturé.', en: 'This ticket is closed.' },
  'ticket.btn.release': { fr: 'Relâcher', en: 'Release' },
  'ticket.embed.status': { fr: 'Statut', en: 'Status' },
  'ticket.embed.priority': { fr: 'Priorité', en: 'Priority' },
  'ticket.embed.owner': { fr: 'Responsable', en: 'Handled by' },
  'ticket.embed.unclaimed': { fr: 'Personne pour l’instant', en: 'Nobody yet' },
  'ticket.embed.opened': { fr: 'Ouvert {when} par {user}', en: 'Opened {when} by {user}' },
  'ticket.priority.LOW': { fr: 'Basse', en: 'Low' },
  'ticket.priority.NORMAL': { fr: 'Normale', en: 'Normal' },
  'ticket.priority.HIGH': { fr: '🟠 Haute', en: '🟠 High' },
  'ticket.priority.URGENT': { fr: '🔴 Urgente', en: '🔴 Urgent' },
  'ticket.channel.closing': { fr: 'Ticket clôturé par {staff}. Suppression du salon imminente.', en: 'Ticket closed by {staff}. This channel will be deleted shortly.' },
  'ticket.btn.claim': { fr: 'Prendre en charge', en: 'Claim' },
  'ticket.btn.close': { fr: 'Clôturer', en: 'Close' },
  'ticket.btn.teleport': { fr: 'Téléporter sur le joueur', en: 'Teleport to player' },
  'ticket.sheet.title': { fr: 'Fiche joueur', en: 'Player sheet' },
  'ticket.sheet.character': { fr: '{name} ({citizenId}) · {job} · 💵 {cash} · 🏦 {bank}', en: '{name} ({citizenId}) · {job} · 💵 {cash} · 🏦 {bank}' },
  'ticket.sheet.bans': { fr: 'Bans actifs : **{count}**', en: 'Active bans: **{count}**' },
  'ticket.sheet.warns': { fr: 'Avertissements : **{count}**', en: 'Warnings: **{count}**' },
  'ticket.sheet.link': { fr: '[Fiche sur le site]({url})', en: '[Profile on website]({url})' },
  'report.title': { fr: 'Report #{externalId}', en: 'Report #{externalId}' },
  'report.reporter': { fr: 'Joueur', en: 'Player' },
  'report.reason': { fr: 'Motif', en: 'Reason' },
  'report.status.open': { fr: '🔴 Ouvert', en: '🔴 Open' },
  'report.status.claimed': { fr: '🟢 Pris en charge par {staff}', en: '🟢 Claimed by {staff}' },
  'report.status.closed': { fr: '🔒 Clôturé par {staff} — {reason}', en: '🔒 Closed by {staff} — {reason}' },
  'report.btn.claim': { fr: 'Prendre en charge', en: 'Claim' },
  'report.btn.release': { fr: 'Relâcher', en: 'Release' },
  'report.btn.teleport': { fr: 'Téléporter sur le joueur', en: 'Teleport to player' },
  'report.btn.close': { fr: 'Clôturer', en: 'Close' },
  'report.modal.title': { fr: 'Clôturer le report', en: 'Close report' },
  'report.modal.resolution': { fr: 'Résolution', en: 'Resolution' },
  'report.relay.game': { fr: '🎮 **{author}** : {content}', en: '🎮 **{author}**: {content}' },
  'report.relay.system': { fr: 'ℹ️ {content}', en: 'ℹ️ {content}' },
  'ticket.game.ids': { fr: 'UID / ID serveur : {uid} / {serverId}', en: 'UID / server ID: {uid} / {serverId}' },
  'ticket.game.position': { fr: 'Position', en: 'Position' },
  'ticket.game.vitals': { fr: 'Vie / Armure', en: 'Health / Armor' },
  'ticket.game.gear': { fr: 'Arme / Véhicule', en: 'Weapon / Vehicle' },
  'ticket.game.nearby': { fr: 'Joueurs proches', en: 'Nearby players' },
  'douane.accepted': { fr: 'Félicitations {user}, la douane vous a **accepté** !', en: 'Congratulations {user}, customs **accepted** you!' },
  'douane.refused': { fr: 'Bonjour {user}, la douane a **refusé** votre dossier. Contactez le staff si besoin.', en: 'Hello {user}, customs **refused** your application. Contact staff if needed.' },
  'douane.done.accepted': { fr: '{user} a été accepté(e).', en: '{user} was accepted.' },
  'douane.done.refused': { fr: '{user} a été refusé(e).', en: '{user} was refused.' },
  'common.teleport_sent': { fr: 'Ordre de téléportation envoyé (valable 1 minute, vous devez être connecté en jeu).', en: 'Teleport order sent (valid for 1 minute, you must be online in game).' },
  'douane.btn.accept': { fr: 'Accepter', en: 'Accept' },
  'douane.btn.refuse': { fr: 'Refuser', en: 'Refuse' },
  'status.title': { fr: 'Statut du serveur', en: 'Server status' },
  'status.online': { fr: '🟢 En ligne', en: '🟢 Online' },
  'status.offline': { fr: '🔴 Hors ligne', en: '🔴 Offline' },
  'status.players': { fr: 'Joueurs', en: 'Players' },
  'status.join': { fr: 'Se connecter', en: 'Join' },
  'ticket.dm.files_blocked': { fr: 'Les fichiers ne sont pas acceptés. Envoyez un lien (Imgur, YouTube, Google Drive…) à la place.', en: 'Files are not accepted. Please send a link (Imgur, YouTube, Google Drive…) instead.' },
  'ticket.channel.files_blocked': { fr: 'Fichier non conservé et non transmis au joueur : utilisez un lien (Imgur, YouTube, Drive…).', en: 'File not kept and not sent to the player: please use a link (Imgur, YouTube, Drive…).' },
  'embed.role.added': { fr: 'Rôle **{role}** ajouté.', en: 'Role **{role}** added.' },
  'embed.role.removed': { fr: 'Rôle **{role}** retiré.', en: 'Role **{role}** removed.' },
  'embed.role.forbidden': { fr: 'Ce rôle ne peut pas être attribué automatiquement.', en: 'This role cannot be self-assigned.' },
  'embed.role.failed': { fr: 'Impossible d’attribuer ce rôle pour le moment.', en: 'Could not assign this role right now.' },
  'common.no_permission': { fr: 'Vous n’avez pas la permission.', en: 'You do not have permission.' },
};

export const MESSAGE_VARIABLES = [
  'user', 'username', 'staff', 'pole', 'reason', 'content', 'max', 'sheetUrl', 'when', 'url', 'count', 'name', 'citizenId', 'job', 'cash', 'bank', 'uid', 'serverId', 'externalId', 'author', 'role', 'ticket.number', 'ticket.id',
] as const;

const VAR_RE = /\{([a-zA-Z_.]+)\}/g;

/** Retourne les variables inconnues d'un texte (validation côté dashboard) */
export function unknownVariables(text: string): string[] {
  const known = new Set<string>(MESSAGE_VARIABLES);
  return [...text.matchAll(VAR_RE)].map((m) => m[1]!).filter((v) => !known.has(v));
}

/** Rendu sûr : remplace uniquement les variables fournies, laisse le reste intact (pas d'eval). */
export function renderTemplate(text: string, vars: Record<string, string | number>): string {
  return text.replace(VAR_RE, (whole, name: string) => (Object.hasOwn(vars, name) ? String(vars[name]) : whole));
}

export function defaultModuleConfig(key: ModuleKey): unknown {
  // Modules qui exigent des IDs Discord : pas de défaut valide -> désactivés, config vide à compléter
  const parsed = MODULE_CONFIG_SCHEMAS[key].safeParse({});
  return parsed.success ? parsed.data : {};
}

/** Presets de mapping pour la BDD FiveM (vérifiés sur le schéma qbx_core). `CUSTOM` = à renseigner dans le dashboard. */
export const FIVEM_PRESETS: Record<'QBOX' | 'QBCORE' | 'ESX' | 'CUSTOM', FivemMapping | null> = {
  QBOX: {
    players: { table: 'players', idColumn: 'citizenid', licenseColumn: 'license', nameColumn: 'name', charinfo: 'charinfo', job: 'job', money: 'money', phone: 'phone_number' },
    bans: { table: 'bans', licenseColumn: 'license', reasonColumn: 'reason', expireColumn: 'expire' },
  },
  QBCORE: {
    players: { table: 'players', idColumn: 'citizenid', licenseColumn: 'license', nameColumn: 'name', charinfo: 'charinfo', job: 'job', money: 'money' },
    bans: { table: 'bans', licenseColumn: 'license', reasonColumn: 'reason', expireColumn: 'expire' },
  },
  ESX: {
    players: { table: 'users', idColumn: 'identifier', licenseColumn: 'identifier', job: 'job', money: 'accounts' },
  },
  CUSTOM: null,
};

/** Qbox + tables de syntra-admin (`bans` qbx pour les bans, `syntra_sanctions` kind='warn' pour les avertissements). */
export const SYNTRA_MAPPING: FivemMapping = {
  players: FIVEM_PRESETS.QBOX!.players,
  bans: { table: 'bans', licenseColumn: 'license', reasonColumn: 'reason', expireColumn: 'expire' },
  warns: { table: 'syntra_sanctions', licenseColumn: 'license', reasonColumn: 'reason', kindColumn: 'kind', kindValue: 'warn', revokedColumn: 'revoked' },
};
