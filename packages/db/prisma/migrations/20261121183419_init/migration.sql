-- CreateEnum
CREATE TYPE "ProjectPlan" AS ENUM ('FREE', 'PRO', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProjectRole" AS ENUM ('OWNER', 'ADMIN');

-- CreateEnum
CREATE TYPE "TicketStatusTrigger" AS ENUM ('ON_CREATE', 'ON_USER_REPLY', 'ON_STAFF_REPLY', 'MANUAL_ONLY');

-- CreateEnum
CREATE TYPE "TicketSource" AS ENUM ('DISCORD_DM', 'INGAME_REPORT', 'API', 'STAFF_CREATED');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "TicketMessageKind" AS ENUM ('PLAYER', 'STAFF_PUBLIC', 'STAFF_ANONYMOUS', 'INTERNAL_NOTE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'API_KEY', 'BOT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "DouaneDecision" AS ENUM ('PENDING', 'ACCEPTED', 'REFUSED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "EmbedStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RoleSyncSource" AS ENUM ('JOB', 'JOB_GRADE', 'GROUP', 'CUSTOM_QUERY_KEY');

-- CreateEnum
CREATE TYPE "WebhookStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "FivemFramework" AS ENUM ('ESX', 'QBCORE', 'QBOX', 'CUSTOM');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "avatar" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "plan" "ProjectPlan" NOT NULL DEFAULT 'FREE',
    "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "locale" TEXT NOT NULL DEFAULT 'fr',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Paris',
    "templateKey" TEXT NOT NULL DEFAULT 'default',
    "templateVersion" INTEGER NOT NULL DEFAULT 1,
    "configRevision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMember" (
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ProjectRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("projectId","userId")
);

-- CreateTable
CREATE TABLE "ConfigTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConfigTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Guild" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "discordGuildId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "botPresent" BOOLEAN NOT NULL DEFAULT false,
    "healthReport" JSONB,
    "healthCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Guild_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModuleInstance" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "guildId" TEXT,
    "scopeKey" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL DEFAULT '{}',
    "configVersion" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModuleInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessPolicy" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "roleGuildId" TEXT NOT NULL,
    "discordRoleId" TEXT NOT NULL,
    "targetGuildId" TEXT,
    "targetScopeKey" TEXT NOT NULL,
    "permissions" TEXT[],
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "secretEnc" TEXT NOT NULL,
    "scopes" TEXT[],
    "rateLimitPerMin" INTEGER NOT NULL DEFAULT 120,
    "ipAllowlist" TEXT[],
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "graceUntil" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FivemDatabase" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "framework" "FivemFramework" NOT NULL DEFAULT 'ESX',
    "connectionEnc" TEXT NOT NULL,
    "mapping" JSONB NOT NULL,
    "allowPrivateNetwork" BOOLEAN NOT NULL DEFAULT false,
    "lastCheckAt" TIMESTAMP(3),
    "lastCheckOk" BOOLEAN,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FivemDatabase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RconConnection" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "passwordEnc" TEXT NOT NULL,
    "allowedCommands" TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RconConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BridgeLink" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "apiKeyId" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "bridgeVersion" TEXT,
    "pendingCommands" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "BridgeLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerLink" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketPole" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "emoji" TEXT,
    "description" TEXT,
    "categoryChannelId" TEXT,
    "staffRoleIds" TEXT[],
    "anonymousName" TEXT,
    "channelPattern" TEXT,
    "defaultPriority" "TicketPriority" NOT NULL DEFAULT 'NORMAL',
    "position" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TicketPole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketQuestion" (
    "id" TEXT NOT NULL,
    "poleId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "placeholder" TEXT,
    "style" TEXT NOT NULL DEFAULT 'SHORT',
    "required" BOOLEAN NOT NULL DEFAULT true,
    "minLength" INTEGER,
    "maxLength" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TicketQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketStatus" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "trigger" "TicketStatusTrigger" NOT NULL,
    "lockAutoChange" BOOLEAN NOT NULL DEFAULT false,
    "isTerminal" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TicketStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketSnippet" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "poleId" TEXT,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketSnippet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketCounter" (
    "projectId" TEXT NOT NULL,
    "last" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TicketCounter_pkey" PRIMARY KEY ("projectId")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "poleId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "channelId" TEXT,
    "userDiscordId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "statusId" TEXT NOT NULL,
    "priority" "TicketPriority" NOT NULL DEFAULT 'NORMAL',
    "source" "TicketSource" NOT NULL DEFAULT 'DISCORD_DM',
    "claimedByDiscordId" TEXT,
    "subject" TEXT,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "gameContext" JSONB,
    "playerSnapshot" JSONB,
    "pinnedMessageId" TEXT,
    "lastRenameAt" TIMESTAMP(3),
    "pendingChannelName" TEXT,
    "closedAt" TIMESTAMP(3),
    "closedByDiscordId" TEXT,
    "closeReason" TEXT,
    "rating" INTEGER,
    "ratingComment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "TicketMessageKind" NOT NULL,
    "authorDiscordId" TEXT,
    "authorName" TEXT,
    "authorAvatar" TEXT,
    "content" TEXT NOT NULL,
    "embeds" JSONB,
    "discordMessageId" TEXT,
    "channelId" TEXT,
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketAttachment" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "originalUrl" TEXT,

    CONSTRAINT "TicketAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketTransfer" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "fromPoleId" TEXT NOT NULL,
    "toPoleId" TEXT NOT NULL,
    "fromGuildId" TEXT NOT NULL,
    "toGuildId" TEXT NOT NULL,
    "byDiscordId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketStatusChange" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "fromStatusId" TEXT,
    "toStatusId" TEXT NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT,
    "cause" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketStatusChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DouaneSession" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "candidateDiscordId" TEXT NOT NULL,
    "voiceChannelId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "handledByDiscordId" TEXT,
    "decision" "DouaneDecision" NOT NULL DEFAULT 'PENDING',
    "decidedAt" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "DouaneSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "apiKeyId" TEXT,
    "endpoint" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "status" "WebhookStatus" NOT NULL DEFAULT 'RECEIVED',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmbedTemplate" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channelId" TEXT,
    "payload" JSONB NOT NULL,
    "status" "EmbedStatus" NOT NULL DEFAULT 'DRAFT',
    "messageId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmbedTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleSyncRule" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "source" "RoleSyncSource" NOT NULL,
    "matchValue" TEXT NOT NULL,
    "discordRoleId" TEXT NOT NULL,
    "removeWhenUnmatched" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "RoleSyncRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageTemplate" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'fr',
    "content" TEXT NOT NULL,
    "embed" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModuleRecord" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "collection" TEXT NOT NULL,
    "guildId" TEXT,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModuleRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "guildId" TEXT,
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_discordId_key" ON "User"("discordId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_slug_key" ON "Project"("slug");

-- CreateIndex
CREATE INDEX "Project_ownerId_idx" ON "Project"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "ConfigTemplate_key_version_key" ON "ConfigTemplate"("key", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Guild_discordGuildId_key" ON "Guild"("discordGuildId");

-- CreateIndex
CREATE INDEX "Guild_projectId_idx" ON "Guild"("projectId");

-- CreateIndex
CREATE INDEX "ModuleInstance_projectId_moduleKey_idx" ON "ModuleInstance"("projectId", "moduleKey");

-- CreateIndex
CREATE UNIQUE INDEX "ModuleInstance_projectId_moduleKey_scopeKey_key" ON "ModuleInstance"("projectId", "moduleKey", "scopeKey");

-- CreateIndex
CREATE INDEX "AccessPolicy_projectId_idx" ON "AccessPolicy"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "AccessPolicy_roleGuildId_discordRoleId_targetScopeKey_key" ON "AccessPolicy"("roleGuildId", "discordRoleId", "targetScopeKey");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyId_key" ON "ApiKey"("keyId");

-- CreateIndex
CREATE INDEX "ApiKey_projectId_idx" ON "ApiKey"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "FivemDatabase_projectId_key" ON "FivemDatabase"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "RconConnection_projectId_key" ON "RconConnection"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "BridgeLink_projectId_key" ON "BridgeLink"("projectId");

-- CreateIndex
CREATE INDEX "PlayerLink_projectId_discordId_idx" ON "PlayerLink"("projectId", "discordId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerLink_projectId_identifier_key" ON "PlayerLink"("projectId", "identifier");

-- CreateIndex
CREATE UNIQUE INDEX "TicketPole_projectId_key_key" ON "TicketPole"("projectId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "TicketQuestion_poleId_key_key" ON "TicketQuestion"("poleId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "TicketStatus_projectId_key_key" ON "TicketStatus"("projectId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "TicketSnippet_projectId_key_key" ON "TicketSnippet"("projectId", "key");

-- CreateIndex
CREATE INDEX "Ticket_projectId_userDiscordId_idx" ON "Ticket"("projectId", "userDiscordId");

-- CreateIndex
CREATE INDEX "Ticket_projectId_statusId_idx" ON "Ticket"("projectId", "statusId");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_projectId_number_key" ON "Ticket"("projectId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_guildId_channelId_key" ON "Ticket"("guildId", "channelId");

-- CreateIndex
CREATE INDEX "TicketMessage_ticketId_createdAt_idx" ON "TicketMessage"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "TicketMessage_projectId_idx" ON "TicketMessage"("projectId");

-- CreateIndex
CREATE INDEX "TicketAttachment_projectId_idx" ON "TicketAttachment"("projectId");

-- CreateIndex
CREATE INDEX "TicketStatusChange_ticketId_idx" ON "TicketStatusChange"("ticketId");

-- CreateIndex
CREATE INDEX "DouaneSession_projectId_candidateDiscordId_idx" ON "DouaneSession"("projectId", "candidateDiscordId");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookDelivery_projectId_endpoint_idempotencyKey_key" ON "WebhookDelivery"("projectId", "endpoint", "idempotencyKey");

-- CreateIndex
CREATE INDEX "EmbedTemplate_projectId_guildId_idx" ON "EmbedTemplate"("projectId", "guildId");

-- CreateIndex
CREATE INDEX "RoleSyncRule_projectId_guildId_idx" ON "RoleSyncRule"("projectId", "guildId");

-- CreateIndex
CREATE UNIQUE INDEX "MessageTemplate_projectId_key_locale_key" ON "MessageTemplate"("projectId", "key", "locale");

-- CreateIndex
CREATE INDEX "ModuleRecord_projectId_moduleKey_collection_idx" ON "ModuleRecord"("projectId", "moduleKey", "collection");

-- CreateIndex
CREATE INDEX "AuditLog_projectId_createdAt_idx" ON "AuditLog"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_projectId_action_idx" ON "AuditLog"("projectId", "action");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Guild" ADD CONSTRAINT "Guild_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModuleInstance" ADD CONSTRAINT "ModuleInstance_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModuleInstance" ADD CONSTRAINT "ModuleInstance_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessPolicy" ADD CONSTRAINT "AccessPolicy_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FivemDatabase" ADD CONSTRAINT "FivemDatabase_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RconConnection" ADD CONSTRAINT "RconConnection_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeLink" ADD CONSTRAINT "BridgeLink_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerLink" ADD CONSTRAINT "PlayerLink_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketPole" ADD CONSTRAINT "TicketPole_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketPole" ADD CONSTRAINT "TicketPole_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketQuestion" ADD CONSTRAINT "TicketQuestion_poleId_fkey" FOREIGN KEY ("poleId") REFERENCES "TicketPole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketStatus" ADD CONSTRAINT "TicketStatus_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketSnippet" ADD CONSTRAINT "TicketSnippet_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketSnippet" ADD CONSTRAINT "TicketSnippet_poleId_fkey" FOREIGN KEY ("poleId") REFERENCES "TicketPole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketCounter" ADD CONSTRAINT "TicketCounter_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_poleId_fkey" FOREIGN KEY ("poleId") REFERENCES "TicketPole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "TicketStatus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketMessage" ADD CONSTRAINT "TicketMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketAttachment" ADD CONSTRAINT "TicketAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "TicketMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketTransfer" ADD CONSTRAINT "TicketTransfer_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketStatusChange" ADD CONSTRAINT "TicketStatusChange_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketStatusChange" ADD CONSTRAINT "TicketStatusChange_fromStatusId_fkey" FOREIGN KEY ("fromStatusId") REFERENCES "TicketStatus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketStatusChange" ADD CONSTRAINT "TicketStatusChange_toStatusId_fkey" FOREIGN KEY ("toStatusId") REFERENCES "TicketStatus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DouaneSession" ADD CONSTRAINT "DouaneSession_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmbedTemplate" ADD CONSTRAINT "EmbedTemplate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmbedTemplate" ADD CONSTRAINT "EmbedTemplate_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleSyncRule" ADD CONSTRAINT "RoleSyncRule_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleSyncRule" ADD CONSTRAINT "RoleSyncRule_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageTemplate" ADD CONSTRAINT "MessageTemplate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModuleRecord" ADD CONSTRAINT "ModuleRecord_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
