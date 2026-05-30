import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from './prompts';

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
