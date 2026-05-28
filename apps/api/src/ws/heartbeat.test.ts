import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type { WebSocket } from 'ws';
import type { FastifyBaseLogger } from 'fastify';
import { WS_CLOSE_CODES } from '@warachikuy/shared-types';
import { startHeartbeat } from './heartbeat';
import { HEARTBEAT_INTERVAL_MS } from './constants';

// Fake socket que extiende EventEmitter para poder emitir 'pong' y 'close'
// como lo hace el `ws` real. ping() y close() son spies.
class FakeSocket extends EventEmitter {
  ping = vi.fn();
  close = vi.fn();
}

function silentLogger(): FastifyBaseLogger {
  const log = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: () => log,
    level: 'silent',
    silent: vi.fn(),
  } as unknown as FastifyBaseLogger;
  return log;
}

describe('startHeartbeat', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('emite ping cada HEARTBEAT_INTERVAL_MS si el cliente responde con pong', () => {
    const socket = new FakeSocket();
    startHeartbeat(socket as unknown as WebSocket, silentLogger());

    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS);
    expect(socket.ping).toHaveBeenCalledTimes(1);
    socket.emit('pong');

    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS);
    expect(socket.ping).toHaveBeenCalledTimes(2);
    socket.emit('pong');

    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS);
    expect(socket.ping).toHaveBeenCalledTimes(3);
  });

  it('cierra con code 1011 si el cliente no respondio al primer ping antes del segundo tick', () => {
    const socket = new FakeSocket();
    startHeartbeat(socket as unknown as WebSocket, silentLogger());

    // Tick 1: enviamos ping. Cliente no responde.
    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS);
    expect(socket.ping).toHaveBeenCalledTimes(1);
    expect(socket.close).not.toHaveBeenCalled();

    // Tick 2: como isAlive sigue false, cerramos.
    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS);
    expect(socket.close).toHaveBeenCalledWith(
      WS_CLOSE_CODES.KEEPALIVE_FAILURE,
      'keepalive_failure',
    );
  });

  it('detiene el timer cuando el socket emite close', () => {
    const socket = new FakeSocket();
    startHeartbeat(socket as unknown as WebSocket, silentLogger());

    socket.emit('close');
    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS * 5);
    expect(socket.ping).not.toHaveBeenCalled();
  });
});
