import { describe, it, expect, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from './server';
import type { Env } from './config/env';

const testEnv: Env = {
  PORT: 3000,
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  REDIS_URL: 'redis://localhost:6379',
  GEMINI_API_KEY: 'test-key',
  LOG_LEVEL: 'info',
  CORS_ORIGINS: ['http://localhost:5173'],
};

describe('buildServer', () => {
  let server: FastifyInstance;

  afterEach(async () => {
    await server?.close();
  });

  it('responde 200 en GET /health con el cuerpo esperado', async () => {
    server = await buildServer(testEnv);
    const response = await server.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('incluye Access-Control-Allow-Origin para origenes permitidos', async () => {
    server = await buildServer(testEnv);
    const response = await server.inject({
      method: 'OPTIONS',
      url: '/health',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'GET',
      },
    });
    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('no expone Access-Control-Allow-Origin para origenes no permitidos', async () => {
    server = await buildServer(testEnv);
    const response = await server.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'http://evil.example.com' },
    });
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
