import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { AuraMetric, CandidateTranscript } from '@warachikuy/shared-types';
import { createFaceLandmarker } from '@warachikuy/voice-pipeline';
import { useAuraPipeline } from './useAuraPipeline';

const speechMetric: AuraMetric = {
  name: 'fluency',
  value: 80,
  confidence: 'high',
  timestamp: 1,
};
const eyeMetric: AuraMetric = {
  name: 'eye_contact',
  value: 60,
  confidence: 'medium',
  timestamp: 1,
};

const trackerMock = {
  onTranscript: vi.fn(),
  getMetrics: vi.fn((): AuraMetric[] => []),
};
const detectMock = vi.fn((): AuraMetric[] => [eyeMetric]);
const closeMock = vi.fn();

vi.mock('@warachikuy/voice-pipeline', () => ({
  createSpeechMetricsTracker: vi.fn(() => trackerMock),
  createFaceLandmarker: vi.fn(async () => ({ detect: detectMock, close: closeMock })),
}));

const stopTrack = vi.fn();
function mockGetUserMedia(impl: () => Promise<MediaStream>) {
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: vi.fn(impl) },
    configurable: true,
  });
}
function fakeStream(): MediaStream {
  return {
    getTracks: () => [{ stop: stopTrack, addEventListener: vi.fn() }],
  } as unknown as MediaStream;
}

// Capturar createElement ANTES de cualquier spy para evitar recursion infinita
// cuando makeVideoEl es llamada dentro de un mockImplementation de createElement.
const realCreateElement = document.createElement.bind(document);

// Crea un elemento video REAL (para que appendChild/remove funcionen en happy-dom)
// con play() mockeado y videoWidth/videoHeight configurables.
// srcObject se redefine como propiedad de datos para evitar que el setter de
// happy-dom valide el tipo y lance al asignar un MediaStream simulado.
function makeVideoEl(opts: { videoWidth?: number; playFn?: () => Promise<void> } = {}) {
  const videoEl = realCreateElement('video');
  const w = opts.videoWidth ?? 2;
  Object.defineProperty(videoEl, 'videoWidth', { get: () => w, configurable: true });
  Object.defineProperty(videoEl, 'videoHeight', { get: () => w, configurable: true });
  // Redefinir srcObject como dato mutable para que la asignacion en el hook no lance
  Object.defineProperty(videoEl, 'srcObject', { value: null, writable: true, configurable: true });
  videoEl.play = vi.fn(opts.playFn ?? (async () => undefined));
  return videoEl;
}

// Avanza promesas pendientes drenando la cola de microtareas varias veces.
// Necesario porque el flujo async tiene multiples await encadenados:
// getUserMedia -> setState(stream) -> re-render -> play() -> createFaceLandmarker().
async function flushAsync(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  }
}

describe('useAuraPipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    trackerMock.getMetrics.mockReturnValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('con camara deshabilitada no pide la camara y emite snapshots solo de habla', async () => {
    mockGetUserMedia(() => Promise.reject(new Error('no debe llamarse')));
    trackerMock.getMetrics.mockReturnValue([speechMetric]);
    const onSnapshot = vi.fn();
    const { result } = renderHook(() => useAuraPipeline('s1', false, onSnapshot));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.cameraStatus).toBe('off');
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(onSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 's1', metrics: [speechMetric] }),
    );
    expect(result.current.auraState?.metrics).toEqual([speechMetric]);
  });

  it('sin ninguna metrica no emite snapshots (nada de AuraState vacios)', async () => {
    mockGetUserMedia(() => Promise.reject(new Error('x')));
    const onSnapshot = vi.fn();
    renderHook(() => useAuraPipeline('s1', false, onSnapshot));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(onSnapshot).not.toHaveBeenCalled();
  });

  it('camara denegada -> denied y el pipeline de habla sigue', async () => {
    mockGetUserMedia(() =>
      Promise.reject(new DOMException('Permission denied', 'NotAllowedError')),
    );
    trackerMock.getMetrics.mockReturnValue([speechMetric]);
    const onSnapshot = vi.fn();
    const { result } = renderHook(() => useAuraPipeline('s1', true, onSnapshot));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.cameraStatus).toBe('denied');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(onSnapshot).toHaveBeenCalled();
  });

  it('camara ok -> on, crea el landmarker y combina habla + camara', async () => {
    mockGetUserMedia(() => Promise.resolve(fakeStream()));
    trackerMock.getMetrics.mockReturnValue([speechMetric]);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'video') return makeVideoEl({ videoWidth: 2 });
      return realCreateElement(tag);
    });

    const onSnapshot = vi.fn();
    const { result } = renderHook(() => useAuraPipeline('s1', true, onSnapshot));

    // Drenar toda la cadena de promesas async: getUserMedia -> stream -> play -> createFaceLandmarker
    await flushAsync();

    expect(result.current.cameraStatus).toBe('on');
    expect(createFaceLandmarker).toHaveBeenCalledOnce();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    const last = onSnapshot.mock.calls.at(-1)?.[0] as { metrics: AuraMetric[] };
    expect(last.metrics).toEqual(expect.arrayContaining([speechMetric, eyeMetric]));
  });

  it('si createFaceLandmarker falla -> on_no_metrics: camara activa sin eye_contact', async () => {
    mockGetUserMedia(() => Promise.resolve(fakeStream()));
    vi.mocked(createFaceLandmarker).mockRejectedValueOnce(new Error('model_load_failed'));
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'video') return makeVideoEl({ videoWidth: 2 });
      return realCreateElement(tag);
    });
    const { result } = renderHook(() => useAuraPipeline('s1', true, vi.fn()));

    await flushAsync();

    // La camara sigue "on" pero con degradacion: self-view visible sin metricas
    expect(result.current.cameraStatus).toBe('on_no_metrics');
    // La camara NO se libera (el self-view sigue activo aunque falle el landmarker)
    expect(stopTrack).not.toHaveBeenCalled();
  });

  it('fallo de play() -> on_no_metrics: camara activa sin metricas de ojo', async () => {
    mockGetUserMedia(() => Promise.resolve(fakeStream()));
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'video')
        return makeVideoEl({
          videoWidth: 0,
          playFn: () => Promise.reject(new Error('NotAllowedError')),
        });
      return realCreateElement(tag);
    });
    const onSnapshot = vi.fn();
    const { result } = renderHook(() => useAuraPipeline('s1', true, onSnapshot));

    await flushAsync();

    // play() falla -> degrada a on_no_metrics
    expect(result.current.cameraStatus).toBe('on_no_metrics');
    // El stream sigue activo (el self-view permanece, solo falla el analisis)
    expect(result.current.videoStream).not.toBeNull();
    // La pista de video NO se detiene: el self-view sigue vivo
    expect(stopTrack).not.toHaveBeenCalled();
  });

  it('con processingEnabled=false no se emiten metricas de ojo en los snapshots', async () => {
    mockGetUserMedia(() => Promise.resolve(fakeStream()));
    trackerMock.getMetrics.mockReturnValue([speechMetric]);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'video') return makeVideoEl({ videoWidth: 2 });
      return realCreateElement(tag);
    });
    const onSnapshot = vi.fn();
    // processingEnabled = false (cuarto argumento)
    const { result } = renderHook(() => useAuraPipeline('s1', true, onSnapshot, false));

    await flushAsync();

    expect(result.current.cameraStatus).toBe('on');
    // Avanzamos varios frames y un intervalo de snapshot
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    // Con processingEnabled=false el frame loop vacia eyeMetricsRef, por tanto
    // los snapshots no deben incluir la metrica de ojo
    const calls = onSnapshot.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    for (const [snapshot] of calls as [{ metrics: AuraMetric[] }][]) {
      expect(snapshot.metrics.some((m) => m.name === 'eye_contact')).toBe(false);
    }
  });

  it('al apagar la camara dejan de emitirse las metricas de ojo', async () => {
    mockGetUserMedia(() => Promise.resolve(fakeStream()));
    trackerMock.getMetrics.mockReturnValue([speechMetric]);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'video') return makeVideoEl({ videoWidth: 2 });
      return realCreateElement(tag);
    });
    const onSnapshot = vi.fn();
    const { rerender } = renderHook(({ cam }) => useAuraPipeline('s1', cam, onSnapshot), {
      initialProps: { cam: true },
    });

    await flushAsync();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    const withCamera = onSnapshot.mock.calls.at(-1)?.[0] as { metrics: AuraMetric[] };
    expect(withCamera.metrics).toEqual(expect.arrayContaining([eyeMetric]));
    rerender({ cam: false });
    onSnapshot.mockClear();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    const last = onSnapshot.mock.calls.at(-1)?.[0] as { metrics: AuraMetric[] };
    expect(last.metrics).toEqual([speechMetric]);
  });

  it('feedTranscript delega al tracker de habla', () => {
    mockGetUserMedia(() => Promise.reject(new Error('x')));
    const { result } = renderHook(() => useAuraPipeline('s1', false, vi.fn()));
    const t: CandidateTranscript = { sessionId: 's1', text: 'hola', isFinal: true, timestamp: 1 };
    act(() => result.current.feedTranscript(t));
    expect(trackerMock.onTranscript).toHaveBeenCalledWith(t);
  });

  it('al desmontar libera el landmarker y los timers', async () => {
    mockGetUserMedia(() => Promise.resolve(fakeStream()));
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'video') return makeVideoEl({ videoWidth: 2 });
      return realCreateElement(tag);
    });
    const onSnapshot = vi.fn();
    const { unmount } = renderHook(() => useAuraPipeline('s1', true, onSnapshot));

    await flushAsync();

    unmount();
    expect(closeMock).toHaveBeenCalledOnce();
    expect(stopTrack).toHaveBeenCalled();
    onSnapshot.mockClear();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(onSnapshot).not.toHaveBeenCalled();
  });
});
