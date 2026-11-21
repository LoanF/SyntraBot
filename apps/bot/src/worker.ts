import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { ACTION_QUEUE, type ActionJob } from '@syntra/core';
import type { BotContext } from './context';

/** Consomme les jobs envoyés par l'API. Une exception = nouvel essai (backoff exponentiel, 5 tentatives). */
export function startWorker(ctx: BotContext, redisUrl: string) {
  const worker = new Worker<ActionJob>(
    ACTION_QUEUE,
    async (job) => {
      const data = job.data;
      switch (data.type) {
        case 'report.create':
          return ctx.reports.create(data.projectId, data.report);
        case 'report.event':
          return ctx.reports.onGameEvent(data.projectId, data.event);
      }
    },
    { connection: new Redis(redisUrl, { maxRetriesPerRequest: null }), concurrency: 4 },
  );
  worker.on('failed', (job, err) => ctx.log.error({ err, job: job?.id, attempts: job?.attemptsMade }, 'job en échec'));
  return worker;
}
