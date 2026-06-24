import { useEffect, useRef, useState } from 'react';
import {
  createFaceLandmarker,
  createSpeechMetricsTracker,
  type FaceLandmarkerClient,
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
  const landmarkerRef = useRef<FaceLandmarkerClient | null>(null);
  const frameTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  if (trackerRef.current === null) {
    trackerRef.current = createSpeechMetricsTracker();
  }

  // Si la camara esta activa pero el landmarker de MediaPipe fallo, degradamos
  // a on_no_metrics: el self-view sigue visible, solo falta eye_contact.
  const cameraStatus: CameraStatus =
    camera.status === 'on' && workerFailed ? 'on_no_metrics' : camera.status;

  // Landmarker + frame loop: re-create cuando cambia el stream
  useEffect(() => {
    if (!camera.stream) {
      setWorkerFailed(false);
      return;
    }

    let cancelled = false;
    const curStream: MediaStream = camera.stream;
    let activeVideo: HTMLVideoElement | null = null;

    async function initLandmarker(): Promise<void> {
      // Crear video offscreen anclado al DOM para que Chrome no congele los frames
      // (un video no conectado al DOM puede tener videoWidth=0 aunque este playing).
      const video = document.createElement('video');
      activeVideo = video;
      video.muted = true;
      video.playsInline = true; // iOS Safari: sin esto play() puede rechazar
      video.style.cssText =
        'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;';
      document.body.appendChild(video);
      video.srcObject = curStream;
      try {
        await video.play();
      } catch {
        // Degradar a on_no_metrics; el analisis no arranca pero la camara sigue
        video.remove();
        activeVideo = null;
        if (!cancelled) setWorkerFailed(true);
        return;
      }
      if (cancelled) {
        video.remove();
        activeVideo = null;
        return;
      }

      let landmarker: FaceLandmarkerClient | null = null;
      try {
        landmarker = await createFaceLandmarker();
      } catch (err) {
        console.error('[aura/diag] createFaceLandmarker fallo:', err);
        video.remove();
        activeVideo = null;
        if (!cancelled) setWorkerFailed(true);
        return;
      }

      if (cancelled) {
        landmarker.close();
        video.remove();
        activeVideo = null;
        return;
      }

      landmarkerRef.current = landmarker;
      setWorkerFailed(false);

      if (frameTimerRef.current) clearInterval(frameTimerRef.current);

      frameTimerRef.current = setInterval(() => {
        if (!processingEnabledRef.current) {
          eyeMetricsRef.current = [];
          return;
        }
        if (!landmarkerRef.current) return;
        eyeMetricsRef.current = landmarkerRef.current.detect(video);
      }, FRAME_INTERVAL_MS);
    }

    void initLandmarker();

    return () => {
      cancelled = true;
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
      if (frameTimerRef.current) {
        clearInterval(frameTimerRef.current);
        frameTimerRef.current = null;
      }
      eyeMetricsRef.current = [];
      activeVideo?.remove();
      activeVideo = null;
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
