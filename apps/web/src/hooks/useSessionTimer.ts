import { useState, useRef, useCallback, useEffect } from 'react';
import { formatMMSS } from '../utils/formatTime';

export interface SessionTimerState {
  elapsed: number; // segundos transcurridos
  formattedTime: string; // "MM:SS"
  isRunning: boolean;
  start: () => void;
  pause: () => void;
  reset: () => void;
}

/**
 * Temporizador de sesión ascendente.
 *
 * - useRef almacena el intervalo para evitar re-renders innecesarios.
 * - Cleanup automático al desmontar el componente.
 * - Agnóstico al tema visual; úsalo desde ChatRoom u ObserverRoom
 *   y aplica los estilos correspondientes a esas pantallas.
 */
export function useSessionTimer(autoStart = false): SessionTimerState {
  const [elapsed, setElapsed] = useState(0);
  const [isRunning, setIsRunning] = useState(autoStart);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Helpers internos ──────────────────────────────────
  const clearTick = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startTick = useCallback(() => {
    if (intervalRef.current !== null) return; // ya está corriendo
    intervalRef.current = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1_000);
  }, []);

  // ── API pública ───────────────────────────────────────
  const start = useCallback(() => {
    setIsRunning(true);
    startTick();
  }, [startTick]);

  const pause = useCallback(() => {
    setIsRunning(false);
    clearTick();
  }, [clearTick]);

  const reset = useCallback(() => {
    setIsRunning(false);
    clearTick();
    setElapsed(0);
  }, [clearTick]);

  // ── Auto-start opcional ───────────────────────────────
  useEffect(() => {
    if (autoStart) startTick();
    return clearTick; // cleanup al desmontar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // solo al montar

  return {
    elapsed,
    formattedTime: formatMMSS(elapsed),
    isRunning,
    start,
    pause,
    reset,
  };
}
