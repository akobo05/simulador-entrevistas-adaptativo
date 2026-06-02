import { describe, it, expect, beforeEach } from 'vitest';
import RedisMock from 'ioredis-mock';
import type Redis from 'ioredis';
import type { ImprovementPlan } from '@warachikuy/shared-types';
import { tryStartGenerating, readPlan, setPlanReady, setPlanFailed } from './plan-store';

const plan: ImprovementPlan = {
  planId: '550e8400-e29b-41d4-a716-446655440000',
  sessionId: '550e8400-e29b-41d4-a716-446655440001',
  summary: 'ok',
  competencies: [],
  strengths: [],
  improvements: [],
  exercises: [],
  generatedAt: 1,
};

describe('plan-store', () => {
  beforeEach(async () => {
    await (new RedisMock() as unknown as Redis).flushall();
  });

  it('readPlan devuelve null sin registro', async () => {
    const redis = new RedisMock() as unknown as Redis;
    expect(await readPlan(redis, 'nope')).toBeNull();
  });

  it('tryStartGenerating gana la primera vez y pierde la segunda (NX)', async () => {
    const redis = new RedisMock() as unknown as Redis;
    expect(await tryStartGenerating(redis, 's1', 'p1', 1000)).toBe(true);
    expect(await tryStartGenerating(redis, 's1', 'p2', 2000)).toBe(false);
    const rec = await readPlan(redis, 's1');
    expect(rec).toMatchObject({ status: 'generating', planId: 'p1', generatingSince: 1000 });
  });

  it('setPlanReady guarda el plan con status ready', async () => {
    const redis = new RedisMock() as unknown as Redis;
    await tryStartGenerating(redis, 's1', 'p1', 1000);
    await setPlanReady(redis, 's1', plan);
    const rec = await readPlan(redis, 's1');
    expect(rec?.status).toBe('ready');
    // Narrow la union discriminada para acceder a plan.
    if (rec?.status !== 'ready') throw new Error('se esperaba un plan ready');
    expect(rec.plan).toEqual(plan);
  });

  it('setPlanFailed marca el registro como failed', async () => {
    const redis = new RedisMock() as unknown as Redis;
    await tryStartGenerating(redis, 's1', 'p1', 1000);
    await setPlanFailed(redis, 's1', 'p1');
    const rec = await readPlan(redis, 's1');
    expect(rec?.status).toBe('failed');
    expect(rec?.planId).toBe('p1');
  });

  it('readPlan devuelve null ante un registro corrupto', async () => {
    const redis = new RedisMock() as unknown as Redis;
    await redis.set('session:plan:s1', '{ no json', 'EX', 7200);
    expect(await readPlan(redis, 's1')).toBeNull();
  });
});
