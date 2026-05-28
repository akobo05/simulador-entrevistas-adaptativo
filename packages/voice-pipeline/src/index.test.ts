import { describe, it, expect, vi, beforeEach } from 'vitest';
import { voicePipelineVersion, createSttController, createSpeechMetricsTracker } from './index';

// ── Mock de Web Speech API ────────────────────────────────────────────────────

class MockSpeechRecognition {
  continuous = false;
  interimResults = false;
  lang = '';
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
}

beforeEach(() => {
  vi.stubGlobal('SpeechRecognition', MockSpeechRecognition);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('voice-pipeline package', () => {
  it('exporta la versión correcta', () => {
    expect(voicePipelineVersion).toBe('0.1.0');
  });
});

describe('createSttController', () => {
  const SESSION_ID = '550e8400-e29b-41d4-a716-446655440000';

  it('no lanza error al iniciar y detener', () => {
    const controller = createSttController(SESSION_ID, () => {});
    expect(() => {
      controller.start();
      controller.stop();
    }).not.toThrow();
  });

  it('no crea una segunda instancia si start() se llama dos veces', () => {
    const instances: MockSpeechRecognition[] = [];
    vi.stubGlobal(
      'SpeechRecognition',
      class extends MockSpeechRecognition {
        constructor() {
          super();
          instances.push(this);
        }
      },
    );
    const controller = createSttController(SESSION_ID, () => {});
    controller.start();
    controller.start();
    expect(instances.length).toBe(1);
  });

  it('no desactiva active con error no-speech (debe seguir activo para auto-restart)', () => {
    const fakeRec = new MockSpeechRecognition();
    const controller = createSttController(
      SESSION_ID,
      () => {},
      {},
      () => fakeRec as unknown as ReturnType<(typeof fakeRec)['start']>,
    );
    controller.start();
    fakeRec.onerror?.({ error: 'no-speech' });
    // onend debe disparar restart porque active sigue en true
    fakeRec.onend?.();
    expect(fakeRec.start).toHaveBeenCalledTimes(2); // una vez en start(), otra en onend
  });

  it('desactiva active con error terminal not-allowed', () => {
    const fakeRec = new MockSpeechRecognition();
    const controller = createSttController(
      SESSION_ID,
      () => {},
      {},
      () => fakeRec as unknown as ReturnType<(typeof fakeRec)['start']>,
    );
    controller.start();
    fakeRec.onerror?.({ error: 'not-allowed' });
    fakeRec.onend?.();
    expect(fakeRec.start).toHaveBeenCalledTimes(1); // solo la vez inicial, no reinicia
  });

  it('respeta options.lang cuando se especifica', () => {
    const fakeRec = new MockSpeechRecognition();
    const controller = createSttController(
      SESSION_ID,
      () => {},
      { lang: 'en-US' },
      () => fakeRec as unknown as ReturnType<(typeof fakeRec)['start']>,
    );
    controller.start();
    expect(fakeRec.lang).toBe('en-US');
  });

  it('usa es-PE por defecto cuando no se pasa options.lang', () => {
    const fakeRec = new MockSpeechRecognition();
    const controller = createSttController(
      SESSION_ID,
      () => {},
      {},
      () => fakeRec as unknown as ReturnType<(typeof fakeRec)['start']>,
    );
    controller.start();
    expect(fakeRec.lang).toBe('es-PE');
  });

  it('invoca options.onError con el code cuando un error terminal apaga active', () => {
    const errorSpy = vi.fn();
    const fakeRec = new MockSpeechRecognition();
    const controller = createSttController(
      SESSION_ID,
      () => {},
      { onError: errorSpy },
      () => fakeRec as unknown as ReturnType<(typeof fakeRec)['start']>,
    );
    controller.start();
    fakeRec.onerror?.({ error: 'not-allowed' });
    expect(errorSpy).toHaveBeenCalledWith('not-allowed');
  });

  it('no invoca options.onError con errores no terminales como no-speech', () => {
    const errorSpy = vi.fn();
    const fakeRec = new MockSpeechRecognition();
    const controller = createSttController(
      SESSION_ID,
      () => {},
      { onError: errorSpy },
      () => fakeRec as unknown as ReturnType<(typeof fakeRec)['start']>,
    );
    controller.start();
    fakeRec.onerror?.({ error: 'no-speech' });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('invoca options.onError con max-restart-attempts-exceeded cuando se agota el contador', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.fn();
    const fakeRec = new MockSpeechRecognition();
    let startCount = 0;
    fakeRec.start = vi.fn(() => {
      startCount++;
      if (startCount > 1) throw new Error('InvalidStateError');
    });
    const controller = createSttController(
      SESSION_ID,
      () => {},
      { onError: errorSpy },
      () => fakeRec as unknown as ReturnType<(typeof fakeRec)['start']>,
    );
    controller.start();
    for (let i = 0; i < 6; i++) fakeRec.onend?.();
    expect(errorSpy).toHaveBeenCalledWith('max-restart-attempts-exceeded');
    warnSpy.mockRestore();
  });

  it('detiene auto-restart tras 5 InvalidStateError consecutivos en onend', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fakeRec = new MockSpeechRecognition();
    let startCount = 0;
    fakeRec.start = vi.fn(() => {
      startCount++;
      // start inicial OK; reintentos via onend lanzan InvalidStateError
      if (startCount > 1) throw new Error('InvalidStateError');
    });
    const controller = createSttController(
      SESSION_ID,
      () => {},
      {},
      () => fakeRec as unknown as ReturnType<(typeof fakeRec)['start']>,
    );
    controller.start();
    // 6 onend: el 6to no debe intentar restart porque ya se alcanzaron 5 fallos
    for (let i = 0; i < 6; i++) {
      fakeRec.onend?.();
    }
    expect(startCount).toBe(6); // 1 inicial + 5 reintentos
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('loguea parsed.error cuando safeParse rechaza el transcript', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fakeRec = new MockSpeechRecognition();
    // sessionId no-UUID hace que CandidateTranscriptSchema.safeParse rechace
    const controller = createSttController(
      'not-a-uuid',
      () => {},
      {},
      () => fakeRec as unknown as ReturnType<(typeof fakeRec)['start']>,
    );
    controller.start();
    fakeRec.onresult?.({
      resultIndex: 0,
      results: {
        length: 1,
        0: { isFinal: true, length: 1, 0: { transcript: 'hola', confidence: 0.9 } },
      },
    } as unknown as Parameters<NonNullable<typeof fakeRec.onresult>>[0]);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('invoca el callback con el transcript parseado cuando onresult se dispara', () => {
    const received: unknown[] = [];
    const fakeRec = new MockSpeechRecognition();
    const controller = createSttController(
      SESSION_ID,
      (t) => received.push(t),
      {},
      () => fakeRec as unknown as ReturnType<(typeof fakeRec)['start']>,
    );
    controller.start();

    fakeRec.onresult?.({
      resultIndex: 0,
      results: {
        length: 1,
        0: { isFinal: true, length: 1, 0: { transcript: 'hola', confidence: 0.9 } },
      },
    } as unknown as Parameters<NonNullable<typeof fakeRec.onresult>>[0]);

    expect(received.length).toBe(1);
    expect((received[0] as { text: string }).text).toBe('hola');
  });
});

describe('createSpeechMetricsTracker', () => {
  const SESSION_ID = '550e8400-e29b-41d4-a716-446655440000';
  const now = Date.now();

  it('devuelve fluency 100 y speech_rate neutro sin transcripts', () => {
    const tracker = createSpeechMetricsTracker();
    const metrics = tracker.getMetrics();
    const fluency = metrics.find((m) => m.name === 'fluency');
    expect(fluency?.value).toBe(100);
  });

  it('detecta muletillas simples y baja fluency', () => {
    const tracker = createSpeechMetricsTracker();
    tracker.onTranscript({
      sessionId: SESSION_ID,
      text: 'este bueno yo creo que sí',
      isFinal: true,
      timestamp: now,
    });
    const fluency = tracker.getMetrics().find((m) => m.name === 'fluency');
    expect(fluency?.value).toBeLessThan(100);
  });

  it('detecta muletillas de varias palabras como "o sea"', () => {
    const tracker = createSpeechMetricsTracker();
    tracker.onTranscript({
      sessionId: SESSION_ID,
      text: 'o sea yo creo que sí',
      isFinal: true,
      timestamp: now,
    });
    const fluency = tracker.getMetrics().find((m) => m.name === 'fluency');
    // "o sea" debe detectarse → fluency < 100
    expect(fluency?.value).toBeLessThan(100);
  });

  it('ignora transcripts parciales (isFinal: false)', () => {
    const tracker = createSpeechMetricsTracker();
    tracker.onTranscript({
      sessionId: SESSION_ID,
      text: 'este este este',
      isFinal: false,
      timestamp: now,
    });
    const metrics = tracker.getMetrics();
    const fluency = metrics.find((m) => m.name === 'fluency');
    // No procesó nada → sigue en 100
    expect(fluency?.value).toBe(100);
  });

  it('speech_rate sube al 100 con ritmo ideal (130-160 wpm)', () => {
    const tracker = createSpeechMetricsTracker();
    // 75 palabras con inicio hace ~29 s → ~155 wpm (ideal 130-160)
    const words = Array(75).fill('hola').join(' ');
    tracker.onTranscript({
      sessionId: SESSION_ID,
      text: words,
      isFinal: true,
      timestamp: Date.now() - 29_000,
    });
    const metrics = tracker.getMetrics();
    const speechRate = metrics.find((m) => m.name === 'speech_rate');
    expect(speechRate?.value).toBe(100);
  });

  it('cada métrica tiene value entre 0 y 100', () => {
    const tracker = createSpeechMetricsTracker();
    tracker.onTranscript({
      sessionId: SESSION_ID,
      text: 'me llamo Walter y soy estudiante de la UNI',
      isFinal: true,
      timestamp: now,
    });
    const metrics = tracker.getMetrics();
    for (const m of metrics) {
      expect(m.value).toBeGreaterThanOrEqual(0);
      expect(m.value).toBeLessThanOrEqual(100);
    }
  });
});
