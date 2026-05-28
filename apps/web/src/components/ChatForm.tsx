import React, { useState } from 'react';
import { Button } from './Button';

interface Props {
  onSendMessage: (texto: string) => void;
}

export function ChatForm({ onSendMessage }: Props) {
  const [texto, setTexto] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!texto.trim()) return;
    onSendMessage(texto);
    setTexto('');
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '8px' }}>
      <input
        type="text"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Escribe tu respuesta..."
        style={{ flex: 1, padding: '8px' }}
      />
      <Button type="submit">Enviar</Button>
    </form>
  );
}
