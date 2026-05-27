import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import type Redis from 'ioredis';
import { type Env } from './config/env.js';
import { buildRedisClient } from './services/redis.js';

// Aumentamos el tipo de FastifyInstance para que `server.redis` y `server.env`
// sean accesibles desde handlers y plugins sin casts.
declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis;
    env: Env;
  }
}

export interface BuildServerDeps {
  /** Cliente Redis a usar. Si no se provee, se construye con `buildRedisClient(env)`. */
  redis?: Redis;
}

export async function buildServer(env: Env, deps: BuildServerDeps = {}): Promise<FastifyInstance> {
  const server = Fastify({
    logger: { level: env.LOG_LEVEL },
  });

  const redis = deps.redis ?? buildRedisClient(env);
  server.decorate('redis', redis);
  server.decorate('env', env);

  await server.register(cors, {
    origin: env.CORS_ORIGINS,
    credentials: true,
  });

  // El plugin de rate-limit usa la misma instancia de Redis para no abrir
  // una conexión paralela. `global: false` deja que cada ruta opte-in via
  // su config local.
  await server.register(rateLimit, {
    redis,
    global: false,
  });

  server.get('/health', async () => ({ status: 'ok' }));

  return server;
}
