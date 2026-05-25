/**
 * Web Worker — calcula eye_contact con MediaPipe FaceLandmarker.
 * Se comunica con el hilo principal via Comlink.
 * Throttle: máximo 4 Hz (250 ms entre frames procesados).
 */
import { expose } from 'comlink';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import type { AuraMetric } from '@warachikuy/shared-types';

const THROTTLE_MS = 250;
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

// Índices de landmarks para los iris y esquinas del ojo izquierdo
const LEFT_IRIS_CENTER = 473;
const LEFT_EYE_LEFT = 33;
const LEFT_EYE_RIGHT = 133;

let landmarker: FaceLandmarker | null = null;
let lastProcessedAt = 0;

async function initialize(): Promise<void> {
  if (landmarker) return;
  const vision = await FilesetResolver.forVisionTasks(WASM_URL);
  landmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
    runningMode: 'IMAGE',
    numFaces: 1,
  });
}

function computeEyeContact(imageData: ImageData): number {
  if (!landmarker) return 50;

  const result = landmarker.detect(imageData);
  if (!result.faceLandmarks || result.faceLandmarks.length === 0) return 0;

  const landmarks = result.faceLandmarks[0];
  if (!landmarks) return 50;
  const leftIris = landmarks[LEFT_IRIS_CENTER];
  const leftEyeLeft = landmarks[LEFT_EYE_LEFT];
  const leftEyeRight = landmarks[LEFT_EYE_RIGHT];

  if (!leftIris || !leftEyeLeft || !leftEyeRight) return 50;

  const eyeWidth = Math.abs(leftEyeRight.x - leftEyeLeft.x);
  if (eyeWidth < 0.001) return 50;

  const eyeCenterX = (leftEyeLeft.x + leftEyeRight.x) / 2;
  const eyeCenterY = (leftEyeLeft.y + leftEyeRight.y) / 2;

  // Desviación del iris respecto al centro del ojo, normalizada por el ancho del ojo
  const dx = Math.abs(leftIris.x - eyeCenterX) / eyeWidth;
  const dy = Math.abs(leftIris.y - eyeCenterY) / eyeWidth;
  const deviation = Math.sqrt(dx * dx + dy * dy);

  // 0 desviación → 100 puntos, desviación ≥ 0.3 → 0 puntos
  return Math.max(0, Math.min(100, Math.round((1 - Math.min(deviation / 0.3, 1)) * 100)));
}

function processFrame(imageData: ImageData): AuraMetric[] {
  const now = Date.now();
  if (now - lastProcessedAt < THROTTLE_MS) return [];
  lastProcessedAt = now;

  return [
    {
      name: 'eye_contact',
      value: computeEyeContact(imageData),
      confidence: landmarker ? 'high' : 'low',
      timestamp: now,
    },
  ];
}

export interface MetricsWorkerApi {
  initialize: () => Promise<void>;
  processFrame: (imageData: ImageData) => AuraMetric[];
}

expose({ initialize, processFrame });
