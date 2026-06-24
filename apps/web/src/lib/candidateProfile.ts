import type { Industry, Level } from '@warachikuy/shared-types';

export interface CandidateProfile {
  industry: Industry;
  level: Level;
}

const STORAGE_KEY = 'warachikuy:candidateProfile';

const DEFAULTS: CandidateProfile = {
  industry: 'backend',
  level: 'mid',
};

export function loadProfile(): CandidateProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<CandidateProfile>) };
  } catch {
    return DEFAULTS;
  }
}

export function saveProfile(profile: CandidateProfile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // localStorage puede estar bloqueado en contextos privados o en tests
  }
}
