import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, buildCoachPrompt } from './prompts';

const seed = { id: 'be-apis', topic: 'apis', prompt: 'Como disenarias una API REST?' };

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
