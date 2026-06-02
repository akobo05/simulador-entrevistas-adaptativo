import { describe, it, expect, vi, beforeEach } from 'vitest';
import RedisMock from 'ioredis-mock';
import type Redis from 'ioredis';
import type { FastifyBaseLogger } from 'fastify';
import type { SessionState } from '@warachikuy/shared-types';
import type { GeminiClient } from './gemini-client.js';
import { GeminiTransientError } from './gemini-client.js';
import { generatePlan } from './coach.service.js';
import { readPlan } from './plan-store.js';
import { persistAggregate } from './metrics-aggregator.js';

function silentLog(): FastifyBaseLogger {
  const l = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: () => l,
    level: 'silent',
    silent: vi.fn(),
  } as unknown as FastifyBaseLogger;
  return l;
}

function makeState(overrides: Partial<SessionState> = {}): SessionState {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    industry: 'backend',
    level: 'mid',
    status: 'ended',
    phase: 'closing',
    turnNumber: 6,
    startedAt: 1,
    token: 'a'.repeat(64),
    ...overrides,
  };
}

const COACH_OUTPUT = {
  summary: 'Buen desempeno.',
  competencyComments: {
    fluency: 'fluida',
    eye_contact: 'sin datos',
    speech_rate: 'ok',
    content: 'solido',
  },
  contentScore: 75,
  strengths: ['claridad'],
  improvements: ['profundizar'],
  exercises: [{ title: 'STAR', description: 'Estructura tus respuestas.' }],
};

describe('generatePlan', () => {
  beforeEach(async () => {
    await (new RedisMock() as unknown as Redis).flushall();
  });

  it('ensambla el plan inyectando los puntajes medidos y lo marca ready', async () => {
    const redis = new RedisMock() as unknown as Redis;
    await persistAggregate(redis, makeState().id, {
      fluency: 88,
      eye_contact: null,
      speech_rate: 62,
    });
    const gemini: GeminiClient = {
      generate: async () => '',
      generateJson: async () => COACH_OUTPUT,
    };
    await generatePlan(
      { redis, gemini, log: silentLog() },
      makeState(),
      '550e8400-e29b-41d4-a716-446655440099',
    );
    const rec = await readPlan(redis, makeState().id);
    expect(rec?.status).toBe('ready');
    // Narrow la union discriminada para acceder a plan sin non-null asserts.
    if (rec?.status !== 'ready') throw new Error('se esperaba un plan ready');
    const comp = Object.fromEntries(rec.plan.competencies.map((c) => [c.name, c.score]));
    expect(comp.fluency).toBe(88);
    expect(comp.eye_contact).toBeNull();
    expect(comp.speech_rate).toBe(62);
    expect(comp.content).toBe(75);
    expect(rec.plan.summary).toBe('Buen desempeno.');
  });

  it('marca failed si el LLM falla tras el reintento', async () => {
    const redis = new RedisMock() as unknown as Redis;
    const generateJson = vi.fn().mockRejectedValue(new GeminiTransientError('net'));
    await generatePlan(
      { redis, gemini: { generate: async () => '', generateJson }, log: silentLog() },
      makeState(),
      'plan-1',
    );
    expect(generateJson).toHaveBeenCalledTimes(2);
    const rec = await readPlan(redis, makeState().id);
    expect(rec?.status).toBe('failed');
  });

  it('marca failed si la salida del LLM no matchea el schema esperado', async () => {
    const redis = new RedisMock() as unknown as Redis;
    const gemini: GeminiClient = {
      generate: async () => '',
      generateJson: async () => ({ garbage: true }),
    };
    await generatePlan({ redis, gemini, log: silentLog() }, makeState(), 'plan-1');
    expect((await readPlan(redis, makeState().id))?.status).toBe('failed');
  });

  it('reintenta tras un error transitorio y marca ready si el segundo intento funciona', async () => {
    const redis = new RedisMock() as unknown as Redis;
    await persistAggregate(redis, makeState().id, {
      fluency: 88,
      eye_contact: null,
      speech_rate: 62,
    });
    const generateJson = vi
      .fn()
      .mockRejectedValueOnce(new GeminiTransientError('net'))
      .mockResolvedValueOnce(COACH_OUTPUT);
    await generatePlan(
      { redis, gemini: { generate: async () => '', generateJson }, log: silentLog() },
      makeState(),
      '550e8400-e29b-41d4-a716-446655440099',
    );
    expect(generateJson).toHaveBeenCalledTimes(2);
    const rec = await readPlan(redis, makeState().id);
    expect(rec?.status).toBe('ready');
  });
});
