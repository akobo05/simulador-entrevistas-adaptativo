import { describe, it, expect } from 'vitest';
import type { ImprovementPlan } from '@warachikuy/shared-types';
import type { InterviewSessionRow } from '../db/schema.js';
import { buildBaseline } from './baseline.js';

const CAND = '550e8400-e29b-41d4-a716-446655440000';

// Construye una fila archivada con un plan cuyos scores por competencia se pasan
// por parametro. Solo importan endedAt y plan.competencies para la linea base.
function rowWithScores(
  id: string,
  endedAtMs: number,
  scores: {
    fluency: number | null;
    eye_contact: number | null;
    speech_rate: number | null;
    content: number | null;
  },
): InterviewSessionRow {
  const plan: ImprovementPlan = {
    planId: id,
    sessionId: id,
    summary: 's',
    competencies: [
      { name: 'fluency', score: scores.fluency, comment: '' },
      { name: 'eye_contact', score: scores.eye_contact, comment: '' },
      { name: 'speech_rate', score: scores.speech_rate, comment: '' },
      { name: 'content', score: scores.content, comment: '' },
    ],
    strengths: [],
    improvements: [],
    exercises: [],
    generatedAt: endedAtMs,
  };
  return {
    id,
    candidateId: CAND,
    industry: 'backend',
    level: 'mid',
    status: 'ended',
    startedAt: new Date(endedAtMs - 1000),
    endedAt: new Date(endedAtMs),
    durationMs: 1000,
    transcript: [],
    metrics: {
      fluency: scores.fluency,
      eye_contact: scores.eye_contact,
      speech_rate: scores.speech_rate,
    },
    plan,
    createdAt: new Date(endedAtMs),
  };
}

describe('buildBaseline', () => {
  it('promedia los scores previos por competencia y cuenta las sesiones', () => {
    const rows = [
      rowWithScores('11111111-1111-4111-8111-111111111111', 1000, {
        fluency: 60,
        eye_contact: null,
        speech_rate: 50,
        content: 60,
      }),
      rowWithScores('22222222-2222-4222-8222-222222222222', 2000, {
        fluency: 80,
        eye_contact: null,
        speech_rate: 70,
        content: 70,
      }),
    ];
    const baseline = buildBaseline(CAND, rows);
    expect(baseline.priorSessionCount).toBe(2);
    expect(baseline.competencies).toHaveLength(4);
    const byName = Object.fromEntries(baseline.competencies.map((c) => [c.name, c.priorAverage]));
    expect(byName.fluency).toBe(70); // (60+80)/2
    expect(byName.speech_rate).toBe(60); // (50+70)/2
    expect(byName.content).toBe(65); // (60+70)/2
    expect(byName.eye_contact).toBeNull(); // nunca se midio
  });

  it('sin sesiones previas devuelve count 0 y todos los promedios en null', () => {
    const baseline = buildBaseline(CAND, []);
    expect(baseline.priorSessionCount).toBe(0);
    expect(baseline.competencies).toHaveLength(4);
    expect(baseline.competencies.every((c) => c.priorAverage === null)).toBe(true);
  });
});
