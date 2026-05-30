import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import RedisMock from 'ioredis-mock';
import type Redis from 'ioredis';
import type { WebSocket } from 'ws';
import type { FastifyBaseLogger } from 'fastify';
import type { SessionState, ServerToClientMessage } from '@warachikuy/shared-types';
import type { GeminiClient } from './gemini-client';
import { GeminiTransientError, GeminiBlockedError } from './gemini-client';
import { runWarmupTurn, runCandidateTurn } from './turn-orchestrator';
import { readHistory } from './conversation';

class FakeSocket extends EventEmitter {
  readyState = 1;
  OPEN = 1;
  sent: ServerToClientMessage[] = [];
  send = (data: string) => {
    this.sent.push(JSON.parse(data));
  };
}

function silentLog(): FastifyBaseLogger {
  const l = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: () => l,
    level: 'silent',
    silent: vi.fn(),
  } as unknown as FastifyBaseLogger;
  return l;
}

function makeState(overrides: Partial<SessionState> = {}): SessionState {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    industry: 'backend',
    level: 'mid',
    status: 'active',
    phase: 'warmup',
    turnNumber: 0,
    startedAt: 1,
    token: 'a'.repeat(64),
    ...overrides,
  };
}

function deps(gemini: GeminiClient, socket = new FakeSocket(), state = makeState()) {
  const redis = new RedisMock() as unknown as Redis;
  return {
    socket: socket as unknown as WebSocket,
    log: silentLog(),
    redis,
    gemini,
    state,
    _socket: socket,
    _redis: redis,
  };
}

// ioredis-mock comparte el store entre instancias del mismo host:port/db,
// por lo que se limpia antes de cada test para garantizar aislamiento.
beforeEach(async () => {
  const redis = new RedisMock() as unknown as Redis;
  await redis.flushall();
});

describe('runWarmupTurn', () => {
  it('genera y envia la pregunta de warmup y la persiste', async () => {
    const gemini: GeminiClient = { generate: async () => 'Hola, presentate brevemente.' };
    const d = deps(gemini);
    await runWarmupTurn(d);
    const types = d._socket.sent.map((m) => m.type);
    expect(types).toEqual(['interviewer.message']);
    const history = await readHistory(d._redis, d.state.id);
    expect(history).toHaveLength(1);
    expect(history[0]!.role).toBe('interviewer');
  });
});

describe('runCandidateTurn', () => {
  it('avanza el turno, genera, persiste candidato+entrevistador y envia', async () => {
    const gemini: GeminiClient = { generate: async () => 'Buena. Como manejas concurrencia?' };
    const d = deps(gemini, new FakeSocket(), makeState({ turnNumber: 0, phase: 'warmup' }));
    await runCandidateTurn(d, 'Soy backend con 3 anios');
    expect(d.state.turnNumber).toBe(1);
    expect(d.state.phase).toBe('interviewing');
    const history = await readHistory(d._redis, d.state.id);
    expect(history.map((e) => e.role)).toEqual(['candidate', 'interviewer']);
    expect(d._socket.sent.some((m) => m.type === 'interviewer.message')).toBe(true);
  });

  it('en fallo transitorio reintenta una vez y luego emite error llm_unavailable sin persistir', async () => {
    const generate = vi.fn().mockRejectedValue(new GeminiTransientError('net'));
    const d = deps(
      { generate },
      new FakeSocket(),
      makeState({ turnNumber: 1, phase: 'interviewing' }),
    );
    await runCandidateTurn(d, 'respuesta');
    expect(generate).toHaveBeenCalledTimes(2);
    const err = d._socket.sent.find((m) => m.type === 'error');
    expect(err).toMatchObject({
      type: 'error',
      payload: { code: 'llm_unavailable', recoverable: true },
    });
    expect(d.state.turnNumber).toBe(1);
    expect(await readHistory(d._redis, d.state.id)).toEqual([]);
  });

  it('en contenido bloqueado emite un interviewer.message de fallback sin avanzar el turno', async () => {
    const generate = vi.fn().mockRejectedValue(new GeminiBlockedError('safety'));
    const d = deps(
      { generate },
      new FakeSocket(),
      makeState({ turnNumber: 1, phase: 'interviewing' }),
    );
    await runCandidateTurn(d, 'respuesta');
    expect(generate).toHaveBeenCalledTimes(1);
    const msg = d._socket.sent.find((m) => m.type === 'interviewer.message');
    expect(msg).toMatchObject({ payload: { intent: 'clarification' } });
    expect(d.state.turnNumber).toBe(1);
    expect(await readHistory(d._redis, d.state.id)).toEqual([]);
  });

  it('si el socket se cerro durante la generacion, no persiste ni envia', async () => {
    const socket = new FakeSocket();
    const gemini: GeminiClient = {
      generate: async () => {
        socket.readyState = 3;
        return 'respuesta tardia';
      },
    };
    const d = deps(gemini, socket, makeState({ turnNumber: 1, phase: 'interviewing' }));
    await runCandidateTurn(d, 'respuesta');
    expect(socket.sent.some((m) => m.type === 'interviewer.message')).toBe(false);
    expect(await readHistory(d._redis, d.state.id)).toEqual([]);
  });

  it('no hace nada si el turno ya alcanzo el maximo', async () => {
    const generate = vi.fn();
    const d = deps({ generate }, new FakeSocket(), makeState({ turnNumber: 6, phase: 'closing' }));
    await runCandidateTurn(d, 'respuesta tardia post-cierre');
    expect(generate).not.toHaveBeenCalled();
    expect(d._socket.sent).toEqual([]);
  });

  it('en la transicion al turno de cierre emite intent closing y pasa la fase a closing', async () => {
    const gemini: GeminiClient = {
      generate: async () => 'Gracias por tu tiempo, hemos terminado.',
    };
    const d = deps(gemini, new FakeSocket(), makeState({ turnNumber: 5, phase: 'interviewing' }));
    await runCandidateTurn(d, 'mi ultima respuesta');
    expect(d.state.turnNumber).toBe(6);
    expect(d.state.phase).toBe('closing');
    const msg = d._socket.sent.find((m) => m.type === 'interviewer.message');
    expect(msg).toMatchObject({ payload: { intent: 'closing' } });
  });

  it('si la persistencia falla no avanza el turno y emite llm_unavailable', async () => {
    const failingPipe = {
      rpush: () => failingPipe,
      set: () => failingPipe,
      expire: () => failingPipe,
      sadd: () => failingPipe,
      exec: async () => [[new Error('pipeline fallo'), null]],
    };
    const redis = {
      lrange: async () => [],
      pipeline: () => failingPipe,
    } as unknown as Redis;
    const socket = new FakeSocket();
    const gemini: GeminiClient = { generate: async () => 'pregunta generada ok' };
    const d = {
      socket: socket as unknown as WebSocket,
      log: silentLog(),
      redis,
      gemini,
      state: makeState({ turnNumber: 1, phase: 'interviewing' }),
    };
    await runCandidateTurn(d, 'respuesta');
    expect(d.state.turnNumber).toBe(1); // no avanza
    expect(socket.sent.some((m) => m.type === 'interviewer.message')).toBe(false);
    const err = socket.sent.find((m) => m.type === 'error');
    expect(err).toMatchObject({ payload: { code: 'llm_unavailable', recoverable: true } });
  });
});
