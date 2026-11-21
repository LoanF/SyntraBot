# Syntra — Architecture, Sécurité & Base de données (Étape 1)

> Statut : **proposition à valider**. Aucun code d'implémentation n'est écrit avant ton feu vert.
> Le schéma complet est dans [`packages/db/prisma/schema.prisma`](../packages/db/prisma/schema.prisma).

---

## 0. Décisions structurantes (à valider)

| # | Décision | Pourquoi |
|---|----------|----------|
| D1 | **pnpm workspaces + Turborepo**, TypeScript `strict`, Node 22 LTS | Cache de build, tâches parallèles, un seul lockfile |
| D2 | **3 processus** : `bot` (gateway Discord), `api` (Fastify), `web` (Next.js) | Le bot est stateful (gateway) ; l'API doit rester scalable et redémarrable sans déconnecter Discord |
| D3 | **Redis obligatoire** (cache, pub/sub d'invalidation, rate-limit, nonces anti-replay, files BullMQ) | Sans Redis, impossible de coordonner proprement bot/api/web ni de dédupliquer les replays |
| D4 | **PostgreSQL + Prisma** | Typage généré, migrations propres, RLS Postgres possible en défense en profondeur |
| D5 | **Le bridge FiveM appelle l'API en sortant** (long-polling signé), l'API n'ouvre jamais de connexion vers le serveur FiveM | Aucun port à exposer chez le client, pas de NAT/pare-feu, pas de SSRF sortante vers l'IP du client |
| D6 | **Auth.js en sessions JWT**, rôles Discord résolus côté serveur via le token du bot (cache 60 s) | Le scope OAuth `guilds.members.read` ne couvre pas tous les serveurs ; le bot peut lire les rôles réels |
| D7 | **Aucun fichier stocké** : les joueurs envoient des liens, les pièces jointes Discord sont refusées | Pas de stockage à sécuriser, scanner ni sauvegarder ; les URL CDN Discord expirent, un lien persistant (Imgur, Drive…) est demandé |
| D8 | Bot et API **partagent `packages/core`** (services, registre de modules) ; l'API n'agit sur Discord que via REST (`@discordjs/rest`) ou via des jobs BullMQ consommés par le bot | Les actions synchrones simples (check membre) restent rapides ; les actions lourdes passent par la file |

---

## 1. Arborescence du monorepo

```
syntra/
├─ package.json                  # workspaces, scripts turbo
├─ pnpm-workspace.yaml
├─ turbo.json
├─ tsconfig.base.json            # strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes
├─ .env.example                  # DATABASE_URL, REDIS_URL, MASTER_KEY_V1, DISCORD_*, S3_*
├─ docker-compose.yml            # postgres, redis, minio (dev)
├─ docs/
│  ├─ ARCHITECTURE.md            # ce document
│  └─ SECURITY.md                # modèle de menace + procédures de rotation de clés
│
├─ apps/
│  ├─ bot/                       # Processus Discord.js (gateway)
│  │  └─ src/
│  │     ├─ main.ts              # bootstrap + graceful shutdown (SIGTERM : drain queues, destroy client)
│  │     ├─ client.ts            # Client + intents
│  │     ├─ loader/              # charge les modules activés, enregistre commandes/événements
│  │     ├─ handlers/            # interactionCreate, messageCreate, voiceStateUpdate, guildMemberAdd…
│  │     ├─ queue/               # workers BullMQ (actions envoyées par l'API/le dashboard)
│  │     ├─ discord/             # wrappers REST : rate-limit-aware (file par salon, debounce renommage)
│  │     └─ health.ts            # endpoint /healthz + /readyz
│  │
│  ├─ api/                       # Fastify (webhooks externes, bridge FiveM, API interne dashboard)
│  │  └─ src/
│  │     ├─ main.ts
│  │     ├─ server.ts            # fastify + zod type provider + swagger
│  │     ├─ plugins/             # hmac-auth, rate-limit, error-handler, request-id, rbac
│  │     ├─ routes/
│  │     │  ├─ v1/webhooks/whitelist.ts
│  │     │  ├─ v1/guilds/members-check.ts
│  │     │  ├─ v1/bridge/{report,poll,ack,heartbeat}.ts
│  │     │  └─ internal/         # utilisés par le dashboard (token service-à-service)
│  │     └─ openapi/             # génération /docs (OpenAPI 3.1 via zod)
│  │
│  └─ web/                       # Next.js App Router
│     ├─ src/
│     │  ├─ app/
│     │  │  ├─ (auth)/login/
│     │  │  ├─ (dashboard)/
│     │  │  │  ├─ layout.tsx     # sidebar : sélecteur Projet + Serveur Discord
│     │  │  │  ├─ [projectSlug]/
│     │  │  │  │  ├─ overview/ modules/ tickets/ transcripts/[id]/
│     │  │  │  │  ├─ embeds/[id]/ (Embed Builder split-screen)
│     │  │  │  │  ├─ poles/ statuses/ snippets/ messages/
│     │  │  │  │  ├─ integrations/ (BDD FiveM, RCON, bridge)
│     │  │  │  │  ├─ api-keys/ access/ audit/ settings/
│     │  │  │  └─ new-project/
│     │  │  └─ api/auth/[...nextauth]/
│     │  ├─ components/          # ui (shadcn), discord-preview/, module-card/, transcript/
│     │  ├─ server/              # server actions + garde RBAC (`withPermission`)
│     │  └─ lib/
│     └─ tailwind.config.ts
│
├─ packages/
│  ├─ db/                        # Prisma : schema, migrations, client étendu (injection projectId), seed du template
│  ├─ shared/                    # Zod schemas (config des modules, payloads API), types, constantes d'événements
│  ├─ core/                      # Cœur métier indépendant de Discord.js / Next
│  │  └─ src/
│  │     ├─ modules/             # ModuleManifest, registry, activation, health checks
│  │     ├─ config/              # ConfigResolver (template → projet), cache RAM/Redis, invalidation pub/sub
│  │     ├─ templating/          # moteur de variables {user} {pole}… + validation
│  │     ├─ errors/              # AppError, ValidationError, ForbiddenError, RateLimitedError, ExternalServiceError
│  │     ├─ audit/               # AuditService (masquage des secrets avant écriture)
│  │     ├─ fivem/               # PlayerLookupService (mapping validé, requêtes paramétrées), RconClient
│  │     └─ storage/             # S3 : upload de pièces jointes
│  ├─ security/                  # crypto AES-256-GCM, HMAC, safeFetch (anti-SSRF), permissions, RBAC resolver
│  ├─ modules/                   # 1 dossier = 1 plugin ; manifest + handlers + services + panel config (schema)
│  │  ├─ tickets/                # dm-flow, channels, statuses, claim, notes, snippets, transfer, transcripts, rating
│  │  ├─ reports/                # ingestion /report → ticket prioritaire + bouton téléportation
│  │  ├─ douane/                 # voiceStateUpdate, /douane accept|refuse
│  │  ├─ embeds/                 # publication/édition de messages, boutons (lien, auto-rôle, open_ticket)
│  │  ├─ rcon/                   # /ban /kick /revive /announce
│  │  ├─ status/                 # embed de statut serveur (poll cfx / info.json)
│  │  ├─ sync_roles/             # synchro métiers/grades → rôles
│  │  └─ _template/              # squelette pour une future brique (ex. factions)
│  ├─ ui/                        # composants shadcn partagés + tokens de design
│  └─ config/                    # eslint, prettier, tsconfig presets
│
└─ integrations/
   └─ fivem/bot_bridge/          # Ressource FiveM (fxmanifest.lua + server.ts → build JS)
      ├─ fxmanifest.lua
      ├─ config.lua              # apiUrl, keyId (le secret est lu depuis un convar non versionné)
      └─ src/{server,client,hmac,poller}.ts
```

### Contrat d'un module (ce qui rend la v2 « Factions » sans refactor)

```ts
// packages/core/src/modules/manifest.ts
export interface ModuleManifest<C extends z.ZodTypeAny> {
  key: string;                               // "tickets"
  scope: 'guild' | 'project';                // portée de l'activation
  configSchema: C;                           // validation Zod de ModuleInstance.config
  defaultConfig: z.infer<C>;                 // copié dans le ConfigTemplate
  requiredDiscordPermissions: PermissionString[];  // → alertes de santé dans le dashboard
  permissions: PermissionDef[];              // entrées du catalogue RBAC ("tickets:read"…)
  commands?: CommandDef[];                   // slash commands (noms/descriptions viennent de la config)
  events?: EventHandlerDef[];
  routes?: (app: FastifyInstance) => void;   // endpoints API optionnels
  health(ctx: ModuleContext): Promise<HealthReport>;
}
```

Le loader du bot lit `ModuleInstance` en base, n'enregistre commandes et handlers **que** pour les modules `enabled` du guild concerné, et réagit à l'événement Redis `config:invalidate:{projectId}`. Ajouter « Factions » = ajouter un dossier `packages/modules/factions` + une entrée dans le registre ; ses tables portent `projectId` (ou démarrent sur `ModuleRecord`).

### Isolation tenant

1. Le client Prisma exporté par `packages/db` est **étendu** : toute requête exige un `ProjectScope` et injecte `projectId` dans `where`/`data` (impossible d'oublier le filtre).
2. Défense en profondeur : **Row-Level Security Postgres** avec `SET LOCAL app.project_id` par transaction sur les tables métier.
3. Le bot résout `guildId → projectId` via un index en RAM (`Guild.discordGuildId`) ; un event d'un guild inconnu est ignoré.

---

## 2. Stratégie de sécurité

### 2.1 Chiffrement au repos — AES-256-GCM avec chiffrement d'enveloppe

- `MASTER_KEY_V1..n` (32 octets, base64) dans l'environnement / secret manager — **jamais** en base.
- Format stocké : `v1:<keyId>:<iv b64>:<tag b64>:<ciphertext b64>`.
- IV aléatoire de 12 octets par chiffrement ; **AAD** = `projectId|table.colonne` → un secret copié dans une autre ligne/projet ne se déchiffre pas.
- Rotation : `keyId` dans le format permet de déchiffrer avec l'ancienne clé et de rechiffrer paresseusement (job `rotate-secrets`).
- Les secrets ne sont **jamais** renvoyés au navigateur après saisie (affichage `••••` + « Remplacer »), jamais loggés, masqués dans `AuditLog`.

```ts
// packages/security/src/crypto.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const keys = loadMasterKeys();            // Map<keyId, Buffer(32)> depuis l'env, validé au boot
const CURRENT = process.env.MASTER_KEY_CURRENT ?? 'k1';

export function encrypt(plain: string, aad: string): string {
  const key = keys.get(CURRENT)!;
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', CURRENT, iv.toString('base64'), c.getAuthTag().toString('base64'), ct.toString('base64')].join(':');
}

export function decrypt(payload: string, aad: string): string {
  const [v, keyId, iv, tag, ct] = payload.split(':');
  if (v !== 'v1' || !keyId || !iv || !tag || !ct) throw new CryptoError('format invalide');
  const key = keys.get(keyId);
  if (!key) throw new CryptoError('clé inconnue');
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8');
}
```

### 2.2 Authentification machine-à-machine — clé API + HMAC-SHA256 + anti-replay

Utilisé par le site vitrine externe et le `bot_bridge`.

**En-têtes** : `X-Syntra-Key-Id`, `X-Syntra-Timestamp` (secondes), `X-Syntra-Nonce` (UUID), `X-Syntra-Signature` (hex).

**Chaîne signée** (canonique, empêche toute altération de méthode/chemin/corps) :

```
{timestamp}\n{nonce}\n{METHOD}\n{path?query triée}\n{sha256_hex(body)}
```

**Vérification (hook Fastify `preHandler`)** :
1. Lire la clé par `keyId` → rejeter si `revokedAt`, `expiresAt` dépassé, IP hors `ipAllowlist`. (Réponse uniforme `401` pour ne pas révéler l'existence d'une clé.)
2. `|now - timestamp| ≤ 300 s` sinon `401`.
3. Recalculer le HMAC avec le secret déchiffré ; comparaison `timingSafeEqual`.
4. Anti-replay : `SET nonce:{keyId}:{nonce} 1 NX EX 600` dans Redis ; échec = rejeu → `401`.
5. Vérifier le **scope** de la clé pour la route (`webhooks:whitelist`, `bridge:report`…).
6. Rate limit par clé (`rateLimitPerMin`, fenêtre glissante Redis) + par IP en amont.
7. Webhooks : en-tête `Idempotency-Key` obligatoire → `WebhookDelivery` (unique) ; un doublon renvoie le résultat précédent.
8. Corps lu en **raw** (limite 256 Ko) avant parsing, puis validé par Zod ; tout champ inconnu est rejeté (`.strict()`).

```ts
// packages/security/src/hmac.ts
export function sign(secret: string, p: { ts: number; nonce: string; method: string; pathQuery: string; body: Buffer }) {
  const bodyHash = createHash('sha256').update(p.body).digest('hex');
  const msg = `${p.ts}\n${p.nonce}\n${p.method.toUpperCase()}\n${p.pathQuery}\n${bodyHash}`;
  return createHmac('sha256', secret).update(msg).digest('hex');
}
export function verify(expectedHex: string, receivedHex: string) {
  const a = Buffer.from(expectedHex, 'hex'), b = Buffer.from(receivedHex, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
```

Le secret est **affiché une seule fois** à la création, stocké chiffré (nécessaire pour recalculer le HMAC). Rotation : nouvelle clé générée, ancienne valide jusqu'à `graceUntil`. Le bridge appelle l'API en sortant, donc l'ordre de téléportation transite par `GET /v1/bridge/poll` (réponse signée par l'API avec le même schéma pour que le bridge authentifie le serveur).

### 2.3 RBAC granulaire (dashboard)

**Modèle** : `permission = domaine:action` (catalogue déclaré par chaque module + permissions cœur : `project:admin`, `apikeys:manage`, `rcon:execute`, `integrations:manage`, `audit:read`, `access:manage`).
**Attribution** : `AccessPolicy` = (rôle Discord d'un serveur) → (permissions) sur une **cible** (un serveur du projet, ou le projet entier).

**Résolution** (côté serveur uniquement) :
1. Session Auth.js → `discordId` (JWT signé, `httpOnly`, `sameSite=lax`).
2. Pour chaque `Guild` du projet, récupérer les rôles du membre via le token du bot (`GET /guilds/:id/members/:id`), cache Redis 60 s, invalidé par `guildMemberUpdate`.
3. `ProjectMember.OWNER` ⇒ tout. Sinon : union des permissions des `AccessPolicy` dont le rôle est détenu.
4. Les permissions **sensibles** (`rcon:*`, `integrations:*`, `apikeys:*`, `access:*`) ne sont **jamais** héritées d'une portée « serveur » : elles exigent une policy ciblant le projet entier. Un *Responsable Illégal* (policy ciblant le Discord Illégal) ne peut donc ni voir le RCON ni les transcripts du Staff.
5. Toute requête (Server Action, route API interne, chargement de page) passe par le même garde :

```ts
// apps/web/src/server/guard.ts
export async function withPermission<T>(
  perm: Permission,
  target: { projectId: string; guildId?: string },
  fn: (ctx: AuthContext) => Promise<T>,
): Promise<T> {
  const session = await requireSession();                       // 401 si absent
  const ctx = await resolveAccess(session.discordId, target);   // lit AccessPolicy + rôles Discord
  if (!ctx.can(perm, target)) throw new ForbiddenError(perm);   // 403, journalisé
  return fn(ctx);
}
```

Les ID d'objet (ticket, embed, transcript) sont **toujours** re-vérifiés contre `projectId`/`guildId` à la lecture (anti-IDOR) — pas seulement à l'entrée de la route.

### 2.4 Anti-injection & SSRF

- **`safeFetch`** (packages/security) : `https` uniquement, résolution DNS puis blocage des plages privées/loopback/link-local/metadata (`10/8, 172.16/12, 192.168/16, 127/8, 169.254/16, ::1, fc00::/7…`), **pas de redirection** automatique (ou re-validation à chaque saut), timeout 5 s, taille max 8 Mo, `Content-Type` image vérifié (magic bytes). Utilisé pour : images d'embeds, thumbnails, ré-upload de pièces jointes.
- URLs de boutons/embeds : schéma `https`/`discord`/`cfx.re` seulement, `javascript:`/`data:` rejetés.
- **BDD FiveM client** : (a) l'hôte est résolu et refusé s'il est privé, sauf `allowPrivateNetwork` explicitement activé par l'opérateur self-host ; (b) l'utilisateur DB fourni doit être en lecture seule (test à la connexion : tentative d'écriture refusée, sinon avertissement bloquant) ; (c) **aucun SQL libre** : le mapping (`table`, `colonnes`) est validé par `^[A-Za-z0-9_]+$` et quoté par le driver ; la valeur recherchée est un paramètre lié ; (d) pool limité, timeout de requête 3 s, résultats tronqués.
- **RCON** : allowlist de commandes + templates (`ban {id} {reason}`), arguments échappés/validés Zod (pas de `;`, retours ligne), exécution réservée à `rcon:execute`, chaque appel audité.
- Rendu des messages Discord dans le dashboard : texte échappé, markdown parsé via parseur whitelisté (pas de `dangerouslySetInnerHTML` sur du contenu utilisateur).
- Mentions : `allowedMentions` restreint par défaut sur tout message sortant (pas de `@everyone` via champ de formulaire).
- Dashboard : CSP stricte, `SameSite`, tokens CSRF natifs des Server Actions, en-têtes de sécurité (`helmet` côté API).

### 2.5 Audit logs

`AuditService.record({...})` est appelé par une **couche unique** (wrapper des services de mutation, pas par chaque route) : acteur (user/clé/bot), action, entité, `before`/`after` (secrets remplacés par `[REDACTED]`), IP, UA. Table append-only : le rôle DB applicatif n'a que `INSERT/SELECT` dessus. Rétention configurable ; export dans le dashboard (`audit:read`).

### 2.6 Autres garde-fous

- **Rate limits Discord** : toutes les écritures passent par la couche `discord/` : file par route/salon ; renommage de salon (limite ~2 / 10 min) **debounce 10 s + coalescence** (seul le dernier nom voulu est appliqué, `pendingChannelName`/`lastRenameAt`), statuts `lockAutoChange` respectés.
- **Secrets du bot** (token Discord) : variable d'environnement uniquement, jamais en base. Un token par déploiement (un seul bot multi-serveurs), le client ajoute le bot via lien OAuth.
- **Graceful shutdown** : SIGTERM → arrêt d'accepter des jobs, drain des files, `client.destroy()`, fermeture Prisma/Redis.
- Dépendances : `pnpm audit` + Renovate en CI ; `.env` jamais commité ; `gitleaks` en pre-commit.

---

## 3. Schéma de base de données

Fichier complet : [`packages/db/prisma/schema.prisma`](../packages/db/prisma/schema.prisma). Vue d'ensemble :

| Domaine | Modèles |
|---|---|
| Identité / tenant | `User`, `Project`, `ProjectMember`, `Guild` |
| Config data-driven | `ConfigTemplate` (versionné, cloné à la création), `ModuleInstance` (enabled + config JSON validée Zod), `MessageTemplate` (tous les textes) |
| RBAC | `AccessPolicy` (rôle Discord → permissions sur serveur/projet) |
| Intégrations (chiffrées) | `ApiKey`, `FivemDatabase`, `RconConnection`, `BridgeLink`, `PlayerLink` |
| Tickets | `TicketPole`, `TicketQuestion`, `TicketStatus` (pastilles + `trigger` + `lockAutoChange`), `TicketSnippet`, `TicketCounter`, `Ticket`, `TicketMessage` (PLAYER / STAFF_PUBLIC / STAFF_ANONYMOUS / INTERNAL_NOTE / SYSTEM), `TicketAttachment`, `TicketTransfer`, `TicketStatusChange` |
| Autres modules | `DouaneSession`, `WebhookDelivery` (idempotence), `EmbedTemplate`, `RoleSyncRule` |
| Extensibilité v2 | `ModuleRecord` (stockage générique pour Factions/LSPD avant tables dédiées) |
| Audit | `AuditLog` (append-only) |

Points de conception :

- **Template par défaut** : `ConfigTemplate(key="default")` contient modules, pôles, statuts, snippets, textes. `createProject()` le clone dans une transaction (`ModuleInstance`, `TicketStatus`, `MessageTemplate`…) → zéro valeur en dur dans le code, et « réinitialiser aux valeurs par défaut » devient une simple re-copie.
- **Portée de module** : `ModuleInstance.scopeKey = guildId ?? 'project'` pour une unicité propre malgré les `NULL`.
- **Pastilles** : `TicketStatus.trigger` ∈ `ON_CREATE | ON_USER_REPLY | ON_STAFF_REPLY | MANUAL_ONLY` ; le moteur choisit le statut cible en cherchant le statut du projet qui porte le trigger de l'événement, sauf si le statut courant a `lockAutoChange`. Pattern de nom de salon `{emoji}・{pole}-{username}-{id}` stocké dans la config du module `tickets` (surchargeable par pôle).
- **Cross-guild** : `Ticket.guildId` = serveur du pôle cible ; `TicketTransfer` conserve l'historique, `TicketMessage.channelId` garde le salon d'origine des messages.
- **Un guild Discord = un seul projet** (`Guild.discordGuildId @unique`) : évite toute fuite inter-tenants.
- **Invalidation de cache** : `Project.configRevision` incrémenté à chaque écriture de config → publication Redis `config:invalidate:{projectId}` → bot et API purgent leur cache RAM.

---

## 4. Points à trancher avant de coder

1. **Hébergement cible** : Docker Compose sur VPS (recommandé pour démarrer) ou autre ? Détermine le stockage objet (MinIO vs R2) et le secret manager.
2. **Modèle de commercialisation** : toi l'opérateur unique du bot (un token, les clients ajoutent « ton » bot) vs. chaque client héberge son instance ? J'ai conçu pour le premier cas ; le second est compatible (`allowPrivateNetwork`).
3. **Frameworks FiveM supportés au MVP** : ESX / QBCore / QBox ? (impacte les presets de `FivemDatabase.mapping`).
4. **Langue du dashboard** : FR uniquement au MVP, i18n-ready (`next-intl`) ?
5. **Direction visuelle** du dashboard : je propose sombre/neutre type Linear avec un accent unique (violet/indigo). OK ou autre préférence ?

## 5. Ordre d'implémentation proposé après validation

1. Monorepo + `packages/db` + `shared` + `security` (+ tests unitaires crypto/HMAC/SSRF/RBAC)
2. `core` (registre de modules, ConfigResolver, audit, erreurs) + bootstrap bot/api
3. Module `tickets` (flux MP complet) → `reports` + bridge FiveM
4. `webhooks` externes, `douane`, `sync_roles`, `rcon`, `status`
5. Dashboard : auth/RBAC → modules → tickets/transcripts → Embed Builder → clés API/audit
6. Module `embeds` (publication + édition en direct)
