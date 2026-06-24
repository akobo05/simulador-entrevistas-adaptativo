import { useEffect, useRef, useState } from 'react';
import {
  createMetricsWorker,
  createSpeechMetricsTracker,
  type MetricsWorkerClient,
  type SpeechMetricsTracker,
} from '@warachikuy/voice-pipeline';
import type { AuraMetric, AuraState, CandidateTranscript } from '@warachikuy/shared-types';

export type CameraStatus = 'off' | 'starting' | 'on' | 'on_no_metrics' | 'denied' | 'failed';

export interface AuraPipeline {
  /** Ultimo snapshot, para alimentar el AvatarAura. */
  auraState: AuraState | null;
  /** Empuja un transcript final del STT al tracker de habla. */
  feedTranscript: (t: CandidateTranscript) => void;
  cameraStatus: CameraStatus;
  /** Stream de la camara para el self-view; null si no esta activa. */
  videoStream: MediaStream | null;
}

// 250 ms = 4 Hz, el maximo que acepta el backend para metrics.update
const SNAPSHOT_INTERVAL_MS = 250;
// El frame loop corre MAS LENTO que el throttle interno del worker (250 ms):
// con el mismo periodo, el jitter del postMessage hace que el worker descarte
// frames y devuelva [] intermitente (el aura parpadearia "sin datos")
const FRAME_INTERVAL_MS = 300;

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
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
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

    function delay(ms: number): Promise<void> {
      return new Promise((r) => setTimeout(r, ms));
    }

    async function startCamera(): Promise<void> {
      setCameraStatus('starting');
      const maxRetries = 2;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15 } },
          });
          break;
        } catch (err) {
          const isNotAllowed = (err as DOMException)?.name === 'NotAllowedError';
          if (cancelled) return;
          if (isNotAllowed) {
            setCameraStatus('denied');
            return;
          }
          if (attempt < maxRetries) {
            await delay(1000 * (attempt + 1));
            if (cancelled) return;
            continue;
          }
          setCameraStatus('failed');
          return;
        }
      }
      const cam = stream!;
      if (cancelled) {
        cam.getTracks().forEach((t) => t.stop());
        return;
      }

      // Preview YA: el self-view aparece apenas la camara entrega frames, sin
      // esperar a MediaPipe. "Ver mi camara" no depende de "MediaPipe pudo medir
      // contacto visual": responsabilidades separadas que deben fallar por separado.
      setCameraStatus('on');
      setVideoStream(cam);

      // Si la camara muere a mitad de sesion (se desenchufa, el SO revoca el
      // permiso) hay que cortar el loop y avisar.
      cam.getTracks().forEach((track) =>
        track.addEventListener('ended', () => {
          if (cancelled) return;
          if (frameTimer) clearInterval(frameTimer);
          eyeMetricsRef.current = [];
          setCameraStatus('failed');
          setVideoStream(null);
        }),
      );

      // Analisis (MediaPipe) como paso SEPARADO. Si algo falla (carga del WASM,
      // descarga del modelo, GPU/CPU, o el play del video de analisis), se degrada
      // a 'on_no_metrics': la camara sigue encendida y visible, sin eye_contact.
      try {
        worker = createMetricsWorker();
        await worker.api.initialize();
        if (cancelled) return;

        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true; // iOS Safari: sin esto play() puede rechazar
        video.srcObject = cam;
        await video.play();
        if (cancelled) return;

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

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
        }, FRAME_INTERVAL_MS);
      } catch (err) {
        // Degradacion: el analisis no arranco, pero la camara sigue viva. Se
        // termina el worker para no dejarlo zombie ocupando memoria. terminate()
        // es idempotente: si el cleanup ya lo llamo (unmount durante el init), el
        // segundo llamado es un no-op seguro.
        worker?.terminate();
        worker = null;
        if (!cancelled) setCameraStatus('on_no_metrics');
        console.warn('[aura] MediaPipe no inicializo; la camara sigue activa', err);
      }
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
      setVideoStream(null);
      // Sin camara no puede quedar un eye_contact congelado emitiendose: el
      // proximo ciclo (toggle/remontaje) debe arrancar "sin datos" honesto
      eyeMetricsRef.current = [];
    };
  }, [sessionId, cameraEnabled]);

  function feedTranscript(t: CandidateTranscript): void {
    trackerRef.current!.onTranscript(t);
  }

  return { auraState, feedTranscript, cameraStatus, videoStream };
}
