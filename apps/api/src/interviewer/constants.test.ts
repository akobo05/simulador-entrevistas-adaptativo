import { describe, it, expect } from 'vitest';
import {
  derivePhase,
  MAX_INTERVIEWER_TURNS,
  INTERVIEWING_TURNS,
  PLAN_TTL_SECONDS,
  GENERATION_TIMEOUT_SECONDS,
  METRICS_FLUSH_INTERVAL_MS,
} from './constants';

describe('derivePhase', () => {
  it('turno 0 es warmup', () => {
    expect(derivePhase(0)).toBe('warmup');
  });

  it('turnos 1..5 son interviewing', () => {
    for (let t = 1; t <= INTERVIEWING_TURNS; t++) {
      expect(derivePhase(t)).toBe('interviewing');
    }
  });

  it('el turno maximo es closing', () => {
    expect(derivePhase(MAX_INTERVIEWER_TURNS)).toBe('closing');
  });

  it('MAX_INTERVIEWER_TURNS es 6 (warmup + 5 troncales + closing)', () => {
    expect(MAX_INTERVIEWER_TURNS).toBe(6);
  });

  it('turnos por debajo de 0 caen en warmup', () => {
    expect(derivePhase(-1)).toBe('warmup');
  });

  it('turnos por encima del maximo siguen en closing', () => {
    expect(derivePhase(MAX_INTERVIEWER_TURNS + 1)).toBe('closing');
  });
});

describe('constantes del plan de mejora', () => {
  it('PLAN_TTL_SECONDS es mayor que el TTL de la sesion (1h)', () => {
    expect(PLAN_TTL_SECONDS).toBeGreaterThan(3600);
  });
  it('GENERATION_TIMEOUT_SECONDS es holgado sobre el timeout de Gemini (15s)', () => {
    expect(GENERATION_TIMEOUT_SECONDS).toBeGreaterThan(15);
  });
  it('METRICS_FLUSH_INTERVAL_MS evita escrituras a 4 Hz', () => {
    expect(METRICS_FLUSH_INTERVAL_MS).toBeGreaterThanOrEqual(1000);
  });
});
