import { describe, it, expect, beforeEach } from 'vitest';
import RedisMock from 'ioredis-mock';
import type Redis from 'ioredis';
import type { SessionState, ConversationEntry } from '@warachikuy/shared-types';
import { readHistory, appendWarmupTurn, appendCandidateTurn } from './conversation';

function makeState(overrides: Partial<SessionState> = {}): SessionState {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    industry: 'backend',
    level: 'mid',
    status: 'active',
    phase: 'warmup',
    turnNumber: 0,
    startedAt: 1,
    token: 'a'.repeat(64),
    ...overrides,
  };
}

const iv = (text: string): ConversationEntry => ({ role: 'interviewer', text, timestamp: 1 });
const ca = (text: string): ConversationEntry => ({ role: 'candidate', text, timestamp: 2 });

describe('conversation', () => {
  // ioredis-mock comparte el store entre instancias del mismo host:port/db,
  // por lo que se limpia antes de cada test para garantizar aislamiento.
  beforeEach(async () => {
    const redis = new RedisMock() as unknown as Redis;
    await redis.flushall();
  });

  it('readHistory devuelve [] cuando no hay historial', async () => {
    const redis = new RedisMock() as unknown as Redis;
    expect(await readHistory(redis, 'nope')).toEqual([]);
  });

  it('appendWarmupTurn persiste solo el turno del entrevistador y actualiza el SessionState', async () => {
    const redis = new RedisMock() as unknown as Redis;
    const state = makeState();
    await appendWarmupTurn(redis, state, iv('Hola, presentate.'));
    const history = await readHistory(redis, state.id);
    expect(history).toEqual([iv('Hola, presentate.')]);
    const saved = JSON.parse((await redis.get(`session:${state.id}`)) as string);
    expect(saved.turnNumber).toBe(0);
  });

  it('appendCandidateTurn persiste candidato + entrevistador en orden y registra la troncal', async () => {
    const redis = new RedisMock() as unknown as Redis;
    const state = makeState({ turnNumber: 1, phase: 'interviewing' });
    await appendCandidateTurn(
      redis,
      state,
      ca('mi respuesta'),
      iv('siguiente pregunta'),
      'be-apis',
    );
    const history = await readHistory(redis, state.id);
    expect(history).toEqual([ca('mi respuesta'), iv('siguiente pregunta')]);
    expect(await redis.sismember(`session:asked:${state.id}`, 'be-apis')).toBe(1);
    const saved = JSON.parse((await redis.get(`session:${state.id}`)) as string);
    expect(saved.turnNumber).toBe(1);
    expect(saved.phase).toBe('interviewing');
  });

  it('appendCandidateTurn sin seedId no escribe en el set de troncales', async () => {
    const redis = new RedisMock() as unknown as Redis;
    const state = makeState({ turnNumber: 6, phase: 'closing' });
    await appendCandidateTurn(redis, state, ca('ok'), iv('gracias, terminamos'));
    expect(await redis.scard(`session:asked:${state.id}`)).toBe(0);
  });

  it('las keys del historial reciben TTL', async () => {
    const redis = new RedisMock() as unknown as Redis;
    const state = makeState();
    await appendWarmupTurn(redis, state, iv('Hola'));
    expect(await redis.ttl(`session:messages:${state.id}`)).toBeGreaterThan(0);
  });
});
