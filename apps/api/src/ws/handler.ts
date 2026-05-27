import type { WebSocket } from 'ws';
import type { FastifyBaseLogger } from 'fastify';
import type Redis from 'ioredis';
import {
  ClientToServerMessageSchema,
  type SessionState,
  type ServerToClientMessage,
  WS_CLOSE_CODES,
} from '@warachikuy/shared-types';
import { startHeartbeat } from './heartbeat.js';
import { MAX_CONSECUTIVE_INVALID_MESSAGES, SESSION_REFRESH_TTL_SECONDS } from './constants.js';
import type { ConnectionRegistry } from '../services/connection-registry.js';

export interface HandlerContext {
  socket: WebSocket;
  log: FastifyBaseLogger;
  redis: Redis;
  connections: ConnectionRegistry;
  state: SessionState;
}

export function attachHandlers(ctx: HandlerContext): void {
  const { socket, log, redis, connections, state } = ctx;
  const sessionId = state.id;

  connections.register(sessionId, socket);

  // Primer mensaje al cliente: snapshot del estado actual. El cliente lo
  // usa para sincronizar phase/turnNumber al conectar (incluyendo
  // reconexiones).
  sendServer(socket, {
    type: 'session.state',
    payload: {
      sessionId,
      phase: state.phase,
      turnNumber: state.turnNumber,
    },
  });

  startHeartbeat(socket, log);
  log.info('ws connected');

  let invalidCount = 0;

  const handleInvalid = (reason: string): void => {
    invalidCount++;
    sendServer(socket, {
      type: 'error',
      payload: { code: 'invalid_message', message: reason, recoverable: true },
    });
    log.warn({ invalidCount, reason }, 'invalid ws message');
    if (invalidCount >= MAX_CONSECUTIVE_INVALID_MESSAGES) {
      socket.close(WS_CLOSE_CODES.POLICY_VIOLATION, 'policy_violation');
    }
  };

  socket.on('message', (raw) => {
    let json: unknown;
    try {
      // `ws` emite Buffer para frames de texto (binaryType default) y a veces
      // Buffer[] si la libreria fragmenta internamente. toString() decodifica
      // el Buffer y Buffer.concat() acumula el array antes de decodificar.
      // Con maxPayload=16KB el caso de Buffer[] es practicamente inalcanzable
      // pero la normalizamos por defensa.
      const text = Array.isArray(raw) ? Buffer.concat(raw).toString('utf8') : raw.toString();
      json = JSON.parse(text);
    } catch {
      handleInvalid('json_parse_error');
      return;
    }
    const parsed = ClientToServerMessageSchema.safeParse(json);
    if (!parsed.success) {
      handleInvalid('schema_validation_failed');
      return;
    }
    invalidCount = 0;
    log.debug({ type: parsed.data.type }, 'ws message received');
    // F1.2: sin logica de negocio. La generacion de interviewer.message
    // llega en un issue posterior (LLM Coach).
  });

  socket.on('pong', () => {
    // Renovamos el TTL solo en el pong (cada 30s) en vez de en cada
    // mensaje (4 Hz). Ver spec §4.1.
    redis.expire(`session:${sessionId}`, SESSION_REFRESH_TTL_SECONDS).catch((err) => {
      log.error({ err }, 'redis expire failed');
    });
  });

  socket.on('close', (code, reason) => {
    connections.unregister(sessionId, socket);
    log.info({ code, reason: reason?.toString() }, 'ws closed');
  });

  socket.on('error', (err) => {
    log.error({ err }, 'ws error');
    // No llamamos close() aqui: ws emite 'close' automaticamente despues
    // de 'error', y queremos un solo path de cleanup.
  });
}

function sendServer(socket: WebSocket, msg: ServerToClientMessage): void {
  socket.send(JSON.stringify(msg));
}
