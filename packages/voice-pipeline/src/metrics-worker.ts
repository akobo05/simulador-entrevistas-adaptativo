/**
 * Web Worker — calcula eye_contact con MediaPipe FaceLandmarker.
 * Se comunica con el hilo principal via Comlink.
 * Throttle: máximo 4 Hz (250 ms entre frames procesados).
 *
 * processFrame recibe ArrayBuffer transferable para evitar structured-clone
 * y reducir picos de GC a 4 Hz. El caller usa Comlink.transfer().
 */
import { expose } from 'comlink';
import { FaceLandmarker, FilesetResolver, type NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { AuraMetric } from '@warachikuy/shared-types';

const THROTTLE_MS = 250;

// Fuente del WASM de MediaPipe, inyectada por Vite (define en vite.config):
// en DEV es el CDN externo y en BUILD el local /mediapipe-wasm. Razon: MediaPipe
// hace import() dinamico del loader; Vite DEV NO permite importar un archivo de
// /public como modulo ("should not be imported from source code"), pero si deja
// pasar los import() a URLs http (CDN). En build no hay middleware dev, asi que
// el asset local de /mediapipe-wasm (copiado por copy:wasm, #77/#78) funciona y
// no se depende del CDN. La version del CDN matchea @mediapipe/tasks-vision.
declare const __MEDIAPIPE_WASM_URL__: string;
const WASM_URL = __MEDIAPIPE_WASM_URL__;
// Ayuda de verificacion: muestra en la consola del worker la fuente usada.
console.info('[aura] MediaPipe WASM source:', WASM_URL);
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

// Right iris contour: landmarks 473-477. Left iris contour: landmarks 468-472.
// We compute the iris center as the centroid of the contour points for accuracy.
const LEFT_IRIS_INDICES = [468, 469, 470, 471, 472] as const;
const RIGHT_IRIS_INDICES = [473, 474, 475, 476, 477] as const;
const LEFT_EYE_LEFT = 33;
const LEFT_EYE_RIGHT = 133;

let landmarker: FaceLandmarker | null = null;
let lastProcessedAt = 0;

// Lanza Error('model_load_failed') con .cause si ni GPU ni CPU pueden cargar
// el modelo, para que el caller (main thread via Comlink) lo distinga de un
// rechazo generico y pueda mostrar un mensaje claro al usuario.
async function initialize(): Promise<void> {
  if (landmarker) return;

  let vision: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;
  try {
    vision = await FilesetResolver.forVisionTasks(WASM_URL);
  } catch (err) {
    throw new Error('model_load_failed', { cause: err });
  }

  let gpuError: unknown;
  try {
    landmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numFaces: 1,
    });
    return;
  } catch (err) {
    gpuError = err;
  }

  // GPU no disponible — intentamos CPU como fallback
  try {
    landmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
      runningMode: 'VIDEO',
      numFaces: 1,
    });
  } catch (cpuError) {
    throw new Error('model_load_failed', { cause: { gpuError, cpuError } });
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

function computeEyeContact(imageData: ImageData, timestamp: number): number | null {
  if (!landmarker) return null;

  try {
    const result = landmarker.detectForVideo(imageData, timestamp);
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
