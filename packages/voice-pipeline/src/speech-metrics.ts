import type { AuraMetric, CandidateTranscript } from '@warachikuy/shared-types';

// Muletillas comunes en español peruano
const FILLER_WORDS = new Set([
  'um',
  'uh',
  'eh',
  'ah',
  'este',
  'pues',
  'osea',
  'o sea',
  'bueno',
  'entonces',
  'o sea que',
  'digamos',
  'como',
  'así',
  'básicamente',
  'literalmente',
  'obviamente',
  'igual',
  'tipo',
]);

const WINDOW_MS = 30_000; // ventana deslizante de 30 segundos para fluency

interface WordEntry {
  word: string;
  isFiller: boolean;
  timestamp: number;
}

export interface SpeechMetricsTracker {
  onTranscript: (transcript: CandidateTranscript) => void;
  getMetrics: () => AuraMetric[];
}

export function createSpeechMetricsTracker(): SpeechMetricsTracker {
  const wordHistory: WordEntry[] = [];
  let sessionStartMs: number | null = null;
  let totalWordCount = 0;

  function tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[.,!?;:]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 0);
  }

  function isFiller(word: string): boolean {
    return FILLER_WORDS.has(word);
  }

  function onTranscript(transcript: CandidateTranscript): void {
    if (!transcript.isFinal) return; // solo procesar frases confirmadas

    if (sessionStartMs === null) sessionStartMs = transcript.timestamp;

    const words = tokenize(transcript.text);
    for (const word of words) {
      wordHistory.push({ word, isFiller: isFiller(word), timestamp: transcript.timestamp });
      totalWordCount++;
    }
  }

  function getMetrics(): AuraMetric[] {
    const now = Date.now();
    const cutoff = now - WINDOW_MS;

    // Limpiar entradas fuera de la ventana
    while (wordHistory.length > 0 && (wordHistory[0]?.timestamp ?? 0) < cutoff) {
      wordHistory.shift();
    }

    const now_ = Date.now();

    // Fluency: porcentaje de palabras sin muletilla en la ventana de 30 s
    const windowWords = wordHistory.length;
    const fillerCount = wordHistory.filter((e) => e.isFiller).length;
    const fluencyValue =
      windowWords === 0 ? 100 : Math.round(((windowWords - fillerCount) / windowWords) * 100);

    // Speech rate: palabras por minuto desde el inicio de la sesión
    const elapsedMin = sessionStartMs === null ? 0 : (now_ - sessionStartMs) / 60_000;
    const rawWpm = elapsedMin < 0.05 ? 0 : totalWordCount / elapsedMin;
    // Normalizar: 130-160 wpm es ideal → 100 puntos. Fuera de ese rango baja.
    const speechRateValue = normalizeSpeechRate(rawWpm);

    return [
      {
        name: 'fluency',
        value: fluencyValue,
        confidence: windowWords >= 10 ? 'high' : windowWords >= 3 ? 'medium' : 'low',
        timestamp: now_,
      },
      {
        name: 'speech_rate',
        value: speechRateValue,
        confidence: elapsedMin >= 0.5 ? 'high' : elapsedMin >= 0.1 ? 'medium' : 'low',
        timestamp: now_,
      },
    ];
  }

  return { onTranscript, getMetrics };
}

function normalizeSpeechRate(wpm: number): number {
  if (wpm === 0) return 50; // sin datos, valor neutro
  const IDEAL_MIN = 130;
  const IDEAL_MAX = 160;
  if (wpm >= IDEAL_MIN && wpm <= IDEAL_MAX) return 100;
  if (wpm < IDEAL_MIN) {
    // Muy lento: 0 wpm → 0 puntos, 130 wpm → 100 puntos
    return Math.max(0, Math.round((wpm / IDEAL_MIN) * 100));
  }
  // Muy rápido: 160 wpm → 100 puntos, 240+ wpm → 0 puntos
  return Math.max(0, Math.round((1 - (wpm - IDEAL_MAX) / 80) * 100));
}
