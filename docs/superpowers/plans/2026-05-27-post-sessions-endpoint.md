# POST /api/v1/sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el endpoint REST `POST /api/v1/sessions` que crea una sesión de entrevista, la persiste en Redis con TTL, devuelve `{ sessionId, websocketUrl, token }` y aplica rate limit de 60/h por IP.

**Architecture:** Tres capas independientes en `apps/api/src/`: `routes/sessions.ts` (HTTP concerns), `services/sessions.service.ts` (lógica pura, testeable sin Fastify), `services/redis.ts` (factory del cliente). Contratos Zod en `packages/shared-types`. Tests con vitest + `ioredis-mock` para integración del handler.

**Tech Stack:** Fastify 5, Zod 3, ioredis, `@fastify/rate-limit`, Node 22, vitest, ioredis-mock.

**Spec referencia:** `docs/superpowers/specs/2026-05-27-post-sessions-endpoint-design.md`

---

## File Structure

**Nuevos archivos:**
- `packages/shared-types/src/sessions.ts` — schemas Industry, Level, CreateSessionRequest/Response, SessionPhase, SessionStatus, SessionState
- `apps/api/src/errors.ts` — helper `apiError(code, message, details?)`
- `apps/api/src/errors.test.ts` — tests del helper
- `apps/api/src/services/redis.ts` — `buildRedisClient(env)` factory
- `apps/api/src/services/sessions.service.ts` — `createSession(redis, request, env)` pura
- `apps/api/src/services/sessions.service.test.ts` — tests unit con ioredis-mock
- `apps/api/src/routes/sessions.ts` — handler HTTP de POST /api/v1/sessions
- `apps/api/src/routes/sessions.test.ts` — tests integración con server.inject
- `apps/api/README.md` — nota corta sobre Redis-only y TTL

**Modificaciones:**
- `packages/shared-types/src/index.ts` — re-exportar `./sessions`
- `packages/shared-types/src/index.test.ts` — agregar tests para los schemas nuevos
- `apps/api/src/config/env.ts` — agregar `WS_BASE_URL`
- `apps/api/src/config/env.test.ts` — agregar tests del default + override
- `apps/api/src/server.ts` — decorar `server.redis` y `server.env`, registrar rate-limit y rutas
- `apps/api/src/server.test.ts` — inyectar `RedisMock` en los tests existentes
- `apps/api/package.json` — agregar deps + devDeps

---

## Task 1: Instalar dependencias del endpoint

**Files:**
- Modify: `apps/api/package.json`
- Modify: `pnpm-lock.yaml` (auto)

- [ ] **Step 1: Instalar deps de runtime**

Run:
```bash
pnpm --filter @warachikuy/api add ioredis@^5.4.1 @fastify/rate-limit@^10.2.1
```

- [ ] **Step 2: Instalar devDep para tests**

Run:
```bash
pnpm --filter @warachikuy/api add -D ioredis-mock@^8.9.0
```

- [ ] **Step 3: Verificar que typecheck del monorepo sigue OK**

Run:
```bash
pnpm -r typecheck
```
Expected: PASS en los 4 paquetes (shared-types, voice-pipeline, api, web).

- [ ] **Step 4: Commit**

```bash
git add apps/api/package.json pnpm-lock.yaml
git commit -m "Se agregan dependencias para el endpoint de sesiones (ioredis, rate-limit, ioredis-mock)"
```

---

## Task 2: Agregar schemas de sesión a shared-types

**Files:**
- Create: `packages/shared-types/src/sessions.ts`
- Modify: `packages/shared-types/src/index.ts`
- Modify: `packages/shared-types/src/index.test.ts`

- [ ] **Step 1: Escribir los tests fallando**

Agregar al final de `packages/shared-types/src/index.test.ts` los siguientes bloques `describe` (antes del cierre del archivo):

```typescript
import {
  IndustrySchema,
  LevelSchema,
  CreateSessionRequestSchema,
  CreateSessionResponseSchema,
  SessionPhaseSchema,
  SessionStatusSchema,
  SessionStateSchema,
} from './index';

describe('IndustrySchema', () => {
  it('acepta los 4 valores de F1', () => {
    expect(IndustrySchema.safeParse('backend').success).toBe(true);
    expect(IndustrySchema.safeParse('frontend').success).toBe(true);
    expect(IndustrySchema.safeParse('data').success).toBe(true);
    expect(IndustrySchema.safeParse('fullstack').success).toBe(true);
  });

  it('rechaza un valor desconocido', () => {
    expect(IndustrySchema.safeParse('mobile').success).toBe(false);
  });
});

describe('LevelSchema', () => {
  it('acepta junior, mid y senior', () => {
    expect(LevelSchema.safeParse('junior').success).toBe(true);
    expect(LevelSchema.safeParse('mid').success).toBe(true);
    expect(LevelSchema.safeParse('senior').success).toBe(true);
  });

  it('rechaza otro nivel', () => {
    expect(LevelSchema.safeParse('principal').success).toBe(false);
  });
});

describe('CreateSessionRequestSchema', () => {
  it('valida un request bien formado', () => {
    const result = CreateSessionRequestSchema.safeParse({
      industry: 'backend',
      level: 'mid',
    });
    expect(result.success).toBe(true);
  });

  it('rechaza request sin industry', () => {
    expect(CreateSessionRequestSchema.safeParse({ level: 'mid' }).success).toBe(false);
  });
});

describe('CreateSessionResponseSchema', () => {
  it('valida response con shape esperada', () => {
    const result = CreateSessionResponseSchema.safeParse({
      sessionId: '550e8400-e29b-41d4-a716-446655440000',
      websocketUrl: 'ws://localhost:3000/v1/sessions/abc/ws?token=xyz',
      token: 'a'.repeat(64),
    });
    expect(result.success).toBe(true);
  });

  it('rechaza token con longitud distinta de 64', () => {
    expect(
      CreateSessionResponseSchema.safeParse({
        sessionId: '550e8400-e29b-41d4-a716-446655440000',
        websocketUrl: 'ws://localhost:3000',
        token: 'short',
      }).success,
    ).toBe(false);
  });
});

describe('SessionStateSchema', () => {
  it('valida un estado inicial coherente', () => {
    const result = SessionStateSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      industry: 'backend',
      level: 'mid',
      status: 'active',
      phase: 'warmup',
      turnNumber: 0,
      startedAt: 1700000000000,
      token: 'a'.repeat(64),
    });
    expect(result.success).toBe(true);
  });

  it('rechaza turnNumber negativo', () => {
    const result = SessionStateSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      industry: 'backend',
      level: 'mid',
      status: 'active',
      phase: 'warmup',
      turnNumber: -1,
      startedAt: 1700000000000,
      token: 'a'.repeat(64),
    });
    expect(result.success).toBe(false);
  });

  it('acepta los 3 valores válidos de phase', () => {
    for (const phase of ['warmup', 'interviewing', 'closing'] as const) {
      const result = SessionPhaseSchema.safeParse(phase);
      expect(result.success).toBe(true);
    }
  });

  it('acepta los 3 valores válidos de status', () => {
    for (const status of ['active', 'ended', 'expired'] as const) {
      const result = SessionStatusSchema.safeParse(status);
      expect(result.success).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Correr los tests para confirmar que fallan**

Run:
```bash
pnpm -F @warachikuy/shared-types test
```
Expected: FAIL con error de imports `IndustrySchema is not defined` (o similar) porque `sessions.ts` no existe todavía.

- [ ] **Step 3: Implementar `packages/shared-types/src/sessions.ts`**

```typescript
import { z } from 'zod';

export const IndustrySchema = z.enum(['backend', 'frontend', 'data', 'fullstack']);
export type Industry = z.infer<typeof IndustrySchema>;

export const LevelSchema = z.enum(['junior', 'mid', 'senior']);
export type Level = z.infer<typeof LevelSchema>;

export const CreateSessionRequestSchema = z.object({
  industry: IndustrySchema,
  level: LevelSchema,
});
export type CreateSessionRequest = z.infer<typeof CreateSessionRequestSchema>;

export const CreateSessionResponseSchema = z.object({
  sessionId: z.string().uuid(),
  websocketUrl: z.string().url(),
  token: z.string().length(64),
});
export type CreateSessionResponse = z.infer<typeof CreateSessionResponseSchema>;

export const SessionPhaseSchema = z.enum(['warmup', 'interviewing', 'closing']);
export type SessionPhase = z.infer<typeof SessionPhaseSchema>;

export const SessionStatusSchema = z.enum(['active', 'ended', 'expired']);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const SessionStateSchema = z.object({
  id: z.string().uuid(),
  industry: IndustrySchema,
  level: LevelSchema,
  status: SessionStatusSchema,
  phase: SessionPhaseSchema,
  turnNumber: z.number().int().nonnegative(),
  startedAt: z.number().int(),
  token: z.string().length(64),
});
export type SessionState = z.infer<typeof SessionStateSchema>;
```

- [ ] **Step 4: Re-exportar desde el barrel**

Agregar al final de `packages/shared-types/src/index.ts`:

```typescript
export * from './sessions';
```

- [ ] **Step 5: Correr los tests para verificar que pasan**

Run:
```bash
pnpm -F @warachikuy/shared-types test
```
Expected: PASS con 13 (preexistentes) + 11 (nuevos) = 24 tests.

- [ ] **Step 6: Typecheck del paquete**

Run:
```bash
pnpm -F @warachikuy/shared-types typecheck
```
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add packages/shared-types/src/sessions.ts packages/shared-types/src/index.ts packages/shared-types/src/index.test.ts
git commit -m "Se agregan schemas de sesiones (Industry, Level, CreateSession*, SessionState) en shared-types"
```

---

## Task 3: Agregar WS_BASE_URL al schema de env

**Files:**
- Modify: `apps/api/src/config/env.ts`
- Modify: `apps/api/src/config/env.test.ts`

- [ ] **Step 1: Escribir los tests fallando**

Agregar al final de `apps/api/src/config/env.test.ts` (antes del cierre del último `describe`):

```typescript
describe('WS_BASE_URL', () => {
  const fullEnv = {
    PORT: '3000',
    DATABASE_URL: 'postgresql://x:x@x/x',
    REDIS_URL: 'redis://x:6379',
    GEMINI_API_KEY: 'k',
    LOG_LEVEL: 'info',
    CORS_ORIGINS: 'http://localhost:5173',
  };

  it('aplica ws://localhost:3000 por defecto cuando no se especifica', () => {
    const env = loadEnv(fullEnv);
    expect(env.WS_BASE_URL).toBe('ws://localhost:3000');
  });

  it('respeta WS_BASE_URL del entorno cuando se provee', () => {
    const env = loadEnv({ ...fullEnv, WS_BASE_URL: 'wss://api.warachikuy.com' });
    expect(env.WS_BASE_URL).toBe('wss://api.warachikuy.com');
  });

  it('rechaza WS_BASE_URL que no sea URL válida', () => {
    expect(() => loadEnv({ ...fullEnv, WS_BASE_URL: 'not a url' })).toThrow();
  });
});
```

- [ ] **Step 2: Correr para confirmar fallo**

Run:
```bash
pnpm -F @warachikuy/api test
```
Expected: FAIL en los 3 nuevos tests (`WS_BASE_URL` undefined).

- [ ] **Step 3: Agregar el campo al schema**

En `apps/api/src/config/env.ts`, agregar dentro de `envSchema` (después de `CORS_ORIGINS`):

```typescript
WS_BASE_URL: z.string().url().default('ws://localhost:3000'),
```

- [ ] **Step 4: Correr para verificar pass**

Run:
```bash
pnpm -F @warachikuy/api test
```
Expected: PASS con 21 (preexistentes) + 3 (nuevos) = 24 tests en env.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/config/env.ts apps/api/src/config/env.test.ts
git commit -m "Se agrega WS_BASE_URL al schema de variables de entorno con default ws://localhost:3000"
```

---

## Task 4: Crear el helper `apiError`

**Files:**
- Create: `apps/api/src/errors.ts`
- Create: `apps/api/src/errors.test.ts`

- [ ] **Step 1: Escribir los tests fallando**

Crear `apps/api/src/errors.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { ApiErrorSchema } from '@warachikuy/shared-types';
import { apiError } from './errors';

describe('apiError', () => {
  it('devuelve estructura mínima sin details', () => {
    const result = apiError('invalid_input', 'Body invalido');
    expect(result).toEqual({
      error: { code: 'invalid_input', message: 'Body invalido' },
    });
  });

  it('incluye details cuando se proveen', () => {
    const result = apiError('invalid_input', 'Body invalido', { field: 'industry' });
    expect(result.error.details).toEqual({ field: 'industry' });
  });

  it('valida con ApiErrorSchema de shared-types', () => {
    const result = apiError('internal_error', 'Algo fallo');
    expect(ApiErrorSchema.safeParse(result).success).toBe(true);
  });
});
```

- [ ] **Step 2: Correr para confirmar fallo**

Run:
```bash
pnpm -F @warachikuy/api test
```
Expected: FAIL (`apiError is not defined`).

- [ ] **Step 3: Implementar `apps/api/src/errors.ts`**

```typescript
import type { ApiError } from '@warachikuy/shared-types';

// Helper para construir respuestas de error uniformes. Mantiene la shape
// exacta del ApiErrorSchema de shared-types para que el frontend pueda
// validarla con safeParse en su interceptor.
export function apiError(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): ApiError {
  return {
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  };
}
```

- [ ] **Step 4: Correr para verificar pass**

Run:
```bash
pnpm -F @warachikuy/api test
```
Expected: PASS con los 3 nuevos tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/errors.ts apps/api/src/errors.test.ts
git commit -m "Se agrega helper apiError para construir respuestas de error uniformes"
```

---

## Task 5: Crear `buildRedisClient`

**Files:**
- Create: `apps/api/src/services/redis.ts`

- [ ] **Step 1: Crear el factory**

Crear `apps/api/src/services/redis.ts`:

```typescript
import Redis from 'ioredis';
import type { Env } from '../config/env.js';

// Factory aislado para poder inyectar un mock en tests via el parámetro
// `deps.redis` de `buildServer`. En producción se llama una sola vez al
// iniciar el servidor.
export function buildRedisClient(env: Env): Redis {
  return new Redis(env.REDIS_URL);
}
```

- [ ] **Step 2: Verificar typecheck**

Run:
```bash
pnpm -F @warachikuy/api typecheck
```
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/redis.ts
git commit -m "Se agrega factory buildRedisClient para crear la conexion a Redis desde env"
```

---

## Task 6: Crear el service `createSession` (TDD)

**Files:**
- Create: `apps/api/src/services/sessions.service.ts`
- Create: `apps/api/src/services/sessions.service.test.ts`

- [ ] **Step 1: Escribir los tests fallando**

Crear `apps/api/src/services/sessions.service.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import RedisMock from 'ioredis-mock';
import type Redis from 'ioredis';
import { createSession } from './sessions.service';
import type { Env } from '../config/env';

const fakeEnv: Env = {
  PORT: 3000,
  DATABASE_URL: 'postgresql://x:x@x/x',
  REDIS_URL: 'redis://x:6379',
  GEMINI_API_KEY: 'k',
  LOG_LEVEL: 'info',
  CORS_ORIGINS: ['http://localhost:5173'],
  WS_BASE_URL: 'ws://test.local',
};

describe('createSession', () => {
  it('escribe el SessionState en Redis bajo key session:<id>', async () => {
    const redis = new RedisMock() as unknown as Redis;
    const res = await createSession(redis, { industry: 'backend', level: 'mid' }, fakeEnv);
    const raw = await redis.get(`session:${res.sessionId}`);
    expect(raw).toBeTruthy();
    const state = JSON.parse(raw as string);
    expect(state.industry).toBe('backend');
    expect(state.level).toBe('mid');
  });

  it('genera sessionId UUID v4 distinto entre llamadas', async () => {
    const redis = new RedisMock() as unknown as Redis;
    const a = await createSession(redis, { industry: 'backend', level: 'mid' }, fakeEnv);
    const b = await createSession(redis, { industry: 'backend', level: 'mid' }, fakeEnv);
    expect(a.sessionId).not.toBe(b.sessionId);
    expect(a.sessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('genera token de 64 chars hexadecimales', async () => {
    const redis = new RedisMock() as unknown as Redis;
    const res = await createSession(redis, { industry: 'backend', level: 'mid' }, fakeEnv);
    expect(res.token).toHaveLength(64);
    expect(res.token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('llama redis.set con TTL 3600 segundos', async () => {
    const setSpy = vi.fn().mockResolvedValue('OK');
    const redis = { set: setSpy } as unknown as Redis;
    await createSession(redis, { industry: 'backend', level: 'mid' }, fakeEnv);
    expect(setSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^session:/),
      expect.any(String),
      'EX',
      3600,
    );
  });

  it('inicializa SessionState con status=active, phase=warmup, turnNumber=0', async () => {
    const redis = new RedisMock() as unknown as Redis;
    const res = await createSession(redis, { industry: 'frontend', level: 'junior' }, fakeEnv);
    const state = JSON.parse((await redis.get(`session:${res.sessionId}`)) as string);
    expect(state.status).toBe('active');
    expect(state.phase).toBe('warmup');
    expect(state.turnNumber).toBe(0);
  });

  it('websocketUrl incluye sessionId y token y respeta WS_BASE_URL', async () => {
    const redis = new RedisMock() as unknown as Redis;
    const res = await createSession(redis, { industry: 'data', level: 'senior' }, fakeEnv);
    expect(res.websocketUrl).toContain(res.sessionId);
    expect(res.websocketUrl).toContain(res.token);
    expect(res.websocketUrl).toMatch(/^ws:\/\/test\.local\/v1\/sessions\/[^/]+\/ws\?token=/);
  });
});
```

- [ ] **Step 2: Correr para confirmar fallo**

Run:
```bash
pnpm -F @warachikuy/api test
```
Expected: FAIL en los 6 tests (`createSession is not defined`).

- [ ] **Step 3: Implementar `apps/api/src/services/sessions.service.ts`**

```typescript
// Import explícito de node:crypto. El crypto global de Node 22 implementa
// Web Crypto API y NO expone randomBytes — usar node:crypto unifica ambos
// métodos (randomUUID + randomBytes) en una sola API estable.
import crypto from 'node:crypto';
import type Redis from 'ioredis';
import type {
  CreateSessionRequest,
  CreateSessionResponse,
  SessionState,
} from '@warachikuy/shared-types';
import type { Env } from '../config/env.js';

const SESSION_TTL_SECONDS = 3600;

export async function createSession(
  redis: Redis,
  request: CreateSessionRequest,
  env: Env,
): Promise<CreateSessionResponse> {
  const sessionId = crypto.randomUUID();
  const token = crypto.randomBytes(32).toString('hex');

  const state: SessionState = {
    id: sessionId,
    industry: request.industry,
    level: request.level,
    status: 'active',
    phase: 'warmup',
    turnNumber: 0,
    startedAt: Date.now(),
    token,
  };

  await redis.set(`session:${sessionId}`, JSON.stringify(state), 'EX', SESSION_TTL_SECONDS);

  return {
    sessionId,
    websocketUrl: `${env.WS_BASE_URL}/v1/sessions/${sessionId}/ws?token=${token}`,
    token,
  };
}
```

- [ ] **Step 4: Correr los tests**

Run:
```bash
pnpm -F @warachikuy/api test
```
Expected: PASS con 6 nuevos tests en `sessions.service.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/sessions.service.ts apps/api/src/services/sessions.service.test.ts
git commit -m "Se agrega createSession service con persistencia en Redis y TTL de 1h"
```

---

## Task 7: Decorar el server con redis + env, registrar rate-limit, actualizar tests

**Files:**
- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/src/server.test.ts`

- [ ] **Step 1: Actualizar `server.test.ts` para inyectar RedisMock**

Reemplazar las llamadas a `buildServer(env)` por `buildServer(env, { redis })`. El archivo completo queda así:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import RedisMock from 'ioredis-mock';
import type Redis from 'ioredis';
import type { FastifyInstance } from 'fastify';
import { buildServer } from './server';
import { loadEnv } from './config/env';

const testEnv = loadEnv({
  PORT: '3000',
  DATABASE_URL: 'postgresql://x:x@x/x',
  REDIS_URL: 'redis://x:6379',
  GEMINI_API_KEY: 'k',
  LOG_LEVEL: 'silent',
  CORS_ORIGINS: 'http://localhost:5173',
});

describe('buildServer', () => {
  let server: FastifyInstance;
  let redis: Redis;

  beforeEach(async () => {
    redis = new RedisMock() as unknown as Redis;
    server = await buildServer(testEnv, { redis });
  });

  afterEach(async () => {
    await server.close();
  });

  it('responde 200 con {status:"ok"} en /health', async () => {
    const res = await server.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ status: 'ok' });
  });

  it('responde 204 al preflight CORS de un origen permitido', async () => {
    const res = await server.inject({
      method: 'OPTIONS',
      url: '/health',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'GET',
      },
    });
    expect(res.statusCode).toBe(204);
  });

  it('responde 200 a petición de origen no permitido sin header access-control-allow-origin', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'http://evil.example.com' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
```

- [ ] **Step 2: Modificar `apps/api/src/server.ts`**

Reemplazar el contenido completo de `apps/api/src/server.ts`:

```typescript
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import type Redis from 'ioredis';
import { type Env } from './config/env.js';
import { buildRedisClient } from './services/redis.js';

// Aumentamos el tipo de FastifyInstance para que `server.redis` y `server.env`
// sean accesibles desde handlers y plugins sin casts.
declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis;
    env: Env;
  }
}

export interface BuildServerDeps {
  /** Cliente Redis a usar. Si no se provee, se construye con `buildRedisClient(env)`. */
  redis?: Redis;
}

export async function buildServer(
  env: Env,
  deps: BuildServerDeps = {},
): Promise<FastifyInstance> {
  const server = Fastify({
    logger: { level: env.LOG_LEVEL },
  });

  const redis = deps.redis ?? buildRedisClient(env);
  server.decorate('redis', redis);
  server.decorate('env', env);

  await server.register(cors, {
    origin: env.CORS_ORIGINS,
    credentials: true,
  });

  // El plugin de rate-limit usa la misma instancia de Redis para no abrir
  // una conexión paralela. `global: false` deja que cada ruta opte-in via
  // su config local.
  await server.register(rateLimit, {
    redis,
    global: false,
  });

  server.get('/health', async () => ({ status: 'ok' }));

  return server;
}
```

- [ ] **Step 3: Correr los tests del paquete api**

Run:
```bash
pnpm -F @warachikuy/api test
```
Expected: PASS con todos los tests (env + errors + sessions.service + server).

- [ ] **Step 4: Typecheck del paquete**

Run:
```bash
pnpm -F @warachikuy/api typecheck
```
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/server.ts apps/api/src/server.test.ts
git commit -m "Se decora el server con redis y env, se registra rate-limit reusando la misma instancia"
```

---

## Task 8: Crear el handler de POST /api/v1/sessions (TDD)

**Files:**
- Create: `apps/api/src/routes/sessions.ts`
- Create: `apps/api/src/routes/sessions.test.ts`
- Modify: `apps/api/src/server.ts`

- [ ] **Step 1: Escribir los tests fallando**

Crear `apps/api/src/routes/sessions.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import RedisMock from 'ioredis-mock';
import type Redis from 'ioredis';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../server';
import { loadEnv } from '../config/env';

const testEnv = loadEnv({
  PORT: '3000',
  DATABASE_URL: 'postgresql://x:x@x/x',
  REDIS_URL: 'redis://x:6379',
  GEMINI_API_KEY: 'k',
  LOG_LEVEL: 'silent',
  CORS_ORIGINS: 'http://localhost:5173',
  WS_BASE_URL: 'ws://test.local',
});

describe('POST /api/v1/sessions', () => {
  let server: FastifyInstance;
  let redis: Redis;

  beforeEach(async () => {
    redis = new RedisMock() as unknown as Redis;
    server = await buildServer(testEnv, { redis });
  });

  afterEach(async () => {
    await server.close();
  });

  it('responde 201 con la shape de CreateSessionResponse cuando el body es válido', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      payload: { industry: 'backend', level: 'mid' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.sessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(body.token).toHaveLength(64);
    expect(body.websocketUrl).toContain(body.sessionId);
    expect(body.websocketUrl).toContain(body.token);
  });

  it('responde 400 con ApiError invalid_input cuando el body está vacío', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('invalid_input');
  });

  it('responde 400 cuando industry es desconocida', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      payload: { industry: 'mobile', level: 'mid' },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('invalid_input');
  });

  it('responde 400 cuando level es desconocido', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      payload: { industry: 'backend', level: 'principal' },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('invalid_input');
  });

  it('responde 400 cuando el body no es JSON parseable', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      headers: { 'content-type': 'application/json' },
      payload: 'not json',
    });
    expect(res.statusCode).toBe(400);
  });

  it('responde 500 sin exponer stack cuando redis.set rechaza', async () => {
    // RedisMock como base + override de set para forzar rechazo
    const brokenRedis = new RedisMock() as unknown as Redis;
    brokenRedis.set = vi.fn().mockRejectedValue(new Error('connection refused'));
    const brokenServer = await buildServer(testEnv, { redis: brokenRedis });

    const res = await brokenServer.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      payload: { industry: 'backend', level: 'mid' },
    });
    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('internal_error');
    expect(JSON.stringify(body)).not.toContain('connection refused');
    expect(JSON.stringify(body)).not.toContain('stack');

    await brokenServer.close();
  });
});
```

- [ ] **Step 2: Correr para confirmar fallo**

Run:
```bash
pnpm -F @warachikuy/api test
```
Expected: FAIL en los 6 tests nuevos (la ruta no existe → Fastify devuelve 404).

- [ ] **Step 3: Crear el handler `apps/api/src/routes/sessions.ts`**

```typescript
import type { FastifyInstance } from 'fastify';
import { CreateSessionRequestSchema } from '@warachikuy/shared-types';
import { createSession } from '../services/sessions.service.js';
import { apiError } from '../errors.js';

export async function registerSessionsRoutes(server: FastifyInstance): Promise<void> {
  server.post(
    '/sessions',
    {
      config: {
        // Rate limit por IP: 60 sesiones/hora según spec arquitectónica 3.7
        rateLimit: { max: 60, timeWindow: '1 hour' },
      },
    },
    async (req, reply) => {
      const parsed = CreateSessionRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send(apiError('invalid_input', 'Body invalido', parsed.error.format()));
      }

      try {
        const response = await createSession(server.redis, parsed.data, server.env);
        return reply.code(201).send(response);
      } catch (err) {
        req.log.error({ err }, 'Error creando sesion');
        return reply
          .code(500)
          .send(apiError('internal_error', 'No se pudo crear la sesion'));
      }
    },
  );
}
```

- [ ] **Step 4: Registrar las rutas en `server.ts` bajo el prefix /api/v1**

En `apps/api/src/server.ts`, agregar el import al inicio:

```typescript
import { registerSessionsRoutes } from './routes/sessions.js';
```

Y agregar antes del `server.get('/health', ...)` el siguiente bloque:

```typescript
await server.register(
  async (api) => {
    await registerSessionsRoutes(api);
  },
  { prefix: '/api/v1' },
);
```

- [ ] **Step 5: Correr los tests**

Run:
```bash
pnpm -F @warachikuy/api test
```
Expected: PASS con todos los tests, incluyendo los 6 nuevos del handler.

- [ ] **Step 6: Typecheck**

Run:
```bash
pnpm -F @warachikuy/api typecheck
```
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/sessions.ts apps/api/src/routes/sessions.test.ts apps/api/src/server.ts
git commit -m "Se agrega el handler POST /api/v1/sessions con validacion Zod y rate limit 60/h"
```

---

## Task 9: Agregar nota en `apps/api/README.md` sobre Redis-only

**Files:**
- Create: `apps/api/README.md`

- [ ] **Step 1: Crear el README con la nota**

```markdown
# @warachikuy/api

Backend Fastify del simulador de entrevistas.

## Decisiones de scope en F1

- **Persistencia de sesiones: solo en Redis.** El estado de una sesión (`SessionState`) vive bajo la key `session:<sessionId>` con TTL de 3600 segundos. PostgreSQL y `drizzle-kit` se incorporan en F2 cuando aparezca `ImprovementPlan`, que sí es persistente por diseño.

  Consecuencia conocida: si el container del backend se reinicia, las sesiones en curso se pierden. El usuario simplemente vuelve a crear una sesión. Trade-off aceptado para el MVP académico.

- **Sin autenticación de usuario final.** Las sesiones se identifican por `sessionId` + `token` opaco (32 bytes hex). Rate-limiting de 60 sesiones por hora por IP mitiga abuso. Autenticación completa llega en F5.

## Scripts

- `pnpm dev` — levanta el servidor con `tsx watch` (recarga al guardar).
- `pnpm typecheck` — `tsc --noEmit`.
- `pnpm test` — vitest run.
- `pnpm build` — emite `dist/`.
- `pnpm start` — corre el build producido.
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/README.md
git commit -m "Se agrega README del paquete api con nota sobre persistencia Redis-only en F1"
```

---

## Task 10: Verificación final del monorepo

**Files:** (ninguno)

- [ ] **Step 1: Lint completo**

Run:
```bash
pnpm -r lint
```
Expected: PASS en los 4 paquetes.

- [ ] **Step 2: Typecheck completo**

Run:
```bash
pnpm -r typecheck
```
Expected: PASS en los 4 paquetes.

- [ ] **Step 3: Tests completos**

Run:
```bash
pnpm -r test
```
Expected: PASS con el conteo:
- shared-types: 24 tests (13 preexistentes + 11 nuevos)
- voice-pipeline: 19 tests (sin cambios)
- api: ~40 tests (24 env + 3 errors + 6 service + 3 server + 6 sessions)
- web: 1 test (sin cambios)

- [ ] **Step 4: Build completo**

Run:
```bash
pnpm -r build
```
Expected: PASS en los 4 paquetes (genera `dist/` en cada uno).

- [ ] **Step 5: Push de la rama**

Run:
```bash
git push -u origin feat/post-sessions-endpoint
```
Expected: rama publicada en remoto.

- [ ] **Step 6: Abrir PR contra main**

Run:
```bash
gh pr create --base main --head feat/post-sessions-endpoint --title "feat(api): endpoint POST /api/v1/sessions (cierra #16)" --body "$(cat <<'EOF'
## Resumen

Primer endpoint REST del backend. Crea sesiones de entrevista y devuelve los datos para que el cliente abra la conexión WebSocket de F1.3.

Implementa el spec en \`docs/superpowers/specs/2026-05-27-post-sessions-endpoint-design.md\`.

## Cambios

- **shared-types**: nuevos schemas \`Industry\`, \`Level\`, \`CreateSessionRequest/Response\`, \`SessionPhase\`, \`SessionStatus\`, \`SessionState\`.
- **api**: handler \`POST /api/v1/sessions\` con validación Zod, persistencia Redis (TTL 1h), token opaco 32-bytes hex, rate-limit 60/h por IP.
- **infra**: \`buildRedisClient\` factory, decoración \`server.redis\` y \`server.env\`, \`@fastify/rate-limit\` reusa la misma instancia de Redis.

## Cierra

- #16 — [F1] Endpoint POST /sessions

## Verificación

- \`pnpm -r lint\` ✅
- \`pnpm -r typecheck\` ✅
- \`pnpm -r test\` ✅
- \`pnpm -r build\` ✅
EOF
)"
```

---

## Self-Review (resultado)

**1. Spec coverage:**

- ✅ Sección 1.1 Request → Task 2 (CreateSessionRequestSchema)
- ✅ Sección 1.2 Response → Task 2 (CreateSessionResponseSchema)
- ✅ Sección 2.1 SessionStateSchema con phase → Task 2 (SessionState + Phase + Status)
- ✅ Sección 2.2 Persistencia con TTL 3600 → Task 6 (SESSION_TTL_SECONDS = 3600)
- ✅ Sección 2.3 Inicialización → Task 6 (status=active, phase=warmup, turnNumber=0)
- ✅ Sección 2.4 Redis-only en F1 → Task 9 (nota en README)
- ✅ Sección 3.1 Estructura nuevos archivos → Tasks 4-8
- ✅ Sección 3.2 Capas → Tasks 6, 7, 8
- ✅ Sección 3.3 Flujo del handler → Task 8
- ✅ Sección 3.4 Service createSession con `node:crypto` → Task 6
- ✅ Sección 3.5 Cambios en server.ts → Task 7
- ✅ Sección 3.6 Códigos de respuesta → Task 8
- ✅ Sección 3.7 WS_BASE_URL → Task 3
- ✅ Sección 3.8 Dependencias → Task 1
- ✅ Sección 4 Testing → Tasks 6 y 8
- ✅ Sección 5 Out of scope → no requiere implementación
- ✅ Sección 6 Cierra #16 → Task 10 cuerpo del PR

**2. Placeholder scan:** sin TBDs, TODOs ni "implement later". Cada step tiene código completo.

**3. Type consistency:** verificado que los nombres usados son consistentes: `IndustrySchema`, `LevelSchema`, `CreateSessionRequest/Response`, `SessionState`, `SessionPhase`, `SessionStatus`, `createSession`, `buildRedisClient`, `apiError`, `registerSessionsRoutes`. La signature `createSession(redis, request, env)` se mantiene entre el spec, Task 6 y Task 8.
