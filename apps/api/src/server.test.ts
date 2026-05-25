import { describe, it, expect, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from './server';

describe('buildServer', () => {
  let server: FastifyInstance;

  afterEach(async () => {
    await server?.close();
  });

  it('responde 200 en GET /health con el cuerpo esperado', async () => {
    server = await buildServer();
    const response = await server.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });
});
