import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getOrCreateCandidateId } from './candidate';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('getOrCreateCandidateId', () => {
  beforeEach(() => localStorage.clear());

  it('genera un uuid y lo persiste en localStorage', () => {
    const id = getOrCreateCandidateId();
    expect(id).toMatch(UUID_RE);
    expect(localStorage.getItem('warachikuy:candidateId')).toBe(id);
  });

  it('devuelve el mismo id en llamadas sucesivas', () => {
    const a = getOrCreateCandidateId();
    const b = getOrCreateCandidateId();
    expect(a).toBe(b);
  });

  it('regenera si el valor guardado no es un uuid valido', () => {
    localStorage.setItem('warachikuy:candidateId', 'basura');
    const id = getOrCreateCandidateId();
    expect(id).toMatch(UUID_RE);
    expect(localStorage.getItem('warachikuy:candidateId')).toBe(id);
  });

  it('cae a un id en memoria si localStorage no esta disponible', () => {
    const getSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denegado');
    });
    const a = getOrCreateCandidateId();
    const b = getOrCreateCandidateId();
    expect(a).toMatch(UUID_RE);
    expect(a).toBe(b);
    getSpy.mockRestore();
  });
});
