-- AlterTable
ALTER TABLE "Ticket" DROP COLUMN "rating",
DROP COLUMN "ratingComment";


-- Le schema de config des tickets est strict : retirer la cle obsolete des configurations existantes
UPDATE "ModuleInstance" SET "config" = "config" - 'ratingEnabled' WHERE "moduleKey" = 'tickets';

-- Retire la demande de notation du MP de cloture (uniquement si le texte est encore celui par defaut)
UPDATE "MessageTemplate" SET "content" = 'Votre ticket **#{ticket.number}** est clôturé.' WHERE "key" = 'ticket.dm.closed' AND "locale" = 'fr' AND "content" = 'Votre ticket **#{ticket.number}** est clôturé. Merci de noter la qualité de la prise en charge.';
UPDATE "MessageTemplate" SET "content" = 'Your ticket **#{ticket.number}** is closed.' WHERE "key" = 'ticket.dm.closed' AND "locale" = 'en' AND "content" = 'Your ticket **#{ticket.number}** is closed. Please rate the support you received.';
