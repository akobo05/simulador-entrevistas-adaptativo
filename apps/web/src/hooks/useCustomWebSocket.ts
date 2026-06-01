import { useState } from 'react';

// TODO(ws): STUB TEMPORAL. La conexion real al WebSocket /v1/sessions/:id/ws
// (usando los contratos ClientToServerMessage / ServerToClientMessage de
// @warachikuy/shared-types) se implementa en la integracion de F1 (#42). Por
// ahora readyState esta fijo en 1 y la lista de mensajes siempre esta vacia:
// nada de esto refleja una conexion real.

export interface Mensaje {
  id: string;
  tipo: 'ai' | 'user';
  contenido: string;
}

export const useCustomWebSocket = () => {
  const [mensajes, _setMensajes] = useState<Mensaje[]>([]);
  const sendJsonMessage = (msg: Mensaje) => {
    // Guardado tras DEV: las respuestas de entrevista pueden ser PII y no deben
    // loguearse en produccion. (Stub: aun no se envia nada por red.)
    if (import.meta.env.DEV) {
      console.log('Enviando (stub):', msg);
    }
  };
  const readyState = 1;
  return { mensajes, sendJsonMessage, readyState };
};
