import { test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProgressRing } from './ProgressRing';

test('ProgressRing muestra el valor y expone aria-label', () => {
  render(<ProgressRing value={73} label="Fluidez" />);
  expect(screen.getByText('73%')).toBeInTheDocument();
  expect(screen.getByRole('img', { name: /73/ })).toBeInTheDocument();
});
