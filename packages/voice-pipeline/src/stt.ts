import { CandidateTranscriptSchema } from '@warachikuy/shared-types';
import type { CandidateTranscript } from '@warachikuy/shared-types';

export type TranscriptCallback = (transcript: CandidateTranscript) => void;

export interface SttOptions {
  /** Locale BCP-47 que se pasa a `SpeechRecognition.lang`. Default: 'es-PE'. */
  lang?: string;
}

export interface SttController {
  start: () => void;
  stop: () => void;
}

// Web Speech API types not in lib.dom.d.ts by default — minimal declarations
interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}
interface SpeechRecognitionResultList {
  readonly length: number;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}
interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
}
interface WebSpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
declare const webkitSpeechRecognition: new () => WebSpeechRecognition;
declare const SpeechRecognition: new () => WebSpeechRecognition;

function createRecognition(): WebSpeechRecognition {
  const Ctor =
    typeof SpeechRecognition !== 'undefined'
      ? SpeechRecognition
      : typeof webkitSpeechRecognition !== 'undefined'
        ? webkitSpeechRecognition
        : null;
  if (!Ctor) throw new Error('Web Speech API no disponible en este navegador');
  return new Ctor();
}

// sessionId es requerido por el schema — se pasa al crear el controlador
export function createSttController(
  sessionId: string,
  onTranscript: TranscriptCallback,
  options: SttOptions = {},
  recognitionFactory: () => WebSpeechRecognition = createRecognition,
): SttController {
  const lang = options.lang ?? 'es-PE';
  let recognition: WebSpeechRecognition | null = null;
  let active = false;

  function start() {
    if (active) return;
    recognition = recognitionFactory();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result) continue;
        const alt = result[0];
        if (!alt) continue;
        const raw = {
          sessionId,
          text: alt.transcript,
          isFinal: result.isFinal,
          timestamp: Date.now(),
        };
        const parsed = CandidateTranscriptSchema.safeParse(raw);
        if (parsed.success) {
          onTranscript(parsed.data);
        } else if (typeof console !== 'undefined') {
          // En produccion conviene enviar esto al sink de errores del cliente (Sentry)
          console.warn('Transcript rechazado por schema', parsed.error.issues);
        }
      }
    };

    // Solo detener en errores terminales — no-speech ocurre en silencio y no es fatal
    const TERMINAL_ERRORS = new Set(['not-allowed', 'audio-capture', 'service-not-allowed']);
    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (TERMINAL_ERRORS.has(event.error)) active = false;
    };

    // auto-restart on end (Web Speech API stops after silence)
    recognition.onend = () => {
      if (active) recognition?.start();
    };

    // active=true antes de start() para que si start() lanza sincrono podamos
    // resetear estado limpio en el catch sin dejar la instancia colgando
    active = true;
    try {
      recognition.start();
    } catch (err) {
      active = false;
      recognition = null;
      throw err;
    }
  }

  function stop() {
    active = false;
    recognition?.stop();
    recognition = null;
  }

  return { start, stop };
}
