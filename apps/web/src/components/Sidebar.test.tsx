import { render, screen } from '@testing-library/react';
import { test, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from './Sidebar';

test('Sidebar enlaza a todas las rutas reales sin items diferidos', () => {
  render(
    <MemoryRouter>
      <Sidebar />
    </MemoryRouter>,
  );
  expect(screen.getByRole('link', { name: /inicio/i })).toHaveAttribute('href', '/');
  expect(screen.getByRole('link', { name: /nueva sesion/i })).toHaveAttribute('href', '/setup');
  expect(screen.getByRole('link', { name: /mi progreso/i })).toHaveAttribute('href', '/progress');
  expect(screen.getByRole('link', { name: /ranking/i })).toHaveAttribute('href', '/ranking');
  expect(screen.getByRole('link', { name: /sala de observador/i })).toHaveAttribute(
    'href',
    '/observer',
  );
  // El patron "proximamente" desaparecio por completo
  expect(screen.queryByText(/proximamente/i)).toBeNull();
});
