import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SessionProvider } from './context/SessionContext';
import { Home } from './pages/Home';

/* Prueba de integracion: renderiza App completo en la ruta raiz */
describe('App', () => {
  it('renderiza el Home en la ruta raiz', async () => {
    render(
      <SessionProvider>
        <MemoryRouter initialEntries={['/']}>
          <Home />
        </MemoryRouter>
      </SessionProvider>,
    );
    /* findBy espera la resolucion de Suspense si aplica */
    expect(await screen.findByText(/Warachikuy/i)).toBeInTheDocument();
  });

  it('el titulo principal es accesible como heading', async () => {
    render(
      <SessionProvider>
        <MemoryRouter initialEntries={['/']}>
          <Home />
        </MemoryRouter>
      </SessionProvider>,
    );
    const heading = await screen.findByRole('heading', { level: 1 });
    expect(heading).toBeInTheDocument();
  });

  it('el boton de CTA existe y navega a /setup', async () => {
    render(
      <SessionProvider>
        <MemoryRouter initialEntries={['/']}>
          <Home />
        </MemoryRouter>
      </SessionProvider>,
    );
    const cta = await screen.findByRole('button', { name: /comenzar/i });
    expect(cta).toBeInTheDocument();
  });
});
