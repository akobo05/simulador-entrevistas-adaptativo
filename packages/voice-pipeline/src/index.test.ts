import { describe, it, expect, vi, beforeEach } from 'vitest';
import { voicePipelineVersion, createSttController, metricsWorkerApi } from './index';

// ── Mock de Web Speech API ────────────────────────────────────────────────────

class MockSpeechRecognition {
  continuous = false;
  interimResults = false;
  lang = '';
  onresult: ((e: unknown) => void) | null = null;
  onerror: (() => void) | null = null;
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

describe('metricsWorkerApi', () => {
  it('processFrame devuelve 3 métricas en la primera llamada', () => {
    const imageData = { width: 640, height: 480, data: new Uint8ClampedArray(0) } as ImageData;
    const metrics = metricsWorkerApi.processFrame(imageData);
    expect(metrics).toHaveLength(3);
    expect(metrics.map((m) => m.name).sort()).toEqual(['eye_contact', 'fluency', 'speech_rate']);
  });

  it('cada métrica tiene value entre 0 y 100', () => {
    const imageData = { width: 640, height: 480, data: new Uint8ClampedArray(0) } as ImageData;
    const metrics = metricsWorkerApi.processFrame(imageData);
    for (const m of metrics) {
      expect(m.value).toBeGreaterThanOrEqual(0);
      expect(m.value).toBeLessThanOrEqual(100);
    }
  });
});
