export interface TtsOptions {
  /** Locale BCP-47 de la utterance. Default: 'es-PE'. */
  lang?: string;
  /** Voz inicial (SpeechSynthesisVoice). Si no se pasa se elige la primera es-*. */
  voice?: SpeechSynthesisVoice | null;
  /** Velocidad de habla (0.1–10). Default: 1. */
  rate?: number;
  onStart?: () => void;
  onEnd?: () => void;
  /** Navegador sin speechSynthesis: la app sigue solo con texto. */
  onUnsupported?: () => void;
}

export interface TtsController {
  /** Cancela lo que este sonando y habla este texto. */
  speak: (text: string) => void;
  cancel: () => void;
  /** Cambia la voz y velocidad que se usaran en el proximo speak(). */
  setVoice: (voice: SpeechSynthesisVoice | null, rate?: number) => void;
  readonly speaking: boolean;
}

export function createTtsController(options: TtsOptions = {}): TtsController {
  const lang = options.lang ?? 'es-PE';
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
  let speaking = false;
  let voice: SpeechSynthesisVoice | null = options.voice ?? null;
  let rate: number = options.rate ?? 1;
  // Referencia viva a la utterance en curso. Cumple dos roles: (1) evita el
  // bug de Chrome que recolecta utterances sin referencia a mitad del habla
  // (y se pierde el onend), y (2) filtra los handlers tardios de utterances
  // viejas canceladas, que NO deben apagar el speaking de la nueva.
  let current: SpeechSynthesisUtterance | null = null;

  // Cierra el habla en curso (si la hay) avisando al consumidor. Lo usan
  // cancel() y el arranque de un speak() nuevo.
  function releaseCurrent(): void {
    current = null;
    if (speaking) {
      speaking = false;
      options.onEnd?.();
    }
  }

  // Eleccion de voz: primera cuyo lang empiece por 'es'. Chrome carga las voces
  // de forma asincrona: si aun no estan, se reintenta una sola vez al evento
  // voiceschanged. Si nunca aparece una voz es-*, la utterance usa la default.
  // Si options.voice ya viene preseleccionada (desde localStorage), se salta el auto-pick.
  function pickVoice(): void {
    if (!synth || voice) return;
    voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith('es')) ?? null;
  }
  if (synth) {
    pickVoice();
    if (!voice) synth.addEventListener('voiceschanged', pickVoice, { once: true });
  }

  function speak(text: string): void {
    if (!synth) {
      options.onUnsupported?.();
      return;
    }
    // Cancela la pregunta anterior para no solapar audios entre turnos
    releaseCurrent();
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = rate;
    if (voice) utterance.voice = voice;
    utterance.onstart = () => {
      if (utterance !== current) return; // handler tardio de una utterance vieja
      speaking = true;
      options.onStart?.();
    };
    // Al cancelar (barge-in) el navegador dispara error, no end: ambos liberan
    const finish = (): void => {
      if (utterance !== current) return;
      current = null;
      speaking = false;
      options.onEnd?.();
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    current = utterance;
    synth.speak(utterance);
  }

  function cancel(): void {
    if (!synth) return;
    releaseCurrent();
    synth.cancel();
  }

  function setVoice(newVoice: SpeechSynthesisVoice | null, newRate?: number): void {
    voice = newVoice;
    if (newRate !== undefined) rate = newRate;
  }

  return {
    speak,
    cancel,
    setVoice,
    get speaking() {
      return speaking;
    },
  };
}
