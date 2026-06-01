import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import RedisMock from 'ioredis-mock';
import type Redis from 'ioredis';
import type { FastifyInstance } from 'fastify';
import type { SessionState } from '@warachikuy/shared-types';
import type { GeminiClient } from '../interviewer/gemini-client';
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

// CoachOutput crudo que devuelve el fake Gemini para que la generacion del plan
// resuelva 'ready' de forma determinista en el camino feliz.
const coachOutput = {
  summary: 'ok',
  competencyComments: { fluency: 'a', eye_contact: 'b', speech_rate: 'c', content: 'd' },
  contentScore: 70,
  strengths: ['x'],
  improvements: ['y'],
  exercises: [{ title: 't', description: 'd' }],
};

function seedSession(redis: Redis, sessionId: string): Promise<unknown> {
  const state: SessionState = {
    id: sessionId,
    industry: 'backend',
    level: 'mid',
    status: 'active',
    phase: 'closing',
    turnNumber: 6,
    startedAt: Date.now(),
    token: 'a'.repeat(64),
  };
  return redis.set(`session:${sessionId}`, JSON.stringify(state), 'EX', 3600);
}

describe('POST /api/v1/sessions/:sessionId/end y GET /api/v1/sessions/:sessionId/plan', () => {
  let server: FastifyInstance;
  let redis: Redis;
  const sessionId = '11111111-1111-4111-8111-111111111111';

  beforeEach(async () => {
    redis = new RedisMock() as unknown as Redis;
    // ioredis-mock comparte el store en memoria entre instancias; limpiamos
    // para que las claves de un test no filtren al siguiente.
    await redis.flushall();
    const gemini: GeminiClient = {
      generate: async () => '',
      generateJson: async () => coachOutput,
    };
    server = await buildServer(testEnv, { redis, gemini });
  });

  afterEach(async () => {
    await server.close();
  });

  it('POST /end responde 202 con planId y la generacion termina en ready', async () => {
    await seedSession(redis, sessionId);

    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/end`,
    });
    expect(res.statusCode).toBe(202);
    const body = JSON.parse(res.body);
    expect(body.sessionId).toBe(sessionId);
    expect(typeof body.planId).toBe('string');

    // La generacion es fire-and-forget; poll hasta que el plan quede listo.
    await vi.waitFor(async () => {
      const planRes = await server.inject({
        method: 'GET',
        url: `/api/v1/sessions/${sessionId}/plan`,
      });
      expect(planRes.statusCode).toBe(200);
      const planBody = JSON.parse(planRes.body);
      expect(planBody.plan).toBeDefined();
      expect(planBody.plan.summary).toBe('ok');
    });
  });

  it('POST /end dos veces devuelve el mismo planId (idempotente)', async () => {
    await seedSession(redis, sessionId);

    const first = await server.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/end`,
    });
    const second = await server.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/end`,
    });
    expect(first.statusCode).toBe(202);
    expect(second.statusCode).toBe(202);
    expect(JSON.parse(second.body).planId).toBe(JSON.parse(first.body).planId);
  });

  it('POST /end sobre una sesion inexistente responde 404', async () => {
    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/end`,
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error.code).toBe('session_not_found');
  });

  it('GET /plan sin /end previo responde 404', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/v1/sessions/${sessionId}/plan`,
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error.code).toBe('plan_not_found');
  });

  it('GET /plan con registro generating antiguo responde 200 failed (timeout)', async () => {
    await redis.set(
      `session:plan:${sessionId}`,
      JSON.stringify({ status: 'generating', planId: 'p', generatingSince: 1 }),
      'EX',
      7200,
    );

    const res = await server.inject({
      method: 'GET',
      url: `/api/v1/sessions/${sessionId}/plan`,
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toStrictEqual({ status: 'failed' });
  });
});
