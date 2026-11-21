import type { Client } from 'discord.js';
import type { PrismaClient } from '@syntra/db';
import type { PlayerLookupService, AuditService, BridgeCommands, ConfigService, RenameQueue } from '@syntra/core';
import type { Logger } from 'pino';
import type { TicketService } from './tickets/service';
import type { ReportService } from './reports/service';
import type { DouaneService } from './douane/service';

export interface BotContext {
  client: Client<true>;
  prisma: PrismaClient;
  config: ConfigService;
  audit: AuditService;
  renames: RenameQueue;
  bridge: BridgeCommands;
  log: Logger;
  tickets: TicketService;
  reports: ReportService;
  douane: DouaneService;
  players: PlayerLookupService;
}
