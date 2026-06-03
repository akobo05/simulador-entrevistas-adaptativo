import { render, screen } from '@testing-library/react';
import { test, expect } from 'vitest';
import { vi } from 'vitest';
import { AvatarAura } from './AvatarAura';

// Canvas de react-three-fiber no funciona en happy-dom — se reemplaza
// por un div simple que renderiza sus hijos para que los chips sean visibles.
vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="r3f-canvas">{children}</div>
  ),
  useFrame: () => {},
}));

// Drei tampoco funciona en happy-dom — se mockean sus exports usados.
vi.mock('@react-three/drei', () => ({
  MeshDistortMaterial: () => null,
  Float: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

test('muestra "sin datos" cuando una metrica es null', () => {
  render(<AvatarAura fluency={75} speechRate={null} eyeContact={null} speaking={false} />);
  expect(screen.getByTestId('aura-chip-fluency')).toHaveTextContent('75');
  expect(screen.getByTestId('aura-chip-speechRate')).toHaveTextContent(/sin datos/i);
  expect(screen.getByTestId('aura-chip-eyeContact')).toHaveTextContent(/sin datos/i);
});
