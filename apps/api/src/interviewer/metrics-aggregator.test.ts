import { describe, it, expect, beforeEach } from 'vitest';
import RedisMock from 'ioredis-mock';
import type Redis from 'ioredis';
import type { AuraState } from '@warachikuy/shared-types';
import { MetricsAggregator, persistAggregate, readAggregate } from './metrics-aggregator.js';

function aura(metrics: { name: string; value: number }[]): AuraState {
  return {
    sessionId: '550e8400-e29b-41d4-a716-446655440000',
    metrics: metrics.map((m) => ({
      name: m.name as AuraState['metrics'][number]['name'],
      value: m.value,
      confidence: 'high',
      timestamp: 1,
    })),
    collectedAt: 1,
  };
}

describe('MetricsAggregator', () => {
  it('promedia por metrica sobre varias muestras', () => {
    const agg = new MetricsAggregator();
    agg.add(
      aura([
        { name: 'fluency', value: 80 },
        { name: 'eye_contact', value: 60 },
      ]),
    );
    agg.add(aura([{ name: 'fluency', value: 100 }]));
    expect(agg.snapshot()).toEqual({ fluency: 90, eye_contact: 60, speech_rate: null });
  });

  it('devuelve null para una metrica sin muestras', () => {
    expect(new MetricsAggregator().snapshot()).toEqual({
      fluency: null,
      eye_contact: null,
      speech_rate: null,
    });
  });

  it('ignora nombres de metrica fuera de las tres rastreadas', () => {
    const agg = new MetricsAggregator();
    agg.add(aura([{ name: 'posture', value: 50 }]));
    expect(agg.snapshot()).toEqual({ fluency: null, eye_contact: null, speech_rate: null });
  });

  it('hasSamples es false sin muestras y true tras agregar una', () => {
    const agg = new MetricsAggregator();
    expect(agg.hasSamples()).toBe(false);
    agg.add(aura([{ name: 'fluency', value: 80 }]));
    expect(agg.hasSamples()).toBe(true);
  });

  it('hasSamples sigue false si solo llegan metricas no rastreadas', () => {
    const agg = new MetricsAggregator();
    agg.add(aura([{ name: 'posture', value: 50 }]));
    expect(agg.hasSamples()).toBe(false);
  });
});

describe('persistAggregate / readAggregate', () => {
  beforeEach(async () => {
    await (new RedisMock() as unknown as Redis).flushall();
  });

  it('readAggregate devuelve todo null si no hay registro', async () => {
    const redis = new RedisMock() as unknown as Redis;
    expect(await readAggregate(redis, 'nope')).toEqual({
      fluency: null,
      eye_contact: null,
      speech_rate: null,
    });
  });

  it('persistAggregate guarda y readAggregate recupera', async () => {
    const redis = new RedisMock() as unknown as Redis;
    await persistAggregate(redis, 's1', { fluency: 70, eye_contact: null, speech_rate: 55 });
    expect(await readAggregate(redis, 's1')).toEqual({
      fluency: 70,
      eye_contact: null,
      speech_rate: 55,
    });
  });
});
