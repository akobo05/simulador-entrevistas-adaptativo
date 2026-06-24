import { describe, it, expect } from 'vitest';
import { ProgressSummarySchema } from './progress';

describe('ProgressSummarySchema', () => {
  const valid = {
    candidateId: '550e8400-e29b-41d4-a716-446655440000',
    sessionCount: 2,
    firstSessionAt: 1000,
    lastSessionAt: 2000,
    competencies: [
      {
        name: 'fluency',
        points: [
          { at: 1000, score: 70 },
          { at: 2000, score: 80 },
        ],
        latest: 80,
        average: 75,
        delta: 10,
      },
    ],
  };

  it('acepta un summary valido', () => {
    expect(ProgressSummarySchema.parse(valid).sessionCount).toBe(2);
  });

  it('acepta el estado vacio (candidato sin datos)', () => {
    const empty = {
      candidateId: '550e8400-e29b-41d4-a716-446655440000',
      sessionCount: 0,
      firstSessionAt: null,
      lastSessionAt: null,
      competencies: [{ name: 'fluency', points: [], latest: null, average: null, delta: null }],
    };
    expect(ProgressSummarySchema.parse(empty).firstSessionAt).toBeNull();
  });

  it('rechaza un score fuera de rango', () => {
    const bad = {
      ...valid,
      competencies: [
        {
          name: 'fluency',
          points: [{ at: 1, score: 150 }],
          latest: null,
          average: null,
          delta: null,
        },
      ],
    };
    expect(ProgressSummarySchema.safeParse(bad).success).toBe(false);
  });

  it('rechaza un candidateId que no es uuid', () => {
    expect(ProgressSummarySchema.safeParse({ ...valid, candidateId: 'x' }).success).toBe(false);
  });
});
