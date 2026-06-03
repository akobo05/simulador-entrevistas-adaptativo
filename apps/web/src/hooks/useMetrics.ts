import { useState, useEffect, useCallback, useRef } from 'react';

// ── Tipos públicos ────────────────────────────────────────
export interface MetricsState {
  fluency: number; // fluidez       0-100
  rhythm: number; // ritmo         0-100
  level: number; // nivel         0-100
  pause: number; // pausas        0-100
}

export type MetricKey = keyof MetricsState;

export interface UseMetricsReturn {
  metrics: MetricsState;
  updateMetric: (key: MetricKey, value: number) => void;
}

// ── Constantes ────────────────────────────────────────────
const FLUCTUATION_INTERVAL_MS = 2_000;
const MIN_DELTA = 2;
const MAX_DELTA = 5;

// ── Helpers ───────────────────────────────────────────────
function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

/** Genera un delta aleatorio entre ±MIN_DELTA y ±MAX_DELTA */
function randomDelta(): number {
  const magnitude = MIN_DELTA + Math.random() * (MAX_DELTA - MIN_DELTA);
  return Math.random() < 0.5 ? magnitude : -magnitude;
}

/**
 * Simula métricas de sesión en tiempo real.
 *
 * Cada 2 segundos cada métrica varía ±2-5 puntos (clamp 0-100).
 * También expone `updateMetric` para sobrescribir un valor
 * manualmente (útil cuando llegan datos reales por WebSocket).
 *
 * Agnóstico al tema visual; los componentes consumidores
 * aplican sus propias variables CSS.
 *
 * @param initialValues  Valores de arranque para las cuatro métricas.
 */
export function useMetrics(initialValues: MetricsState): UseMetricsReturn {
  const [metrics, setMetrics] = useState<MetricsState>({
    fluency: clamp(initialValues.fluency),
    rhythm: clamp(initialValues.rhythm),
    level: clamp(initialValues.level),
    pause: clamp(initialValues.pause),
  });

  // Ref para que el intervalo siempre lea el estado más reciente
  // sin necesidad de re-crear el intervalo en cada render.
  const metricsRef = useRef(metrics);
  useEffect(() => {
    metricsRef.current = metrics;
  }, [metrics]);

  // ── Fluctuación automática ────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      setMetrics((prev) => ({
        fluency: clamp(Math.round(prev.fluency + randomDelta())),
        rhythm: clamp(Math.round(prev.rhythm + randomDelta())),
        level: clamp(Math.round(prev.level + randomDelta())),
        pause: clamp(Math.round(prev.pause + randomDelta())),
      }));
    }, FLUCTUATION_INTERVAL_MS);

    return () => clearInterval(id); // cleanup al desmontar
  }, []); // sin dependencias: solo al montar

  // ── API pública ───────────────────────────────────────
  const updateMetric = useCallback((key: MetricKey, value: number) => {
    setMetrics((prev) => ({
      ...prev,
      [key]: clamp(Math.round(value)),
    }));
  }, []);

  return { metrics, updateMetric };
}
