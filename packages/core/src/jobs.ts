import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import type { ReportEvent, ReportPayload } from './types';

/** Jobs envoyés par l'API au bot (qui seul possède la gateway et la logique tickets). */
export type ActionJob =
  | { type: 'report.create'; projectId: string; report: ReportPayload }
  | { type: 'report.event'; projectId: string; event: ReportEvent };

export interface JobQueue {
  enqueue(job: ActionJob): Promise<void>;
}

export const ACTION_QUEUE = 'syntra-actions';

export class BullJobQueue implements JobQueue {
  private queue: Queue;
  constructor(redisUrl: string) {
    this.queue = new Queue(ACTION_QUEUE, {
      connection: new Redis(redisUrl, { maxRetriesPerRequest: null }),
      defaultJobOptions: { attempts: 5, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: 1000, removeOnFail: 5000 },
    });
  }
  async enqueue(job: ActionJob) {
    await this.queue.add(job.type, job);
  }
  async close() {
    await this.queue.close();
  }
}

// ----------------------------- Bridge FiveM (commandes sortantes) -----------------------------

export type BridgeCommand =
  | {
      id: string;
      type: 'teleport';
      /** Joueur à rejoindre (identifier) et staff qui se téléporte (identifier) */
      targetIdentifier: string;
      staffIdentifier: string;
      expiresAt: number; // epoch ms
    }
  | {
      /** Action de staff faite sur Discord, à appliquer au report en jeu (syntra-admin) */
      id: string;
      type: 'report';
      action: 'message' | 'claim' | 'release' | 'close';
      externalId: string;
      actor: { id: string; name: string };
      /** message : le texte ; close : la résolution */
      text?: string;
      expiresAt: number;
    };

export interface BridgeCommands {
  push(projectId: string, cmd: BridgeCommand): Promise<void>;
  /** Long-polling : attend jusqu'à `timeoutSec` des commandes non expirées */
  pop(projectId: string, timeoutSec: number): Promise<BridgeCommand[]>;
}

export class RedisBridgeCommands implements BridgeCommands {
  constructor(private redis: Redis) {}
  private key = (projectId: string) => `bridge:cmd:${projectId}`;

  async push(projectId: string, cmd: BridgeCommand) {
    await this.redis.lpush(this.key(projectId), JSON.stringify(cmd));
    await this.redis.expire(this.key(projectId), 3600);
  }

  async pop(projectId: string, timeoutSec: number): Promise<BridgeCommand[]> {
    const conn = this.redis.duplicate(); // BRPOP bloque la connexion
    try {
      const out: BridgeCommand[] = [];
      let first = await conn.brpop(this.key(projectId), timeoutSec);
      while (first) {
        const cmd = JSON.parse(first[1]) as BridgeCommand;
        if (cmd.expiresAt > Date.now()) out.push(cmd);
        const next = await conn.rpop(this.key(projectId));
        first = next ? [this.key(projectId), next] : null;
      }
      return out;
    } finally {
      conn.disconnect();
    }
  }
}
