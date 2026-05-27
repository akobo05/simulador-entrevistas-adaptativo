import { describe, it, expect, vi } from 'vitest';
import type { WebSocket } from 'ws';
import { WS_CLOSE_CODES } from '@warachikuy/shared-types';
import { ConnectionRegistry } from './connection-registry';

// Helper para crear un fake WebSocket con solo el metodo close mockeado.
// `ws` real tiene muchos eventos; aca solo necesitamos verificar close().
function makeFakeSocket(): WebSocket {
  return { close: vi.fn() } as unknown as WebSocket;
}

describe('ConnectionRegistry', () => {
  it('register agrega el socket bajo el sessionId', () => {
    const registry = new ConnectionRegistry();
    const socket = makeFakeSocket();
    registry.register('s1', socket);
    expect(registry.get('s1')).toBe(socket);
    expect(registry.size()).toBe(1);
  });

  it('register cierra la conexion previa con code 4000 cuando ya existe una', () => {
    const registry = new ConnectionRegistry();
    const prev = makeFakeSocket();
    const next = makeFakeSocket();
    registry.register('s1', prev);
    registry.register('s1', next);
    expect(prev.close).toHaveBeenCalledWith(WS_CLOSE_CODES.SESSION_REPLACED, 'session_replaced');
    expect(registry.get('s1')).toBe(next);
    expect(registry.size()).toBe(1);
  });

  it('unregister borra la entrada solo si el socket coincide', () => {
    const registry = new ConnectionRegistry();
    const a = makeFakeSocket();
    registry.register('s1', a);
    registry.unregister('s1', a);
    expect(registry.get('s1')).toBeUndefined();
    expect(registry.size()).toBe(0);
  });

  it('unregister no borra si el socket fue reemplazado (race protection)', () => {
    const registry = new ConnectionRegistry();
    const old = makeFakeSocket();
    const fresh = makeFakeSocket();
    registry.register('s1', old);
    registry.register('s1', fresh);
    // El cleanup tardio del socket viejo llega despues del replace.
    registry.unregister('s1', old);
    expect(registry.get('s1')).toBe(fresh);
  });

  it('get devuelve undefined para sessionId desconocido', () => {
    const registry = new ConnectionRegistry();
    expect(registry.get('nope')).toBeUndefined();
  });
});
