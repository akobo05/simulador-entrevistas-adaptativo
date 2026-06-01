import type { Mensaje } from '../hooks/useCustomWebSocket';

interface Props {
  mensaje: Mensaje;
}

export function MessageBubble({ mensaje }: Props) {
  return (
    <div className="message-bubble">
      <strong>{mensaje.tipo === 'ai' ? 'Entrevistador' : 'Tú'}: </strong>
      <span>{mensaje.contenido}</span>
    </div>
  );
}
