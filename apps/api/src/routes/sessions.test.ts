import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import RedisMock from 'ioredis-mock';
import type Redis from 'ioredis';
import type { FastifyInstance } from 'fastify';
import type { SessionState } from '@warachikuy/shared-types';
import type { GeminiClient } from '../interviewer/gemini-client';
import { buildServer } from '../server';
import { loadEnv } from '../config/env';
import { makeTestDb } from '../db/test-helpers.js';
import type { Db } from '../db/client.js';
import { getArchivedSession } from '../db/session-archive.js';
import { persistAggregate } from '../interviewer/metrics-aggregator.js';

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
  let db: Db;
  const sessionId = '11111111-1111-4111-8111-111111111111';
  // Token sembrado por seedSession (SessionStateSchema.token).
  const token = 'a'.repeat(64);

  beforeEach(async () => {
    redis = new RedisMock() as unknown as Redis;
    // ioredis-mock comparte el store en memoria entre instancias; limpiamos
    // para que las claves de un test no filtren al siguiente.
    await redis.flushall();
    const gemini: GeminiClient = {
      generate: async () => '',
      generateJson: async () => coachOutput,
    };
    db = await makeTestDb();
    server = await buildServer(testEnv, { redis, gemini, db });
  });

  afterEach(async () => {
    await server.close();
  });

  it('POST /end responde 202 con planId y la generacion termina en ready', async () => {
    await seedSession(redis, sessionId);

    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/end?token=${token}`,
    });
    expect(res.statusCode).toBe(202);
    const body = JSON.parse(res.body);
    expect(body.sessionId).toBe(sessionId);
    expect(typeof body.planId).toBe('string');

    // La generacion es fire-and-forget; poll hasta que el plan quede listo.
    await vi.waitFor(async () => {
      const planRes = await server.inject({
        method: 'GET',
        url: `/api/v1/sessions/${sessionId}/plan?token=${token}`,
      });
      expect(planRes.statusCode).toBe(200);
      const planBody = JSON.parse(planRes.body);
      expect(planBody.status).toBe('ready');
      expect(planBody.plan).toBeDefined();
      expect(planBody.plan.summary).toBe('ok');
    });
  });

  it('POST /end dos veces devuelve el mismo planId (idempotente)', async () => {
    await seedSession(redis, sessionId);

    const first = await server.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/end?token=${token}`,
    });
    const second = await server.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/end?token=${token}`,
    });
    expect(first.statusCode).toBe(202);
    expect(second.statusCode).toBe(202);
    expect(JSON.parse(second.body).planId).toBe(JSON.parse(first.body).planId);
  });

  it('POST /end sobre una sesion inexistente responde 404', async () => {
    // Token con formato valido para pasar el chequeo de formato y llegar al 404.
    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/end?token=${token}`,
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error.code).toBe('session_not_found');
  });

  it('POST /end sin token responde 400 (invalid_input)', async () => {
    await seedSession(redis, sessionId);
    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/end`,
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('invalid_input');
  });

  it('POST /end con token de formato valido pero distinto responde 401 (invalid_token)', async () => {
    await seedSession(redis, sessionId);
    const wrongToken = 'b'.repeat(64);
    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/end?token=${wrongToken}`,
    });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error.code).toBe('invalid_token');
  });

  it('GET /plan sin /end previo responde 404 (plan_not_found, con token valido)', async () => {
    // El plan no existe, pero la sesion (con su token) si: pasa auth y cae en
    // el 404 de plan_not_found.
    await seedSession(redis, sessionId);
    const res = await server.inject({
      method: 'GET',
      url: `/api/v1/sessions/${sessionId}/plan?token=${token}`,
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error.code).toBe('plan_not_found');
  });

  it('GET /plan con token de formato valido pero distinto responde 401', async () => {
    await seedSession(redis, sessionId);
    const wrongToken = 'b'.repeat(64);
    const res = await server.inject({
      method: 'GET',
      url: `/api/v1/sessions/${sessionId}/plan?token=${wrongToken}`,
    });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error.code).toBe('invalid_token');
  });

  it('GET /plan con registro generating antiguo responde 200 failed (timeout)', async () => {
    await seedSession(redis, sessionId);
    await redis.set(
      `session:plan:${sessionId}`,
      JSON.stringify({ status: 'generating', planId: 'p', generatingSince: 1 }),
      'EX',
      7200,
    );

    const res = await server.inject({
      method: 'GET',
      url: `/api/v1/sessions/${sessionId}/plan?token=${token}`,
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toStrictEqual({ status: 'failed' });
  });

  it('archiva la sesion en Postgres al cerrarla y sobrevive el TTL de Redis', async () => {
    const create = await server.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      payload: { industry: 'backend', level: 'mid' },
    });
    const { sessionId, token } = JSON.parse(create.body);

    // Seed del transcript y las metricas como los habria dejado la entrevista,
    // para verificar que /end archiva el contenido real (no solo los metadatos).
    await redis.rpush(
      `session:messages:${sessionId}`,
      JSON.stringify({ role: 'interviewer', text: 'Cuentame de ti', timestamp: 1 }),
      JSON.stringify({ role: 'candidate', text: 'Soy backend', timestamp: 2 }),
    );
    await persistAggregate(redis, sessionId, { fluency: 88, eye_contact: null, speech_rate: 60 });

    const end = await server.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/end?token=${token}`,
    });
    expect(end.statusCode).toBe(202);
    const { planId } = JSON.parse(end.body);

    // La fila durable existe con los metadatos, el transcript y las metricas
    // correctos (escritos sincronicamente en /end antes del 202).
    const archived = await getArchivedSession(db, sessionId);
    expect(archived?.industry).toBe('backend');
    expect(archived?.level).toBe('mid');
    expect(archived?.status).toBe('ended');
    expect(archived?.durationMs).toBeGreaterThanOrEqual(0);
    expect(archived?.transcript).toEqual([
      { role: 'interviewer', text: 'Cuentame de ti', timestamp: 1 },
      { role: 'candidate', text: 'Soy backend', timestamp: 2 },
    ]);
    expect(archived?.metrics).toEqual({ fluency: 88, eye_contact: null, speech_rate: 60 });

    // El plan lo completa generatePlan en un segundo paso (fire-and-forget desde
    // /end): se espera a que la fila quede con el mismo planId, probando el write
    // de dos pasos de punta a punta por la capa de ruta.
    await vi.waitFor(async () => {
      const withPlan = await getArchivedSession(db, sessionId);
      expect(withPlan?.plan?.planId).toBe(planId);
    });

    // "Sobrevive el TTL de Redis": vaciamos Redis y la sesion sigue consultable
    await redis.flushall();
    const stillThere = await getArchivedSession(db, sessionId);
    expect(stillThere?.id).toBe(sessionId);
  });

  it('si el archivo en Postgres falla, /end igual responde 202', async () => {
    // Spy en insert: confirma que el camino de archivo se ejecuto (y fallo),
    // no que el test pase por haberse salteado el archivo.
    const insertSpy = vi.fn(() => ({
      values: () => ({
        onConflictDoNothing: () => Promise.reject(new Error('db caida')),
      }),
    }));
    const failingDb = { insert: insertSpy } as unknown as Db;
    const failServer = await buildServer(testEnv, {
      redis: new RedisMock() as unknown as Redis,
      db: failingDb,
    });

    const create = await failServer.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      payload: { industry: 'backend', level: 'mid' },
    });
    const { sessionId, token } = JSON.parse(create.body);
    const end = await failServer.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/end?token=${token}`,
    });
    expect(end.statusCode).toBe(202);
    expect(insertSpy).toHaveBeenCalled();
    await failServer.close();
  });

  it('estampa el candidate_id en la fila archivada cuando la sesion tiene candidateId', async () => {
    const candidateId = '550e8400-e29b-41d4-a716-446655440000';
    const create = await server.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      payload: { industry: 'backend', level: 'mid', candidateId },
    });
    const { sessionId, token } = JSON.parse(create.body);
    await server.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/end?token=${token}`,
    });
    const archived = await getArchivedSession(db, sessionId);
    expect(archived?.candidateId).toBe(candidateId);
  });

  it('archiva candidate_id null cuando la sesion no tiene candidateId', async () => {
    const create = await server.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      payload: { industry: 'backend', level: 'mid' },
    });
    const { sessionId, token } = JSON.parse(create.body);
    await server.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/end?token=${token}`,
    });
    const archived = await getArchivedSession(db, sessionId);
    expect(archived?.candidateId).toBeNull();
  });
});

describe('GET /api/v1/sessions/:sessionId', () => {
  let server: FastifyInstance;
  let redis: Redis;
  const sessionId = '22222222-2222-4222-8222-222222222222';
  const token = 'a'.repeat(64);

  beforeEach(async () => {
    redis = new RedisMock() as unknown as Redis;
    await redis.flushall();
    server = await buildServer(testEnv, { redis });
  });

  afterEach(async () => {
    await server.close();
  });

  it('responde 200 con el resumen de la sesion cuando el token es valido', async () => {
    await seedSession(redis, sessionId);
    const res = await server.inject({
      method: 'GET',
      url: `/api/v1/sessions/${sessionId}?token=${token}`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.session.id).toBe(sessionId);
    expect(body.session.industry).toBe('backend');
    expect(body.session.level).toBe('mid');
    expect(body.session.status).toBe('active');
    expect(body.session.turnNumber).toBe(6);
    expect(typeof body.session.startedAt).toBe('number');
    // El token (secreto) y la fase (estado interno) no se filtran.
    expect(body.session.token).toBeUndefined();
    expect(body.session.phase).toBeUndefined();
  });

  it('responde 401 cuando el token tiene formato valido pero es distinto', async () => {
    await seedSession(redis, sessionId);
    const wrongToken = 'b'.repeat(64);
    const res = await server.inject({
      method: 'GET',
      url: `/api/v1/sessions/${sessionId}?token=${wrongToken}`,
    });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error.code).toBe('invalid_token');
  });

  it('GET /sessions/:id con token mal formado responde 400', async () => {
    // Token corto que falla el regex ^[0-9a-f]{64}$ antes de cualquier compare.
    await seedSession(redis, sessionId);
    const res = await server.inject({
      method: 'GET',
      url: `/api/v1/sessions/${sessionId}?token=123`,
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('invalid_input');
  });

  it('responde 400 cuando falta el token', async () => {
    await seedSession(redis, sessionId);
    const res = await server.inject({
      method: 'GET',
      url: `/api/v1/sessions/${sessionId}`,
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('invalid_input');
  });

  it('responde 404 sobre una sesion inexistente', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/v1/sessions/33333333-3333-4333-8333-333333333333?token=${token}`,
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error.code).toBe('session_not_found');
  });
});

describe('GET /api/v1/industries', () => {
  let server: FastifyInstance;
  let redis: Redis;

  beforeEach(async () => {
    redis = new RedisMock() as unknown as Redis;
    await redis.flushall();
    server = await buildServer(testEnv, { redis });
  });

  afterEach(async () => {
    await server.close();
  });

  it('responde 200 con las 4 industrias y es publico (sin token)', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/industries',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.industries).toHaveLength(4);
    expect(body.industries).toContainEqual({ id: 'backend', name: 'Backend' });
  });
});
