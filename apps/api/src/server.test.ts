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
    // El servidor sigue respondiendo 200 con el cuerpo normal. CORS es
    // un mecanismo del navegador: el backend NO rechaza la peticion, solo
    // omite el header que autoriza al JS cliente a leer la respuesta.
    // Asertar el statusCode ademas de la ausencia del header ancla este
    // contrato y atrapa cambios futuros de @fastify/cors que respondieran
    // 403 o 500 (cuyo header tambien estaria ausente).
    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
