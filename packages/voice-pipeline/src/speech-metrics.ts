import type { AuraMetric, CandidateTranscript } from '@warachikuy/shared-types';

const WINDOW_MS = 30_000;
// Cadencia media asumida para distribuir timestamps dentro de un transcript
const AVG_MS_PER_WORD = Math.round(60_000 / 150); // ~400 ms/palabra a 150 wpm

// Frases de varias palabras van primero para reemplazarse antes de tokenizar
const MULTI_WORD_FILLERS: [RegExp, string][] = [
  [/\bo sea que\b/g, '__filler__'],
  [/\bo sea\b/g, '__filler__'],
];

// Muletillas de una sola palabra en español peruano
const SINGLE_WORD_FILLERS = new Set([
  'um',
  'uh',
  'eh',
  'ah',
  'este',
  'pues',
  'osea',
  'bueno',
  'entonces',
  'digamos',
  'básicamente',
  'literalmente',
  'obviamente',
  'tipo',
  '__filler__',
]);

interface WordEntry {
  isFiller: boolean;
  timestamp: number;
}

export interface SpeechMetricsTracker {
  onTranscript: (transcript: CandidateTranscript) => void;
  getMetrics: () => AuraMetric[];
}

export function createSpeechMetricsTracker(): SpeechMetricsTracker {
  const wordHistory: WordEntry[] = [];

  function preprocess(text: string): string {
    let result = text.toLowerCase();
    for (const [pattern, replacement] of MULTI_WORD_FILLERS) {
      result = result.replace(pattern, replacement);
    }
    return result.replace(/[.,!?;:]/g, '');
  }

  function tokenize(text: string): string[] {
    return text.split(/\s+/).filter((w) => w.length > 0);
  }

  function onTranscript(transcript: CandidateTranscript): void {
    if (!transcript.isFinal) return;

    const words = tokenize(preprocess(transcript.text));
    if (words.length === 0) return;

    // Repartir timestamps asumiendo cadencia constante para evitar que todas
    // las palabras de un transcript largo entren/salgan de la ventana en el mismo tick
    const estimatedDuration = words.length * AVG_MS_PER_WORD;
    const estimatedStart = transcript.timestamp - estimatedDuration;

    for (const [i, word] of words.entries()) {
      wordHistory.push({
        isFiller: SINGLE_WORD_FILLERS.has(word),
        timestamp: estimatedStart + Math.round((i * estimatedDuration) / words.length),
      });
    }
  }

  function getMetrics(): AuraMetric[] {
    const now = Date.now();
    const cutoff = now - WINDOW_MS;

    // Limpiar entradas fuera de la ventana de 30 s
    while (wordHistory.length > 0 && (wordHistory[0]?.timestamp ?? 0) < cutoff) {
      wordHistory.shift();
    }

    const windowWords = wordHistory.length;
    const fillerCount = wordHistory.filter((e) => e.isFiller).length;

    // Fluency: porcentaje de palabras sin muletilla en la ventana
    const fluencyValue =
      windowWords === 0 ? 100 : Math.round(((windowWords - fillerCount) / windowWords) * 100);

    // Speech rate: wpm sobre la ventana deslizante usando timestamps distribuidos
    const first = wordHistory[0];
    const last = wordHistory[windowWords - 1];
    const windowDurationMin =
      windowWords >= 2 && first && last ? (last.timestamp - first.timestamp) / 60_000 : 0;
    const rawWpm = windowDurationMin < 0.05 ? 0 : windowWords / windowDurationMin;
    const speechRateValue = normalizeSpeechRate(rawWpm);

    return [
      {
        name: 'fluency',
        value: fluencyValue,
        confidence: windowWords >= 10 ? 'high' : windowWords >= 3 ? 'medium' : 'low',
        timestamp: now,
      },
      {
        name: 'speech_rate',
        value: speechRateValue,
        confidence: windowDurationMin >= 0.5 ? 'high' : windowDurationMin >= 0.1 ? 'medium' : 'low',
        timestamp: now,
      },
    ];
  }

  return { onTranscript, getMetrics };
}

function normalizeSpeechRate(wpm: number): number {
  if (wpm === 0) return 50;
  const IDEAL_MIN = 130;
  const IDEAL_MAX = 160;
  if (wpm >= IDEAL_MIN && wpm <= IDEAL_MAX) return 100;
  if (wpm < IDEAL_MIN) return Math.max(0, Math.round((wpm / IDEAL_MIN) * 100));
  return Math.max(0, Math.round((1 - (wpm - IDEAL_MAX) / 80) * 100));
}
