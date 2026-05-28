import { wrap, type Remote } from 'comlink';
import type { MetricsWorkerApi } from './metrics-worker';

export interface MetricsWorkerClient {
  api: Remote<MetricsWorkerApi>;
  terminate: () => void;
}

/**
 * Crea una instancia del Web Worker de métricas.
 * Llamar una vez al montar el componente; llamar terminate() al desmontar.
 */
export function createMetricsWorker(): MetricsWorkerClient {
  const worker = new Worker(new URL('./metrics-worker.ts', import.meta.url), { type: 'module' });
  return {
    api: wrap<MetricsWorkerApi>(worker),
    terminate: () => worker.terminate(),
  };
}
