'use strict';
/* global GetConvar, GetConvarInt, GetPlayers, GetPlayerName, GetPlayerPed, GetPlayerIdentifiers, GetEntityCoords, GetEntityHealth,
   GetPedArmour, GetSelectedPedWeapon, GetVehiclePedIsIn, GetVehicleNumberPlateText, GetPlayerRoutingBucket, SetPlayerRoutingBucket,
   SetEntityCoords, on, exports, GetResourceState */
const http = require('http');
const https = require('https');
const lib = require('./lib');

// ---------------------------------------------------------------- configuration (convars, jamais en dur)
//   set syntra_bridge:url      "https://api.exemple.com"
//   set syntra_bridge:keyId    "sk_..."
//   set syntra_bridge:secret   "..."            (secret : ne pas le mettre dans un fichier versionné)
//   set syntra_bridge:radius   50
const cfg = {
  url: GetConvar('syntra_bridge:url', '').replace(/\/+$/, ''),
  keyId: GetConvar('syntra_bridge:keyId', ''),
  secret: GetConvar('syntra_bridge:secret', ''),
  radius: GetConvarInt('syntra_bridge:radius', 50),
  pollWaitSec: 20,
  debug: GetConvarInt('syntra_bridge:debug', 0) === 1,
};

const log = (...a) => console.log('^5[bot_bridge]^7', ...a);
const debug = (...a) => cfg.debug && log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function start() {
  // ---------------------------------------------------------------- HTTP signé
  function request(method, pathQuery, bodyObj, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const body = bodyObj === undefined ? '' : JSON.stringify(bodyObj);
      const headers = lib.signedHeaders({ keyId: cfg.keyId, secret: cfg.secret, method, pathQuery, body });
      const target = new URL(cfg.url + pathQuery);
      const mod = target.protocol === 'https:' ? https : http;
      const req = mod.request(target, { method, headers: { ...headers, 'content-length': Buffer.byteLength(body) }, timeout: timeoutMs }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString('utf8'), headers: res.headers, nonce: headers['x-syntra-nonce'] });
        });
      });
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', reject);
      req.end(body);
    });
  }

  // ---------------------------------------------------------------- collecte du contexte joueur
  function identifiersOf(src) {
    const ids = GetPlayerIdentifiers(String(src));
    const pick = (p) => ids.find((i) => i.startsWith(p));
    const license2 = pick('license2:');
    const license = pick('license:');
    return { primary: license2 || license, all: [license2, license].filter(Boolean), discordId: lib.stripPrefix(pick('discord:'), 'discord:') };
  }

  function uidOf(src) {
    // UID persistant fourni par syntra-admin si présent (sinon omis)
    try {
      if (GetResourceState('syntra-admin') === 'started') return exports['syntra-admin'].GetUid(src) || undefined;
    } catch (_) {
      /* ressource absente ou export indisponible */
    }
    return undefined;
  }

  function buildReport(src, reason, meta) {
    const ped = GetPlayerPed(String(src));
    const [x, y, z] = GetEntityCoords(ped);
    const vehicle = GetVehiclePedIsIn(ped, false);
    const ids = identifiersOf(src);
    const others = GetPlayers()
      .filter((p) => Number(p) !== Number(src))
      .map((p) => {
        const [px, py, pz] = GetEntityCoords(GetPlayerPed(p));
        return { serverId: Number(p), name: GetPlayerName(p) || String(p), x: px, y: py, z: pz };
      });
    const uid = uidOf(src);
    return {
      identifier: ids.primary,
      identifiers: ids.all,
      ...(ids.discordId ? { discordId: ids.discordId } : {}),
      serverId: Number(src),
      ...(uid ? { uid } : {}),
      ...(meta && meta.reportId ? { externalId: String(meta.reportId) } : {}),
      reason: String(reason).slice(0, 1000),
      coords: { x, y, z },
      health: GetEntityHealth(ped),
      armor: GetPedArmour(ped),
      weapon: lib.weaponName(GetSelectedPedWeapon(ped)),
      vehicle: vehicle && vehicle !== 0 ? (GetVehicleNumberPlateText(vehicle) || '').trim() || 'vehicle' : null,
      nearby: lib.nearbyPlayers({ x, y, z }, others, cfg.radius),
    };
  }

  // ---------------------------------------------------------------- reports (miroir du système en jeu -> Discord)
  // Les reports sont créés EN JEU uniquement (syntra-admin). Le bridge reçoit des événements de syntra-admin
  // et les transmet à Discord ; inversement il applique en jeu les actions faites par le staff sur Discord.
  const suppress = lib.createSuppressor();
  const serial = lib.createSerialQueue();

  /** POST avec 3 essais ; les événements d'un même flux restent ordonnés (file sérielle) */
  function send(path, body) {
    return serial(async () => {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const res = await request('POST', path, body);
          if (res.status === 202 || res.status === 200) return true;
          if (res.status >= 400 && res.status < 500 && res.status !== 429) {
            log('^1refusé par l\'API^7', path, res.status, res.text.slice(0, 200));
            return false;
          }
        } catch (e) {
          debug('échec', path, attempt, e.message);
        }
        await sleep(1000 * 2 ** attempt);
      }
      return false;
    });
  }

  // syntra-admin: TriggerEvent('syntra-admin:reportCreated', id, src, text)
  on('syntra-admin:reportCreated', (id, src, text) => {
    // le premier message du joueur (= le motif) est déjà dans l'embed : ne pas le dupliquer dans le fil
    suppress.mark(lib.eventKey(id, 'player', text));
    send('/v1/bridge/report', buildReport(Number(src), text, { reportId: id }));
  });

  // syntra-admin: TriggerEvent('syntra-admin:reportMessage', id, kind, author, text)  (kind = player | staff)
  on('syntra-admin:reportMessage', (id, kind, author, text) => {
    if (suppress.consume(lib.eventKey(id, kind, text))) return;
    send('/v1/bridge/report/event', { externalId: String(id), type: 'message', kind, author: String(author).slice(0, 80), text: String(text).slice(0, 1000) });
  });

  // syntra-admin: TriggerEvent('syntra-admin:reportStatus', id, action, author, text)  (action = claim | release | close)
  on('syntra-admin:reportStatus', (id, action, author, text) => {
    send('/v1/bridge/report/event', { externalId: String(id), type: action, kind: 'system', author: String(author).slice(0, 80), text: String(text || '').slice(0, 1000) });
  });

  /** Action de staff faite sur Discord -> appliquée au report en jeu via l'export de syntra-admin */
  function handleReportCommand(cmd) {
    const id = Number(cmd.externalId);
    if (!Number.isInteger(id)) return;
    if (GetResourceState('syntra-admin') !== 'started') return log('^3syntra-admin indisponible : action de report ignorée^7', cmd.id);
    // Anti-écho : le jeu va émettre syntra-admin:reportMessage pour ce texte
    if (cmd.action === 'message') suppress.mark(lib.eventKey(id, 'staff', cmd.text || ''));
    try {
      const [ok, err] = exports['syntra-admin'].ReportFromDiscord(cmd.action, id, cmd.actor, { text: cmd.text, resolution: cmd.text });
      if (ok === false) log('^3action de report refusée par syntra-admin^7', cmd.action, id, err);
    } catch (e) {
      log('^1ReportFromDiscord indisponible (patch syntra-admin appliqué ?)^7', e.message);
    }
  }

  // ---------------------------------------------------------------- liaison Discord <-> identifiants (à la connexion)
  on('playerJoining', () => {
    const ids = identifiersOf(Number(global.source));
    if (!ids.discordId || ids.all.length === 0) return;
    request('POST', '/v1/bridge/link', { discordId: ids.discordId, identifiers: ids.all }).catch((e) => debug('link échec', e.message));
  });

  // ---------------------------------------------------------------- téléportation staff (commandes reçues par long-polling)
  function findSourceByIdentifier(identifier) {
    for (const p of GetPlayers()) if (GetPlayerIdentifiers(p).includes(identifier)) return Number(p);
    return null;
  }

  function handleTeleport(cmd) {
    const staff = findSourceByIdentifier(cmd.staffIdentifier);
    const target = findSourceByIdentifier(cmd.targetIdentifier);
    if (!staff || !target) return debug('téléportation ignorée : joueur hors ligne', cmd.id);
    // Même bucket que la cible : sinon le staff arrive dans un autre monde (lieux privés, instances)
    const bucket = GetPlayerRoutingBucket(String(target));
    if (GetPlayerRoutingBucket(String(staff)) !== bucket) SetPlayerRoutingBucket(String(staff), bucket);
    const [x, y, z] = GetEntityCoords(GetPlayerPed(String(target)));
    SetEntityCoords(GetPlayerPed(String(staff)), x + 1.0, y, z + 0.5, false, false, false, false);
    log('téléportation', cmd.id, 'staff', staff, '->', target);
  }

  async function pollLoop() {
    let failures = 0;
    for (;;) {
      const pathQuery = `/v1/bridge/poll?wait=${cfg.pollWaitSec}`;
      try {
        const res = await request('GET', pathQuery, undefined, (cfg.pollWaitSec + 10) * 1000);
        if (res.status !== 200) throw new Error('HTTP ' + res.status);
        const ok = lib.verifyResponse({
          secret: cfg.secret, nonce: res.nonce, pathQuery, body: res.text,
          timestamp: res.headers['x-syntra-response-timestamp'], signature: res.headers['x-syntra-response-signature'],
        });
        if (!ok) throw new Error('signature de réponse invalide (API usurpée ?)');
        for (const cmd of JSON.parse(res.text).commands || []) {
          if (cmd.type === 'teleport') handleTeleport(cmd);
          else if (cmd.type === 'report') handleReportCommand(cmd);
        }
        failures = 0;
      } catch (e) {
        failures++;
        if (failures === 1 || failures % 10 === 0) log('^3poll échec^7', e.message);
        await sleep(Math.min(30000, 1000 * 2 ** Math.min(failures, 5)));
      }
    }
  }

  pollLoop();
  log('démarré -> ' + cfg.url);
}

if (!cfg.url || !cfg.keyId || !cfg.secret) {
  log('^1Configuration incomplète (syntra_bridge:url / keyId / secret) : le bridge est désactivé.^7');
} else if (!/^https:\/\//.test(cfg.url) && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(cfg.url)) {
  log('^1syntra_bridge:url doit être en https (http toléré uniquement en local).^7');
} else {
  start();
}
