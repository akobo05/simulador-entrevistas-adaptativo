// Funcion pura que formatea la hora (hh:mm) de un mensaje del chat.
export const formatTime = (date: Date): string => {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

// Convierte segundos totales al formato MM:SS con padding de ceros.
export function formatMMSS(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

// Devuelve una representacion legible de segundos (ej. "45 seg" o "2 min").
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  if (s < 60) return `${s} seg`;
  return `${Math.round(s / 60)} min`;
}
