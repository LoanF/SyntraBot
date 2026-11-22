#!/usr/bin/env bash
# Raccourci d'exploitation : docker compose de la pile de production, avec les bons réglages.
# Exemples : bash deploy/compose.sh ps | logs -f bot | up -d web | run --rm --no-deps bot /app/node_modules/.bin/tsx src/register-commands.ts
set -euo pipefail
cd "$(dirname "$0")/.."
export ENV_FILE="${ENV_FILE:-/opt/syntra/.env.prod}"
export COMPOSE_PROJECT_NAME=syntra
# Version actuellement déployée (sinon « latest », qui n'existe pas et déclencherait un build)
IMAGE_TAG="$(cat /opt/syntra/.deploy/current 2>/dev/null || echo latest)"
export IMAGE_TAG
exec docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE" "$@"
