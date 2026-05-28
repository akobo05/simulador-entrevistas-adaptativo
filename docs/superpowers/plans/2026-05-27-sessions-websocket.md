# WebSocket /sessions/:id/ws Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el endpoint WebSocket `/v1/sessions/:sessionId/ws` con handshake autenticado contra Redis, validación de mensajes con los discriminated unions de `shared-types/ws`, registry de conexiones en memoria con kick-de-la-previa, heartbeat ping/pong, redacción del token en logs, y suite de tests con cliente WS real en puerto efímero.

**Architecture:** Plugin `@fastify/websocket` registrado en scope sin prefijo `/api/v1`. Handshake validado en hook `preValidation` (HTTP normal, antes del upgrade). Servicios aislados: `ConnectionRegistry` (Map en memoria), `validateUpgrade` (lee Redis), `startHeartbeat` (timers). Handler de mensajes con `safeParse` + try/catch de `JSON.parse` + contador de inválidos consecutivos. TTL de Redis se renueva en `on('pong')`, no por mensaje. Close codes compartidos con frontend en `shared-types/ws.ts` como `WS_CLOSE_CODES`.

**Tech Stack:** Fastify 5 + @fastify/websocket + Zod 3 + ioredis + ws + Node 22 + vitest + ioredis-mock

**Spec:** `docs/superpowers/specs/2026-05-27-sessions-websocket-design.md`

---

## File map

```
packages/shared-types/src/
└── ws.ts                                     (modifica) agrega WS_CLOSE_CODES + WsCloseCode

apps/api/package.json                         (modifica) agrega @fastify/websocket, ws, @types/ws

apps/api/src/
├── routes/
│   └── sessions.ws.ts                        (nuevo) registra ruta WS y delega al handler
├── services/
│   ├── connection-registry.ts                (nuevo) Map<sessionId, WebSocket> singleton
│   └── connection-registry.test.ts           (nuevo) unit tests
├── ws/
│   ├── constants.ts                          (nuevo) MAX_WS_PAYLOAD_BYTES, etc
│   ├── auth.ts                               (nuevo) validateUpgrade(redis, sessionId, token)
│   ├── auth.test.ts                          (nuevo) unit tests con ioredis-mock
│   ├── handler.ts                            (nuevo) attachHandlers(socket, ctx)
│   ├── handler.test.ts                       (nuevo) integration con cliente ws real
│   ├── heartbeat.ts                          (nuevo) startHeartbeat(socket, log)
│   └── heartbeat.test.ts                     (nuevo) unit con fake timers
└── server.ts                                 (modifica) registra plugin, decora connections, serializer redactor
```

---

## Task 1: Setup de dependencias, constantes y close codes compartidos

**Files:**
- Modify: `apps/api/package.json`
- Create: `apps/api/src/ws/constants.ts`
- Modify: `packages/shared-types/src/ws.ts`
- Test: `packages/shared-types/src/ws.test.ts` (nuevo)

- [ ] **Step 1: Agregar dependencias a apps/api/package.json**

En `dependencies` agregar:

```json
"@fastify/websocket": "^11.0.2",
"ws": "^8.18.0"
```

En `devDependencies` agregar:

```json
"@types/ws": "^8.5.13"
```

- [ ] **Step 2: Instalar dependencias**

Run: `pnpm install`
Expected: pnpm reporta `+3 packages` aprox, sin errores.

- [ ] **Step 3: Crear apps/api/src/ws/constants.ts**

```typescript
// apps/api/src/ws/constants.ts

// Limite duro de tamano de payload por mensaje WebSocket. Aplicado por el
// plugin (@fastify/websocket lo pasa a `ws`). Defiende el event loop de
// payloads gigantes. 16 KB cubre AuraState con 10 metricas (~1 KB) y un
// transcript de turno de ~600 palabras (~4 KB) con margen 3x.
export const MAX_WS_PAYLOAD_BYTES = 16384;

// Numero de mensajes invalidos CONSECUTIVOS antes de cerrar el socket con
// close(1008, 'policy_violation'). Se resetea al primer mensaje valido.
// Un cliente legitimo se equivoca 1-2 veces durante reconexion/migracion
// de schema, no 5 seguidos.
export const MAX_CONSECUTIVE_INVALID_MESSAGES = 5;

// Cada cuanto el server envia un ping para detectar clientes muertos.
export const HEARTBEAT_INTERVAL_MS = 30_000;

// Documental: ver spec §5. El ciclo del setInterval ya da la ventana de
// tolerancia (si no respondio en HEARTBEAT_INTERVAL_MS, cerramos).
export const HEARTBEAT_TIMEOUT_MS = 10_000;

// TTL renovado en Redis cada vez que llega un pong. Misma magnitud que el
// TTL inicial fijado en createSession (3600s = 1h).
export const SESSION_REFRESH_TTL_SECONDS = 3600;
```

- [ ] **Step 4: Agregar WS_CLOSE_CODES en packages/shared-types/src/ws.ts**

Al final del archivo (después del `ServerToClientMessageSchema`):

```typescript
// Codigos de cierre WebSocket. Backend y frontend importan este objeto
// para no usar magic numbers. Los <4000 son del RFC 6455; los >=4000 son
// del rango de aplicacion (4000-4999) y los definimos nosotros.
export const WS_CLOSE_CODES = {
  NORMAL: 1000,
  POLICY_VIOLATION: 1008,
  KEEPALIVE_FAILURE: 1011,
  SESSION_REPLACED: 4000,
  SESSION_EXPIRED: 4001,
} as const;

export type WsCloseCode = (typeof WS_CLOSE_CODES)[keyof typeof WS_CLOSE_CODES];
```

- [ ] **Step 5: Escribir el test del export**

Create `packages/shared-types/src/ws.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { WS_CLOSE_CODES, type WsCloseCode } from './ws';

describe('WS_CLOSE_CODES', () => {
  it('expone los codigos definidos en la spec §8', () => {
    expect(WS_CLOSE_CODES.NORMAL).toBe(1000);
    expect(WS_CLOSE_CODES.POLICY_VIOLATION).toBe(1008);
    expect(WS_CLOSE_CODES.KEEPALIVE_FAILURE).toBe(1011);
    expect(WS_CLOSE_CODES.SESSION_REPLACED).toBe(4000);
    expect(WS_CLOSE_CODES.SESSION_EXPIRED).toBe(4001);
  });

  it('WsCloseCode acepta solo valores del const', () => {
    const code: WsCloseCode = WS_CLOSE_CODES.SESSION_REPLACED;
    expect(code).toBe(4000);
  });
});
```

- [ ] **Step 6: Run tests**

Run: `pnpm --filter @warachikuy/shared-types test`
Expected: PASS, 2 tests del nuevo archivo + los que ya existían.

- [ ] **Step 7: Verificar typecheck**

Run: `pnpm -r typecheck`
Expected: sin errores.

- [ ] **Step 8: Commit**

```bash
git add apps/api/package.json pnpm-lock.yaml apps/api/src/ws/constants.ts packages/shared-types/src/ws.ts packages/shared-types/src/ws.test.ts
git commit -m "Se agregan dependencias del WebSocket y constantes compartidas (WS_CLOSE_CODES)"
```

---

## Task 2: ConnectionRegistry

**Files:**
- Create: `apps/api/src/services/connection-registry.ts`
- Test: `apps/api/src/services/connection-registry.test.ts`

- [ ] **Step 1: Escribir tests fallando**

Create `apps/api/src/services/connection-registry.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests para verificar que fallan**

Run: `pnpm --filter @warachikuy/api test connection-registry`
Expected: FAIL con "Cannot find module './connection-registry'".

- [ ] **Step 3: Implementar ConnectionRegistry**

Create `apps/api/src/services/connection-registry.ts`:

```typescript
import type { WebSocket } from 'ws';
import { WS_CLOSE_CODES } from '@warachikuy/shared-types';

// Singleton por proceso. Garantiza el invariante "una conexion por
// sessionId". Vive solo en memoria: F1 corre en una sola instancia
// (docker-compose, MVP academico). Si en F5 escalamos a multiples
// replicas habra que migrar a Redis con pub/sub para kick remoto.
export class ConnectionRegistry {
  private conns = new Map<string, WebSocket>();

  register(sessionId: string, socket: WebSocket): void {
    const prev = this.conns.get(sessionId);
    if (prev) {
      // Cerramos la conexion previa con code 4000 antes de aceptar la
      // nueva. El frontend tiene mapeado este code y NO debe reconectar.
      prev.close(WS_CLOSE_CODES.SESSION_REPLACED, 'session_replaced');
    }
    this.conns.set(sessionId, socket);
  }

  unregister(sessionId: string, socket: WebSocket): void {
    // Solo borra si el socket actual coincide. Esto protege la race en la
    // que un register() reemplaza la entrada y el unregister() tardio del
    // socket viejo borraria la entrada del nuevo.
    if (this.conns.get(sessionId) === socket) {
      this.conns.delete(sessionId);
    }
  }

  get(sessionId: string): WebSocket | undefined {
    return this.conns.get(sessionId);
  }

  size(): number {
    return this.conns.size;
  }
}
```

- [ ] **Step 4: Run tests para verificar que pasan**

Run: `pnpm --filter @warachikuy/api test connection-registry`
Expected: PASS, 5/5 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/connection-registry.ts apps/api/src/services/connection-registry.test.ts
git commit -m "Se agrega ConnectionRegistry con proteccion de race en unregister"
```

---

## Task 3: validateUpgrade (auth del handshake)

**Files:**
- Create: `apps/api/src/ws/auth.ts`
- Test: `apps/api/src/ws/auth.test.ts`

- [ ] **Step 1: Escribir tests fallando**

Create `apps/api/src/ws/auth.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import RedisMock from 'ioredis-mock';
import type Redis from 'ioredis';
import type { SessionState } from '@warachikuy/shared-types';
import { validateUpgrade } from './auth';

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

describe('validateUpgrade', () => {
  it('acepta cuando el token coincide y status=active', async () => {
    const redis = new RedisMock() as unknown as Redis;
    const state = makeState();
    await seedSession(redis, state);
    const result = await validateUpgrade(redis, state.id, VALID_TOKEN);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.id).toBe(state.id);
      expect(result.state.phase).toBe('warmup');
    }
  });

  it('rechaza con status=400 si el token tiene formato invalido', async () => {
    const redis = new RedisMock() as unknown as Redis;
    const result = await validateUpgrade(redis, 'any-id', 'not-hex-64-chars');
    expect(result).toEqual({ ok: false, status: 400, code: 'invalid_input' });
  });

  it('rechaza con status=400 si el token es undefined', async () => {
    const redis = new RedisMock() as unknown as Redis;
    const result = await validateUpgrade(redis, 'any-id', undefined);
    expect(result).toEqual({ ok: false, status: 400, code: 'invalid_input' });
  });

  it('rechaza con status=404 si la session no existe', async () => {
    const redis = new RedisMock() as unknown as Redis;
    const result = await validateUpgrade(
      redis,
      '550e8400-e29b-41d4-a716-446655440000',
      VALID_TOKEN,
    );
    expect(result).toEqual({ ok: false, status: 404, code: 'session_not_found' });
  });

  it('rechaza con status=401 si el token no coincide', async () => {
    const redis = new RedisMock() as unknown as Redis;
    const state = makeState();
    await seedSession(redis, state);
    const wrong = 'b'.repeat(64);
    const result = await validateUpgrade(redis, state.id, wrong);
    expect(result).toEqual({ ok: false, status: 401, code: 'invalid_token' });
  });

  it('rechaza con status=410 si la session tiene status distinto de active', async () => {
    const redis = new RedisMock() as unknown as Redis;
    const state = makeState({ status: 'ended' });
    await seedSession(redis, state);
    const result = await validateUpgrade(redis, state.id, VALID_TOKEN);
    expect(result).toEqual({ ok: false, status: 410, code: 'session_expired' });
  });

  it('rechaza con status=500 si el payload guardado en Redis no parsea contra el schema', async () => {
    const redis = new RedisMock() as unknown as Redis;
    const id = '550e8400-e29b-41d4-a716-446655440000';
    await redis.set(`session:${id}`, '{"garbled": true}', 'EX', 3600);
    const result = await validateUpgrade(redis, id, VALID_TOKEN);
    expect(result).toEqual({ ok: false, status: 500, code: 'internal_error' });
  });
});
```

- [ ] **Step 2: Run tests para verificar que fallan**

Run: `pnpm --filter @warachikuy/api test ws/auth`
Expected: FAIL con "Cannot find module './auth'".

- [ ] **Step 3: Implementar validateUpgrade**

Create `apps/api/src/ws/auth.ts`:

```typescript
import { z } from 'zod';
import type Redis from 'ioredis';
import { SessionStateSchema, type SessionState } from '@warachikuy/shared-types';

// Schema del query param. z.string() rechaza arrays automaticamente, lo
// que defiende contra ?token=A&token=B aunque el querystring parser de
// Fastify cambie en el futuro.
const TokenQuerySchema = z.string().regex(/^[0-9a-f]{64}$/);

export type ValidateUpgradeResult =
  | { ok: true; state: SessionState }
  | {
      ok: false;
      status: 400 | 401 | 404 | 410 | 500;
      code: 'invalid_input' | 'invalid_token' | 'session_not_found' | 'session_expired' | 'internal_error';
    };

export async function validateUpgrade(
  redis: Redis,
  sessionId: string,
  token: string | undefined,
): Promise<ValidateUpgradeResult> {
  const tokenCheck = TokenQuerySchema.safeParse(token);
  if (!tokenCheck.success) {
    return { ok: false, status: 400, code: 'invalid_input' };
  }

  const raw = await redis.get(`session:${sessionId}`);
  if (!raw) {
    return { ok: false, status: 404, code: 'session_not_found' };
  }

  // Si el payload en Redis no parsea contra el schema es un bug nuestro
  // (lo escribimos en createSession). Devolvemos 500, no 401, porque no
  // es culpa del cliente.
  let state: SessionState;
  try {
    const parsed = SessionStateSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      return { ok: false, status: 500, code: 'internal_error' };
    }
    state = parsed.data;
  } catch {
    return { ok: false, status: 500, code: 'internal_error' };
  }

  if (state.token !== tokenCheck.data) {
    return { ok: false, status: 401, code: 'invalid_token' };
  }
  if (state.status !== 'active') {
    return { ok: false, status: 410, code: 'session_expired' };
  }
  return { ok: true, state };
}
```

- [ ] **Step 4: Run tests para verificar que pasan**

Run: `pnpm --filter @warachikuy/api test ws/auth`
Expected: PASS, 7/7 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/ws/auth.ts apps/api/src/ws/auth.test.ts
git commit -m "Se agrega validateUpgrade para validar el handshake del WS contra Redis"
```

---

## Task 4: Heartbeat ping/pong

**Files:**
- Create: `apps/api/src/ws/heartbeat.ts`
- Test: `apps/api/src/ws/heartbeat.test.ts`

- [ ] **Step 1: Escribir tests fallando**

Create `apps/api/src/ws/heartbeat.test.ts`:

```typescript
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
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
    trace: vi.fn(), fatal: vi.fn(),
    child: () => log, level: 'silent', silent: vi.fn(),
  } as unknown as FastifyBaseLogger;
  return log;
}

describe('startHeartbeat', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

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
    expect(socket.close).toHaveBeenCalledWith(WS_CLOSE_CODES.KEEPALIVE_FAILURE, 'keepalive_failure');
  });

  it('detiene el timer cuando el socket emite close', () => {
    const socket = new FakeSocket();
    startHeartbeat(socket as unknown as WebSocket, silentLogger());

    socket.emit('close');
    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS * 5);
    expect(socket.ping).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests para verificar que fallan**

Run: `pnpm --filter @warachikuy/api test ws/heartbeat`
Expected: FAIL con "Cannot find module './heartbeat'".

- [ ] **Step 3: Implementar startHeartbeat**

Create `apps/api/src/ws/heartbeat.ts`:

```typescript
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
```

- [ ] **Step 4: Run tests para verificar que pasan**

Run: `pnpm --filter @warachikuy/api test ws/heartbeat`
Expected: PASS, 3/3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/ws/heartbeat.ts apps/api/src/ws/heartbeat.test.ts
git commit -m "Se agrega heartbeat ping/pong con timeout y cierre 1011"
```

---

## Task 5: Redacción del token en logs (logger serializer)

**Files:**
- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/src/server.test.ts`

- [ ] **Step 1: Escribir el test fallando**

Append al `describe('buildServer', ...)` en `apps/api/src/server.test.ts`, justo antes del cierre `})`:

```typescript
  it('redacta ?token= en los logs de request', async () => {
    // Capturamos el output del logger de Fastify pasandole un stream que
    // acumula los chunks. Usamos un sub-server con LOG_LEVEL=info y
    // destination custom para no contaminar la suite con logs reales.
    const writes: string[] = [];
    const captureStream = { write: (chunk: string) => { writes.push(chunk); return true; } };
    const captureEnv = { ...testEnv, LOG_LEVEL: 'info' as const };
    // buildServer toma deps.redis y deps.loggerDestination (este ultimo es
    // un parametro opcional que vamos a agregar). Si tu firma no lo tiene
    // aun, este test fallara y el siguiente step lo agrega.
    const sub = await buildServer(captureEnv, { redis, loggerDestination: captureStream });

    await sub.inject({
      method: 'GET',
      url: '/health?token=' + 'a'.repeat(64),
    });

    const joined = writes.join('');
    expect(joined).toContain('REDACTED');
    expect(joined).not.toContain('a'.repeat(64));
    await sub.close();
  });
```

- [ ] **Step 2: Run test para verificar que falla**

Run: `pnpm --filter @warachikuy/api test server`
Expected: FAIL (loggerDestination no existe en BuildServerDeps; el log no contiene REDACTED).

- [ ] **Step 3: Modificar apps/api/src/server.ts para soportar el serializer**

En el bloque `BuildServerDeps`, agregar el campo opcional:

```typescript
export interface BuildServerDeps {
  /** Cliente Redis a usar. Si no se provee, se construye con `buildRedisClient(env)`. */
  redis?: Redis;
  /** Destino opcional para los logs (usado en tests para capturar output). */
  loggerDestination?: { write(chunk: string): boolean | void };
}
```

Reemplazar la creacion de `Fastify({ logger: ... })` por:

```typescript
  // Redacta el query param `token` en req.url antes de loguearlo. Pino
  // por defecto loguea la URL completa, lo que filtraria el token de
  // sesion (que es secreto, ver spec §6.1). Aplica a CUALQUIER ruta que
  // reciba un token por query string, no solo al WS.
  const redactTokenInUrl = (url: string): string =>
    url.replace(/([?&]token=)[^&]+/g, '$1REDACTED');

  const server = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      serializers: {
        req: (req) => ({
          method: req.method,
          url: redactTokenInUrl(req.url),
          remoteAddress: req.ip,
        }),
      },
      ...(deps.loggerDestination ? { stream: deps.loggerDestination } : {}),
    },
  });
```

- [ ] **Step 4: Run tests para verificar que pasan**

Run: `pnpm --filter @warachikuy/api test server`
Expected: PASS, todos los tests (los previos + el nuevo).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/server.ts apps/api/src/server.test.ts
git commit -m "Se redacta el query param token en los logs de request"
```

---

## Task 6: WS message handler (sin route todavía)

**Files:**
- Create: `apps/api/src/ws/handler.ts`

(No tests directos en esta task: el handler se prueba via integration en Task 7. Está aislado lo suficiente que el spec compliance + code review cubren su correctitud.)

- [ ] **Step 1: Crear apps/api/src/ws/handler.ts**

```typescript
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
import {
  MAX_CONSECUTIVE_INVALID_MESSAGES,
  SESSION_REFRESH_TTL_SECONDS,
} from './constants.js';
import { ConnectionRegistry } from '../services/connection-registry.js';

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
      // raw puede ser Buffer, ArrayBuffer o Buffer[]. toString() funciona
      // para los dos primeros casos; el tercero es raro con maxPayload
      // pequeno pero igual normalizamos.
      const text = Array.isArray(raw)
        ? Buffer.concat(raw).toString('utf8')
        : raw.toString();
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
```

- [ ] **Step 2: Verificar typecheck**

Run: `pnpm --filter @warachikuy/api typecheck`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/ws/handler.ts
git commit -m "Se agrega el handler de mensajes WS con validacion Zod y contador de invalidos"
```

---

## Task 7: Registro de la ruta + integración

**Files:**
- Create: `apps/api/src/routes/sessions.ws.ts`
- Modify: `apps/api/src/server.ts`
- Test: `apps/api/src/ws/handler.test.ts`

- [ ] **Step 1: Modificar server.ts para registrar @fastify/websocket y decorar connections**

En `apps/api/src/server.ts`, dentro de `buildServer` (después del registro de `rateLimit` y antes del bloque de `prefix: '/api/v1'`), agregar:

```typescript
  // ── WebSocket ──────────────────────────────────────────────────────────
  // Importamos en este punto del archivo (los imports van al tope, este
  // bloque es el lugar donde se registra el plugin). El handler completo
  // se registra en routes/sessions.ws.ts.
  await server.register(websocket, {
    options: { maxPayload: MAX_WS_PAYLOAD_BYTES },
  });

  const connections = new ConnectionRegistry();
  server.decorate('connections', connections);

  // Registramos la ruta WS fuera del prefijo /api/v1 para matchear el
  // contrato arquitectonico (spec 3.4): /v1/sessions/:id/ws
  await server.register(async (api) => {
    await registerSessionsWsRoute(api);
  });
```

Y agregar los imports al tope:

```typescript
import websocket from '@fastify/websocket';
import { MAX_WS_PAYLOAD_BYTES } from './ws/constants.js';
import { ConnectionRegistry } from './services/connection-registry.js';
import { registerSessionsWsRoute } from './routes/sessions.ws.js';
```

Y aumentar el `declare module 'fastify'` para incluir `connections`:

```typescript
declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis;
    env: Env;
    connections: ConnectionRegistry;
  }
}
```

- [ ] **Step 2: Crear apps/api/src/routes/sessions.ws.ts**

```typescript
import type { FastifyInstance } from 'fastify';
import { validateUpgrade } from '../ws/auth.js';
import { attachHandlers } from '../ws/handler.js';
import { apiError } from '../errors.js';

export async function registerSessionsWsRoute(server: FastifyInstance): Promise<void> {
  server.get<{
    Params: { sessionId: string };
    Querystring: { token?: string };
  }>(
    '/v1/sessions/:sessionId/ws',
    {
      websocket: true,
      // El preValidation corre en HTTP normal antes del upgrade. Si
      // rechazamos aca, el cliente recibe un 4xx HTTP estandar (curl-able)
      // y no se inicia el handshake WebSocket.
      preValidation: async (req, reply) => {
        const { sessionId } = req.params as { sessionId: string };
        const { token } = req.query as { token?: string };
        const result = await validateUpgrade(server.redis, sessionId, token);
        if (!result.ok) {
          return reply.code(result.status).send(apiError(result.code, messageFor(result.code)));
        }
        // Guardamos el state validado en el request para que el handler lo
        // recupere sin tener que volver a leer Redis.
        (req as unknown as { wsState: typeof result.state }).wsState = result.state;
      },
    },
    (socket, req) => {
      const state = (req as unknown as { wsState: import('@warachikuy/shared-types').SessionState }).wsState;
      const log = req.log.child({ sessionId: state.id, ws: true });
      attachHandlers({
        socket,
        log,
        redis: server.redis,
        connections: server.connections,
        state,
      });
    },
  );
}

function messageFor(code: string): string {
  switch (code) {
    case 'invalid_input': return 'Token invalido o ausente';
    case 'session_not_found': return 'Sesion no encontrada';
    case 'invalid_token': return 'Token no coincide con la sesion';
    case 'session_expired': return 'Sesion ya no esta activa';
    default: return 'Error interno';
  }
}
```

- [ ] **Step 3: Verificar typecheck del server**

Run: `pnpm --filter @warachikuy/api typecheck`
Expected: sin errores.

- [ ] **Step 4: Escribir el archivo de integration tests fallando**

Create `apps/api/src/ws/handler.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WebSocket } from 'ws';
import RedisMock from 'ioredis-mock';
import type Redis from 'ioredis';
import type { FastifyInstance, AddressInfo } from 'fastify';
import type { SessionState } from '@warachikuy/shared-types';
import { WS_CLOSE_CODES } from '@warachikuy/shared-types';
import { buildServer } from '../server';
import { loadEnv } from '../config/env';
import { MAX_CONSECUTIVE_INVALID_MESSAGES } from './constants';

const testEnv = loadEnv({
  PORT: '0',
  DATABASE_URL: 'postgresql://x:x@x/x',
  REDIS_URL: 'redis://x:6379',
  GEMINI_API_KEY: 'k',
  LOG_LEVEL: 'silent',
  CORS_ORIGINS: 'http://localhost:5173',
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

function nextMessage(ws: WebSocket): Promise<string> {
  return new Promise((resolve, reject) => {
    ws.once('message', (data) => resolve(data.toString()));
    ws.once('error', reject);
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
    await new Promise<void>((resolve) => {
      ws.on('unexpected-response', (_req, res) => {
        expect(res.statusCode).toBe(400);
        resolve();
      });
    });
  });

  it('rechaza con 404 si la session no existe', async () => {
    const ws = new WebSocket(url(makeState()));
    await new Promise<void>((resolve) => {
      ws.on('unexpected-response', (_req, res) => {
        expect(res.statusCode).toBe(404);
        resolve();
      });
    });
  });

  it('rechaza con 401 si el token no coincide', async () => {
    const state = makeState();
    await seedSession(redis, state);
    const ws = new WebSocket(url(state, 'b'.repeat(64)));
    await new Promise<void>((resolve) => {
      ws.on('unexpected-response', (_req, res) => {
        expect(res.statusCode).toBe(401);
        resolve();
      });
    });
  });

  it('rechaza con 410 si la session esta ended', async () => {
    const state = makeState({ status: 'ended' });
    await seedSession(redis, state);
    const ws = new WebSocket(url(state));
    await new Promise<void>((resolve) => {
      ws.on('unexpected-response', (_req, res) => {
        expect(res.statusCode).toBe(410);
        resolve();
      });
    });
  });

  it('al conectar emite session.state con phase y turnNumber', async () => {
    const state = makeState({ phase: 'interviewing', turnNumber: 2 });
    await seedSession(redis, state);
    const ws = new WebSocket(url(state));
    await new Promise<void>((resolve) => ws.once('open', () => resolve()));
    const first = JSON.parse(await nextMessage(ws));
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
    await new Promise<void>((resolve) => ws.once('open', () => resolve()));
    await nextMessage(ws); // descarta session.state inicial
    ws.send('this is not json');
    const errMsg = JSON.parse(await nextMessage(ws));
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
    await new Promise<void>((resolve) => ws.once('open', () => resolve()));
    await nextMessage(ws);
    ws.send(JSON.stringify({ type: 'unknown.thing', payload: {} }));
    const errMsg = JSON.parse(await nextMessage(ws));
    expect(errMsg.payload.code).toBe('invalid_message');
    expect(errMsg.payload.message).toBe('schema_validation_failed');
    ws.close();
  });

  it('cierra con 1008 tras MAX_CONSECUTIVE_INVALID_MESSAGES invalidos seguidos', async () => {
    const state = makeState();
    await seedSession(redis, state);
    const ws = new WebSocket(url(state));
    await new Promise<void>((resolve) => ws.once('open', () => resolve()));
    await nextMessage(ws);
    // Envia MAX inválidos. Los primeros (MAX-1) reciben error. El MAX-esimo
    // gatilla el close. Drenamos todas las respuestas error mientras tanto.
    const closeP = waitClose(ws);
    for (let i = 0; i < MAX_CONSECUTIVE_INVALID_MESSAGES; i++) {
      ws.send('garbled');
    }
    const closed = await closeP;
    expect(closed.code).toBe(WS_CLOSE_CODES.POLICY_VIOLATION);
  });

  it('cuando llega una segunda conexion al mismo sessionId, cierra la primera con 4000', async () => {
    const state = makeState();
    await seedSession(redis, state);
    const ws1 = new WebSocket(url(state));
    await new Promise<void>((resolve) => ws1.once('open', () => resolve()));
    await nextMessage(ws1); // session.state

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
    await new Promise<void>((resolve) => ws.once('open', () => resolve()));
    await nextMessage(ws);
    expect(server.connections.size()).toBe(1);
    const closedP = new Promise<void>((resolve) => ws.once('close', () => resolve()));
    ws.close();
    await closedP;
    // Pequena espera para que el server procese el 'close' tambien.
    await new Promise((r) => setTimeout(r, 50));
    expect(server.connections.size()).toBe(0);
  });
});
```

- [ ] **Step 5: Run tests para verificar que pasan**

Run: `pnpm --filter @warachikuy/api test ws/handler`
Expected: PASS, 10/10 tests.

- [ ] **Step 6: Correr toda la suite del api para confirmar que nada se rompió**

Run: `pnpm --filter @warachikuy/api test`
Expected: PASS, todos los tests del api (los previos del Task 1-6 + los previos de POST /sessions + los nuevos de WS).

- [ ] **Step 7: Run typecheck del monorepo**

Run: `pnpm -r typecheck`
Expected: sin errores.

- [ ] **Step 8: Run lint**

Run: `pnpm --filter @warachikuy/api lint`
Expected: sin errores.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/server.ts apps/api/src/routes/sessions.ws.ts apps/api/src/ws/handler.test.ts
git commit -m "Se registra la ruta WS /v1/sessions/:sessionId/ws con tests de integracion"
```

---

## Notas finales

- **Branch:** `feat/sessions-websocket` (ya creada, contiene el spec en los commits `384977d` + `ec8b451`).
- **PR target:** `main`. Crear PR al terminar todas las tareas.
- **No mergear hasta:** suite del api pasa al 100% + typecheck + lint del monorepo verde.
- **Follow-ups esperados (no incluir en este PR):** generación de `interviewer.message` con LLM Coach, rate-limit por mensaje dentro del socket, registry distribuido para múltiples replicas (F5).
- **Gap consciente de testing:** el caso del spec §10.2 "TTL en Redis se renueva tras pong" no está cubierto. Agregar el integration test agregaría ~30s al runtime con timers reales (el primer pong real llega cuando el server emite su primer ping), y mockear el socket interno desde un test integration es complejo. La cobertura indirecta es: (1) el unit test del heartbeat verifica que el ping se envía, (2) el código del handler en Task 6 instala el listener `on('pong')` con la llamada a `redis.expire`. Si en code review insisten, se promueve a un test unit del handler con FakeSocket en un PR de follow-up.
