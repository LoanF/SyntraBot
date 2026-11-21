#!/usr/bin/env bash
# Déploiement de Syntra sur le serveur (appelé par le workflow GitHub, ou à la main : bash deploy/deploy.sh).
#   1. sauvegarde de la base      4. attente de santé : API, dashboard, bot
#   2. build des images (tag = SHA)   5. échec => retour automatique à la version précédente
#   3. migrations puis démarrage       6. nettoyage des anciennes images
set -euo pipefail
cd "$(dirname "$0")/.."

export ENV_FILE="${ENV_FILE:-/opt/syntra/.env.prod}"   # secrets : sur le serveur uniquement, jamais dans Git
export COMPOSE_PROJECT_NAME=syntra                     # mêmes volumes quel que soit le dossier du runner
STATE_DIR="${STATE_DIR:-/opt/syntra/.deploy}"
BACKUP_DIR="${BACKUP_DIR:-/opt/syntra/backups}"
SHA="${GITHUB_SHA:-$(git rev-parse HEAD)}"
NEW="${SHA:0:12}"
DC=(docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE")

mkdir -p "$STATE_DIR" "$BACKUP_DIR"
[ -f "$ENV_FILE" ] || { echo "❌ $ENV_FILE introuvable : créez-le à partir de .env.prod.example"; exit 1; }
PREV="$(cat "$STATE_DIR/current" 2>/dev/null || true)"
echo "▶ Déploiement $NEW (version actuelle : ${PREV:-aucune})"

# ---------------------------------------------------------------- 1. sauvegarde avant migration
if "${DC[@]}" ps --status running --services 2>/dev/null | grep -qx postgres; then
  echo "💾 Sauvegarde de la base…"
  "${DC[@]}" exec -T postgres pg_dump -U syntra syntra | gzip > "$BACKUP_DIR/pre-$NEW.sql.gz"
  ls -1t "$BACKUP_DIR"/pre-*.sql.gz | tail -n +11 | xargs -r rm -f   # garde les 10 dernières
fi

# ---------------------------------------------------------------- 2. build
export IMAGE_TAG="$NEW"
echo "🏗️  Build des images…"
"${DC[@]}" build

# ---------------------------------------------------------------- 3. démarrage (le service migrate passe avant le reste)
echo "🔄 Démarrage…"
"${DC[@]}" up -d --remove-orphans

# ---------------------------------------------------------------- 4. santé
wait_for() { # nom, commande, essais
  local name="$1" cmd="$2" tries="${3:-30}"
  for i in $(seq 1 "$tries"); do
    if eval "$cmd" >/dev/null 2>&1; then echo "✅ $name"; return 0; fi
    echo "⏳ $name ($i/$tries)"; sleep 3
  done
  echo "❌ $name ne répond pas"; return 1
}

healthy() {
  wait_for "API"       "${DC[*]} exec -T api node -e \"fetch('http://localhost:4000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\"" &&
  wait_for "Dashboard" "${DC[*]} exec -T web node -e \"fetch('http://localhost:3000/login').then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))\"" &&
  wait_for "Bot"       "${DC[*]} logs --since 3m bot 2>&1 | grep -q 'bot pr'" 40
}

rollback() {
  echo "📋 Journaux récents :"
  "${DC[@]}" logs --tail 40 api web bot 2>&1 || true
  if [ -n "$PREV" ]; then
    echo "⏪ Retour à la version $PREV (les migrations de base ne sont pas annulées : elles doivent rester compatibles)"
    IMAGE_TAG="$PREV" "${DC[@]}" up -d --no-build --remove-orphans || true
  fi
  exit 1
}

if ! healthy; then rollback; fi

# ---------------------------------------------------------------- 5. mémorise + nettoyage
echo "$NEW" > "$STATE_DIR/current"
[ -n "$PREV" ] && echo "$PREV" > "$STATE_DIR/previous"
docker image prune -f --filter "until=168h" >/dev/null || true
echo "🎉 Syntra $NEW déployé"
