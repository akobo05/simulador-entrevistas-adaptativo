import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import RedisMock from 'ioredis-mock';
import type Redis from 'ioredis';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../server';
import { loadEnv } from '../config/env';

const testEnv = loadEnv({
  PORT: '3000',
  DATABASE_URL: 'postgresql://x:x@x/x',
  REDIS_URL: 'redis://x:6379',
  GEMINI_API_KEY: 'k',
  LOG_LEVEL: 'silent',
  CORS_ORIGINS: 'http://localhost:5173',
  WS_BASE_URL: 'ws://test.local',
});

describe('POST /api/v1/sessions', () => {
  let server: FastifyInstance;
  let redis: Redis;

  beforeEach(async () => {
    redis = new RedisMock() as unknown as Redis;
    server = await buildServer(testEnv, { redis });
  });

  afterEach(async () => {
    await server.close();
  });

  it('responde 201 con la shape de CreateSessionResponse cuando el body es válido', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      payload: { industry: 'backend', level: 'mid' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.sessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(body.token).toHaveLength(64);
    expect(body.websocketUrl).toContain(body.sessionId);
    expect(body.websocketUrl).toContain(body.token);
  });

  it('responde 400 con ApiError invalid_input cuando el body está vacío', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('invalid_input');
  });

  it('responde 400 cuando industry es desconocida', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      payload: { industry: 'mobile', level: 'mid' },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('invalid_input');
  });

  it('responde 400 cuando level es desconocido', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      payload: { industry: 'backend', level: 'principal' },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('invalid_input');
  });

  it('responde 400 cuando el body no es JSON parseable', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      headers: { 'content-type': 'application/json' },
      payload: 'not json',
    });
    expect(res.statusCode).toBe(400);
  });

  it('responde 500 sin exponer stack cuando redis.set rechaza', async () => {
    // RedisMock como base + override de set para forzar rechazo
    const brokenRedis = new RedisMock() as unknown as Redis;
    brokenRedis.set = vi.fn().mockRejectedValue(new Error('connection refused'));
    const brokenServer = await buildServer(testEnv, { redis: brokenRedis });

    const res = await brokenServer.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      payload: { industry: 'backend', level: 'mid' },
    });
    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    // Aserto la shape estricta para detectar cualquier key extra que pudiera
    // filtrarse en el futuro (stack, stackTrace, details con info interna, etc),
    // no solo el sustring 'stack' que es fragil.
    expect(body).toStrictEqual({
      error: { code: 'internal_error', message: 'No se pudo crear la sesion' },
    });
    // Verificacion adicional: el mensaje del error original tampoco se filtra.
    expect(JSON.stringify(body)).not.toContain('connection refused');

    await brokenServer.close();
  });
});
