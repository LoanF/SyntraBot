# Déploiement (Docker Compose)

Un seul serveur suffit : Postgres, Redis, le bot, l API, le dashboard et Caddy (relais HTTP interne ; le TLS est géré par le reverse proxy HAProxy, voir CI-CD.md).

## 1. Préparer
1. Deux noms DNS pointant vers le serveur : `WEB_DOMAIN` (dashboard) et `API_DOMAIN` (API signée, bridge FiveM, site vitrine).
2. `cp .env.prod.example .env.prod` puis remplir. Secrets : `openssl rand -base64 32` (clé `MASTER_KEYS`, `AUTH_SECRET`, mot de passe Postgres).
3. Portail développeur Discord : activer les intents privilégiés **SERVER MEMBERS** et **MESSAGE CONTENT**, ajouter le redirect OAuth `https://<WEB_DOMAIN>/api/auth/callback/discord`.

## 2. Lancer
```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
docker compose -f docker-compose.prod.yml run --rm bot /app/node_modules/.bin/tsx src/register-commands.ts   # commandes slash (une fois / à chaque changement)
```
Les migrations tournent automatiquement (service `migrate`) avant le démarrage du bot, de l'API et du dashboard.

## 3. Brancher le serveur de jeu
Dashboard › Clés API : créer une clé (`bridge:report`, `bridge:poll`, `bridge:link`), puis suivre `integrations/fivem/bot_bridge/README.md` avec `syntra_bridge:url https://<API_DOMAIN>`.

## Exploitation
- **Sauvegarde** : volume `pgdata` (Postgres). Aucun fichier n'est stocké : les joueurs envoient des liens.
- **Rotation de la clé de chiffrement** : ajouter `k2:…` à `MASTER_KEYS`, passer `MASTER_KEY_CURRENT=k2`, redéployer ; l'ancienne clé reste valable en lecture.
- **Mise à jour** : `git pull && docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build`.
- **Limite actuelle** : le bot n'a pas de healthcheck HTTP.
