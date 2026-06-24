import { render, screen, waitFor } from '@testing-library/react';
import { test, expect, vi, beforeEach } from 'vitest';
import { MyProgress } from './MyProgress';

const mockGetProgress = vi.hoisted(() => vi.fn());

vi.mock('../lib/apiClient', () => ({
  getProgress: mockGetProgress,
}));

beforeEach(() => {
  mockGetProgress.mockReset();
});

test('MyProgress muestra loading mientras carga', () => {
  mockGetProgress.mockImplementation(() => new Promise(() => {}));
  render(<MyProgress />);
  expect(screen.getByText('Cargando tu progreso…')).toBeInTheDocument();
});

test('MyProgress muestra vacio cuando no hay sesiones', async () => {
  mockGetProgress.mockResolvedValue({
    candidateId: '00000000-0000-0000-0000-000000000001',
    sessionCount: 0,
    firstSessionAt: null,
    lastSessionAt: null,
    competencies: [],
  });
  render(<MyProgress />);
  await waitFor(() => {
    expect(screen.getByText('Aún no tienes sesiones')).toBeInTheDocument();
  });
});

test('MyProgress renderiza las metricas reales cuando hay datos', async () => {
  mockGetProgress.mockResolvedValue({
    candidateId: '00000000-0000-0000-0000-000000000001',
    sessionCount: 5,
    firstSessionAt: 1718000000000,
    lastSessionAt: 1719000000000,
    competencies: [
      {
        name: 'fluency',
        points: [
          { at: 1718000000000, score: 60 },
          { at: 1718500000000, score: 65 },
          { at: 1719000000000, score: 70 },
        ],
        latest: 70,
        average: 65,
        delta: 5,
      },
      {
        name: 'eye_contact',
        points: [
          { at: 1718000000000, score: 50 },
          { at: 1718500000000, score: 55 },
          { at: 1719000000000, score: 60 },
        ],
        latest: 60,
        average: 55,
        delta: 5,
      },
      {
        name: 'speech_rate',
        points: [
          { at: 1718000000000, score: 70 },
          { at: 1718500000000, score: 72 },
          { at: 1719000000000, score: 75 },
        ],
        latest: 75,
        average: 72,
        delta: 3,
      },
      {
        name: 'content',
        points: [
          { at: 1718000000000, score: 80 },
          { at: 1718500000000, score: 82 },
          { at: 1719000000000, score: 85 },
        ],
        latest: 85,
        average: 82,
        delta: 3,
      },
    ],
  });
  render(<MyProgress />);
  await waitFor(() => {
    expect(screen.getByRole('main')).toBeInTheDocument();
  });
  expect(screen.getAllByText('5 sesiones').length).toBeGreaterThanOrEqual(1);
  expect(screen.getByText(/^Nivel 2/)).toBeInTheDocument();
  expect(screen.getByText('Evolución de métricas')).toBeInTheDocument();
  expect(screen.getByText('Fluidez')).toBeInTheDocument();
});

test('MyProgress muestra error cuando falla la API', async () => {
  mockGetProgress.mockRejectedValue(new Error('Network error'));
  render(<MyProgress />);
  await waitFor(() => {
    expect(screen.getByText('Network error')).toBeInTheDocument();
  });
  expect(screen.getByText('Reintentar')).toBeInTheDocument();
});
