import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTtsController } from './tts';

// Fake minimo de SpeechSynthesisUtterance: captura texto y expone los handlers
class FakeUtterance {
  text: string;
  lang = '';
  voice: unknown = null;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

function makeSynth(voices: Array<{ lang: string }> = []) {
  return {
    speak: vi.fn(),
    cancel: vi.fn(),
    getVoices: vi.fn(() => voices),
    addEventListener: vi.fn(),
  };
}

describe('createTtsController', () => {
  let synth: ReturnType<typeof makeSynth>;

  beforeEach(() => {
    synth = makeSynth([{ lang: 'en-US' }, { lang: 'es-PE' }]);
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('speak cancela lo previo, arma la utterance con voz es-* y la habla', () => {
    const tts = createTtsController();
    tts.speak('Hola candidato');
    expect(synth.cancel).toHaveBeenCalledOnce();
    expect(synth.speak).toHaveBeenCalledOnce();
    const utt = synth.speak.mock.calls[0]![0] as FakeUtterance;
    expect(utt.text).toBe('Hola candidato');
    expect(utt.lang).toBe('es-PE');
    expect((utt.voice as { lang: string }).lang).toBe('es-PE');
  });

  it('si las voces no cargaron, escucha voiceschanged una vez', () => {
    synth.getVoices.mockReturnValue([]);
    createTtsController();
    expect(synth.addEventListener).toHaveBeenCalledWith('voiceschanged', expect.any(Function), {
      once: true,
    });
  });

  it('onstart/onend actualizan speaking y disparan los callbacks', () => {
    const onStart = vi.fn();
    const onEnd = vi.fn();
    const tts = createTtsController({ onStart, onEnd });
    tts.speak('Pregunta');
    const utt = synth.speak.mock.calls[0]![0] as FakeUtterance;
    expect(tts.speaking).toBe(false);
    utt.onstart?.();
    expect(tts.speaking).toBe(true);
    expect(onStart).toHaveBeenCalledOnce();
    utt.onend?.();
    expect(tts.speaking).toBe(false);
    expect(onEnd).toHaveBeenCalledOnce();
  });

  it('cancel corta la sintesis y libera speaking (y onerror tambien libera)', () => {
    const onEnd = vi.fn();
    const tts = createTtsController({ onEnd });
    tts.speak('Pregunta');
    const utt = synth.speak.mock.calls[0]![0] as FakeUtterance;
    utt.onstart?.();
    tts.cancel();
    expect(synth.cancel).toHaveBeenCalledTimes(2); // una por speak, otra por cancel
    expect(tts.speaking).toBe(false);
    // El navegador dispara onerror al cancelar: no debe romper ni duplicar estado
    utt.onerror?.();
    expect(tts.speaking).toBe(false);
  });

  it('un speak mientras habla: el cierre tardio del anterior no apaga al nuevo', () => {
    const tts = createTtsController();
    tts.speak('Primera');
    const first = synth.speak.mock.calls[0]![0] as FakeUtterance;
    first.onstart?.();
    expect(tts.speaking).toBe(true);
    tts.speak('Segunda'); // cancela la primera
    const second = synth.speak.mock.calls[1]![0] as FakeUtterance;
    second.onstart?.();
    expect(tts.speaking).toBe(true);
    // El onerror tardio de la PRIMERA (disparado por su cancel) no debe
    // apagar el speaking de la segunda
    first.onerror?.();
    expect(tts.speaking).toBe(true);
    second.onend?.();
    expect(tts.speaking).toBe(false);
  });

  it('voiceschanged tardio: al llegar las voces, los speak siguientes usan la voz es-*', () => {
    synth.getVoices.mockReturnValue([]);
    const tts = createTtsController();
    const listener = synth.addEventListener.mock.calls[0]![1] as () => void;
    synth.getVoices.mockReturnValue([{ lang: 'es-PE' }]);
    listener();
    tts.speak('Hola');
    const utt = synth.speak.mock.calls[0]![0] as FakeUtterance;
    expect((utt.voice as { lang: string }).lang).toBe('es-PE');
  });

  it('sin speechSynthesis: speak es no-op y dispara onUnsupported', () => {
    Object.defineProperty(window, 'speechSynthesis', { value: undefined, configurable: true });
    const onUnsupported = vi.fn();
    const tts = createTtsController({ onUnsupported });
    expect(() => tts.speak('Hola')).not.toThrow();
    expect(onUnsupported).toHaveBeenCalledOnce();
    expect(() => tts.cancel()).not.toThrow();
  });
});
