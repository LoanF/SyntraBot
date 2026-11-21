/**
 * Point d'entrée pour le dashboard : sans la file de jobs (bullmq) ni ce qui n'est utile qu'au bot / à l'API.
 * `import … from '@syntra/core/web'`
 */
export * from './bus';
export * from './audit';
export * from './discord/actions';
export * from './modules/registry';
export * from './net';
export * from './fivem/player-lookup';
