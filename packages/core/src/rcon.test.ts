import { describe, expect, it } from 'vitest';
import { buildRconPacket, commandName, parseRconResponse, renderRconCommand, sanitizeRconArg } from './fivem/rcon';
import { assertPublicHost } from './net';

describe('RCON : assainissement', () => {
  it('neutralise ; retours à la ligne, guillemets et antislash', () => {
    expect(sanitizeRconArg('hack; quit\n"x"\\y')).toBe('hack quit x y');
  });
  it('un motif ne peut pas enchaîner une 2e commande', () => {
    const cmd = renderRconCommand('ban {id} {reason}', { id: 12, reason: 'cheat; quit' });
    expect(cmd).toBe('ban 12 cheat quit');
    expect(cmd).not.toContain(';');
  });
  it('refuse un argument manquant', () => {
    expect(() => renderRconCommand('kick {id} {reason}', { id: 1 })).toThrow(/manquant/);
  });
  it('extrait le nom de commande pour la liste blanche', () => {
    expect(commandName('ban 12 motif')).toBe('ban');
  });
});

describe('RCON : protocole', () => {
  it('paquet FiveM : 4 octets 0xFF puis « rcon mdp commande »', () => {
    const p = buildRconPacket('secret', 'status');
    expect([...p.subarray(0, 4)]).toEqual([255, 255, 255, 255]);
    expect(p.subarray(4).toString()).toBe('rcon secret status');
  });
  it('parse la réponse « print »', () => {
    expect(parseRconResponse(Buffer.concat([Buffer.from([255, 255, 255, 255]), Buffer.from('print\nOK\n')]))).toBe('OK');
  });
});

describe('SSRF hôte', () => {
  it('refuse une IP privée, accepte une IP publique, ALLOW_PRIVATE_RCON lève la restriction', async () => {
    await expect(assertPublicHost('192.168.1.10', {})).rejects.toThrow();
    await expect(assertPublicHost('127.0.0.1', {})).rejects.toThrow();
    expect(await assertPublicHost('8.8.8.8', {})).toBe('8.8.8.8');
    expect(await assertPublicHost('10.0.0.5', { ALLOW_PRIVATE_RCON: '1' })).toBe('10.0.0.5');
  });
});
