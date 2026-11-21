/*
  Warnings:

  - You are about to drop the `TicketAttachment` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "TicketAttachment" DROP CONSTRAINT "TicketAttachment_messageId_fkey";

-- DropTable
DROP TABLE "TicketAttachment";

-- Le schema de config des tickets est strict : retirer la cle obsolete des configurations existantes
UPDATE "ModuleInstance" SET "config" = "config" - 'attachmentsMaxMb' WHERE "moduleKey" = 'tickets';
