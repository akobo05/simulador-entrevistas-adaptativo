import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import RedisMock from 'ioredis-mock';
import type Redis from 'ioredis';
import type { FastifyInstance } from 'fastify';
import type { ImprovementPlan } from '@warachikuy/shared-types';
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
    expect(body.sessionCount).toBe(2);
    const fluency = body.competencies.find((c: { name: string }) => c.name === 'fluency');
    expect(fluency.latest).toBe(80);
    expect(fluency.delta).toBe(10);
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
});
