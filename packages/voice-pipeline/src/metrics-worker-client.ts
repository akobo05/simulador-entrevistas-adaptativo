import { wrap, type Remote } from 'comlink';
import type { MetricsWorkerApi } from './metrics-worker';

/**
 * Crea una instancia del Web Worker de métricas y devuelve su API via Comlink.
 * Todos los métodos devuelven Promises porque cruzan el límite del worker.
 * Llamar una vez al montar el componente de la sala de entrevista.
 */
export function createMetricsWorker(): Remote<MetricsWorkerApi> {
  const worker = new Worker(new URL('./metrics-worker.ts', import.meta.url), { type: 'module' });
  return wrap<MetricsWorkerApi>(worker);
}
