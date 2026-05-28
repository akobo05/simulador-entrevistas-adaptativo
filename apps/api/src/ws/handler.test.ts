import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebSocket } from 'ws';
import RedisMock from 'ioredis-mock';
import type Redis from 'ioredis';
import type { FastifyInstance } from 'fastify';
import type { AddressInfo } from 'node:net';
import type { SessionState } from '@warachikuy/shared-types';
import { WS_CLOSE_CODES } from '@warachikuy/shared-types';
import { buildServer } from '../server';
import { loadEnv } from '../config/env';
import { MAX_CONSECUTIVE_INVALID_MESSAGES } from './constants';

const testEnv = loadEnv({
  PORT: '3000',
  DATABASE_URL: 'postgresql://x:x@x/x',
  REDIS_URL: 'redis://x:6379',
  GEMINI_API_KEY: 'k',
  LOG_LEVEL: 'silent',
  CORS_ORIGINS: 'http://localhost:5173',
  WS_BASE_URL: 'ws://127.0.0.1:3000',
});

const VALID_TOKEN = 'a'.repeat(64);

function makeState(overrides: Partial<SessionState> = {}): SessionState {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    industry: 'backend',
    level: 'mid',
    status: 'active',
    phase: 'warmup',
    turnNumber: 0,
    startedAt: Date.now(),
    token: VALID_TOKEN,
    ...overrides,
  };
}

async function seedSession(redis: Redis, state: SessionState): Promise<void> {
  await redis.set(`session:${state.id}`, JSON.stringify(state), 'EX', 3600);
}

// Cola de mensajes que evita la race entre 'open' y el primer 'message'.
// El servidor envia session.state inmediatamente al conectar; si primero
// esperamos 'open' y luego ponemos el listener, el mensaje ya llego.
// Solcion: queue recoge todos los mensajes desde la creacion del socket.
function makeMessageQueue(ws: WebSocket): () => Promise<string> {
  const queue: string[] = [];
  const waiters: Array<(msg: string) => void> = [];
  ws.on('message', (data) => {
    const msg = data.toString();
    const waiter = waiters.shift();
    if (waiter) {
      waiter(msg);
    } else {
      queue.push(msg);
    }
  });
  return () =>
    new Promise<string>((resolve) => {
      const msg = queue.shift();
      if (msg !== undefined) {
        resolve(msg);
      } else {
        waiters.push(resolve);
      }
    });
}

function waitClose(ws: WebSocket): Promise<{ code: number; reason: string }> {
  return new Promise((resolve) => {
    ws.once('close', (code, reason) => resolve({ code, reason: reason.toString() }));
  });
}

describe('WS /v1/sessions/:sessionId/ws (integration)', () => {
  let server: FastifyInstance;
  let redis: Redis;
  let port: number;

  beforeEach(async () => {
    redis = new RedisMock() as unknown as Redis;
    server = await buildServer(testEnv, { redis });
    await server.listen({ port: 0, host: '127.0.0.1' });
    port = (server.server.address() as AddressInfo).port;
  });

  afterEach(async () => {
    await server.close();
  });

  function url(state: SessionState, token = VALID_TOKEN): string {
    return `ws://127.0.0.1:${port}/v1/sessions/${state.id}/ws?token=${token}`;
  }

  it('rechaza con 400 si el token tiene formato invalido', async () => {
    const state = makeState();
    await seedSession(redis, state);
    const ws = new WebSocket(url(state, 'short'));
    await new Promise<void>((resolve, reject) => {
      ws.on('unexpected-response', (_req, res) => {
        expect(res.statusCode).toBe(400);
        // Drenamos la respuesta y cerramos el socket para liberar la
        // conexion TCP antes del afterEach (server.close() espera conexiones
        // activas antes de aceptar nuevas).
        res.resume();
        res.socket?.destroy();
        resolve();
      });
      ws.on('upgrade', () => reject(new Error('Handshake debio ser rechazado')));
    });
  });

  it('rechaza con 404 si la session no existe', async () => {
    // Usamos un UUID distinto al de makeState() para asegurarnos de que
    // nunca fue sembrado en el contexto compartido de ioredis-mock.
    const ghost = makeState({ id: '00000000-0000-4000-a000-000000000000' });
    const ws = new WebSocket(url(ghost));
    await new Promise<void>((resolve, reject) => {
      ws.on('unexpected-response', (_req, res) => {
        expect(res.statusCode).toBe(404);
        res.resume();
        res.socket?.destroy();
        resolve();
      });
      ws.on('upgrade', () => reject(new Error('Handshake debio ser rechazado')));
    });
  });

  it('rechaza con 401 si el token no coincide', async () => {
    const state = makeState();
    await seedSession(redis, state);
    const ws = new WebSocket(url(state, 'b'.repeat(64)));
    await new Promise<void>((resolve, reject) => {
      ws.on('unexpected-response', (_req, res) => {
        expect(res.statusCode).toBe(401);
        res.resume();
        res.socket?.destroy();
        resolve();
      });
      ws.on('upgrade', () => reject(new Error('Handshake debio ser rechazado')));
    });
  });

  it('rechaza con 410 si la session esta ended', async () => {
    const state = makeState({ status: 'ended' });
    await seedSession(redis, state);
    const ws = new WebSocket(url(state));
    await new Promise<void>((resolve, reject) => {
      ws.on('unexpected-response', (_req, res) => {
        expect(res.statusCode).toBe(410);
        res.resume();
        res.socket?.destroy();
        resolve();
      });
      ws.on('upgrade', () => reject(new Error('Handshake debio ser rechazado')));
    });
  });

  it('al conectar emite session.state con phase y turnNumber', async () => {
    const state = makeState({ phase: 'interviewing', turnNumber: 2 });
    await seedSession(redis, state);
    const ws = new WebSocket(url(state));
    const nextMessage = makeMessageQueue(ws);
    await new Promise<void>((resolve) => ws.once('open', () => resolve()));
    const first = JSON.parse(await nextMessage());
    expect(first.type).toBe('session.state');
    expect(first.payload).toMatchObject({
      sessionId: state.id,
      phase: 'interviewing',
      turnNumber: 2,
    });
    ws.close();
  });

  it('responde con error{invalid_message, recoverable:true} ante JSON malformado y mantiene la conexion', async () => {
    const state = makeState();
    await seedSession(redis, state);
    const ws = new WebSocket(url(state));
    const nextMessage = makeMessageQueue(ws);
    await new Promise<void>((resolve) => ws.once('open', () => resolve()));
    await nextMessage(); // consume el session.state inicial
    ws.send('this is not json');
    const errMsg = JSON.parse(await nextMessage());
    expect(errMsg).toEqual({
      type: 'error',
      payload: { code: 'invalid_message', message: 'json_parse_error', recoverable: true },
    });
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });

  it('responde con error{invalid_message} ante payload que no matchea schema', async () => {
    const state = makeState();
    await seedSession(redis, state);
    const ws = new WebSocket(url(state));
    const nextMessage = makeMessageQueue(ws);
    await new Promise<void>((resolve) => ws.once('open', () => resolve()));
    await nextMessage(); // consume el session.state inicial
    ws.send(JSON.stringify({ type: 'unknown.thing', payload: {} }));
    const errMsg = JSON.parse(await nextMessage());
    expect(errMsg.payload.code).toBe('invalid_message');
    expect(errMsg.payload.message).toBe('schema_validation_failed');
    ws.close();
  });

  it('cierra con 1008 tras MAX_CONSECUTIVE_INVALID_MESSAGES invalidos seguidos', async () => {
    const state = makeState();
    await seedSession(redis, state);
    const ws = new WebSocket(url(state));
    const nextMessage = makeMessageQueue(ws);
    await new Promise<void>((resolve) => ws.once('open', () => resolve()));
    await nextMessage(); // consume el session.state inicial
    const closeP = waitClose(ws);
    for (let i = 0; i < MAX_CONSECUTIVE_INVALID_MESSAGES; i++) {
      ws.send('garbled');
    }
    const closed = await closeP;
    expect(closed.code).toBe(WS_CLOSE_CODES.POLICY_VIOLATION);
  });

  it('un mensaje valido resetea el contador de invalidos consecutivos', async () => {
    const state = makeState();
    await seedSession(redis, state);
    const ws = new WebSocket(url(state));
    const queue = makeMessageQueue(ws);
    await new Promise<void>((resolve) => ws.once('open', () => resolve()));
    await queue(); // descarta el session.state inicial

    // Mandamos MAX-1 invalidos. Cada uno responde con un envelope error.
    for (let i = 0; i < MAX_CONSECUTIVE_INVALID_MESSAGES - 1; i++) {
      ws.send('garbled');
      const err = JSON.parse(await queue());
      expect(err.payload.code).toBe('invalid_message');
    }
    expect(ws.readyState).toBe(WebSocket.OPEN);

    // Mandamos un mensaje valido (metrics.update con AuraState minimo).
    // F1.2 no responde a este tipo de mensajes, solo loguea con debug,
    // asi que NO drenamos nada de la queue.
    const validMsg = {
      type: 'metrics.update',
      payload: {
        sessionId: state.id,
        metrics: [],
        collectedAt: Date.now(),
      },
    };
    ws.send(JSON.stringify(validMsg));

    // Otros MAX-1 invalidos. Sin reset, este lote llevaria el contador
    // total a 2*(MAX-1) = 8 y el socket estaria cerrado. Con reset
    // funcionando, el contador volvio a 0 con el valido y este lote
    // solo llega a MAX-1, asi que el socket sigue abierto.
    for (let i = 0; i < MAX_CONSECUTIVE_INVALID_MESSAGES - 1; i++) {
      ws.send('garbled');
      const err = JSON.parse(await queue());
      expect(err.payload.code).toBe('invalid_message');
    }
    expect(ws.readyState).toBe(WebSocket.OPEN);

    ws.close();
  });

  it('cuando llega una segunda conexion al mismo sessionId, cierra la primera con 4000', async () => {
    const state = makeState();
    await seedSession(redis, state);
    const ws1 = new WebSocket(url(state));
    const nextMessage1 = makeMessageQueue(ws1);
    await new Promise<void>((resolve) => ws1.once('open', () => resolve()));
    await nextMessage1(); // consume el session.state inicial

    const closedP = waitClose(ws1);
    const ws2 = new WebSocket(url(state));
    await new Promise<void>((resolve) => ws2.once('open', () => resolve()));
    const closed = await closedP;
    expect(closed.code).toBe(WS_CLOSE_CODES.SESSION_REPLACED);
    ws2.close();
  });

  it('al cerrar el cliente, el registry queda limpio', async () => {
    const state = makeState();
    await seedSession(redis, state);
    const ws = new WebSocket(url(state));
    const nextMessage = makeMessageQueue(ws);
    await new Promise<void>((resolve) => ws.once('open', () => resolve()));
    await nextMessage(); // consume el session.state inicial
    expect(server.connections.size()).toBe(1);
    const closedP = new Promise<void>((resolve) => ws.once('close', () => resolve()));
    ws.close();
    await closedP;
    // vi.waitFor hace polling cada 10ms con timeout 1s por default. Sustituye
    // un setTimeout fijo que era flaky en CI bajo carga: el server-side
    // 'close' listener puede tardar mas de 50ms antes de llamar
    // connections.unregister.
    await vi.waitFor(() => {
      expect(server.connections.size()).toBe(0);
    });
  });
});
