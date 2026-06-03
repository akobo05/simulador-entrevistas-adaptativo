import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type * as RouterModule from 'react-router-dom';
import { SessionProvider } from '../context/SessionContext';
import { SetupPage } from './SetupPage';
import * as apiClient from '../lib/apiClient';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof RouterModule>()),
  useNavigate: () => navigateMock,
}));

describe('SetupPage', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    sessionStorage.clear();
    vi.spyOn(apiClient, 'getIndustries').mockResolvedValue([
      { id: 'backend', name: 'Backend' },
      { id: 'frontend', name: 'Frontend' },
    ]);
  });

  function renderPage() {
    return render(
      <MemoryRouter>
        <SessionProvider>
          <SetupPage />
        </SessionProvider>
      </MemoryRouter>,
    );
  }

  it('carga las industrias y crea la sesion al enviar', async () => {
    vi.spyOn(apiClient, 'createSession').mockResolvedValue({
      sessionId: '550e8400-e29b-41d4-a716-446655440000',
      websocketUrl: 'ws://x',
      token: 'a'.repeat(64),
    });
    renderPage();
    // Las industrias cargan y se muestran en el select
    await waitFor(() => expect(screen.getByTestId('setup-industry')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('Backend')).toBeInTheDocument());
    // Enviar el formulario
    fireEvent.click(screen.getByTestId('setup-submit'));
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith('/interview/550e8400-e29b-41d4-a716-446655440000'),
    );
    expect(apiClient.createSession).toHaveBeenCalledWith({
      industry: 'backend',
      level: 'mid',
    });
  });

  it('muestra error si createSession falla', async () => {
    vi.spyOn(apiClient, 'createSession').mockRejectedValue(
      new apiClient.ApiClientError('x', 'fallo'),
    );
    renderPage();
    await waitFor(() => expect(screen.getByText('Backend')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('setup-submit'));
    await waitFor(() => expect(screen.getByText(/no se pudo crear/i)).toBeInTheDocument());
  });
});
