import type { AuraState } from '@warachikuy/shared-types';

export interface AvatarAuraMetrics {
  fluency: number | null;
  speechRate: number | null;
  eyeContact: number | null;
}

// El backend OMITE del array las metricas sin senal (no las manda con null).
// Este selector traduce esa ausencia a null para el AvatarAura.
export function auraStateToAvatarProps(state: AuraState | null): AvatarAuraMetrics {
  const find = (name: string): number | null =>
    state?.metrics.find((m) => m.name === name)?.value ?? null;
  return {
    fluency: find('fluency'),
    speechRate: find('speech_rate'),
    eyeContact: find('eye_contact'),
  };
}
