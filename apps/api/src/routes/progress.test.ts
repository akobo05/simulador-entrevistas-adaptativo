import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import RedisMock from 'ioredis-mock';
import type Redis from 'ioredis';
import type { FastifyInstance } from 'fastify';
import type { ImprovementPlan } from '@warachikuy/shared-types';
import { ProgressSummarySchema } from '@warachikuy/shared-types';
import { buildServer } from '../server';
import { loadEnv } from '../config/env';
import { makeTestDb } from '../db/test-helpers.js';
import type { Db } from '../db/client.js';
import { archiveSession, updateArchivedPlan } from '../db/session-archive.js';
import type { NewInterviewSession } from '../db/schema.js';

const testEnv = loadEnv({
  PORT: '3000',
  DATABASE_URL: 'postgresql://x:x@x/x',
  REDIS_URL: 'redis://x:6379',
  GEMINI_API_KEY: 'k',
  LOG_LEVEL: 'silent',
  CORS_ORIGINS: 'http://localhost:5173',
  WS_BASE_URL: 'ws://test.local',
});

const cand = '550e8400-e29b-41d4-a716-446655440000';

function rowFor(id: string, endedAt: Date): NewInterviewSession {
  return {
    id,
    candidateId: cand,
    industry: 'backend',
    level: 'mid',
    status: 'ended',
    startedAt: new Date(endedAt.getTime() - 1000),
    endedAt,
    durationMs: 1000,
    transcript: [],
    metrics: { fluency: null, eye_contact: null, speech_rate: null },
  };
}

function planFor(id: string, fluency: number): ImprovementPlan {
  return {
    planId: id,
    sessionId: id,
    summary: 's',
    competencies: [
      { name: 'fluency', score: fluency, comment: 'c' },
      { name: 'eye_contact', score: null, comment: 'c' },
      { name: 'speech_rate', score: 60, comment: 'c' },
      { name: 'content', score: 70, comment: 'c' },
    ],
    strengths: [],
    improvements: [],
    exercises: [],
    generatedAt: 1,
  };
}

describe('GET /api/v1/candidates/:candidateId/progress', () => {
  let server: FastifyInstance;
  let db: Db;

  beforeEach(async () => {
    db = await makeTestDb();
    server = await buildServer(testEnv, { redis: new RedisMock() as unknown as Redis, db });
  });
  afterEach(async () => {
    await server.close();
  });

  it('devuelve la evolucion por competencia del candidato', async () => {
    const a = rowFor('11111111-1111-4111-8111-111111111111', new Date('2026-06-23T10:00:00Z'));
    const b = rowFor('22222222-2222-4222-8222-222222222222', new Date('2026-06-23T12:00:00Z'));
    await archiveSession(db, a);
    await archiveSession(db, b);
    await updateArchivedPlan(db, a.id, planFor(a.id, 70));
    await updateArchivedPlan(db, b.id, planFor(b.id, 80));

    const res = await server.inject({
      method: 'GET',
      url: `/api/v1/candidates/${cand}/progress`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    // La respuesta cumple el contrato del wire (no solo el tipo estatico).
    expect(ProgressSummarySchema.safeParse(body).success).toBe(true);
    expect(body.sessionCount).toBe(2);
    const fluency = body.competencies.find((c: { name: string }) => c.name === 'fluency');
    expect(fluency.latest).toBe(80);
    expect(fluency.delta).toBe(10);
  });

  it('no mezcla el historial de otro candidato', async () => {
    const other = '660e8400-e29b-41d4-a716-446655440001';
    const mine = rowFor('33333333-3333-4333-8333-333333333333', new Date('2026-06-23T10:00:00Z'));
    const theirs: NewInterviewSession = {
      ...rowFor('44444444-4444-4444-8444-444444444444', new Date('2026-06-23T11:00:00Z')),
      candidateId: other,
    };
    await archiveSession(db, mine);
    await archiveSession(db, theirs);
    await updateArchivedPlan(db, mine.id, planFor(mine.id, 70));
    await updateArchivedPlan(db, theirs.id, planFor(theirs.id, 95));

    const res = await server.inject({
      method: 'GET',
      url: `/api/v1/candidates/${cand}/progress`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.sessionCount).toBe(1); // solo la propia, no la del otro candidato
    const fluency = body.competencies.find((c: { name: string }) => c.name === 'fluency');
    expect(fluency.latest).toBe(70); // 70 (propia), nunca 95 (del otro)
  });

  it('candidato sin datos devuelve 200 con summary vacio', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/v1/candidates/${cand}/progress`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.sessionCount).toBe(0);
    expect(body.firstSessionAt).toBeNull();
    expect(body.competencies).toHaveLength(4);
  });

  it('candidateId que no es uuid devuelve 400', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/candidates/no-soy-uuid/progress',
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('invalid_input');
  });

  it('si la lectura a Postgres falla responde 500', async () => {
    // Stub cuyo select rechaza: la lectura es el camino critico del request.
    const failingDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => Promise.reject(new Error('db caida')),
          }),
        }),
      }),
    } as unknown as Db;
    const failServer = await buildServer(testEnv, {
      redis: new RedisMock() as unknown as Redis,
      db: failingDb,
    });
    const res = await failServer.inject({
      method: 'GET',
      url: `/api/v1/candidates/${cand}/progress`,
    });
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).error.code).toBe('internal_error');
    await failServer.close();
  });
});
