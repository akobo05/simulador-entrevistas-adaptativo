import { describe, it, expect } from 'vitest';
import { derivePhase, MAX_INTERVIEWER_TURNS, INTERVIEWING_TURNS } from './constants';

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
});
