import { useState, type FormEvent } from 'react';
import { Button } from './Button';

interface Props {
  onSendMessage: (texto: string) => void;
}

export function ChatForm({ onSendMessage }: Props) {
  const [texto, setTexto] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
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
      />
      <Button type="submit">Enviar</Button>
    </form>
  );
}
