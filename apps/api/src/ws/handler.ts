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
import type { GeminiClient } from '../interviewer/gemini-client.js';
import { runWarmupTurn, runCandidateTurn } from '../interviewer/turn-orchestrator.js';
import { readHistory } from '../interviewer/conversation.js';
import { MAX_CANDIDATE_TEXT_LENGTH } from '../interviewer/constants.js';

export interface HandlerContext {
  socket: WebSocket;
  log: FastifyBaseLogger;
  redis: Redis;
  connections: ConnectionRegistry;
  gemini: GeminiClient;
  state: SessionState;
}

export function attachHandlers(ctx: HandlerContext): void {
  const { socket, log, redis, connections, gemini, state } = ctx;
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

  let generating = false;
  const turnDeps = { socket, log, redis, gemini, state };

  // Arrancamos el warmup SOLO en una sesion fresca (historial vacio). En una
  // reconexion a mitad de entrevista el historial ya existe; reproducir el
  // warmup agregaria un segundo turno 'interviewer' seguido y corromperia la
  // alternancia del historial. turnNumber no sirve como guardia: la warmup no
  // lo avanza, asi que tras enviar la primera pregunta sigue en 0. El historial
  // no vacio es la senal correcta de que el warmup ya ocurrio. En reconexion
  // basta el session.state sincrono que ya se envio; el siguiente
  // candidate.transcript reanuda el arco desde el turno actual.
  generating = true;
  void (async () => {
    const history = await readHistory(redis, sessionId, log);
    if (history.length === 0) {
      await runWarmupTurn(turnDeps);
    }
  })()
    .catch((err: unknown) => {
      // El IIFE puede rechazar si readHistory falla (ej: Redis caido en el
      // connect). runWarmupTurn maneja sus propios fallos internamente, asi que
      // este catch cubre sobre todo ese read. Avisamos al cliente en vez de
      // dejarlo colgado sin pregunta de warmup.
      log.error({ err }, 'fallo el arranque del warmup');
      sendServer(socket, {
        type: 'error',
        payload: {
          code: 'llm_unavailable',
          message: 'No se pudo iniciar la entrevista, intenta reconectar.',
          recoverable: true,
        },
      });
    })
    .finally(() => {
      generating = false;
    });

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
      // `ws` agrega los frames internamente y emite un solo Buffer cuando
      // binaryType es 'nodebuffer' (el default que usamos). Solo emitiria
      // Buffer[] si configurasemos binaryType: 'fragments'. Mantenemos el
      // Array.isArray como defensa por si alguien cambia esa opcion en el
      // futuro: el handler sigue funcionando sin tocar este branch.
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
    const data = parsed.data;
    if (data.type === 'candidate.transcript' && data.payload.isFinal) {
      if (generating) {
        log.debug('turno en curso, se ignora el transcript');
        return;
      }
      // Acotamos el texto del candidato: CandidateTranscriptSchema.text es un
      // z.string() sin tope, asi que un cliente podria inflar el costo/latencia
      // del LLM y el crecimiento del historial. Truncamos (no rechazamos) para
      // no perder una respuesta larga legitima; el limite es generoso.
      const candidateText = data.payload.text.slice(0, MAX_CANDIDATE_TEXT_LENGTH);
      if (candidateText.length < data.payload.text.length) {
        log.warn({ originalLength: data.payload.text.length }, 'transcript del candidato truncado');
      }
      generating = true;
      void runCandidateTurn(turnDeps, candidateText).finally(() => {
        generating = false;
      });
    }
    // metrics.update, turn.event, voice.command y los parciales (isFinal=false)
    // se ignoran (fuera del scope de #39).
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
    generating = false;
    log.info({ code, reason: reason?.toString() }, 'ws closed');
  });

  socket.on('error', (err) => {
    log.error({ err }, 'ws error');
    // No llamamos close() aqui: ws emite 'close' automaticamente despues
    // de 'error', y queremos un solo path de cleanup.
  });
}

function sendServer(socket: WebSocket, msg: ServerToClientMessage): void {
  // `ws` lanza synchronously si readyState no es OPEN. Esto puede pasar
  // en escenarios de cierre en transit (ej: enviar error{recoverable:true}
  // mientras llega el FIN del cliente). El error envelope simplemente se
  // pierde, que es preferible a tumbar el handler con una excepcion.
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(msg));
  }
}
