import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PermissionGate } from './PermissionGate';

const stopTrack = vi.fn();
function fakeStream() {
  return { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;
}

function mockGetUserMedia(results: Array<'ok' | 'fail'>) {
  let call = 0;
  Object.defineProperty(navigator, 'mediaDevices', {
    value: {
      getUserMedia: vi.fn(() => {
        const r = results[call++];
        return r === 'ok' ? Promise.resolve(fakeStream()) : Promise.reject(new Error('denied'));
      }),
    },
    configurable: true,
  });
}

describe('PermissionGate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('activa mic y camara (dos solicitudes separadas) y reporta ambos permisos', async () => {
    mockGetUserMedia(['ok', 'ok']);
    const onReady = vi.fn();
    render(<PermissionGate onReady={onReady} />);
    fireEvent.click(screen.getByRole('button', { name: /activar micrófono y cámara/i }));
    await waitFor(() => expect(onReady).toHaveBeenCalledWith({ mic: true, camera: true }));
    // Los streams solo se pedian para el permiso: se detienen al instante
    expect(stopTrack).toHaveBeenCalledTimes(2);
  });

  it('mic ok pero camara denegada -> degradacion parcial', async () => {
    mockGetUserMedia(['ok', 'fail']);
    const onReady = vi.fn();
    render(<PermissionGate onReady={onReady} />);
    fireEvent.click(screen.getByRole('button', { name: /activar micrófono y cámara/i }));
    await waitFor(() => expect(onReady).toHaveBeenCalledWith({ mic: true, camera: false }));
  });

  it('continuar sin activar -> ambos en false sin pedir permisos', () => {
    mockGetUserMedia(['fail', 'fail']);
    const onReady = vi.fn();
    render(<PermissionGate onReady={onReady} />);
    fireEvent.click(screen.getByRole('button', { name: /continuar sin activar/i }));
    expect(onReady).toHaveBeenCalledWith({ mic: false, camera: false });
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  });

  it('explica que el video no sale del navegador (RNF05)', () => {
    mockGetUserMedia([]);
    render(<PermissionGate onReady={vi.fn()} />);
    expect(screen.getByText(/nunca sale de tu equipo/i)).toBeInTheDocument();
  });
});
