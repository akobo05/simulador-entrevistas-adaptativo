import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Sin la opcion globals de vitest, testing-library no registra su limpieza
// automatica entre tests. Se limpia el DOM manualmente para evitar que el
// render de un test se filtre al siguiente.
afterEach(() => {
  cleanup();
});
