import { useState, type FormEvent } from 'react';
import { Button } from './Button';

interface Props {
  onSendMessage: (texto: string) => void;
  disabled?: boolean;
}

export function ChatForm({ onSendMessage, disabled = false }: Props) {
  const [texto, setTexto] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (disabled) return;
    const limpio = texto.trim();
    if (!limpio) return;
    // Limpiamos el input de forma optimista (UX comun). Cuando llegue el WS
    // real (#42), un envio fallido deberia restaurar el texto (rollback); por
    // ahora el stub no falla.
    onSendMessage(limpio);
    setTexto('');
  };

  return (
    <form onSubmit={handleSubmit} className="chat-form">
      <input
        type="text"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Escribe tu respuesta..."
        aria-label="Escribe tu respuesta"
        className="chat-input"
        disabled={disabled}
      />
      <Button type="submit" disabled={disabled}>
        Enviar
      </Button>
    </form>
  );
}
