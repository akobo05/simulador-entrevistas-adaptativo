import { type FormEvent, type KeyboardEvent } from 'react';
import { Button } from './Button';

interface Props {
  // Campo controlado por el padre: el dictado del microfono se acumula aqui
  // y el candidato lo revisa antes de enviar.
  value: string;
  onChange: (texto: string) => void;
  onSendMessage: (texto: string) => void;
  disabled?: boolean;
}

export function ChatForm({ value, onChange, onSendMessage, disabled = false }: Props) {
  const submit = () => {
    if (disabled) return;
    const limpio = value.trim();
    if (!limpio) return;
    // El padre limpia el campo tras enviar; aqui solo se entrega el texto.
    onSendMessage(limpio);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit();
  };

  // Enter envia; Shift+Enter agrega un salto de linea para respuestas largas.
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="chat-form">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Escribe o dicta tu respuesta..."
        aria-label="Escribe tu respuesta"
        className="chat-input"
        rows={2}
        disabled={disabled}
      />
      <Button type="submit" disabled={disabled}>
        Enviar
      </Button>
    </form>
  );
}
