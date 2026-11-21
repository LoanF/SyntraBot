import { z } from 'zod';

export const snowflake = z.string().regex(/^\d{15,22}$/, 'Snowflake Discord invalide');
export const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Couleur #RRGGBB attendue');
export const identifier = z.string().regex(/^[A-Za-z0-9_]{1,64}$/, 'Identifiant SQL invalide');
export const locale = z.enum(['fr', 'en']);
export type Locale = z.infer<typeof locale>;

/** Message de salon avec variables : {emoji} {pole} {username} {id} */
export const channelPattern = z
  .string()
  .min(1)
  .max(100)
  .refine((p) => /^[^{}]*(\{(emoji|pole|username|id)\}[^{}]*)*$/.test(p), 'Variable inconnue dans le pattern');

// --------------------------- Config des modules ---------------------------

export const ticketsConfig = z
  .object({
    channelPattern: channelPattern.default('{emoji}・{pole}-{username}-{id}'),
    /** Délai de coalescence des renommages (Discord limite à ~2 renommages / 10 min) */
    renameDebounceMs: z.number().int().min(1000).max(120_000).default(10_000),
    playerSheetUrlTemplate: z.string().url().optional(), // ex: https://site.tld/joueur/{identifier}
    maxOpenTicketsPerUser: z.number().int().min(1).max(20).default(3),
    internalNotes: z.boolean().default(true),
    /** Un seul responsable par ticket : seul lui (ou un administrateur) peut répondre ; la 1re réponse prend en charge si le ticket est libre */
    enforceClaim: z.boolean().default(true),
    deleteChannelOnClose: z.boolean().default(true),
    closeDeleteDelaySeconds: z.number().int().min(0).max(3600).default(10),
  })
  .strict();

export const reportsConfig = z
  .object({
    /** Salon staff où chaque report ouvre un fil (les reports ne sont JAMAIS créés depuis Discord) */
    channelId: snowflake,
    /** Rôles autorisés à répondre / claim / clôturer depuis Discord */
    staffRoleIds: z.array(snowflake).min(1),
    mentionRoleId: snowflake.optional(),
    teleportButton: z.boolean().default(true),
  })
  .strict();

export const douaneConfig = z
  .object({
    waitingVoiceChannelIds: z.array(snowflake).min(1),
    notifyChannelId: snowflake,
    notifyRoleId: snowflake.optional(),
    candidateSheetUrlTemplate: z.string().url().optional(),
    acceptRoleIds: z.array(snowflake).default([]),
    removeRoleIds: z.array(snowflake).default([]),
  })
  .strict();

export const rconConfig = z
  .object({
    /** Templates d'arguments : jamais de commande libre */
    commands: z
      .record(z.string().regex(/^[a-z_]{1,32}$/), z.string().min(1).max(200))
      .default({
        ban: 'ban {id} {reason}',
        kick: 'kick {id} {reason}',
        revive: 'revive {id}',
        announce: 'announce {message}',
      }),
  })
  .strict();

export const statusConfig = z
  .object({
    channelId: snowflake,
    refreshSeconds: z.number().int().min(15).max(600).default(30),
    cfxJoinCode: z.string().regex(/^[a-z0-9]{4,8}$/).optional(),
    endpointBaseUrl: z.string().url().optional(),
  })
  .strict();

export const syncRolesConfig = z
  .object({ intervalMinutes: z.number().int().min(1).max(1440).default(10) })
  .strict();

export const embedsConfig = z.object({}).strict();

export const whitelistConfig = z
  .object({
    acceptRoleIds: z.array(snowflake).default([]),
    removeRoleIdsOnAccept: z.array(snowflake).default([]),
    refuseRoleIds: z.array(snowflake).default([]),
    sendDm: z.boolean().default(true),
  })
  .strict();

export const MODULE_CONFIG_SCHEMAS = {
  tickets: ticketsConfig,
  reports: reportsConfig,
  douane: douaneConfig,
  rcon: rconConfig,
  status: statusConfig,
  sync_roles: syncRolesConfig,
  embeds: embedsConfig,
  whitelist: whitelistConfig,
} as const;

export type ModuleKey = keyof typeof MODULE_CONFIG_SCHEMAS;
export const MODULE_KEYS = Object.keys(MODULE_CONFIG_SCHEMAS) as ModuleKey[];

/** Modules de portée projet (une seule instance) vs serveur Discord */
export const MODULE_SCOPE: Record<ModuleKey, 'project' | 'guild'> = {
  tickets: 'guild',
  reports: 'project',
  douane: 'guild',
  rcon: 'project',
  status: 'project',
  sync_roles: 'guild',
  embeds: 'guild',
  whitelist: 'guild',
};

// --------------------------- Statuts / pôles ---------------------------

export const ticketStatusInput = z.object({
  key: z.string().regex(/^[a-z0-9_]{1,32}$/),
  label: z.string().min(1).max(40),
  emoji: z.string().min(1).max(16),
  color: hexColor,
  trigger: z.enum(['ON_CREATE', 'ON_USER_REPLY', 'ON_STAFF_REPLY', 'MANUAL_ONLY']),
  lockAutoChange: z.boolean().default(false),
  isTerminal: z.boolean().default(false),
});
export type TicketStatusInput = z.infer<typeof ticketStatusInput>;

export const ticketQuestionInput = z.object({
  key: z.string().regex(/^[a-z0-9_]{1,32}$/),
  label: z.string().min(1).max(45), // limite label modal Discord
  placeholder: z.string().max(100).optional(),
  style: z.enum(['SHORT', 'PARAGRAPH']).default('SHORT'),
  required: z.boolean().default(true),
  minLength: z.number().int().min(0).max(4000).optional(),
  maxLength: z.number().int().min(1).max(4000).optional(),
});

export const ticketPoleTemplate = z.object({
  key: z.string().regex(/^[a-z0-9_]{1,32}$/),
  label: z.string().min(1).max(50),
  emoji: z.string().max(16).optional(),
  description: z.string().max(100).optional(),
  /** Le pôle est créé quand un serveur de ce `kind` est rattaché au projet */
  guildKind: z.string().min(1),
  questions: z.array(ticketQuestionInput).max(5),
});

// --------------------------- Embeds ---------------------------

const safeUrl = z
  .string()
  .url()
  .refine((u) => ['https:', 'discord:'].includes(new URL(u).protocol), 'Seuls https: et discord: sont autorisés');

export const embedComponent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('link'), label: z.string().min(1).max(80), url: safeUrl }),
  z.object({ type: z.literal('auto_role'), label: z.string().min(1).max(80), roleId: snowflake, mode: z.enum(['toggle', 'add']).default('toggle') }),
  z.object({ type: z.literal('open_ticket'), label: z.string().min(1).max(80), poleKey: z.string().min(1) }),
]);

export const embedPayload = z
  .object({
    content: z.string().max(2000).optional(),
    embeds: z
      .array(
        z.object({
          title: z.string().max(256).optional(),
          description: z.string().max(4096).optional(),
          color: hexColor.optional(),
          url: safeUrl.optional(),
          image: safeUrl.optional(),
          thumbnail: safeUrl.optional(),
          footer: z.string().max(2048).optional(),
          fields: z.array(z.object({ name: z.string().min(1).max(256), value: z.string().min(1).max(1024), inline: z.boolean().default(false) })).max(25).default([]),
        }),
      )
      .max(10)
      .default([]),
    components: z.array(embedComponent).max(25).default([]),
  })
  .strict();

// --------------------------- API externe (webhooks / bridge) ---------------------------

export const whitelistWebhook = z
  .object({
    discordId: snowflake,
    decision: z.enum(['accepted', 'refused']),
    reason: z.string().max(1000).optional(),
    applicationId: z.string().max(64).optional(),
  })
  .strict();

export const reportPayload = z
  .object({
    identifier: z.string().min(1).max(128),
    /** license + license2 : Qbox rattache un personnage à l'un ou l'autre */
    identifiers: z.array(z.string().min(1).max(128)).max(10).default([]),
    discordId: snowflake.optional(),
    serverId: z.number().int().nonnegative(),
    /** UID persistant du serveur (syntra-admin) et id du report côté jeu, si disponibles */
    uid: z.number().int().positive().optional(),
    /** ID du report côté jeu (syntra_reports.id) : clé de synchronisation */
    externalId: z.string().min(1).max(64),
    reason: z.string().min(1).max(1000),
    coords: z.object({ x: z.number(), y: z.number(), z: z.number() }),
    health: z.number().min(0).max(1000),
    armor: z.number().min(0).max(100),
    weapon: z.string().max(64).nullable(),
    vehicle: z.string().max(64).nullable(),
    nearby: z.array(z.object({ serverId: z.number().int(), name: z.string().max(64), distance: z.number() })).max(100),
  })
  .strict();

export const SIGNATURE_HEADERS = {
  keyId: 'x-syntra-key-id',
  timestamp: 'x-syntra-timestamp',
  nonce: 'x-syntra-nonce',
  signature: 'x-syntra-signature',
} as const;

// --------------------------- Mapping BDD FiveM (identifiants SQL validés, jamais de SQL libre) ---------------------------

export const fivemMapping = z
  .object({
    players: z
      .object({
        table: identifier,
        idColumn: identifier,
        /** Colonne comparée aux identifiants du joueur (license / license2…) */
        licenseColumn: identifier,
        nameColumn: identifier.optional(),
        charinfo: identifier.optional(),
        job: identifier.optional(),
        money: identifier.optional(),
        phone: identifier.optional(),
      })
      .strict(),
    bans: z.object({ table: identifier, licenseColumn: identifier, reasonColumn: identifier.optional(), expireColumn: identifier.optional() }).strict().optional(),
    /** kindColumn/kindValue : ne compter que les lignes d'un type (ex. kind='warn') ; revokedColumn : ignorer les sanctions révoquées (=1) */
    warns: z.object({ table: identifier, licenseColumn: identifier, reasonColumn: identifier.optional(), kindColumn: identifier.optional(), kindValue: z.string().max(32).optional(), revokedColumn: identifier.optional() }).strict().optional(),
  })
  .strict();
export type FivemMapping = z.infer<typeof fivemMapping>;

/** Snapshot de fiche joueur stocké dans Ticket.playerSnapshot (données brutes, rendu via MessageTemplate) */
export const playerSnapshot = z.object({
  identifiers: z.array(z.string()),
  characters: z.array(z.object({ citizenId: z.string(), name: z.string().optional(), job: z.string().optional(), jobName: z.string().optional(), jobGrade: z.number().optional(), cash: z.number().optional(), bank: z.number().optional(), phone: z.string().optional() })),
  activeBans: z.number().int(),
  warns: z.number().int(),
  sheetUrl: z.string().optional(),
});
export type PlayerSnapshot = z.infer<typeof playerSnapshot>;

/** Événement de report venant du jeu après sa création (message, claim, release, close) */
export const reportEvent = z
  .object({
    externalId: z.string().min(1).max(64),
    type: z.enum(['message', 'claim', 'release', 'close']),
    kind: z.enum(['player', 'staff', 'system']).default('system'),
    author: z.string().max(80),
    /** Texte du message ; pour `close` : la résolution */
    text: z.string().max(1000).default(''),
  })
  .strict();
export type ReportEvent = z.infer<typeof reportEvent>;
