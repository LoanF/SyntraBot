import type { Redis } from 'ioredis';
import type { NonceStore } from '@syntra/security';

export class RedisNonceStore implements NonceStore {
  constructor(private redis: Redis) {}
  async claim(key: string, ttlSeconds: number): Promise<boolean> {
    return (await this.redis.set(key, '1', 'EX', ttlSeconds, 'NX')) === 'OK';
  }
}

/** Fenêtre glissante (ZSET). Retourne true si la requête est autorisée. */
export class RedisRateLimiter {
  constructor(private redis: Redis) {}
  async allow(key: string, limit: number, windowMs = 60_000): Promise<boolean> {
    const now = Date.now();
    const k = `rl:${key}`;
    const res = await this.redis
      .multi()
      .zremrangebyscore(k, 0, now - windowMs)
      .zadd(k, now, `${now}-${Math.random()}`)
      .zcard(k)
      .pexpire(k, windowMs)
      .exec();
    const count = Number(res?.[2]?.[1] ?? 0);
    return count <= limit;
  }
}
