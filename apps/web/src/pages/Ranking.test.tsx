import { render, screen } from '@testing-library/react';
import { test, expect } from 'vitest';
import { Ranking } from './Ranking';

// La pagina es mock (datos inline); el test cubre que el chunk monta,
// que aporta su landmark main y que el encabezado es accesible.
test('Ranking renderiza el encabezado y su landmark', () => {
  render(<Ranking />);
  expect(screen.getByRole('main')).toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 1, name: /ranking/i })).toBeInTheDocument();
});
