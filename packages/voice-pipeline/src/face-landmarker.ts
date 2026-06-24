import { FaceLandmarker, FilesetResolver, type NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { AuraMetric } from '@warachikuy/shared-types';

const THROTTLE_MS = 250;
// WASM desde el CDN; la version la fija el override de pnpm en 0.10.35 (matchea el
// JS bundleado). En el hilo principal MediaPipe NO usa importScripts, asi que no
// aparece "ModuleFactory not set" como en el worker modulo.
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

const LEFT_IRIS_INDICES = [468, 469, 470, 471, 472] as const;
const RIGHT_IRIS_INDICES = [473, 474, 475, 476, 477] as const;
const LEFT_EYE_LEFT = 33;
const LEFT_EYE_RIGHT = 133;

export interface FaceLandmarkerClient {
  // Procesa un frame del video y devuelve la metrica de contacto visual, o []
  // (sin medicion confiable o antes del throttle). Sincrono.
  detect: (video: HTMLVideoElement) => AuraMetric[];
  close: () => void;
}

function computeIrisCenter(
  landmarks: NormalizedLandmark[],
  indices: readonly number[],
): { x: number; y: number } | null {
  let sumX = 0;
  let sumY = 0;
  for (const idx of indices) {
    const p = landmarks[idx];
    if (!p) return null;
    sumX += p.x;
    sumY += p.y;
  }
  return { x: sumX / indices.length, y: sumY / indices.length };
}

function computeEyeContact(
  landmarker: FaceLandmarker,
  video: HTMLVideoElement,
  timestamp: number,
): number | null {
  try {
    const result = landmarker.detectForVideo(video, timestamp);
    if (!result.faceLandmarks || result.faceLandmarks.length === 0) return null;

    const landmarks = result.faceLandmarks[0];
    if (!landmarks) return null;

    const leftIris = computeIrisCenter(landmarks, LEFT_IRIS_INDICES);
    const rightIris = computeIrisCenter(landmarks, RIGHT_IRIS_INDICES);
    const leftEyeLeft = landmarks[LEFT_EYE_LEFT];
    const leftEyeRight = landmarks[LEFT_EYE_RIGHT];
    const rightEyeInner = landmarks[362];
    const rightEyeOuter = landmarks[263];

    // Se elige UN ojo completo (iris + sus 2 esquinas) como unidad; el fallback
    // por-campo cruzaria el iris de un ojo con las esquinas del otro.
    let iris: { x: number; y: number };
    let eyeA: NormalizedLandmark;
    let eyeB: NormalizedLandmark;
    if (leftIris && leftEyeLeft && leftEyeRight) {
      iris = leftIris;
      eyeA = leftEyeLeft;
      eyeB = leftEyeRight;
    } else if (rightIris && rightEyeInner && rightEyeOuter) {
      iris = rightIris;
      eyeA = rightEyeInner;
      eyeB = rightEyeOuter;
    } else {
      return null;
    }

    const eyeWidth = Math.abs(eyeB.x - eyeA.x);
    if (eyeWidth < 0.001) return null;
    const eyeCenterX = (eyeA.x + eyeB.x) / 2;
    const eyeCenterY = (eyeA.y + eyeB.y) / 2;
    const dx = Math.abs(iris.x - eyeCenterX) / eyeWidth;
    const dy = Math.abs(iris.y - eyeCenterY) / eyeWidth;
    const deviation = Math.sqrt(dx * dx + dy * dy);
    return Math.max(0, Math.min(100, Math.round((1 - Math.min(deviation / 0.3, 1)) * 100)));
  } catch {
    return null;
  }
}

export async function createFaceLandmarker(): Promise<FaceLandmarkerClient> {
  const vision = await FilesetResolver.forVisionTasks(WASM_URL);
  let landmarker: FaceLandmarker;
  try {
    landmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numFaces: 1,
    });
  } catch {
    landmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
      runningMode: 'VIDEO',
      numFaces: 1,
    });
  }
  let lastProcessedAt = 0;
  return {
    detect(video: HTMLVideoElement): AuraMetric[] {
      const now = Date.now();
      if (now - lastProcessedAt < THROTTLE_MS) return [];
      lastProcessedAt = now;
      if (video.videoWidth === 0) return [];
      const value = computeEyeContact(landmarker, video, now);
      // DIAGNOSTICO temporal: confirmar que detecta rostro/iris.
      if (value === null)
        console.info('[aura/diag] detect: sin medicion (rostro/iris no confiable)');
      else console.info('[aura/diag] detect: eye_contact =', value);
      if (value === null) return [];
      return [{ name: 'eye_contact', value, confidence: 'high', timestamp: now }];
    },
    close(): void {
      landmarker.close();
    },
  };
}
