import { describe, it, expect } from 'vitest';
import RedisMock from 'ioredis-mock';
import type Redis from 'ioredis';
import type { SessionState } from '@warachikuy/shared-types';
import { validateUpgrade } from './auth';

const VALID_TOKEN = 'a'.repeat(64);

function makeState(overrides: Partial<SessionState> = {}): SessionState {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    industry: 'backend',
    level: 'mid',
    status: 'active',
    phase: 'warmup',
    turnNumber: 0,
    startedAt: Date.now(),
    token: VALID_TOKEN,
    ...overrides,
  };
}

async function seedSession(redis: Redis, state: SessionState): Promise<void> {
  await redis.set(`session:${state.id}`, JSON.stringify(state), 'EX', 3600);
}

describe('validateUpgrade', () => {
  it('acepta cuando el token coincide y status=active', async () => {
    const redis = new RedisMock() as unknown as Redis;
    const state = makeState();
    await seedSession(redis, state);
    const result = await validateUpgrade(redis, state.id, VALID_TOKEN);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.id).toBe(state.id);
      expect(result.state.phase).toBe('warmup');
    }
  });

  it('rechaza con status=400 si el token tiene formato invalido', async () => {
    const redis = new RedisMock() as unknown as Redis;
    const result = await validateUpgrade(redis, 'any-id', 'not-hex-64-chars');
    expect(result).toEqual({ ok: false, status: 400, code: 'invalid_input' });
  });

  it('rechaza con status=400 si el token es undefined', async () => {
    const redis = new RedisMock() as unknown as Redis;
    const result = await validateUpgrade(redis, 'any-id', undefined);
    expect(result).toEqual({ ok: false, status: 400, code: 'invalid_input' });
  });

  it('rechaza con status=404 si la session no existe', async () => {
    const redis = new RedisMock() as unknown as Redis;
    const result = await validateUpgrade(
      redis,
      '999e8400-e29b-41d4-a716-446655440000',
      VALID_TOKEN,
    );
    expect(result).toEqual({ ok: false, status: 404, code: 'session_not_found' });
  });

  it('rechaza con status=401 si el token no coincide', async () => {
    const redis = new RedisMock() as unknown as Redis;
    const state = makeState();
    await seedSession(redis, state);
    const wrong = 'b'.repeat(64);
    const result = await validateUpgrade(redis, state.id, wrong);
    expect(result).toEqual({ ok: false, status: 401, code: 'invalid_token' });
  });

  it('rechaza con status=410 si la session tiene status distinto de active', async () => {
    const redis = new RedisMock() as unknown as Redis;
    const state = makeState({ status: 'ended' });
    await seedSession(redis, state);
    const result = await validateUpgrade(redis, state.id, VALID_TOKEN);
    expect(result).toEqual({ ok: false, status: 410, code: 'session_expired' });
  });

  it('rechaza con status=500 si el payload guardado en Redis no parsea contra el schema', async () => {
    const redis = new RedisMock() as unknown as Redis;
    const id = '550e8400-e29b-41d4-a716-446655440000';
    await redis.set(`session:${id}`, '{"garbled": true}', 'EX', 3600);
    const result = await validateUpgrade(redis, id, VALID_TOKEN);
    expect(result).toEqual({ ok: false, status: 500, code: 'internal_error' });
  });
});
