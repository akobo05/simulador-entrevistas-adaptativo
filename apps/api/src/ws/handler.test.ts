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
import { MAX_CANDIDATE_TEXT_LENGTH } from '../interviewer/constants';
import type { GeminiClient } from '../interviewer/gemini-client';

// Fake determinista: cada pregunta del entrevistador es predecible para poder
// asertar sobre el loop sin pegarle a la API real.
function fakeGemini(): GeminiClient {
  let n = 0;
  return {
    generate: async () => {
      n += 1;
      return `Pregunta numero ${n}`;
    },
    generateJson: async () => ({}),
  };
}

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

// Drena los dos mensajes que llegan al conectar: session.state sincrono +
// la interviewer.message de warmup async. Devuelve ambos parseados.
async function drainConnect(queue: () => Promise<string>) {
  const a = JSON.parse(await queue());
  const b = JSON.parse(await queue());
  return { a, b, types: [a.type, b.type] };
}

describe('WS /v1/sessions/:sessionId/ws (integration)', () => {
  let server: FastifyInstance;
  let redis: Redis;
  let port: number;

  beforeEach(async () => {
    redis = new RedisMock() as unknown as Redis;
    // ioredis-mock comparte estado entre instancias; limpiar antes de cada
    // prueba garantiza aislamiento (sin datos residuales de tests anteriores).
    await redis.flushall();
    server = await buildServer(testEnv, { redis, gemini: fakeGemini() });
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

  it('al conectar emite session.state y luego la pregunta de warmup', async () => {
    const state = makeState({ phase: 'warmup', turnNumber: 0 });
    await seedSession(redis, state);
    const ws = new WebSocket(url(state));
    const queue = makeMessageQueue(ws);
    await new Promise<void>((resolve) => ws.once('open', () => resolve()));
    const first = JSON.parse(await queue());
    expect(first.type).toBe('session.state');
    expect(first.payload).toMatchObject({ sessionId: state.id, phase: 'warmup', turnNumber: 0 });
    const second = JSON.parse(await queue());
    expect(second.type).toBe('interviewer.message');
    expect(second.payload.text).toContain('Pregunta numero');
    ws.close();
  });

  it('responde con error{invalid_message, recoverable:true} ante JSON malformado y mantiene la conexion', async () => {
    const state = makeState();
    await seedSession(redis, state);
    const ws = new WebSocket(url(state));
    const nextMessage = makeMessageQueue(ws);
    await new Promise<void>((resolve) => ws.once('open', () => resolve()));
    await drainConnect(nextMessage); // consume session.state + warmup
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
    await drainConnect(nextMessage); // consume session.state + warmup
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
    await drainConnect(nextMessage); // consume session.state + warmup
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
    await drainConnect(queue); // descarta session.state + warmup

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
    await drainConnect(nextMessage1); // consume session.state + warmup

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
    await drainConnect(nextMessage); // consume session.state + warmup
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

  it('responde a un candidate.transcript final con una nueva interviewer.message y avanza el turno', async () => {
    const state = makeState();
    await seedSession(redis, state);
    const ws = new WebSocket(url(state));
    // Listener propio que acumula los mensajes. Permite esperar de forma
    // deterministica con vi.waitFor en vez de un setTimeout fijo (flaky).
    const received: Array<{
      type: string;
      payload: { intent?: string; turnNumber?: number; phase?: string };
    }> = [];
    ws.on('message', (d) => received.push(JSON.parse(d.toString())));
    await new Promise<void>((resolve) => ws.once('open', () => resolve()));
    // Los 2 mensajes de connect: session.state sincrono + warmup async. Cuando
    // el de warmup llego, el warmup termino su send y el lock 'generating' se
    // libera en el microtask siguiente, antes de que el server procese el
    // proximo macrotask (el transcript). Por eso un unico envio es seguro.
    await vi.waitFor(() => expect(received).toHaveLength(2));
    ws.send(
      JSON.stringify({
        type: 'candidate.transcript',
        payload: {
          sessionId: state.id,
          text: 'Tengo 3 anios de experiencia',
          isFinal: true,
          timestamp: Date.now(),
        },
      }),
    );
    // Esperamos las 2 respuestas del turno: interviewer.message + session.state.
    await vi.waitFor(() => expect(received.length).toBeGreaterThanOrEqual(4));
    const responses = received.slice(2);
    const interviewer = responses.find((m) => m.type === 'interviewer.message');
    const st = responses.find((m) => m.type === 'session.state');
    expect(interviewer?.payload.intent).toBe('followup');
    expect(st?.payload.turnNumber).toBe(1);
    expect(st?.payload.phase).toBe('interviewing');
    ws.close();
  });

  it('ignora candidate.transcript con isFinal=false (parciales del STT)', async () => {
    const state = makeState();
    await seedSession(redis, state);
    const ws = new WebSocket(url(state));
    const queue = makeMessageQueue(ws);
    await new Promise<void>((resolve) => ws.once('open', () => resolve()));
    await drainConnect(queue); // session.state + warmup
    ws.send(
      JSON.stringify({
        type: 'candidate.transcript',
        payload: { sessionId: state.id, text: 'parcial...', isFinal: false, timestamp: Date.now() },
      }),
    );
    // Un mensaje invalido fuerza una respuesta; si el parcial se hubiera
    // procesado, el siguiente mensaje seria una interviewer.message en vez de
    // un error. Confirmamos que es el error (el parcial se ignoro).
    ws.send('no-json');
    const next = JSON.parse(await queue());
    expect(next.type).toBe('error');
    expect(next.payload.code).toBe('invalid_message');
    ws.close();
  });

  it('en una reconexion a mitad de entrevista no reproduce el warmup y reanuda el arco', async () => {
    const state = makeState({ turnNumber: 3, phase: 'interviewing' });
    await seedSession(redis, state);
    // Sembramos historial existente: la sesion ya avanzo (no es fresca).
    await redis.rpush(
      `session:messages:${state.id}`,
      JSON.stringify({ role: 'interviewer', text: 'pregunta previa', timestamp: 1 }),
      JSON.stringify({ role: 'candidate', text: 'respuesta previa', timestamp: 2 }),
    );
    const received: Array<{ type: string; payload: { turnNumber?: number } }> = [];
    const ws = new WebSocket(url(state));
    ws.on('message', (d) => received.push(JSON.parse(d.toString())));
    await new Promise<void>((resolve) => ws.once('open', () => resolve()));
    // Al reconectar solo llega session.state; NO una interviewer.message de warmup.
    await vi.waitFor(() => expect(received.length).toBeGreaterThanOrEqual(1));
    expect(received[0]!.type).toBe('session.state');
    // Enviamos una respuesta: el turno reanuda desde 3 hacia 4, sin warmup duplicado.
    ws.send(
      JSON.stringify({
        type: 'candidate.transcript',
        payload: {
          sessionId: state.id,
          text: 'mi respuesta de resume',
          isFinal: true,
          timestamp: Date.now(),
        },
      }),
    );
    await vi.waitFor(() => expect(received.length).toBeGreaterThanOrEqual(3));
    const st = received.slice(1).find((m) => m.type === 'session.state');
    expect(st?.payload.turnNumber).toBe(4);
    // Historial: 2 previos + candidate + interviewer = 4 (ningun warmup duplicado).
    const len = await redis.llen(`session:messages:${state.id}`);
    expect(len).toBe(4);
    ws.close();
  });

  it('trunca el texto del candidato al maximo configurado antes de persistir', async () => {
    const state = makeState();
    await seedSession(redis, state);
    const received: Array<{ type: string }> = [];
    const ws = new WebSocket(url(state));
    ws.on('message', (d) => received.push(JSON.parse(d.toString())));
    await new Promise<void>((resolve) => ws.once('open', () => resolve()));
    await vi.waitFor(() => expect(received.length).toBeGreaterThanOrEqual(2)); // connect
    const huge = 'a'.repeat(MAX_CANDIDATE_TEXT_LENGTH + 500);
    ws.send(
      JSON.stringify({
        type: 'candidate.transcript',
        payload: { sessionId: state.id, text: huge, isFinal: true, timestamp: Date.now() },
      }),
    );
    await vi.waitFor(() => expect(received.length).toBeGreaterThanOrEqual(4)); // turno respondido
    // El turno del candidato persistido quedo recortado al maximo.
    const raw = await redis.lrange(`session:messages:${state.id}`, 0, -1);
    const candidate = raw
      .map((s) => JSON.parse(s) as { role: string; text: string })
      .find((e) => e.role === 'candidate');
    expect(candidate?.text.length).toBe(MAX_CANDIDATE_TEXT_LENGTH);
    ws.close();
  });

  it('recorre el arco completo: warmup, 5 turnos y cierre en el turno 6', async () => {
    const state = makeState();
    await seedSession(redis, state);
    const received: Array<{
      type: string;
      payload: { intent?: string; turnNumber?: number; phase?: string };
    }> = [];
    const ws = new WebSocket(url(state));
    ws.on('message', (d) => received.push(JSON.parse(d.toString())));
    await new Promise<void>((resolve) => ws.once('open', () => resolve()));
    // Connect: session.state + warmup interviewer.message.
    await vi.waitFor(() => expect(received.length).toBeGreaterThanOrEqual(2));

    // 6 respuestas del candidato llevan el arco del turno 0 al turno 6 (cierre).
    for (let turn = 1; turn <= 6; turn++) {
      const before = received.length;
      ws.send(
        JSON.stringify({
          type: 'candidate.transcript',
          payload: {
            sessionId: state.id,
            text: `respuesta del turno ${turn}`,
            isFinal: true,
            timestamp: Date.now(),
          },
        }),
      );
      // Cada turno emite interviewer.message + session.state.
      await vi.waitFor(() => expect(received.length).toBeGreaterThanOrEqual(before + 2));
      const st = received.slice(before).find((m) => m.type === 'session.state');
      expect(st?.payload.turnNumber).toBe(turn);
    }

    // El ultimo turno (6) es el cierre.
    const lastInterviewer = [...received].reverse().find((m) => m.type === 'interviewer.message');
    expect(lastInterviewer?.payload.intent).toBe('closing');

    // Un transcript despues del cierre se ignora (turno ya en el maximo).
    const afterClosing = received.length;
    ws.send(
      JSON.stringify({
        type: 'candidate.transcript',
        payload: {
          sessionId: state.id,
          text: 'respuesta tardia',
          isFinal: true,
          timestamp: Date.now(),
        },
      }),
    );
    await new Promise((r) => setTimeout(r, 150));
    expect(received.length).toBe(afterClosing);
    ws.close();
  });
});
