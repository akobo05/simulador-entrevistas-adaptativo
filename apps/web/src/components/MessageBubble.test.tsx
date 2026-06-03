import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessageBubble } from './MessageBubble';
import type { ChatItem } from '../hooks/useInterviewSocket';

const item = (role: ChatItem['role'], text: string): ChatItem => ({
  id: '1',
  role,
  text,
  timestamp: 1,
});

describe('MessageBubble', () => {
  it('rotula al entrevistador', () => {
    render(<MessageBubble item={item('interviewer', 'Hola')} />);
    expect(screen.getByText(/Entrevistador/)).toBeInTheDocument();
    expect(screen.getByText('Hola')).toBeInTheDocument();
  });
  it('rotula al candidato', () => {
    render(<MessageBubble item={item('candidate', 'Mi respuesta')} />);
    expect(screen.getByText(/Tú/)).toBeInTheDocument();
    expect(screen.getByText('Mi respuesta')).toBeInTheDocument();
  });
});
