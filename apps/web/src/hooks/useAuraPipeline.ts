import { useEffect, useRef, useState } from 'react';
import {
  createMetricsWorker,
  createSpeechMetricsTracker,
  type MetricsWorkerClient,
  type SpeechMetricsTracker,
} from '@warachikuy/voice-pipeline';
import type { AuraMetric, AuraState, CandidateTranscript } from '@warachikuy/shared-types';
import { useCamera, type CameraStatus } from './useCamera';

export type { CameraStatus } from './useCamera';

export interface AuraPipeline {
  auraState: AuraState | null;
  feedTranscript: (t: CandidateTranscript) => void;
  cameraStatus: CameraStatus;
  videoStream: MediaStream | null;
}

const SNAPSHOT_INTERVAL_MS = 250;
const FRAME_INTERVAL_MS = 300;

export function useAuraPipeline(
  sessionId: string,
  cameraEnabled: boolean,
  onSnapshot: (s: AuraState) => void,
  processingEnabled = true,
): AuraPipeline {
  const [auraState, setAuraState] = useState<AuraState | null>(null);
  const [workerFailed, setWorkerFailed] = useState(false);
  const camera = useCamera({ autoStart: cameraEnabled });
  const trackerRef = useRef<SpeechMetricsTracker | null>(null);
  const onSnapshotRef = useRef(onSnapshot);
  onSnapshotRef.current = onSnapshot;
  const processingEnabledRef = useRef(processingEnabled);
  processingEnabledRef.current = processingEnabled;
  const eyeMetricsRef = useRef<AuraMetric[]>([]);
  const workerRef = useRef<MetricsWorkerClient | null>(null);
  const frameTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  if (trackerRef.current === null) {
    trackerRef.current = createSpeechMetricsTracker();
  }

  // Si la cámara está activa pero el worker de MediaPipe falló, degradamos
  // a on_no_metrics: el self-view sigue visible, solo falta eye_contact.
  const cameraStatus: CameraStatus =
    camera.status === 'on' && workerFailed ? 'on_no_metrics' : camera.status;

  // Worker + frame loop: re-create cuando cambia el stream
  useEffect(() => {
    if (!camera.stream) {
      setWorkerFailed(false);
      return;
    }

    let cancelled = false;
    const curStream: MediaStream = camera.stream;

    async function initWorker(): Promise<void> {
      let w: MetricsWorkerClient | null = null;
      try {
        w = createMetricsWorker();
        await w.api.initialize();

        if (cancelled) {
          w.terminate();
          return;
        }

        workerRef.current = w;
        setWorkerFailed(false);

        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true; // iOS Safari: sin esto play() puede rechazar
        video.srcObject = curStream;
        try {
          await video.play();
        } catch {
          // FIX 3: degradar a on_no_metrics; el analisis no arranca pero la camara sigue
          workerRef.current?.terminate();
          workerRef.current = null;
          if (!cancelled) setWorkerFailed(true);
          return;
        }
        if (cancelled) return;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        if (frameTimerRef.current) clearInterval(frameTimerRef.current);

        // Captura w como no-nulo: en este punto initialize() ya resolvio y
        // el cancelled check previo garantiza que w esta asignado.
        const worker = w;
        frameTimerRef.current = setInterval(() => {
          if (!processingEnabledRef.current) {
            eyeMetricsRef.current = [];
            return;
          }
          if (!ctx || video.videoWidth === 0) return;
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          worker.api
            .processFrame(img.data.buffer as ArrayBuffer, img.width, img.height)
            .then((metrics) => {
              if (!cancelled) eyeMetricsRef.current = metrics;
            })
            .catch(() => {});
        }, FRAME_INTERVAL_MS);
      } catch {
        // FIX 1: no dejar el worker zombie si initialize() (u otra cosa) lanza
        w?.terminate();
        if (!cancelled) setWorkerFailed(true);
      }
    }

    void initWorker();

    return () => {
      cancelled = true;
      workerRef.current?.terminate();
      workerRef.current = null;
      if (frameTimerRef.current) {
        clearInterval(frameTimerRef.current);
        frameTimerRef.current = null;
      }
      eyeMetricsRef.current = [];
    };
  }, [camera.stream]);

  // Snapshot timer: corre siempre, independiente de la camara
  useEffect(() => {
    const id = setInterval(() => {
      const metrics = [...trackerRef.current!.getMetrics(), ...eyeMetricsRef.current];
      if (metrics.length === 0) return;
      const state: AuraState = { sessionId, metrics, collectedAt: Date.now() };
      setAuraState(state);
      onSnapshotRef.current(state);
    }, SNAPSHOT_INTERVAL_MS);

    return () => clearInterval(id);
  }, [sessionId]);

  function feedTranscript(t: CandidateTranscript): void {
    trackerRef.current!.onTranscript(t);
  }

  return { auraState, feedTranscript, cameraStatus, videoStream: camera.stream };
}
