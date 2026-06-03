import { render, screen } from '@testing-library/react';
import { test, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from './Sidebar';

test('Sidebar enlaza a rutas reales y marca F2 como proximamente', () => {
  render(
    <MemoryRouter>
      <Sidebar />
    </MemoryRouter>,
  );
  expect(screen.getByRole('link', { name: /inicio/i })).toHaveAttribute('href', '/');
  expect(screen.getByRole('link', { name: /nueva sesion/i })).toHaveAttribute('href', '/setup');
  const ranking = screen.getByText(/ranking/i).closest('[aria-disabled="true"]');
  expect(ranking).toBeTruthy();
});
