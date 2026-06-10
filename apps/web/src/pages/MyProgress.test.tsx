import { render, screen } from '@testing-library/react';
import { test, expect } from 'vitest';
import { MyProgress } from './MyProgress';

// La pagina es mock (datos inline); ya trae su <main className="mp-main">.
test('MyProgress renderiza sus secciones y su landmark', () => {
  render(<MyProgress />);
  expect(screen.getByRole('main')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /ruta de aprendizaje/i })).toBeInTheDocument();
});
