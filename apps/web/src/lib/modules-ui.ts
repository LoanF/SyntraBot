import type { ModuleKey } from '@syntra/shared';

export type FieldKind = 'text' | 'number' | 'bool' | 'channel' | 'channels' | 'role' | 'roles' | 'url';

export interface FieldSpec {
  key: string;
  label: string;
  kind: FieldKind;
  help?: string;
  placeholder?: string;
  suffix?: string;
  required?: boolean;
}

export interface ModuleUi {
  label: string;
  description: string;
  icon: 'ticket' | 'flag' | 'shield' | 'terminal' | 'activity' | 'users' | 'layout' | 'badge';
  fields: FieldSpec[];
  /** Module sans réglage dans cet écran (configuré ailleurs) */
  note?: string;
}

/** Libellés et formulaires de configuration. Les valeurs par défaut viennent du template en base, pas d'ici. */
export const MODULE_UI: Record<ModuleKey, ModuleUi> = {
  tickets: {
    label: 'Tickets',
    description: 'Support par message privé : le joueur choisit un pôle, remplit un formulaire, un salon s’ouvre sur le bon serveur.',
    icon: 'ticket',
    fields: [
      { key: 'channelPattern', label: 'Nom des salons', kind: 'text', help: 'Variables : {emoji} {pole} {username} {id}', placeholder: '{emoji}・{pole}-{username}-{id}' },
      { key: 'maxOpenTicketsPerUser', label: 'Tickets ouverts max par joueur', kind: 'number' },
      { key: 'renameDebounceMs', label: 'Délai avant renommage', kind: 'number', suffix: 'ms', help: 'Discord limite à 2 renommages / 10 min par salon : les changements rapprochés sont regroupés.' },
      { key: 'playerSheetUrlTemplate', label: 'Lien vers la fiche web du joueur', kind: 'url', help: 'Variables : {identifier} {discordId}', placeholder: 'https://site.tld/joueur/{identifier}' },
      { key: 'internalNotes', label: 'Messages sans commande = notes internes', kind: 'bool' },
      { key: 'enforceClaim', label: 'Un seul responsable par ticket', kind: 'bool' },
      { key: 'deleteChannelOnClose', label: 'Supprimer le salon après clôture', kind: 'bool' },
      { key: 'closeDeleteDelaySeconds', label: 'Délai avant suppression', kind: 'number', suffix: 's' },
    ],
  },
  reports: {
    label: 'Reports en jeu',
    description: 'Les reports se font uniquement en jeu. Chacun ouvre un fil dans le salon staff, relayé dans les deux sens avec le panel en jeu.',
    icon: 'flag',
    fields: [
      { key: 'channelId', label: 'Salon staff des reports', kind: 'channel', required: true },
      { key: 'staffRoleIds', label: 'Rôles staff', kind: 'roles', required: true, help: 'Peuvent répondre, prendre en charge et clôturer depuis Discord.' },
      { key: 'mentionRoleId', label: 'Rôle à mentionner', kind: 'role', help: 'Mentionné à chaque nouveau report.' },
      { key: 'teleportButton', label: 'Bouton « Téléporter sur le joueur »', kind: 'bool' },
    ],
  },
  douane: {
    label: 'Douane vocale',
    description: 'Prévient les douaniers quand un candidat rejoint la salle d’attente, avec lien vers sa fiche.',
    icon: 'shield',
    fields: [
      { key: 'waitingVoiceChannelIds', label: 'Salons vocaux d’attente', kind: 'channels', required: true },
      { key: 'notifyChannelId', label: 'Salon de notification', kind: 'channel', required: true },
      { key: 'notifyRoleId', label: 'Rôle à mentionner', kind: 'role' },
      { key: 'candidateSheetUrlTemplate', label: 'Lien vers la fiche du candidat', kind: 'url', placeholder: 'https://site.tld/candidat/{discordId}' },
      { key: 'acceptRoleIds', label: 'Rôles donnés à l’acceptation', kind: 'roles' },
      { key: 'removeRoleIds', label: 'Rôles retirés à l’acceptation', kind: 'roles' },
    ],
  },
  rcon: {
    label: 'RCON',
    description: 'Commandes /ban, /kick, /revive, /announce exécutées sur le serveur de jeu, restreintes à une liste blanche.',
    icon: 'terminal',
    fields: [],
    note: 'La connexion RCON et la liste des commandes se règlent dans Intégrations (réservé aux administrateurs du projet).',
  },
  status: {
    label: 'Statut du serveur',
    description: 'Embed dynamique : joueurs connectés, file d’attente, bouton de connexion cfx.re.',
    icon: 'activity',
    fields: [
      { key: 'channelId', label: 'Salon du message de statut', kind: 'channel', required: true },
      { key: 'refreshSeconds', label: 'Rafraîchissement', kind: 'number', suffix: 's' },
      { key: 'cfxJoinCode', label: 'Code cfx.re/join', kind: 'text', placeholder: 'abc123' },
      { key: 'endpointBaseUrl', label: 'URL du serveur de jeu', kind: 'url', placeholder: 'https://jeu.exemple.com:30120' },
    ],
  },
  sync_roles: {
    label: 'Synchro des rôles',
    description: 'Attribue automatiquement les rôles Discord selon le métier et le grade en jeu.',
    icon: 'users',
    fields: [{ key: 'intervalMinutes', label: 'Fréquence de synchronisation', kind: 'number', suffix: 'min' }],
  },
  embeds: {
    label: 'Embeds',
    description: 'Messages et boutons publiés par le bot : liens, auto-rôles, ouverture de ticket. Modifiables en direct.',
    icon: 'layout',
    fields: [],
    note: 'Les messages se composent dans l’éditeur d’embeds.',
  },
  whitelist: {
    label: 'Whitelist',
    description: 'Reçoit la décision du site externe : attribue les rôles et envoie un MP personnalisé.',
    icon: 'badge',
    fields: [
      { key: 'acceptRoleIds', label: 'Rôles donnés si accepté', kind: 'roles' },
      { key: 'removeRoleIdsOnAccept', label: 'Rôles retirés si accepté', kind: 'roles' },
      { key: 'refuseRoleIds', label: 'Rôles donnés si refusé', kind: 'roles' },
      { key: 'sendDm', label: 'Envoyer un MP au joueur', kind: 'bool' },
    ],
  },
};

/** Permission RBAC requise pour gérer un module (alignée sur le registre du bot) */
export const MODULE_MANAGE_PERMISSION = {
  tickets: 'modules:manage', reports: 'modules:manage', douane: 'douane:manage', rcon: 'rcon:execute',
  status: 'status:manage', sync_roles: 'sync_roles:manage', embeds: 'embeds:write', whitelist: 'modules:manage',
} as const satisfies Record<ModuleKey, string>;
