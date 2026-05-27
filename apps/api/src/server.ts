import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import type Redis from 'ioredis';
import { type Env } from './config/env.js';
import { buildRedisClient } from './services/redis.js';
import { registerSessionsRoutes } from './routes/sessions.js';

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
  /** Destino opcional para los logs (usado en tests para capturar output). */
  loggerDestination?: { write(chunk: string): boolean | void };
}

export async function buildServer(env: Env, deps: BuildServerDeps = {}): Promise<FastifyInstance> {
  // Redacta el query param `token` en req.url antes de loguearlo. Pino
  // por defecto loguea la URL completa, lo que filtraria el token de
  // sesion (que es secreto, ver spec §6.1). Aplica a CUALQUIER ruta que
  // reciba un token por query string, no solo al WS.
  const redactTokenInUrl = (url: string): string => url.replace(/([?&]token=)[^&]+/g, '$1REDACTED');

  const server = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      serializers: {
        req: (req) => ({
          method: req.method,
          url: redactTokenInUrl(req.url),
          remoteAddress: req.ip,
        }),
      },
      ...(deps.loggerDestination ? { stream: deps.loggerDestination } : {}),
    },
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
  // su config local. `errorResponseBuilder` hace que el 429 cumpla el
  // envelope ApiError documentado en la spec 3.6 en vez del default del
  // plugin (que es { statusCode, error: 'Too Many Requests', message }).
  await server.register(rateLimit, {
    redis,
    global: false,
    errorResponseBuilder: (_req, context) => ({
      error: {
        code: 'rate_limited',
        message: `Limite excedido. Intenta de nuevo en ${context.after}.`,
        details: { max: context.max, ttl: context.ttl },
      },
    }),
  });

  await server.register(
    async (api) => {
      await registerSessionsRoutes(api);
    },
    { prefix: '/api/v1' },
  );

  server.get('/health', async () => ({ status: 'ok' }));

  return server;
}
