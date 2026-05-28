// Función pura tipada para mostrar la hora de los mensajes
export const formatDate = (date: Date): string => {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};
