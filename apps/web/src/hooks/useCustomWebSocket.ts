import { useState } from 'react';
// import { WS_URL } from '../utils/constants';

export interface Mensaje {
  tipo: string;
  contenido: string;
}

export const useCustomWebSocket = () => {
  const [mensajes, _setMensajes] = useState<Mensaje[]>([]);
  const sendJsonMessage = (msg: Mensaje) => console.log('Enviando:', msg);
  const readyState = 1;
  return { mensajes, sendJsonMessage, readyState };
};
