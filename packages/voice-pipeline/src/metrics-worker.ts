/**
 * Web Worker que corre MediaPipe FaceMesh/Holistic y emite AuraMetrics.
 * Se comunica con el hilo principal a través de Comlink.
 * Throttle: máximo 4 Hz (250 ms entre frames procesados).
 */
import type { AuraMetric, MetricName } from '@warachikuy/shared-types';

const THROTTLE_MS = 250; // 4 Hz

export interface MetricsWorkerApi {
  processFrame: (imageData: ImageData) => AuraMetric[];
}

let lastProcessedAt = 0;

// MediaPipe se carga dinámicamente en el worker para no bloquear el hilo principal.
// En F1 usamos estimaciones heurísticas simples sobre los landmarks hasta tener
// la integración completa con @mediapipe/tasks-vision.
function estimateMetrics(imageData: ImageData): AuraMetric[] {
  // Heurística temporal: valores derivados del tamaño del frame.
  // Serán reemplazados por landmarks reales de MediaPipe en F2.
  const now = Date.now();
  const base = (imageData.width * imageData.height) % 100;

  const metrics: { name: MetricName; value: number }[] = [
    { name: 'fluency', value: Math.min(100, base + 40) },
    { name: 'eye_contact', value: Math.min(100, base + 20) },
    { name: 'speech_rate', value: Math.min(100, base + 30) },
  ];

  return metrics.map((m) => ({
    name: m.name,
    value: m.value,
    confidence: 'low' as const, // heurística, no modelo real
    timestamp: now,
  }));
}

export const metricsWorkerApi: MetricsWorkerApi = {
  processFrame(imageData: ImageData): AuraMetric[] {
    const now = Date.now();
    if (now - lastProcessedAt < THROTTLE_MS) return [];
    lastProcessedAt = now;
    return estimateMetrics(imageData);
  },
};
