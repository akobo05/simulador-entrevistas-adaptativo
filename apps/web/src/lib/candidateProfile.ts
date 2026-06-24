import { z } from 'zod';
import { IndustrySchema, LevelSchema, type Industry, type Level } from '@warachikuy/shared-types';

export interface CandidateProfile {
  industry: Industry;
  level: Level;
}

const STORAGE_KEY = 'warachikuy:candidateProfile';

const DEFAULTS: CandidateProfile = {
  industry: 'backend',
  level: 'mid',
};

const ProfileSchema = z.object({
  industry: IndustrySchema,
  level: LevelSchema,
});

// Lee el perfil guardado validandolo contra los schemas del dominio. A diferencia
// de las preferencias de experiencia, industry/level viajan al backend para crear
// la sesion (lo valida con Zod) y alimentan un <select> con opciones del API: un
// valor fuera de los enums romperia el flujo, asi que ante cualquier dato invalido
// se cae a los defaults.
export function loadProfile(): CandidateProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = ProfileSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULTS;
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
