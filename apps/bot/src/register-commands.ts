import { REST, Routes } from 'discord.js';
import { z } from 'zod';
import { ticketCommand } from './tickets/commands';
import { adminCommand } from './rcon/commands';
import { douaneCommand } from './douane/service';

/** Enregistre les commandes slash globalement (une fois par déploiement : `pnpm --filter @syntra/bot register`). */
const env = z.object({ DISCORD_BOT_TOKEN: z.string().min(10), DISCORD_CLIENT_ID: z.string().min(5) }).parse(process.env);
const rest = new REST({ version: '10' }).setToken(env.DISCORD_BOT_TOKEN);
await rest.put(Routes.applicationCommands(env.DISCORD_CLIENT_ID), { body: [ticketCommand.toJSON(), adminCommand.toJSON(), douaneCommand.toJSON()] });
console.log('Commandes enregistrées.');
