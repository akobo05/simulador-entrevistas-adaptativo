import { useCallback, useState } from 'react';

export interface ExperiencePrefs {
  /** Modo por defecto al entrar a la sala. */
  responseMode: 'voice' | 'text';
  /** Si el TTS del entrevistador arranca activo. */
  ttsEnabled: boolean;
  /** Override manual de movimiento reducido. null = seguir al sistema (#53). */
  reducedMotion: boolean | null;
  /** Si la camara estaba activa la ultima vez que el candidato paso por el gate. */
  cameraEnabled: boolean | null;
}

const STORAGE_KEY = 'warachikuy:prefs';

const DEFAULTS: ExperiencePrefs = {
  responseMode: 'voice',
  ttsEnabled: true,
  reducedMotion: null,
  cameraEnabled: null,
};

function load(): ExperiencePrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<ExperiencePrefs>) };
  } catch {
    return DEFAULTS;
  }
}

function persist(prefs: ExperiencePrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // localStorage puede estar bloqueado en contextos privados o en tests
  }
}

export function usePreferences() {
  const [prefs, setPrefs] = useState<ExperiencePrefs>(load);

  const setPref = useCallback(
    <K extends keyof ExperiencePrefs>(key: K, value: ExperiencePrefs[K]) => {
      setPrefs((prev) => {
        const next = { ...prev, [key]: value };
        persist(next);
        return next;
      });
    },
    [],
  );

  return { prefs, setPref };
}
