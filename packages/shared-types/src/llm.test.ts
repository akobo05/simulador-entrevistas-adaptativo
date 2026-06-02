import { describe, it, expect } from 'vitest';
import { ConversationEntrySchema, ImprovementPlanSchema, PlanResponseSchema } from './llm';

describe('ConversationEntrySchema', () => {
  it('acepta una entrada valida del entrevistador', () => {
    const entry = { role: 'interviewer', text: 'Hola, contame de ti.', timestamp: 1 };
    expect(ConversationEntrySchema.parse(entry)).toEqual(entry);
  });

  it('acepta una entrada valida del candidato', () => {
    const entry = { role: 'candidate', text: 'Soy backend.', timestamp: 2 };
    expect(ConversationEntrySchema.parse(entry)).toEqual(entry);
  });

  it('rechaza un role desconocido', () => {
    const r = ConversationEntrySchema.safeParse({ role: 'system', text: 'x', timestamp: 1 });
    expect(r.success).toBe(false);
  });
});

describe('ImprovementPlanSchema', () => {
  const valid = {
    planId: '550e8400-e29b-41d4-a716-446655440000',
    sessionId: '550e8400-e29b-41d4-a716-446655440001',
    summary: 'Buen desempeno general.',
    competencies: [
      { name: 'fluency', score: 80, comment: 'fluida' },
      { name: 'eye_contact', score: null, comment: 'sin datos' },
      { name: 'speech_rate', score: 65, comment: 'ok' },
      { name: 'content', score: 70, comment: 'respuestas correctas' },
    ],
    strengths: ['claridad'],
    improvements: ['profundizar'],
    exercises: [{ title: 'Practicar STAR', description: 'Estructura tus respuestas.' }],
    generatedAt: 1,
  };

  it('acepta un plan valido (score null permitido)', () => {
    expect(ImprovementPlanSchema.parse(valid)).toEqual(valid);
  });

  it('rechaza un competency name desconocido', () => {
    const bad = { ...valid, competencies: [{ name: 'postura', score: 50, comment: 'x' }] };
    expect(ImprovementPlanSchema.safeParse(bad).success).toBe(false);
  });

  it('rechaza score fuera de 0-100', () => {
    const bad = { ...valid, competencies: [{ name: 'fluency', score: 150, comment: 'x' }] };
    expect(ImprovementPlanSchema.safeParse(bad).success).toBe(false);
  });

  describe('PlanResponseSchema', () => {
    it('acepta la variante ready con plan', () => {
      const ready = { status: 'ready', plan: valid };
      expect(PlanResponseSchema.parse(ready)).toEqual(ready);
    });

    it('acepta las variantes generating y failed', () => {
      expect(PlanResponseSchema.parse({ status: 'generating' })).toEqual({ status: 'generating' });
      expect(PlanResponseSchema.parse({ status: 'failed' })).toEqual({ status: 'failed' });
    });

    it('rechaza ready sin plan', () => {
      expect(PlanResponseSchema.safeParse({ status: 'ready' }).success).toBe(false);
    });
  });
});
