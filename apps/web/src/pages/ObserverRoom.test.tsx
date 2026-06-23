import { render, screen } from '@testing-library/react';
import { test, expect } from 'vitest';
import { ObserverRoom } from './ObserverRoom';

test('ObserverRoom renderiza el lobby con titulo, campos y boton de entrada', () => {
  render(<ObserverRoom />);
  expect(screen.getByText('Sala de observación')).toBeInTheDocument();
  expect(screen.getByPlaceholderText('room-id')).toBeInTheDocument();
  expect(screen.getByText('🎤 Candidato')).toBeInTheDocument();
  expect(screen.getByText('🎙 Entrevistador')).toBeInTheDocument();
  expect(screen.getByText('👁 Observador')).toBeInTheDocument();
  expect(screen.getByText('Entrar a la sala')).toBeInTheDocument();
});
