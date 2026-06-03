// ── Función existente ────────────────────────────────────
// Formatea la hora (hh:mm) de un mensaje del chat.
export const formatTime = (date: Date): string => {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

// ── Nuevas funciones ─────────────────────────────────────

/**
 * Formatea segundos enteros en "MM:SS".
 * Ejemplos: 0 → "00:00" · 65 → "01:05" · 1102 → "18:22"
 */
export const formatMMSS = (seconds: number): string => {
  const total = Math.max(0, Math.floor(seconds));
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
};

/**
 * Formatea segundos enteros en texto legible.
 * < 60 s  → "X seg"
 * ≥ 60 s  → "X min"  (redondeado al minuto más cercano)
 * Ejemplos: 45 → "45 seg" · 2700 → "45 min" · 90 → "2 min"
 */
export const formatDuration = (seconds: number): string => {
  const total = Math.max(0, Math.floor(seconds));
  if (total < 60) return `${total} seg`;
  return `${Math.round(total / 60)} min`;
};
