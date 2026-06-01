// Funcion pura que formatea la hora (hh:mm) de un mensaje del chat.
export const formatTime = (date: Date): string => {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};
