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
      () => fakeRec as unknown as ReturnType<(typeof fakeRec)['start']>,
    );
    controller.start();
    fakeRec.onerror?.({ error: 'not-allowed' });
    fakeRec.onend?.();
    expect(fakeRec.start).toHaveBeenCalledTimes(1); // solo la vez inicial, no reinicia
  });

  it('invoca el callback con el transcript parseado cuando onresult se dispara', () => {
    const received: unknown[] = [];
    const fakeRec = new MockSpeechRecognition();
    const controller = createSttController(
      SESSION_ID,
      (t) => received.push(t),
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

  it('speech_rate normaliza a la cadencia asumida pero nunca afirma confianza alta', () => {
    const tracker = createSpeechMetricsTracker();
    // Con timestamps estimados (cadencia asumida 150 wpm) un transcript tipico
    // normaliza al rango ideal, pero como la velocidad real no se mide la
    // confianza queda acotada a 'medium' (hara falta STT con timestamps por
    // palabra en F2). Este test documenta esa honestidad, no valida wpm real.
    const words = Array(20).fill('hola').join(' ');
    tracker.onTranscript({
      sessionId: SESSION_ID,
      text: words,
      isFinal: true,
      timestamp: Date.now(),
    });
    const speechRate = tracker.getMetrics().find((m) => m.name === 'speech_rate');
    expect(speechRate?.value).toBe(100);
    expect(speechRate?.confidence).not.toBe('high');
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
