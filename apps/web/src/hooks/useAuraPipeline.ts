import { useEffect, useRef, useState } from 'react';
import {
  createMetricsWorker,
  createSpeechMetricsTracker,
  type MetricsWorkerClient,
  type SpeechMetricsTracker,
} from '@warachikuy/voice-pipeline';
import type { AuraMetric, AuraState, CandidateTranscript } from '@warachikuy/shared-types';

export type CameraStatus = 'off' | 'starting' | 'on' | 'denied' | 'failed';

export interface AuraPipeline {
  /** Ultimo snapshot, para alimentar el AvatarAura. */
  auraState: AuraState | null;
  /** Empuja un transcript final del STT al tracker de habla. */
  feedTranscript: (t: CandidateTranscript) => void;
  cameraStatus: CameraStatus;
}

// 250 ms = 4 Hz, el maximo que acepta el backend para metrics.update
const SNAPSHOT_INTERVAL_MS = 250;

// Combina las dos fuentes de metricas (habla y camara) en AuraState periodicos.
// Las metricas sin senal se OMITEN del array (contrato 3.4: "sin datos" honesto);
// si no hay ninguna, no se emite snapshot.
export function useAuraPipeline(
  sessionId: string,
  cameraEnabled: boolean,
  onSnapshot: (s: AuraState) => void,
): AuraPipeline {
  const [auraState, setAuraState] = useState<AuraState | null>(null);
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('off');
  const trackerRef = useRef<SpeechMetricsTracker | null>(null);
  const onSnapshotRef = useRef(onSnapshot);
  onSnapshotRef.current = onSnapshot;
  // Ultima medicion de la camara; la escribe el frame loop y la lee el snapshot
  const eyeMetricsRef = useRef<AuraMetric[]>([]);

  if (trackerRef.current === null) {
    trackerRef.current = createSpeechMetricsTracker();
  }

  useEffect(() => {
    let worker: MetricsWorkerClient | null = null;
    let stream: MediaStream | null = null;
    let frameTimer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    async function startCamera(): Promise<void> {
      setCameraStatus('starting');
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      } catch {
        if (!cancelled) setCameraStatus('denied');
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      try {
        worker = createMetricsWorker();
        await worker.api.initialize();
      } catch {
        if (!cancelled) setCameraStatus('failed');
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      if (cancelled) return;

      const video = document.createElement('video');
      video.muted = true;
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      setCameraStatus('on');

      frameTimer = setInterval(() => {
        if (!ctx || !worker || video.videoWidth === 0) return;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        // Copia simple del buffer (sin Comlink.transfer): a 4 Hz y resolucion de
        // webcam el costo es bajo y evita invalidar el ImageData
        worker.api
          .processFrame(img.data.buffer as ArrayBuffer, img.width, img.height)
          .then((metrics) => {
            if (!cancelled) eyeMetricsRef.current = metrics;
          })
          .catch(() => {
            // Frame perdido: se reintenta en el proximo tick
          });
      }, SNAPSHOT_INTERVAL_MS);
    }

    if (cameraEnabled) void startCamera();

    const snapshotTimer = setInterval(() => {
      const metrics = [...trackerRef.current!.getMetrics(), ...eyeMetricsRef.current];
      if (metrics.length === 0) return;
      const state: AuraState = { sessionId, metrics, collectedAt: Date.now() };
      setAuraState(state);
      onSnapshotRef.current(state);
    }, SNAPSHOT_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (frameTimer) clearInterval(frameTimer);
      clearInterval(snapshotTimer);
      worker?.terminate();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [sessionId, cameraEnabled]);

  function feedTranscript(t: CandidateTranscript): void {
    trackerRef.current!.onTranscript(t);
  }

  return { auraState, feedTranscript, cameraStatus };
}
