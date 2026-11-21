import { Redis } from 'ioredis';

/** Bus d'invalidation de configuration : le dashboard publie, bot et API purgent leur cache. */
export interface ConfigBus {
  publish(projectId: string): Promise<void>;
  subscribe(handler: (projectId: string) => void): Promise<void>;
  close(): Promise<void>;
}

const CHANNEL = 'syntra:config:invalidate';

export class RedisConfigBus implements ConfigBus {
  private pub: Redis;
  private sub: Redis;
  constructor(url: string) {
    this.pub = new Redis(url, { maxRetriesPerRequest: 2 });
    this.sub = new Redis(url);
  }
  async publish(projectId: string) {
    await this.pub.publish(CHANNEL, projectId);
  }
  async subscribe(handler: (projectId: string) => void) {
    await this.sub.subscribe(CHANNEL);
    this.sub.on('message', (_ch, msg) => handler(msg));
  }
  async close() {
    this.pub.disconnect();
    this.sub.disconnect();
  }
}

/** Implémentation locale (tests / mono-processus) */
export class LocalConfigBus implements ConfigBus {
  private handlers: ((id: string) => void)[] = [];
  async publish(projectId: string) {
    this.handlers.forEach((h) => h(projectId));
  }
  async subscribe(handler: (projectId: string) => void) {
    this.handlers.push(handler);
  }
  async close() {
    this.handlers = [];
  }
}
