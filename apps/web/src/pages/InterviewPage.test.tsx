import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type * as RouterModule from 'react-router-dom';
import { SessionProvider, type SessionData } from '../context/SessionContext';
import { InterviewPage } from './InterviewPage';
import * as apiClient from '../lib/apiClient';
import * as hookMod from '../hooks/useInterviewSocket';
import type { InterviewSocket } from '../hooks/useInterviewSocket';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof RouterModule>()),
  useNavigate: () => navigateMock,
}));

const session: SessionData = {
  sessionId: 's1',
  token: 'a'.repeat(64),
  websocketUrl: 'ws://x',
  industry: 'backend',
  level: 'mid',
};

function seedSession() {
  sessionStorage.setItem('warachikuy:session', JSON.stringify(session));
}

function fakeSocket(over: Partial<InterviewSocket> = {}): InterviewSocket {
  return {
    items: [],
    phase: 'warmup',
    turnNumber: 0,
    status: 'open',
    lastError: null,
    closing: false,
    sendAnswer: vi.fn(),
    sendMetrics: vi.fn(),
    ...over,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <SessionProvider>
        <InterviewPage />
      </SessionProvider>
    </MemoryRouter>,
  );
}

describe('InterviewPage', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    sessionStorage.clear();
  });

  it('renderiza los items y envia la respuesta', () => {
    seedSession();
    const sendAnswer = vi.fn();
    vi.spyOn(hookMod, 'useInterviewSocket').mockReturnValue(
      fakeSocket({
        items: [{ id: '1', role: 'interviewer', text: 'Cuentame de ti', timestamp: 1 }],
        sendAnswer,
      }),
    );
    renderPage();
    expect(screen.getByText('Cuentame de ti')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/escribe tu respuesta/i), {
      target: { value: 'Soy dev' },
    });
    fireEvent.submit(screen.getByRole('button', { name: /enviar/i }).closest('form')!);
    expect(sendAnswer).toHaveBeenCalledWith('Soy dev');
  });

  it('al closing muestra el boton ver plan y al apretarlo llama end y navega', async () => {
    seedSession();
    vi.spyOn(hookMod, 'useInterviewSocket').mockReturnValue(
      fakeSocket({
        closing: true,
        items: [
          {
            id: '2',
            role: 'interviewer',
            text: 'Gracias, terminamos.',
            intent: 'closing',
            timestamp: 9,
          },
        ],
      }),
    );
    vi.spyOn(apiClient, 'endSession').mockResolvedValue({ sessionId: 's1', planId: 'p1' });
    renderPage();
    expect(screen.getByText('Gracias, terminamos.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /ver mi plan/i }));
    await waitFor(() => expect(apiClient.endSession).toHaveBeenCalledWith('s1', 'a'.repeat(64)));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/plan/s1'));
  });

  it('si endSession falla muestra banner y no navega', async () => {
    seedSession();
    vi.spyOn(hookMod, 'useInterviewSocket').mockReturnValue(fakeSocket({ closing: true }));
    vi.spyOn(apiClient, 'endSession').mockRejectedValue(new apiClient.ApiClientError('x', 'fallo'));
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /ver mi plan/i }));
    await waitFor(() => expect(screen.getByText(/no se pudo finalizar/i)).toBeInTheDocument());
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('ante un error no recuperable muestra el mensaje y oculta el form', () => {
    seedSession();
    vi.spyOn(hookMod, 'useInterviewSocket').mockReturnValue(
      fakeSocket({
        lastError: { code: 'session_expired', message: 'La sesion expiro.', recoverable: false },
      }),
    );
    renderPage();
    expect(screen.getByText('La sesion expiro.')).toBeInTheDocument();
    expect(screen.queryByLabelText(/escribe tu respuesta/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /volver al inicio/i })).toBeInTheDocument();
  });
});
