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

test('Sidebar marca activo el item de la ruta actual y no el inicio', () => {
  render(
    <MemoryRouter initialEntries={['/ranking']}>
      <Sidebar />
    </MemoryRouter>,
  );
  expect(screen.getByRole('link', { name: /ranking/i })).toHaveAttribute('aria-current', 'page');
  // El caso especial de "/" no debe marcarse activo fuera del inicio
  expect(screen.getByRole('link', { name: /inicio/i })).not.toHaveAttribute('aria-current');
});
