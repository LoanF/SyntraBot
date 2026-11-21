'use strict';
// Logique pure (aucune native FiveM) : testée côté monorepo contre @syntra/security.
const { createHash, createHmac, timingSafeEqual } = require('crypto');

const MAX_SKEW_SECONDS = 300;

function canonicalPathQuery(pathQuery) {
  const q = pathQuery.indexOf('?');
  if (q === -1) return pathQuery;
  const params = new URLSearchParams(pathQuery.slice(q + 1));
  const sorted = [...params.entries()].sort(([a, av], [b, bv]) => (a === b ? av.localeCompare(bv) : a.localeCompare(b)));
  const qs = new URLSearchParams(sorted).toString();
  return qs ? pathQuery.slice(0, q) + '?' + qs : pathQuery.slice(0, q);
}

function sign(secret, { timestamp, nonce, method, pathQuery, body }) {
  const bodyHash = createHash('sha256').update(body).digest('hex');
  const message = [timestamp, nonce, method.toUpperCase(), canonicalPathQuery(pathQuery), bodyHash].join('\n');
  return createHmac('sha256', secret).update(message).digest('hex');
}

function safeEqualHex(a, b) {
  if (!/^[0-9a-f]+$/i.test(a) || !/^[0-9a-f]+$/i.test(b)) return false;
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && timingSafeEqual(x, y);
}

/** En-têtes d'une requête signée vers l'API Syntra */
function signedHeaders({ keyId, secret, method, pathQuery, body, now = Date.now(), nonce }) {
  const timestamp = Math.floor(now / 1000);
  const n = nonce || require('crypto').randomBytes(12).toString('hex');
  return {
    'content-type': 'application/json',
    'x-syntra-key-id': keyId,
    'x-syntra-timestamp': String(timestamp),
    'x-syntra-nonce': n,
    'x-syntra-signature': sign(secret, { timestamp, nonce: n, method, pathQuery, body }),
  };
}

/** Le bridge authentifie le SERVEUR : la réponse est signée avec le même secret, liée au nonce de la requête. */
function verifyResponse({ secret, nonce, pathQuery, body, timestamp, signature, now = Date.now() }) {
  const ts = Number(timestamp);
  if (!Number.isInteger(ts) || Math.abs(now / 1000 - ts) > MAX_SKEW_SECONDS) return false;
  if (!signature) return false;
  const expected = sign(secret, { timestamp: ts, nonce, method: 'RESPONSE', pathQuery, body });
  return safeEqualHex(expected, signature);
}

const UNARMED = -1569615261;
function weaponName(hash) {
  return hash === 0 || hash === UNARMED ? null : String(hash);
}

function stripPrefix(identifier, prefix) {
  return identifier && identifier.startsWith(prefix) ? identifier.slice(prefix.length) : null;
}

/** Joueurs situés dans le rayon (mètres) autour de `origin`, triés par distance */
function nearbyPlayers(origin, players, radius, limit = 100) {
  return players
    .map((p) => ({ serverId: p.serverId, name: p.name, distance: Math.hypot(p.x - origin.x, p.y - origin.y, p.z - origin.z) }))
    .filter((p) => p.distance <= radius)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit)
    .map((p) => ({ ...p, distance: Math.round(p.distance * 10) / 10 }));
}

module.exports = { canonicalPathQuery, sign, safeEqualHex, signedHeaders, verifyResponse, weaponName, stripPrefix, nearbyPlayers, MAX_SKEW_SECONDS };

/**
 * Anti-écho : quand une action vient de Discord et est appliquée en jeu, le jeu émet à son tour l'événement
 * correspondant. On mémorise brièvement la clé pour ne pas le renvoyer vers Discord (boucle).
 */
function createSuppressor(ttlMs = 30000, now = () => Date.now()) {
  const marks = new Map();
  const purge = () => {
    const t = now();
    for (const [k, exp] of marks) if (exp <= t) marks.delete(k);
  };
  return {
    mark(key) {
      purge();
      marks.set(key, now() + ttlMs);
    },
    /** true (et retire la marque) si la clé était marquée */
    consume(key) {
      purge();
      return marks.delete(key);
    },
  };
}

const eventKey = (externalId, kind, text) => `${externalId}|${kind}|${String(text).trim()}`;

/** Sérialise des tâches asynchrones (ordre des événements d'un report préservé) */
function createSerialQueue() {
  let tail = Promise.resolve();
  return (task) => {
    tail = tail.then(task, task).catch(() => undefined);
    return tail;
  };
}

Object.assign(module.exports, { createSuppressor, eventKey, createSerialQueue });
