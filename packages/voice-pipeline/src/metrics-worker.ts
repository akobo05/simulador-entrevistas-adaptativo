/**
 * Web Worker — calcula eye_contact con MediaPipe FaceLandmarker.
 * Se comunica con el hilo principal via Comlink.
 * Throttle: máximo 4 Hz (250 ms entre frames procesados).
 *
 * processFrame recibe ArrayBuffer transferable para evitar structured-clone
 * y reducir picos de GC a 4 Hz. El caller usa Comlink.transfer().
 */
import { expose } from 'comlink';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import type { AuraMetric } from '@warachikuy/shared-types';

const THROTTLE_MS = 250;
// Versión fija para reproducibilidad y evitar deriva del CDN
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

const LEFT_IRIS_CENTER = 473;
const LEFT_EYE_LEFT = 33;
const LEFT_EYE_RIGHT = 133;

let landmarker: FaceLandmarker | null = null;
let lastProcessedAt = 0;

async function initialize(): Promise<void> {
  if (landmarker) return;
  try {
    const vision = await FilesetResolver.forVisionTasks(WASM_URL);
    landmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
      runningMode: 'VIDEO', // VIDEO para frames continuos, no IMAGE
      numFaces: 1,
    });
  } catch {
    // Fallback a CPU si GPU no está disponible
    const vision = await FilesetResolver.forVisionTasks(WASM_URL);
    landmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
      runningMode: 'VIDEO',
      numFaces: 1,
    });
  }
}

function dispose(): void {
  landmarker?.close();
  landmarker = null;
}

// Retorna null cuando no hay medicion confiable (sin landmarker, sin rostro,
// landmarks incompletos, ojo degenerado, o exception del detector). El caller
// debe filtrar los null antes de emitir metricas, conforme a la spec 3.4:
// "Si una metrica no tiene confianza suficiente para reportarse, se omite del array".
function computeEyeContact(imageData: ImageData, timestamp: number): number | null {
  if (!landmarker) return null;

  try {
    // detectForVideo requiere timestamp en ms (no unix epoch, sino tiempo relativo)
    const result = landmarker.detectForVideo(imageData, timestamp);
    if (!result.faceLandmarks || result.faceLandmarks.length === 0) return null;

    const landmarks = result.faceLandmarks[0];
    if (!landmarks) return null;
    const leftIris = landmarks[LEFT_IRIS_CENTER];
    const leftEyeLeft = landmarks[LEFT_EYE_LEFT];
    const leftEyeRight = landmarks[LEFT_EYE_RIGHT];

    if (!leftIris || !leftEyeLeft || !leftEyeRight) return null;

    const eyeWidth = Math.abs(leftEyeRight.x - leftEyeLeft.x);
    if (eyeWidth < 0.001) return null;

    const eyeCenterX = (leftEyeLeft.x + leftEyeRight.x) / 2;
    const eyeCenterY = (leftEyeLeft.y + leftEyeRight.y) / 2;

    const dx = Math.abs(leftIris.x - eyeCenterX) / eyeWidth;
    const dy = Math.abs(leftIris.y - eyeCenterY) / eyeWidth;
    const deviation = Math.sqrt(dx * dx + dy * dy);

    return Math.max(0, Math.min(100, Math.round((1 - Math.min(deviation / 0.3, 1)) * 100)));
  } catch {
    return null;
  }
}

// Recibe ArrayBuffer transferable en vez de ImageData para evitar structured-clone
// Caller: api.processFrame(Comlink.transfer(imageData.data.buffer, [imageData.data.buffer]), w, h)
function processFrame(buffer: ArrayBuffer, width: number, height: number): AuraMetric[] {
  const now = Date.now();
  if (now - lastProcessedAt < THROTTLE_MS) return [];
  lastProcessedAt = now;

  const imageData = new ImageData(new Uint8ClampedArray(buffer), width, height);
  const eyeValue = computeEyeContact(imageData, now);

  // null = sin medicion confiable, omitimos la metrica del snapshot
  if (eyeValue === null) return [];

  return [
    {
      name: 'eye_contact',
      value: eyeValue,
      confidence: 'high',
      timestamp: now,
    },
  ];
}

export interface MetricsWorkerApi {
  initialize: () => Promise<void>;
  processFrame: (buffer: ArrayBuffer, width: number, height: number) => AuraMetric[];
  dispose: () => void;
}

expose({ initialize, processFrame, dispose });
