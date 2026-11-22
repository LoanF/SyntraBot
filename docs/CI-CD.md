# CI / CD et mise en place du serveur

Même principe que LSPD-Tool : un **runner GitHub auto-hébergé** installé sur le serveur fait tout (vérifications puis déploiement), sans consommer de minutes GitHub. Les vérifications (typecheck, tests, build) utilisent des bases jetables en conteneurs ; le déploiement passe par Docker Compose, avec sauvegarde de la base et retour arrière automatique.

```
pull request ─► verify (typecheck · tests · build)                  [runner « syntra », bases jetables]
push sur main ─► verify ─► deploy (runner « syntra » sur le LXC) :
                           sauvegarde base ► build des images (tag = SHA) ► migrations + démarrage
                           ► santé API / dashboard / bot ► OK : mémorise  |  KO : retour à la version précédente
```

Fichiers : `.github/workflows/ci-cd.yml`, `deploy/deploy.sh` (toute la logique, utilisable à la main), `docker-compose.prod.yml`, `deploy/Caddyfile`, `.env.prod.example`.

## Pourquoi un LXC dédié (et pas avec LSPD-Tool)

Syntra manipule des secrets de tiers (token du bot, clés de chiffrement, mots de passe RCON, bases FiveM des clients) : une faille ou un mauvais déploiement de l'autre projet ne doit pas y donner accès, et un build ou une mise à jour Docker ne doit pas couper l'autre service. Sur Proxmox, un LXC en plus coûte presque rien.

## 1. Créer le LXC (Proxmox)

Interface : *Create CT* › template Debian 12, **unprivileged**, 4 cœurs, 6144 Mo de RAM, 512 Mo de swap, 25 Go de disque, une IP fixe. Puis *Options › Features* : cocher **nesting** et **keyctl** (indispensables pour Docker). Cocher *Start at boot*.

Ou en ligne de commande, sur l'hôte Proxmox (adaptez l'ID, le stockage et le nom du template, listé par `pveam available | grep debian-12`) :

```bash
pveam update
pct create 210 local:vztmpl/debian-12-standard_12.7-1_amd64.tar.zst \
  --hostname syntra --cores 4 --memory 6144 --swap 512 \
  --rootfs local-lvm:25 --net0 name=eth0,bridge=vmbr0,ip=dhcp \
  --unprivileged 1 --features nesting=1,keyctl=1 --onboot 1
pct start 210
pct enter 210
```

## 2. Préparer le système (dans le LXC, en root)

```bash
apt update && apt -y upgrade
apt -y install curl ca-certificates git sudo ufw openssl
curl -fsSL https://get.docker.com | sh
adduser --disabled-password --gecos "" runner
usermod -aG docker runner
mkdir -p /opt/syntra/backups && chown -R runner:runner /opt/syntra
ufw allow OpenSSH && ufw allow from <IP_DE_HAPROXY> to any port 8080 proto tcp && ufw --force enable
```

Vérification : `docker run --rm hello-world` doit afficher « Hello from Docker ».

## 3. Réseau et DNS

- Créez deux enregistrements DNS **A** vers l'IP publique : `console.votre-domaine.fr` (dashboard) et `api.votre-domaine.fr` (API signée, bridge FiveM, site vitrine).
- Le TLS est géré par **HAProxy** (votre machine `proxy`). Le Caddy de la pile n'est qu'un relais HTTP interne : il écoute sur le port `HTTP_PORT` du LXC (8080 par défaut), sans certificat. Seul HAProxy doit pouvoir l'atteindre (règle `ufw` ci-dessus).
- Certificat : sur le proxy, `certbot certonly --dns-cloudflare -d console.votre-domaine.fr -d api.votre-domaine.fr` (aucun port à ouvrir), puis concaténer `fullchain.pem` et `privkey.pem` dans le `.pem` lu par HAProxy (hook de renouvellement `--deploy-hook`).
- Configuration HAProxy (frontend 443 existant, à adapter) :

```
frontend https
    bind :443 ssl crt /etc/haproxy/certs/
    http-request set-header X-Forwarded-Proto https
    acl host_syntra_web hdr(host) -i console.votre-domaine.fr
    acl host_syntra_api hdr(host) -i api.votre-domaine.fr
    use_backend syntra if host_syntra_web || host_syntra_api

backend syntra
    option forwardfor
    timeout server 45s          # le long-polling du bridge FiveM dure jusqu'à ~25 s
    server lxc <IP_DU_LXC>:8080 check
```

## 4. Fichier de secrets (sur le serveur uniquement)

Il n'est jamais dans Git ni dans GitHub. Partez de `.env.prod.example` :

```bash
sudo -u runner nano /opt/syntra/.env.prod
chmod 600 /opt/syntra/.env.prod
```

À remplir (générez chaque secret avec `openssl rand -base64 32`) :

| Variable | Valeur |
|---|---|
| `WEB_DOMAIN`, `API_DOMAIN` | les deux noms DNS ci-dessus |
| `POSTGRES_PASSWORD` | un mot de passe fort ; **le même** dans `DATABASE_URL` |
| `DATABASE_URL` | `postgresql://syntra:<POSTGRES_PASSWORD>@postgres:5432/syntra` |
| `REDIS_URL` | `redis://redis:6379` |
| `MASTER_KEYS`, `MASTER_KEY_CURRENT` | `k1:<32 octets en base64>` et `k1`. **Sauvegardez cette clé ailleurs** : sans elle, les secrets chiffrés (clés API, RCON, bases FiveM) sont perdus. |
| `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | portail Discord, même application |
| `AUTH_SECRET` | un secret aléatoire |
| `AUTH_URL` | `https://<WEB_DOMAIN>` |
| `API_PORT` | `4000` |

Ne définissez **jamais** `AUTH_DEV_BYPASS` en production.

## 5. Installer le runner auto-hébergé

C'est le même mécanisme que pour LSPD-Tool : un petit service installé sur le serveur qui va chercher les jobs de GitHub (connexion sortante, aucun port à ouvrir).

1. Sur GitHub : dépôt › *Settings › Actions › Runners › New self-hosted runner* › **Linux / x64**. GitHub affiche des commandes avec un **token temporaire** : gardez la page ouverte.
2. Dans le LXC :

```bash
sudo -iu runner
mkdir actions-runner && cd actions-runner
# collez ici les commandes "Download" de GitHub (curl + tar), puis :
./config.sh --url https://github.com/<vous>/Syntra --token <TOKEN_AFFICHÉ> \
  --labels syntra --name syntra-lxc --unattended
exit
```

3. Installez-le comme service (démarre au boot) :

```bash
cd /home/runner/actions-runner
./svc.sh install runner
./svc.sh start
./svc.sh status
```

Le runner doit apparaître **Idle** (vert) dans GitHub. Le label `syntra` est celui qu'attend le workflow.

## 6. Réglages GitHub

- *Settings › Environments › New environment* : `production`. Vous pouvez y exiger une **validation manuelle** avant chaque déploiement.
- *Settings › Branches* (ou *Rulesets*) : protégez `main` et exigez la réussite du job « 🔍 Typecheck, tests, build » avant fusion.
- Sécurité : le déploiement ne se lance que sur un push vers `main`, jamais sur une pull request. Ne changez pas ça : un runner auto-hébergé ne doit pas exécuter du code venant d'un fork.

## 7. Portail Discord (une fois)

- *OAuth2 › Redirects* : `https://<WEB_DOMAIN>/api/auth/callback/discord`.
- *Bot* : activer les intents **SERVER MEMBERS** et **MESSAGE CONTENT**.
- Inviter le bot sur vos serveurs avec les permissions nécessaires (gérer les salons et les rôles, envoyer des messages, voir les salons).

## 8. Premier déploiement

Poussez sur `main` (ou *Actions › Run workflow*). Le premier build prend 5 à 10 minutes. Ensuite :

1. Ouvrez `https://<WEB_DOMAIN>`, connectez-vous avec Discord, créez votre projet, rattachez vos serveurs.
2. Enregistrez les commandes slash (une fois, puis à chaque changement de commande) :

```bash
cd /home/runner/actions-runner/_work/SyntraBot/SyntraBot
bash deploy/compose.sh run --rm --no-deps bot /app/node_modules/.bin/tsx src/register-commands.ts
```

3. Dashboard › Clés API : créez la clé du bridge (`bridge:report`, `bridge:poll`, `bridge:link`), puis suivez `integrations/fivem/bot_bridge/README.md` avec `syntra_bridge:url https://<API_DOMAIN>`.

## Exploitation

- **Retour arrière** : si l'API, le dashboard ou le bot ne répondent pas après un déploiement, le script relance la version précédente. Les migrations de base ne sont **pas** annulées : écrivez-les compatibles avec l'ancienne version (ajouter avant de supprimer). La sauvegarde `/opt/syntra/backups/pre-<sha>.sql.gz` (10 dernières gardées) permet de restaurer.
- **Sauvegarde quotidienne** (en plus de celle d'avant déploiement), à copier aussi hors du serveur :

```bash
( crontab -u runner -l 2>/dev/null; echo '0 3 * * * docker exec syntra-postgres-1 pg_dump -U syntra syntra | gzip > /opt/syntra/backups/daily-$(date +\%F).sql.gz' ) | crontab -u runner -
```

- **Restaurer** : `gunzip -c backup.sql.gz | docker exec -i syntra-postgres-1 psql -U syntra syntra`.
- **Commandes Docker** : `bash deploy/compose.sh ps`, `bash deploy/compose.sh logs -f bot api web`, `bash deploy/compose.sh up -d web` (après modification de `.env.prod`). Le script fournit le fichier de secrets et la version déployée.
- **Déploiement manuel** : « Run workflow » dans l'onglet Actions, ou `bash deploy/deploy.sh` dans le dépôt du runner.
- **Mises à jour du système** : `apt upgrade` dans le LXC, puis redémarrez la pile avec le workflow. Surveillez la mise à jour du runner (GitHub la fait seul, mais le service doit rester actif).
