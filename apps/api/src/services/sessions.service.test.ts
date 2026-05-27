import { describe, it, expect, vi } from 'vitest';
import RedisMock from 'ioredis-mock';
import type Redis from 'ioredis';
import { createSession } from './sessions.service';
import type { Env } from '../config/env';

const fakeEnv: Env = {
  PORT: 3000,
  DATABASE_URL: 'postgresql://x:x@x/x',
  REDIS_URL: 'redis://x:6379',
  GEMINI_API_KEY: 'k',
  LOG_LEVEL: 'info',
  CORS_ORIGINS: ['http://localhost:5173'],
  WS_BASE_URL: 'ws://test.local',
};

describe('createSession', () => {
  it('escribe el SessionState en Redis bajo key session:<id>', async () => {
    const redis = new RedisMock() as unknown as Redis;
    const res = await createSession(redis, { industry: 'backend', level: 'mid' }, fakeEnv);
    const raw = await redis.get(`session:${res.sessionId}`);
    expect(raw).toBeTruthy();
    const state = JSON.parse(raw as string);
    expect(state.industry).toBe('backend');
    expect(state.level).toBe('mid');
  });

  it('genera sessionId UUID v4 distinto entre llamadas', async () => {
    const redis = new RedisMock() as unknown as Redis;
    const a = await createSession(redis, { industry: 'backend', level: 'mid' }, fakeEnv);
    const b = await createSession(redis, { industry: 'backend', level: 'mid' }, fakeEnv);
    expect(a.sessionId).not.toBe(b.sessionId);
    expect(a.sessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('genera token de 64 chars hexadecimales', async () => {
    const redis = new RedisMock() as unknown as Redis;
    const res = await createSession(redis, { industry: 'backend', level: 'mid' }, fakeEnv);
    expect(res.token).toHaveLength(64);
    expect(res.token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('llama redis.set con TTL 3600 segundos', async () => {
    const setSpy = vi.fn().mockResolvedValue('OK');
    const redis = { set: setSpy } as unknown as Redis;
    await createSession(redis, { industry: 'backend', level: 'mid' }, fakeEnv);
    expect(setSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^session:/),
      expect.any(String),
      'EX',
      3600,
    );
  });

  it('inicializa SessionState con status=active, phase=warmup, turnNumber=0', async () => {
    const redis = new RedisMock() as unknown as Redis;
    const res = await createSession(redis, { industry: 'frontend', level: 'junior' }, fakeEnv);
    const state = JSON.parse((await redis.get(`session:${res.sessionId}`)) as string);
    expect(state.status).toBe('active');
    expect(state.phase).toBe('warmup');
    expect(state.turnNumber).toBe(0);
  });

  it('websocketUrl incluye sessionId y token y respeta WS_BASE_URL', async () => {
    const redis = new RedisMock() as unknown as Redis;
    const res = await createSession(redis, { industry: 'data', level: 'senior' }, fakeEnv);
    expect(res.websocketUrl).toContain(res.sessionId);
    expect(res.websocketUrl).toContain(res.token);
    expect(res.websocketUrl).toMatch(/^ws:\/\/test\.local\/v1\/sessions\/[^/]+\/ws\?token=/);
  });
});
