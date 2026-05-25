import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import type { Env } from './config/env.js';

export async function buildServer(env: Env): Promise<FastifyInstance> {
  const server = Fastify({
    logger: {
      level: env.LOG_LEVEL,
    },
  });

  await server.register(cors, {
    origin: env.CORS_ORIGINS,
    credentials: true,
  });

  server.get('/health', async () => ({ status: 'ok' }));

  return server;
}
