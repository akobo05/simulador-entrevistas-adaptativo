import { describe, it, expect, beforeEach } from 'vitest';
import { loadProfile, saveProfile } from './candidateProfile';

describe('candidateProfile', () => {
  beforeEach(() => localStorage.clear());

  it('sin nada guardado devuelve los defaults', () => {
    expect(loadProfile()).toEqual({ industry: 'backend', level: 'mid' });
  });

  it('roundtrip: guarda y recupera un perfil valido', () => {
    saveProfile({ industry: 'frontend', level: 'senior' });
    expect(loadProfile()).toEqual({ industry: 'frontend', level: 'senior' });
  });

  it('JSON corrupto -> defaults', () => {
    localStorage.setItem('warachikuy:candidateProfile', '{no es json');
    expect(loadProfile()).toEqual({ industry: 'backend', level: 'mid' });
  });

  it('valores fuera de los enums -> defaults', () => {
    localStorage.setItem(
      'warachikuy:candidateProfile',
      JSON.stringify({ industry: 'mobile', level: 'x' }),
    );
    expect(loadProfile()).toEqual({ industry: 'backend', level: 'mid' });
  });

  it('JSON valido pero no-objeto (array/numero) -> defaults', () => {
    localStorage.setItem('warachikuy:candidateProfile', '123');
    expect(loadProfile()).toEqual({ industry: 'backend', level: 'mid' });
    localStorage.setItem('warachikuy:candidateProfile', '[1,2,3]');
    expect(loadProfile()).toEqual({ industry: 'backend', level: 'mid' });
  });

  it('objeto parcial (falta level) -> defaults (no se confia en parcial invalido)', () => {
    localStorage.setItem('warachikuy:candidateProfile', JSON.stringify({ industry: 'data' }));
    expect(loadProfile()).toEqual({ industry: 'backend', level: 'mid' });
  });
});
