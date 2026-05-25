import Fastify, { type FastifyInstance } from 'fastify';

export async function buildServer(): Promise<FastifyInstance> {
  const server = Fastify({
    logger: {
      level: process.env['LOG_LEVEL'] ?? 'info',
    },
  });

  server.get('/health', async () => ({ status: 'ok' }));

  return server;
}
