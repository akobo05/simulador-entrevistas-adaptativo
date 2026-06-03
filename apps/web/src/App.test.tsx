import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SessionProvider } from './context/SessionContext';
import { Home } from './pages/Home';
import { App } from './App';

// Se mockea solo useNavigate; el resto de react-router-dom queda real
const navigateMock = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useNavigate: () => navigateMock };
});

// El orbe usa un Canvas WebGL (Three.js) que no rinde en happy-dom; se mockea
// para poder montar el App completo y verificar el cableado de rutas.
vi.mock('./components/OrbeAnimado', () => ({ OrbeAnimado: () => null }));

beforeEach(() => {
  navigateMock.mockClear();
});

describe('App', () => {
  it('renderiza el Home en la ruta raiz (cablea el route table y el provider)', async () => {
    // Monta el App real (SessionProvider + BrowserRouter + tabla de rutas + MainLayout)
    render(<App />);
    // El h1 de Home (no el wordmark del sidebar) confirma que la ruta raiz cablea el Home
    const heading = await screen.findByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent(/warachikuy/i);
  });

  it('el boton de CTA navega a /setup', async () => {
    render(
      <SessionProvider>
        <MemoryRouter initialEntries={['/']}>
          <Home />
        </MemoryRouter>
      </SessionProvider>,
    );
    const cta = await screen.findByRole('button', { name: /comenzar/i });
    fireEvent.click(cta);
    expect(navigateMock).toHaveBeenCalledWith('/setup');
  });
});
