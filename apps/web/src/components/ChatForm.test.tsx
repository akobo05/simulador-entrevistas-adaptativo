import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ChatForm } from './ChatForm';

// Wrapper controlado: replica el patron real (el padre es dueño del texto).
// Asi se prueba el campo editable que recibe el dictado y el envio.
function Harness({
  onSendMessage,
  initial = '',
  disabled = false,
}: {
  onSendMessage: (t: string) => void;
  initial?: string;
  disabled?: boolean;
}) {
  const [value, setValue] = useState(initial);
  return (
    <ChatForm value={value} onChange={setValue} onSendMessage={onSendMessage} disabled={disabled} />
  );
}

describe('ChatForm', () => {
  it('muestra el valor controlado y propaga los cambios al padre', () => {
    render(<Harness onSendMessage={vi.fn()} initial="dictado en curso" />);
    const box = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(box.value).toBe('dictado en curso');
    fireEvent.change(box, { target: { value: 'dictado en curso corregido' } });
    expect(box.value).toBe('dictado en curso corregido');
  });

  it('al enviar entrega el texto recortado', () => {
    const onSend = vi.fn();
    render(<Harness onSendMessage={onSend} initial="  mi respuesta  " />);
    fireEvent.submit(screen.getByRole('textbox').closest('form')!);
    expect(onSend).toHaveBeenCalledWith('mi respuesta');
  });

  it('no envia si el campo esta vacio o en blanco', () => {
    const onSend = vi.fn();
    render(<Harness onSendMessage={onSend} initial="   " />);
    fireEvent.submit(screen.getByRole('textbox').closest('form')!);
    expect(onSend).not.toHaveBeenCalled();
  });

  it('Enter envia, Shift+Enter no', () => {
    const onSend = vi.fn();
    render(<Harness onSendMessage={onSend} initial="texto" />);
    const box = screen.getByRole('textbox');
    fireEvent.keyDown(box, { key: 'Enter', shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onSend).toHaveBeenCalledWith('texto');
  });

  it('deshabilitado no envia ni por submit ni por Enter', () => {
    const onSend = vi.fn();
    render(<Harness onSendMessage={onSend} initial="texto" disabled />);
    fireEvent.submit(screen.getByRole('textbox').closest('form')!);
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(onSend).not.toHaveBeenCalled();
  });
});
