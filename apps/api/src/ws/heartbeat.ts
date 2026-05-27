import type { WebSocket } from 'ws';
import type { FastifyBaseLogger } from 'fastify';
import { WS_CLOSE_CODES } from '@warachikuy/shared-types';
import { HEARTBEAT_INTERVAL_MS } from './constants.js';

// Detecta clientes muertos enviando ping cada HEARTBEAT_INTERVAL_MS y
// esperando pong antes del siguiente tick. Si no llega, cierra con
// KEEPALIVE_FAILURE. El frontend deberia reconectar con backoff al ver
// este code (ver spec §8).
export function startHeartbeat(socket: WebSocket, log: FastifyBaseLogger): void {
  let isAlive = true;
  socket.on('pong', () => {
    isAlive = true;
  });

  const interval = setInterval(() => {
    if (!isAlive) {
      log.warn('heartbeat timeout, closing socket');
      socket.close(WS_CLOSE_CODES.KEEPALIVE_FAILURE, 'keepalive_failure');
      return;
    }
    isAlive = false;
    socket.ping();
  }, HEARTBEAT_INTERVAL_MS);

  socket.on('close', () => clearInterval(interval));
}
