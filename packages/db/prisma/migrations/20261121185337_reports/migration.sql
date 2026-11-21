-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'CLAIMED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ReportMessageKind" AS ENUM ('PLAYER', 'STAFF', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ReportMessageSource" AS ENUM ('GAME', 'DISCORD');

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "guildId" TEXT,
    "externalId" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "reason" TEXT NOT NULL,
    "reporterName" TEXT NOT NULL,
    "reporterIdentifier" TEXT NOT NULL,
    "reporterDiscordId" TEXT,
    "reporterUid" INTEGER,
    "serverId" INTEGER,
    "gameContext" JSONB,
    "playerSnapshot" JSONB,
    "claimedByName" TEXT,
    "claimedByDiscordId" TEXT,
    "resolution" TEXT,
    "closedByName" TEXT,
    "channelId" TEXT,
    "mainMessageId" TEXT,
    "threadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportMessage" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "ReportMessageKind" NOT NULL,
    "source" "ReportMessageSource" NOT NULL,
    "authorName" TEXT NOT NULL,
    "authorDiscordId" TEXT,
    "content" TEXT NOT NULL,
    "discordMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Report_projectId_status_idx" ON "Report"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Report_projectId_externalId_key" ON "Report"("projectId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Report_threadId_key" ON "Report"("threadId");

-- CreateIndex
CREATE INDEX "ReportMessage_reportId_createdAt_idx" ON "ReportMessage"("reportId", "createdAt");

-- CreateIndex
CREATE INDEX "ReportMessage_projectId_idx" ON "ReportMessage"("projectId");

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportMessage" ADD CONSTRAINT "ReportMessage_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;
