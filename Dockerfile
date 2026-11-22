# syntax=docker/dockerfile:1.7
# Image unique à plusieurs cibles : `--target bot | api | web | migrate`.
# Le monorepo publie ses paquets internes en TypeScript : bot et api tournent via tsx, le web est compilé par Next.

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1 CI=1
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && corepack enable && corepack prepare pnpm@12.18.0 --activate
WORKDIR /app

# ---- dépendances (cache stable tant que les manifests ne changent pas)
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/security/package.json packages/security/
COPY packages/db/package.json packages/db/
COPY packages/core/package.json packages/core/
COPY packages/ui/package.json packages/ui/
COPY apps/bot/package.json apps/bot/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY integrations/fivem/bot_bridge/package.json integrations/fivem/bot_bridge/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# ---- sources + client Prisma généré
FROM deps AS build
COPY . .
RUN pnpm --filter @syntra/db generate

# ---- migrations (one-shot)
FROM build AS migrate
CMD ["pnpm", "--filter", "@syntra/db", "migrate:deploy"]

# ---- bot Discord
FROM build AS bot
ENV NODE_ENV=production
WORKDIR /app/apps/bot
USER node
# Binaire direct : pas de corepack au démarrage (l'utilisateur node n'a pas pnpm en cache)
CMD ["/app/node_modules/.bin/tsx", "src/main.ts"]

# ---- API Fastify
FROM build AS api
ENV NODE_ENV=production
EXPOSE 4000
WORKDIR /app/apps/api
USER node
CMD ["/app/node_modules/.bin/tsx", "src/main.ts"]

# ---- dashboard Next.js
FROM build AS web-build
ENV NODE_ENV=production
RUN pnpm --filter @syntra/web build

FROM web-build AS web
ENV NODE_ENV=production
EXPOSE 3000
WORKDIR /app/apps/web
# Next écrit son cache d'images optimisées dans .next/cache : le dossier doit appartenir à l'utilisateur non-root
RUN mkdir -p .next/cache && chown -R node:node .next/cache
USER node
CMD ["node_modules/.bin/next", "start", "-p", "3000"]
