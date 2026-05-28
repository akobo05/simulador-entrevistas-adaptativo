import React from 'react';
import type { Mensaje } from '../hooks/useCustomWebSocket';

interface Props {
  mensaje: Mensaje;
}

export function MessageBubble({ mensaje }: Props) {
  return (
    <div style={{ padding: '10px', border: '1px solid #ccc', margin: '5px 0' }}>
      <strong>{mensaje.tipo === 'ai' ? 'Entrevistador' : 'Tú'}: </strong>
      <span>{mensaje.contenido}</span>
    </div>
  );
}
