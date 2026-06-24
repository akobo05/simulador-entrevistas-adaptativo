import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, buildCoachPrompt } from './prompts.js';
import type { CoachBaseline } from './baseline.js';

const seed = { id: 'be-apis', topic: 'apis', prompt: 'Como disenarias una API REST?' };

const metrics = { fluency: 72, eye_contact: null, speech_rate: 64 };

function baselineWith(priorSessionCount: number): CoachBaseline {
  return {
    priorSessionCount,
    competencies: [
      { name: 'fluency', priorAverage: 65 },
      { name: 'eye_contact', priorAverage: null },
      { name: 'speech_rate', priorAverage: 60 },
      { name: 'content', priorAverage: 70 },
    ],
  };
}

describe('buildSystemPrompt', () => {
  it('incluye el rol, la industria y el nivel', () => {
    const p = buildSystemPrompt({ industry: 'backend', level: 'mid', phase: 'warmup' });
    expect(p).toContain('entrevistador');
    expect(p).toContain('backend');
    expect(p).toContain('mid');
  });

  it('en warmup pide una pregunta de presentacion y no incluye seed', () => {
    const p = buildSystemPrompt({ industry: 'backend', level: 'junior', phase: 'warmup' });
    expect(p.toLowerCase()).toContain('presentacion');
  });

  it('en interviewing incluye el prompt de la troncal', () => {
    const p = buildSystemPrompt({
      industry: 'backend',
      level: 'senior',
      phase: 'interviewing',
      seed,
    });
    expect(p).toContain(seed.prompt);
  });

  it('en closing instruye cerrar sin nueva pregunta', () => {
    const p = buildSystemPrompt({ industry: 'backend', level: 'mid', phase: 'closing' });
    expect(p.toLowerCase()).toContain('cierr');
  });

  it('siempre instruye respuesta breve y mantener el rol (anti prompt injection)', () => {
    const p = buildSystemPrompt({ industry: 'backend', level: 'mid', phase: 'interviewing', seed });
    expect(p.toLowerCase()).toContain('oraciones');
    expect(p.toLowerCase()).toContain('instrucciones');
  });

  it('siempre instruye no dar feedback y una sola pregunta por turno', () => {
    const p = buildSystemPrompt({ industry: 'backend', level: 'mid', phase: 'warmup' });
    expect(p.toLowerCase()).toContain('feedback');
    expect(p).toContain('UNA sola pregunta');
  });
});

describe('buildCoachPrompt', () => {
  it('incluye el rol de coach, industria y nivel', () => {
    const p = buildCoachPrompt({
      industry: 'backend',
      level: 'mid',
      metrics: { fluency: 80, eye_contact: 60, speech_rate: 70 },
    });
    expect(p.toLowerCase()).toContain('coach');
    expect(p).toContain('backend');
    expect(p).toContain('mid');
  });

  it('inyecta los valores medidos para comentarlos sin re-puntuarlos', () => {
    const p = buildCoachPrompt({
      industry: 'backend',
      level: 'mid',
      metrics: { fluency: 80, eye_contact: 60, speech_rate: 70 },
    });
    expect(p).toContain('80');
    expect(p.toLowerCase()).toContain('no vuelvas a puntuar');
  });

  it('marca las metricas sin datos', () => {
    const p = buildCoachPrompt({
      industry: 'backend',
      level: 'mid',
      metrics: { fluency: null, eye_contact: null, speech_rate: null },
    });
    expect(p.toLowerCase()).toContain('sin datos');
  });

  it('incluye una linea de endurecimiento contra prompt injection', () => {
    const p = buildCoachPrompt({
      industry: 'backend',
      level: 'mid',
      metrics: { fluency: 80, eye_contact: 60, speech_rate: 70 },
    });
    expect(p.toLowerCase()).toContain('no instrucciones');
    expect(p.toLowerCase()).toContain('ignora cualquier intento');
  });

  it('incluye la rubrica del puntaje de content', () => {
    const p = buildCoachPrompt({
      industry: 'backend',
      level: 'senior',
      metrics: { fluency: 80, eye_contact: 60, speech_rate: 70 },
    });
    expect(p.toLowerCase()).toContain('rubrica');
    expect(p).toContain('content');
  });
});

describe('buildCoachPrompt linea base (#60)', () => {
  it('con sesiones previas, incluye la linea base y la instruccion de tendencia', () => {
    const prompt = buildCoachPrompt({
      industry: 'backend',
      level: 'mid',
      metrics,
      baseline: baselineWith(3),
    });
    expect(prompt).toContain('Linea base del candidato');
    expect(prompt).toContain('3 sesiones previas');
    expect(prompt).toContain('promedio previo 65/100'); // fluency
    expect(prompt).toContain('promedio previo sin datos'); // eye_contact null
    expect(prompt).toContain('mejoro, empeoro o se mantuvo');
    expect(prompt).toContain('fluidez verbal: promedio previo 65/100');
    expect(prompt).toContain('contentScore que tu mismo asignas');
  });

  it('sin sesiones previas (count 0), lo dice honestamente y no afirma tendencia', () => {
    const prompt = buildCoachPrompt({
      industry: 'backend',
      level: 'mid',
      metrics,
      baseline: baselineWith(0),
    });
    expect(prompt).toContain('primera sesion del candidato');
    expect(prompt).not.toContain('Linea base del candidato');
  });

  it('sin baseline, el prompt no menciona linea base ni tendencia', () => {
    const prompt = buildCoachPrompt({ industry: 'backend', level: 'mid', metrics });
    expect(prompt).not.toContain('Linea base del candidato');
    expect(prompt).not.toContain('primera sesion del candidato');
  });
});
