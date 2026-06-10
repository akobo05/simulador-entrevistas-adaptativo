import { render, screen } from '@testing-library/react';
import { test, expect } from 'vitest';
import { ObserverRoom } from './ObserverRoom';

// La pagina es mock con timer EN VIVO (setInterval con cleanup; el
// afterEach(cleanup) de test-setup desmonta y corta los timers). El timer
// arranca en 823s = "13:43"; la asercion corre antes del primer tick (1s).
test('ObserverRoom renderiza la sala en vivo y su landmark', () => {
  render(<ObserverRoom />);
  expect(screen.getByRole('main')).toBeInTheDocument();
  expect(screen.getByText('EN VIVO')).toBeInTheDocument();
  expect(screen.getByText('13:43')).toBeInTheDocument();
});
