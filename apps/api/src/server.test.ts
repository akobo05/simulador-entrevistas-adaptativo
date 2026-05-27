import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import RedisMock from 'ioredis-mock';
import type Redis from 'ioredis';
import type { FastifyInstance } from 'fastify';
import { buildServer } from './server';
import { loadEnv } from './config/env';

const testEnv = loadEnv({
  PORT: '3000',
  DATABASE_URL: 'postgresql://x:x@x/x',
  REDIS_URL: 'redis://x:6379',
  GEMINI_API_KEY: 'k',
  LOG_LEVEL: 'silent',
  CORS_ORIGINS: 'http://localhost:5173',
});

describe('buildServer', () => {
  let server: FastifyInstance;
  let redis: Redis;

  beforeEach(async () => {
    redis = new RedisMock() as unknown as Redis;
    server = await buildServer(testEnv, { redis });
  });

  afterEach(async () => {
    await server.close();
  });

  it('responde 200 con {status:"ok"} en /health', async () => {
    const res = await server.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ status: 'ok' });
  });

  it('responde 204 al preflight CORS de un origen permitido', async () => {
    const res = await server.inject({
      method: 'OPTIONS',
      url: '/health',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'GET',
      },
    });
    expect(res.statusCode).toBe(204);
  });

  it('responde 200 a petición de origen no permitido sin header access-control-allow-origin', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'http://evil.example.com' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
