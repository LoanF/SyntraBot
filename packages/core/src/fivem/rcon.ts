import dgram from 'node:dgram';
import { isIP } from 'node:net';
import { ExternalServiceError, ValidationError } from '@syntra/shared';
import { aad, type Cipher } from '@syntra/security';
import type { PrismaClient } from '@syntra/db';
import { assertPublicHost } from '../net';

/**
 * Neutralise une valeur insérée dans une commande console FiveM : `;` sépare les commandes, les retours à la ligne
 * et caractères de contrôle aussi, `"` et `\` casseraient le découpage des arguments.
 */
export function sanitizeRconArg(value: string, maxLength = 200): string {
  return value.replace(/[\u0000-\u001f\u007f;"\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

/** Rend un gabarit `ban {id} {reason}` avec des arguments assainis. Toute variable absente est une erreur. */
export function renderRconCommand(template: string, args: Record<string, string | number>): string {
  const out = template.replace(/\{([a-z_]+)\}/g, (_w, name: string) => {
    if (!Object.hasOwn(args, name)) throw new ValidationError(`Argument manquant : ${name}`);
    return sanitizeRconArg(String(args[name]));
  });
  if (/[\r\n;]/.test(out)) throw new ValidationError('Commande invalide');
  return out;
}

/** Nom de la commande = premier mot, vérifié contre la liste blanche */
export function commandName(rendered: string): string {
  return rendered.split(' ', 1)[0] ?? '';
}

/** Protocole RCON de FiveM : datagramme UDP « \xff\xff\xff\xffrcon <mot de passe> <commande> » */
export function buildRconPacket(password: string, command: string): Buffer {
  return Buffer.concat([Buffer.from([0xff, 0xff, 0xff, 0xff]), Buffer.from(`rcon ${password} ${command}`, 'utf8')]);
}

export function parseRconResponse(buf: Buffer): string {
  return buf.subarray(4).toString('utf8').replace(/^print\n?/, '').trim();
}

export async function rconSend(opts: { ip: string; port: number; password: string; command: string; timeoutMs?: number }): Promise<string> {
  const socket = dgram.createSocket(isIP(opts.ip) === 6 ? 'udp6' : 'udp4');
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => { socket.close(); reject(new ExternalServiceError('Le serveur de jeu n’a pas répondu (RCON)')); }, opts.timeoutMs ?? 3000);
    socket.once('message', (msg) => { clearTimeout(timer); socket.close(); resolve(parseRconResponse(msg)); });
    socket.once('error', (e) => { clearTimeout(timer); socket.close(); reject(new ExternalServiceError('Erreur RCON', { cause: String(e) })); });
    socket.send(buildRconPacket(opts.password, opts.command), opts.port, opts.ip, (err) => {
      if (err) { clearTimeout(timer); socket.close(); reject(new ExternalServiceError('Envoi RCON impossible', { cause: String(err) })); }
    });
  });
}

export class RconService {
  constructor(private prisma: PrismaClient, private cipher: Cipher) {}

  /** Exécute une commande de la liste blanche du projet. Lève si elle n'est pas autorisée. */
  async execute(projectId: string, template: string, args: Record<string, string | number>): Promise<string> {
    const conn = await this.prisma.rconConnection.findUnique({ where: { projectId } });
    if (!conn) throw new ValidationError('RCON non configuré');
    const command = renderRconCommand(template, args);
    if (!conn.allowedCommands.includes(commandName(command))) throw new ValidationError(`Commande non autorisée : ${commandName(command)}`);
    const ip = await assertPublicHost(conn.host);
    return rconSend({ ip, port: conn.port, password: this.cipher.decrypt(conn.passwordEnc, aad.rcon(projectId)), command });
  }
}
