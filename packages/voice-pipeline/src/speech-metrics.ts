import type { AuraMetric, CandidateTranscript } from '@warachikuy/shared-types';

const WINDOW_MS = 30_000;
// Cadencia asumida solo para repartir los timestamps de las palabras dentro de
// un transcript. No es el objetivo ideal del scoring (ese vive en
// normalizeSpeechRate, rango 130-160): es una cadencia de referencia para
// distribuir en el tiempo. Sin STT con timestamps por palabra es la mejor
// aproximacion disponible.
const ASSUMED_WPM = 150;
const AVG_MS_PER_WORD = Math.round(60_000 / ASSUMED_WPM); // ~400 ms/palabra

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
  // Ultima marca de tiempo insertada. Mantiene el historial en orden
  // cronologico estricto: la poda de la ventana asume que wordHistory[0] es el
  // mas viejo, asi que ningun transcript nuevo puede insertar timestamps
  // anteriores a este (pasa si el candidato habla mas rapido que ASSUMED_WPM).
  let lastTimestamp = -Infinity;

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

    // Repartir los timestamps de las palabras en [start, end] asumiendo cadencia
    // constante, para que un transcript largo no entre/salga de la ventana en el
    // mismo tick (parpadeo de fluency, issue #30). La ultima palabra cae
    // exactamente en el timestamp real del evento isFinal.
    const end = transcript.timestamp;
    let start = end - words.length * AVG_MS_PER_WORD;
    // No insertar antes de la ultima palabra ya registrada: si el candidato
    // hablo mas rapido que ASSUMED_WPM, start caeria en el pasado y desordenaria
    // el historial, corrompiendo la poda de la ventana.
    if (start <= lastTimestamp) start = Math.min(lastTimestamp + 1, end);
    const span = end - start;

    for (const [i, word] of words.entries()) {
      const timestamp =
        words.length === 1 ? end : start + Math.round((i * span) / (words.length - 1));
      wordHistory.push({ isFiller: SINGLE_WORD_FILLERS.has(word), timestamp });
    }
    lastTimestamp = end;
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

    // Speech rate: wpm sobre la ventana deslizante. Ojo: los timestamps son
    // estimados (cadencia asumida), no medidos por palabra. Dentro de un unico
    // transcript la velocidad real no se puede recuperar; solo el desfase entre
    // transcripts aporta tiempo real. Por eso la confianza se acota a 'medium'.
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
        // Nunca 'high': la cadencia sale de timestamps estimados, no medidos.
        confidence: windowDurationMin >= 0.1 ? 'medium' : 'low',
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
