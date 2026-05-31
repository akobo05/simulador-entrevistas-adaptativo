import { describe, it, expect } from 'vitest';
import { BACKEND_QUESTION_BANK, getQuestionBank, selectSeed } from './question-bank';
import { INTERVIEWING_TURNS } from './constants';

describe('question-bank', () => {
  it('el banco de backend tiene al menos INTERVIEWING_TURNS troncales', () => {
    expect(BACKEND_QUESTION_BANK.length).toBeGreaterThanOrEqual(INTERVIEWING_TURNS);
  });

  it('cada troncal tiene id, topic y prompt no vacios', () => {
    for (const q of BACKEND_QUESTION_BANK) {
      expect(q.id).toBeTruthy();
      expect(q.topic).toBeTruthy();
      expect(q.prompt.length).toBeGreaterThan(0);
    }
  });

  it('los ids de las troncales son unicos', () => {
    const ids = BACKEND_QUESTION_BANK.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('getQuestionBank devuelve el banco de backend', () => {
    expect(getQuestionBank('backend')).toBe(BACKEND_QUESTION_BANK);
  });

  it('en F1 las industrias no-backend caen al banco de backend (contrato temporal)', () => {
    expect(getQuestionBank('frontend')).toBe(BACKEND_QUESTION_BANK);
    expect(getQuestionBank('data')).toBe(BACKEND_QUESTION_BANK);
    expect(getQuestionBank('fullstack')).toBe(BACKEND_QUESTION_BANK);
  });

  it('selectSeed devuelve la troncal por indice en turnos de interviewing', () => {
    expect(selectSeed('backend', 1)).toBe(BACKEND_QUESTION_BANK[0]);
    expect(selectSeed('backend', 5)).toBe(BACKEND_QUESTION_BANK[4]);
  });

  it('selectSeed devuelve undefined fuera de interviewing (warmup/closing)', () => {
    expect(selectSeed('backend', 0)).toBeUndefined();
    expect(selectSeed('backend', 6)).toBeUndefined();
  });
});
