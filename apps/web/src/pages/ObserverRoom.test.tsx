import { render, screen } from '@testing-library/react';
import { test, expect } from 'vitest';
import { ObserverRoom } from './ObserverRoom';

test('ObserverRoom renderiza el lobby con titulo, perfiles de observador y boton de entrada', () => {
  render(<ObserverRoom />);
  expect(screen.getByText('Sala de observación')).toBeInTheDocument();
  expect(screen.getByPlaceholderText('room-id')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /estudiante/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /docente/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /reclutador/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /invitado/i })).toBeInTheDocument();
  expect(screen.getByText('Entrar a la sala')).toBeInTheDocument();
});
