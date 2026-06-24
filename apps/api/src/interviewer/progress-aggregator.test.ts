import { describe, it, expect } from 'vitest';
import type { ImprovementPlan } from '@warachikuy/shared-types';
import type { InterviewSessionRow } from '../db/schema.js';
import { buildProgressSummary } from './progress-aggregator.js';

// Fila minima valida para el aggregator (solo le importan endedAt y plan).
function row(id: string, endedAtMs: number, fluency: number | null): InterviewSessionRow {
  const plan: ImprovementPlan = {
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
  return {
    id,
    candidateId: '550e8400-e29b-41d4-a716-446655440000',
    industry: 'backend',
    level: 'mid',
    status: 'ended',
    startedAt: new Date(endedAtMs - 1000),
    endedAt: new Date(endedAtMs),
    durationMs: 1000,
    transcript: [],
    metrics: { fluency: null, eye_contact: null, speech_rate: null },
    plan,
    createdAt: new Date(endedAtMs),
  };
}

const cand = '550e8400-e29b-41d4-a716-446655440000';

describe('buildProgressSummary', () => {
  it('arma la serie por competencia con latest/average/delta y conteos', () => {
    const rows = [row('a', 1000, 70), row('b', 2000, 80)];
    const s = buildProgressSummary(cand, rows);
    expect(s.sessionCount).toBe(2);
    expect(s.firstSessionAt).toBe(1000);
    expect(s.lastSessionAt).toBe(2000);
    // siempre las 4 competencias, en orden fijo
    expect(s.competencies.map((c) => c.name)).toEqual([
      'fluency',
      'eye_contact',
      'speech_rate',
      'content',
    ]);
    const fluency = s.competencies.find((c) => c.name === 'fluency')!;
    expect(fluency.points).toEqual([
      { at: 1000, score: 70 },
      { at: 2000, score: 80 },
    ]);
    expect(fluency.latest).toBe(80);
    expect(fluency.average).toBe(75);
    expect(fluency.delta).toBe(10);
  });

  it('maneja scores null: hueco en points, excluido de latest/average/delta', () => {
    const rows = [row('a', 1000, null), row('b', 2000, 90)];
    const s = buildProgressSummary(cand, rows);
    const fluency = s.competencies.find((c) => c.name === 'fluency')!;
    expect(fluency.points).toEqual([
      { at: 1000, score: null },
      { at: 2000, score: 90 },
    ]);
    expect(fluency.latest).toBe(90);
    expect(fluency.average).toBe(90); // solo el no-null
    expect(fluency.delta).toBeNull(); // <2 no-null
  });

  it('sin filas devuelve el estado vacio con las 4 competencias', () => {
    const s = buildProgressSummary(cand, []);
    expect(s.sessionCount).toBe(0);
    expect(s.firstSessionAt).toBeNull();
    expect(s.lastSessionAt).toBeNull();
    expect(s.competencies).toHaveLength(4);
    expect(s.competencies[0]!.points).toEqual([]);
    expect(s.competencies[0]!.latest).toBeNull();
  });
});
