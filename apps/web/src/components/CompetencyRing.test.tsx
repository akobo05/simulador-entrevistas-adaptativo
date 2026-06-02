import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CompetencyRing } from './CompetencyRing';

describe('CompetencyRing', () => {
  it('muestra el score cuando hay valor', () => {
    render(<CompetencyRing label="Fluidez" score={81} />);
    expect(screen.getByText('81')).toBeInTheDocument();
    expect(screen.getByText('Fluidez')).toBeInTheDocument();
  });

  it('muestra 0 como valor valido (no como sin datos)', () => {
    render(<CompetencyRing label="Contenido" score={0} />);
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.queryByText('sin datos')).not.toBeInTheDocument();
  });

  it('muestra "sin datos" cuando el score es null', () => {
    render(<CompetencyRing label="Ritmo" score={null} />);
    expect(screen.getByText('sin datos')).toBeInTheDocument();
  });
});
