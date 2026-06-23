import Redis from 'ioredis';
import { createRequire } from 'module';
import type { Env } from '../config/env.js';

const require = createRequire(import.meta.url);

// Factory aislado para poder inyectar un mock en tests via el parámetro
// `deps.redis` de `buildServer`. En producción se llama una sola vez al
// iniciar el servidor.
export function buildRedisClient(env: Env): Redis {
  const url = env.REDIS_URL;
  // Si la URL es mock://, usa ioredis-mock para desarrollo sin Redis real
  if (url.startsWith('mock://')) {
    const RedisMock = require('ioredis-mock') as unknown as typeof Redis;
    return new RedisMock();
  }
  const client = new Redis(url);
  // Sin este listener, un blip de Redis (reconexion, restart del servidor,
  // red intermitente) se convierte en uncaught exception y mata el proceso:
  // ioredis es un EventEmitter y el primer 'error' sin listener termina Node.
  // Como @fastify/rate-limit reusa esta misma instancia, una caida llevaria
  // todo el API abajo, incluso handlers que no tocan Redis. Usamos
  // console.error porque este factory corre antes que Fastify/Pino existan.
  client.on('error', (err: Error) => {
    console.error('[redis] error:', err.message);
  });
  return client;
}
