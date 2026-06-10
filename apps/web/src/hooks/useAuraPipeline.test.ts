import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { AuraMetric, CandidateTranscript } from '@warachikuy/shared-types';
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
const workerApi = {
  initialize: vi.fn(async () => undefined),
  processFrame: vi.fn(async (): Promise<AuraMetric[]> => [eyeMetric]),
  dispose: vi.fn(),
};
const terminateMock = vi.fn();

vi.mock('@warachikuy/voice-pipeline', () => ({
  createSpeechMetricsTracker: vi.fn(() => trackerMock),
  createMetricsWorker: vi.fn(() => ({ api: workerApi, terminate: terminateMock })),
}));

const stopTrack = vi.fn();
function mockGetUserMedia(impl: () => Promise<MediaStream>) {
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: vi.fn(impl) },
    configurable: true,
  });
}
function fakeStream(): MediaStream {
  return { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;
}

describe('useAuraPipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    trackerMock.getMetrics.mockReturnValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('con camara deshabilitada no pide la camara y emite snapshots solo de habla', () => {
    mockGetUserMedia(() => Promise.reject(new Error('no debe llamarse')));
    trackerMock.getMetrics.mockReturnValue([speechMetric]);
    const onSnapshot = vi.fn();
    const { result } = renderHook(() => useAuraPipeline('s1', false, onSnapshot));
    expect(result.current.cameraStatus).toBe('off');
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(onSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 's1', metrics: [speechMetric] }),
    );
    expect(result.current.auraState?.metrics).toEqual([speechMetric]);
  });

  it('sin ninguna metrica no emite snapshots (nada de AuraState vacios)', () => {
    mockGetUserMedia(() => Promise.reject(new Error('x')));
    const onSnapshot = vi.fn();
    renderHook(() => useAuraPipeline('s1', false, onSnapshot));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onSnapshot).not.toHaveBeenCalled();
  });

  it('camara denegada -> denied y el pipeline de habla sigue', async () => {
    mockGetUserMedia(() => Promise.reject(new Error('NotAllowed')));
    trackerMock.getMetrics.mockReturnValue([speechMetric]);
    const onSnapshot = vi.fn();
    const { result } = renderHook(() => useAuraPipeline('s1', true, onSnapshot));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.cameraStatus).toBe('denied');
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(onSnapshot).toHaveBeenCalled();
  });

  it('camara ok -> on, inicializa el worker y combina habla + camara', async () => {
    mockGetUserMedia(() => Promise.resolve(fakeStream()));
    trackerMock.getMetrics.mockReturnValue([speechMetric]);
    // El hook crea <video>/<canvas> internos: se stubean via createElement para
    // que el frame loop funcione en happy-dom (que no tiene video real)
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'video') {
        return {
          videoWidth: 2,
          videoHeight: 2,
          muted: false,
          srcObject: null,
          play: vi.fn(async () => undefined),
        } as unknown as HTMLVideoElement;
      }
      if (tag === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => ({
            drawImage: vi.fn(),
            getImageData: () => ({ data: new Uint8ClampedArray(16), width: 2, height: 2 }),
          }),
        } as unknown as HTMLCanvasElement;
      }
      return realCreate(tag);
    });

    const onSnapshot = vi.fn();
    const { result } = renderHook(() => useAuraPipeline('s1', true, onSnapshot));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.cameraStatus).toBe('on');
    expect(workerApi.initialize).toHaveBeenCalledOnce();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    // Segundo avance: el snapshot de t=500 ya ve la metrica de camara que
    // processFrame resolvio tras el tick de t=250 (waitFor no detecta los
    // fake timers de vitest sin el global `jest` y se colgaria)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    const last = onSnapshot.mock.calls.at(-1)?.[0] as { metrics: AuraMetric[] };
    expect(last.metrics).toEqual(expect.arrayContaining([speechMetric, eyeMetric]));
  });

  it('feedTranscript delega al tracker de habla', () => {
    mockGetUserMedia(() => Promise.reject(new Error('x')));
    const { result } = renderHook(() => useAuraPipeline('s1', false, vi.fn()));
    const t: CandidateTranscript = { sessionId: 's1', text: 'hola', isFinal: true, timestamp: 1 };
    act(() => result.current.feedTranscript(t));
    expect(trackerMock.onTranscript).toHaveBeenCalledWith(t);
  });

  it('al desmontar libera worker, stream y timers', async () => {
    mockGetUserMedia(() => Promise.resolve(fakeStream()));
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'video')
        return {
          videoWidth: 0,
          videoHeight: 0,
          muted: false,
          srcObject: null,
          play: vi.fn(async () => undefined),
        } as unknown as HTMLVideoElement;
      if (tag === 'canvas') return { getContext: () => null } as unknown as HTMLCanvasElement;
      return realCreate(tag);
    });
    const onSnapshot = vi.fn();
    const { unmount } = renderHook(() => useAuraPipeline('s1', true, onSnapshot));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    unmount();
    expect(terminateMock).toHaveBeenCalledOnce();
    expect(stopTrack).toHaveBeenCalled();
    onSnapshot.mockClear();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onSnapshot).not.toHaveBeenCalled(); // timers limpiados
  });
});
