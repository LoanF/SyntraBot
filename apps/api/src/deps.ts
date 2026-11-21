import type { PrismaClient } from '@syntra/db';
import type { AuditService, BridgeCommands, ConfigService, DiscordActions, JobQueue } from '@syntra/core';
import type { Cipher, NonceStore } from '@syntra/security';

export interface RateLimiter {
  allow(key: string, limit: number, windowMs?: number): Promise<boolean>;
}

/** Toutes les dépendances externes sont injectées : les tests substituent Discord/Redis. */
export interface AppDeps {
  prisma: PrismaClient;
  config: ConfigService;
  discord: DiscordActions;
  cipher: Cipher;
  nonces: NonceStore;
  limiter: RateLimiter;
  jobs: JobQueue;
  bridge: BridgeCommands;
  audit: AuditService;
}

export interface AuthInfo {
  projectId: string;
  keyId: string;
  secret: string;
  nonce: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    rawBody: Buffer;
    auth?: AuthInfo;
  }
}
