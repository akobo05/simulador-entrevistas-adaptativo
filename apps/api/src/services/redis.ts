import Redis from 'ioredis';
import type { Env } from '../config/env.js';

// Factory aislado para poder inyectar un mock en tests via el parámetro
// `deps.redis` de `buildServer`. En producción se llama una sola vez al
// iniciar el servidor.
export function buildRedisClient(env: Env): Redis {
  return new Redis(env.REDIS_URL);
}
