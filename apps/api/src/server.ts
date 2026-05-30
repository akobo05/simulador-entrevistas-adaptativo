import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import type Redis from 'ioredis';
import { type Env } from './config/env.js';
import { buildRedisClient } from './services/redis.js';
import { registerSessionsRoutes } from './routes/sessions.js';
import { MAX_WS_PAYLOAD_BYTES } from './ws/constants.js';
import { ConnectionRegistry } from './services/connection-registry.js';
import { registerSessionsWsRoute } from './routes/sessions.ws.js';
import { apiError } from './errors.js';

// Aumentamos el tipo de FastifyInstance para que `server.redis`, `server.env`
// y `server.connections` sean accesibles desde handlers y plugins sin casts.
declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis;
    env: Env;
    connections: ConnectionRegistry;
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

  // Handler global de errores no atrapados. Garantiza que cualquier excepcion
  // que escape de un handler o hook (ej: redis.get rechaza por conexion
  // perdida) devuelva el envelope ApiError uniforme en vez del shape default
  // de Fastify { statusCode, error, message }. Esto mantiene el contrato
  // consistente para el cliente que parsea respuestas con ApiErrorSchema.
  // Si el error ya trae un statusCode 4xx (ej: JSON malformado, validacion
  // de Fastify) lo preservamos para no convertir errores del cliente en 500.
  server.setErrorHandler((err, req, reply) => {
    req.log.error({ err }, 'unhandled error');
    const status =
      typeof (err as { statusCode?: number }).statusCode === 'number' &&
      (err as { statusCode?: number }).statusCode! >= 400 &&
      (err as { statusCode?: number }).statusCode! < 500
        ? (err as { statusCode: number }).statusCode
        : 500;
    reply.code(status).send(apiError('internal_error', 'Error interno'));
  });

  await server.register(cors, {
    origin: env.CORS_ORIGINS,
    credentials: true,
  });

  // El plugin de rate-limit usa la misma instancia de Redis para no abrir
  // una conexión paralela. `global: true` aplica un limite por default a
  // TODA ruta (modelo opt-out): asi una ruta nueva queda protegida sin que
  // el dev tenga que acordarse del opt-in. El default es 1000/h por IP; las
  // rutas que necesiten otro limite lo sobreescriben con su `config.rateLimit`
  // local (ej. POST /sessions con 60/h). El upgrade WS hereda este default
  // como defensa barata contra spam de handshakes.
  //
  // `allowList` exime el healthcheck operacional de Docker. Usamos la forma
  // FUNCION y no `['/health']` porque la forma array compara contra la key
  // del rate-limit (que es la IP), no contra el path: un array nunca
  // matchearia la ruta. Cortamos el query string para eximir tambien
  // /health?foo=bar.
  //
  // `errorResponseBuilder` hace que el 429 cumpla el envelope ApiError
  // documentado en la spec 3.6 en vez del default del plugin (que es
  // { statusCode, error: 'Too Many Requests', message }).
  await server.register(rateLimit, {
    redis,
    global: true,
    max: 1000,
    timeWindow: '1 hour',
    allowList: (req) => req.url.split('?')[0] === '/health',
    errorResponseBuilder: (_req, context) => ({
      error: {
        code: 'rate_limited',
        message: `Limite excedido. Intenta de nuevo en ${context.after}.`,
        details: { max: context.max, ttl: context.ttl },
      },
    }),
  });

  // ── WebSocket ──────────────────────────────────────────────────────────
  // El plugin trae maxPayload por la opcion options. El handler completo
  // se registra en routes/sessions.ws.ts.
  await server.register(websocket, {
    options: { maxPayload: MAX_WS_PAYLOAD_BYTES },
  });

  const connections = new ConnectionRegistry();
  server.decorate('connections', connections);

  // Registramos la ruta WS fuera del prefijo /api/v1 para matchear el
  // contrato arquitectonico (spec 3.4): /v1/sessions/:id/ws
  await server.register(async (api) => {
    await registerSessionsWsRoute(api);
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
