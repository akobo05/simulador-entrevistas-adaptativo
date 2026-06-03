import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SessionProvider, type SessionData } from '../context/SessionContext';
import { PlanPage } from './PlanPage';
import * as apiClient from '../lib/apiClient';
import type { ImprovementPlan } from '@warachikuy/shared-types';

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

const plan: ImprovementPlan = {
  planId: '550e8400-e29b-41d4-a716-446655440000',
  sessionId: '550e8400-e29b-41d4-a716-446655440001',
  summary: 'Buen desempeno general.',
  competencies: [
    { name: 'fluency', score: 81, comment: 'fluida' },
    { name: 'eye_contact', score: null, comment: 'sin datos' },
    { name: 'speech_rate', score: 67, comment: 'ok' },
    { name: 'content', score: 75, comment: 'solido' },
  ],
  strengths: ['claridad'],
  improvements: ['profundizar'],
  exercises: [{ title: 'STAR', description: 'Estructura tus respuestas.' }],
  generatedAt: 1,
};

function renderPage() {
  return render(
    <MemoryRouter>
      <SessionProvider>
        <PlanPage />
      </SessionProvider>
    </MemoryRouter>,
  );
}

describe('PlanPage', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('muestra el spinner mientras genera y luego el plan', async () => {
    seedSession();
    vi.spyOn(apiClient, 'getPlan')
      .mockResolvedValueOnce({ status: 'generating' })
      .mockResolvedValue({ status: 'ready', plan });
    renderPage();

    // Estado generating: spinner visible
    expect(screen.getByText(/generando tu plan/i)).toBeInTheDocument();
    expect(screen.getByTestId('plan-generating')).toBeInTheDocument();

    // Estado ready: el plan se renderiza con los datos reales
    await waitFor(() => expect(screen.getByTestId('plan-ready')).toBeInTheDocument(), {
      timeout: 3000,
    });

    // Resumen real del plan
    expect(screen.getByTestId('plan-summary')).toHaveTextContent('Buen desempeno general.');

    // Score 81 del anillo de fluency (CompetencyRing muestra el numero)
    expect(screen.getByText('81')).toBeInTheDocument();

    // Titulo del ejercicio real
    expect(screen.getByText('STAR')).toBeInTheDocument();

    // Score null -> "sin datos" (nunca 0)
    expect(screen.getAllByText(/sin datos/i).length).toBeGreaterThanOrEqual(1);

    // Fortalezas e improvements renderizados
    expect(screen.getByTestId('plan-strengths')).toHaveTextContent('claridad');
    expect(screen.getByTestId('plan-improvements')).toHaveTextContent('profundizar');

    // Nota de metricas pendientes por score null
    expect(screen.getByTestId('plan-null-note')).toBeInTheDocument();
  });

  it('muestra el mensaje de fallo', async () => {
    seedSession();
    vi.spyOn(apiClient, 'getPlan').mockResolvedValue({ status: 'failed' });
    renderPage();
    await waitFor(() => expect(screen.getByTestId('plan-error')).toBeInTheDocument());
    expect(screen.getByText(/no se pudo generar/i)).toBeInTheDocument();
  });

  it('muestra el mensaje de fallo cuando el plan no se encuentra', async () => {
    seedSession();
    vi.spyOn(apiClient, 'getPlan').mockResolvedValue({ status: 'not_found' });
    renderPage();
    await waitFor(() => expect(screen.getByTestId('plan-error')).toBeInTheDocument());
    expect(screen.getByText(/no se pudo generar/i)).toBeInTheDocument();
  });
});
