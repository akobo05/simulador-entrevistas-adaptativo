# Identidad del candidato entre sesiones — Plan de implementacion

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconocer al mismo candidato entre sesiones con un id local anonimo (localStorage) enviado en `POST /sessions` y estampado en `interview_sessions.candidate_id` al cerrar.

**Architecture:** El frontend acuna un `candidateId` (uuid) estable en `localStorage` y lo manda en cada `POST /sessions`. El backend lo guarda en el `SessionState` (Redis) y lo escribe en `candidate_id` durante el archivo del `/end` (de #55). `candidateId` es opcional en todo el camino: omitido => sesion anonima (`candidate_id` null), retrocompatible. Sin login; OAuth real es F5.

**Tech Stack:** shared-types (Zod 3), apps/api (Fastify 5 + drizzle-orm 0.38 + postgres + ioredis), apps/web (React 19 + Vite). Tests: vitest + ioredis-mock + pglite (backend) y vitest + happy-dom (frontend). Node 22, ESM/NodeNext.

**Convenciones del repo (obligatorias):** identificadores y codigo en ingles; comentarios y mensajes de commit en español natural SIN acentos ("Se agrega X"); NO Conventional Commits; sin marcas de IA (nada de Co-Authored-By ni referencias a Claude/Anthropic).

---

## Estructura de archivos

**Modificados:**
- `packages/shared-types/src/sessions.ts` — `candidateId` opcional en `CreateSessionRequestSchema` y `SessionStateSchema`.
- `packages/shared-types/src/sessions.test.ts` — casos del nuevo campo.
- `apps/api/src/services/sessions.service.ts` — `createSession` copia `candidateId` al `SessionState`.
- `apps/api/src/services/sessions.service.test.ts` — el estado persistido incluye `candidateId`.
- `apps/api/src/routes/sessions.ts` — el archivo del `/end` estampa `candidateId`.
- `apps/api/src/routes/sessions.test.ts` — `/end` archiva `candidate_id` (con y sin id).
- `apps/api/src/db/schema.ts` — indice en `candidate_id`.
- `apps/web/src/lib/apiClient.ts` — `createSession` adjunta el id.
- `apps/web/src/lib/apiClient.test.ts` — el body lleva `candidateId`.

**Nuevos:**
- `apps/api/drizzle/0001_*.sql` (+ meta) — migracion del indice (generada).
- `apps/web/src/lib/candidate.ts` — `getOrCreateCandidateId()`.
- `apps/web/src/lib/candidate.test.ts` — persistencia y fallback.

---

## Task 1: Contratos en shared-types

`candidateId` opcional (uuid) en el request de creacion y en el estado de sesion.

**Files:**
- Modify: `packages/shared-types/src/sessions.ts`
- Test: `packages/shared-types/src/sessions.test.ts`

- [ ] **Step 1: Escribir los tests fallidos**

Agrega a `packages/shared-types/src/sessions.test.ts` (reusa los imports existentes; si no importa `CreateSessionRequestSchema`/`SessionStateSchema`, agregalos):

```ts
import { CreateSessionRequestSchema, SessionStateSchema } from './sessions';

describe('candidateId en los contratos', () => {
  const uuid = '550e8400-e29b-41d4-a716-446655440000';

  it('CreateSessionRequest acepta un candidateId uuid valido', () => {
    const parsed = CreateSessionRequestSchema.parse({
      industry: 'backend',
      level: 'mid',
      candidateId: uuid,
    });
    expect(parsed.candidateId).toBe(uuid);
  });

  it('CreateSessionRequest es valido sin candidateId', () => {
    const parsed = CreateSessionRequestSchema.parse({ industry: 'backend', level: 'mid' });
    expect(parsed.candidateId).toBeUndefined();
  });

  it('CreateSessionRequest rechaza un candidateId que no es uuid', () => {
    const r = CreateSessionRequestSchema.safeParse({
      industry: 'backend',
      level: 'mid',
      candidateId: 'no-soy-uuid',
    });
    expect(r.success).toBe(false);
  });

  it('SessionState acepta candidateId opcional', () => {
    const base = {
      id: uuid,
      industry: 'backend' as const,
      level: 'mid' as const,
      status: 'active' as const,
      phase: 'warmup' as const,
      turnNumber: 0,
      startedAt: 1,
      token: 'a'.repeat(64),
    };
    expect(SessionStateSchema.parse(base).candidateId).toBeUndefined();
    expect(SessionStateSchema.parse({ ...base, candidateId: uuid }).candidateId).toBe(uuid);
  });
});
```

- [ ] **Step 2: Correr los tests para verlos fallar**

Run: `pnpm --filter @warachikuy/shared-types test -- --run`
Expected: FALLAN (los `parse` con `candidateId` lo descartan o el campo no existe).

- [ ] **Step 3: Agregar el campo a los dos schemas**

En `packages/shared-types/src/sessions.ts`:

En `CreateSessionRequestSchema`, agrega la propiedad:
```ts
export const CreateSessionRequestSchema = z.object({
  industry: IndustrySchema,
  level: LevelSchema,
  // Id local anonimo del candidato (#56). Opcional: omitido => sesion anonima.
  candidateId: z.string().uuid().optional(),
});
```

En `SessionStateSchema`, agrega la propiedad (junto a las demas, antes de `token`):
```ts
  // Dueno de la sesion para el historial multi-sesion (#56). Opcional.
  candidateId: z.string().uuid().optional(),
```

- [ ] **Step 4: Correr los tests (deben pasar)**

Run: `pnpm --filter @warachikuy/shared-types test -- --run`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @warachikuy/shared-types typecheck`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add packages/shared-types/src/sessions.ts packages/shared-types/src/sessions.test.ts
git commit -m "Se agrega candidateId opcional a los contratos de sesion"
```

---

## Task 2: Backend persiste y estampa el candidateId

`createSession` copia el id al `SessionState`; el archivo del `/end` lo escribe en `candidate_id`.

**Files:**
- Modify: `apps/api/src/services/sessions.service.ts`
- Modify: `apps/api/src/routes/sessions.ts`
- Test: `apps/api/src/services/sessions.service.test.ts`
- Test: `apps/api/src/routes/sessions.test.ts`

- [ ] **Step 1: Escribir el test fallido del service**

Lee primero `apps/api/src/services/sessions.service.test.ts` para reusar su patron (crea un `RedisMock`, llama `createSession`, lee `session:<id>` de Redis). Agrega:

```ts
it('persiste el candidateId en el SessionState cuando viene en el request', async () => {
  const redis = new RedisMock() as unknown as Redis;
  const candidateId = '550e8400-e29b-41d4-a716-446655440000';
  const res = await createSession(redis, { industry: 'backend', level: 'mid', candidateId }, fakeEnv);
  const raw = await redis.get(`session:${res.sessionId}`);
  expect(JSON.parse(raw!).candidateId).toBe(candidateId);
});

it('sin candidateId el SessionState no lo incluye', async () => {
  const redis = new RedisMock() as unknown as Redis;
  const res = await createSession(redis, { industry: 'backend', level: 'mid' }, fakeEnv);
  const raw = await redis.get(`session:${res.sessionId}`);
  expect(JSON.parse(raw!).candidateId).toBeUndefined();
});
```
El archivo ya define `fakeEnv: Env`, importa `RedisMock` y `createSession`, y usa `new RedisMock() as unknown as Redis`. Reusa esos identificadores tal cual.

- [ ] **Step 2: Correr el test para verlo fallar**

Run: `pnpm --filter @warachikuy/api test -- --run src/services/sessions.service.test.ts`
Expected: FALLA (el estado persistido no tiene `candidateId`).

- [ ] **Step 3: Implementar en createSession**

En `apps/api/src/services/sessions.service.ts`, dentro del objeto `state`, agrega el campo (copiando del request). El `SessionState` ahora admite `candidateId` opcional:
```ts
  const state: SessionState = {
    id: sessionId,
    industry: request.industry,
    level: request.level,
    status: 'active',
    phase: 'warmup',
    turnNumber: 0,
    startedAt: Date.now(),
    candidateId: request.candidateId,
    token,
  };
```
Nota: si `request.candidateId` es `undefined`, `JSON.stringify` omite la clave, asi que el estado queda sin `candidateId` (lo que asierta el segundo test).

- [ ] **Step 4: Correr el test del service (debe pasar)**

Run: `pnpm --filter @warachikuy/api test -- --run src/services/sessions.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Escribir el test fallido del /end**

En `apps/api/src/routes/sessions.test.ts`, en el describe del `/end` (que ya inyecta `db` pglite y usa `getArchivedSession`, de #55), agrega:

```ts
  it('estampa el candidate_id en la fila archivada cuando la sesion tiene candidateId', async () => {
    const candidateId = '550e8400-e29b-41d4-a716-446655440000';
    const create = await server.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      payload: { industry: 'backend', level: 'mid', candidateId },
    });
    const { sessionId, token } = JSON.parse(create.body);
    await server.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/end?token=${token}`,
    });
    const archived = await getArchivedSession(db, sessionId);
    expect(archived?.candidateId).toBe(candidateId);
  });

  it('archiva candidate_id null cuando la sesion no tiene candidateId', async () => {
    const create = await server.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      payload: { industry: 'backend', level: 'mid' },
    });
    const { sessionId, token } = JSON.parse(create.body);
    await server.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/end?token=${token}`,
    });
    const archived = await getArchivedSession(db, sessionId);
    expect(archived?.candidateId).toBeNull();
  });
```

- [ ] **Step 6: Correr el test del /end para verlo fallar**

Run: `pnpm --filter @warachikuy/api test -- --run src/routes/sessions.test.ts`
Expected: FALLA el primer caso (`candidateId` archivado es `null` porque el `/end` aun no lo estampa).

- [ ] **Step 7: Estampar candidateId en el archivo del /end**

En `apps/api/src/routes/sessions.ts`, en el objeto que pasa a `archiveSession` dentro del bloque try del `/end`, agrega `candidateId`:
```ts
        await archiveSession(server.db, {
          id: sessionId,
          candidateId: ended.candidateId ?? null,
          industry: ended.industry,
          level: ended.level,
          status: ended.status,
          startedAt: new Date(ended.startedAt),
          endedAt: new Date(now),
          durationMs: now - ended.startedAt,
          transcript,
          metrics,
        });
```
(`ended` es `{ ...state, status: 'ended' }`, asi que `ended.candidateId` viene del estado persistido por `createSession`.)

- [ ] **Step 8: Correr los tests del /end (deben pasar)**

Run: `pnpm --filter @warachikuy/api test -- --run src/routes/sessions.test.ts`
Expected: PASS (ambos casos + los existentes).

- [ ] **Step 9: Suite api, typecheck, lint**

Run: `pnpm --filter @warachikuy/api test -- --run`, `pnpm --filter @warachikuy/api typecheck`, `pnpm --filter @warachikuy/api lint`
Expected: todo verde. Nota: `GET /sessions/:id` no cambia — `SessionSummarySchema.parse` descarta `candidateId` (no esta en el summary), asi que no se filtra.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/services/sessions.service.ts apps/api/src/services/sessions.service.test.ts apps/api/src/routes/sessions.ts apps/api/src/routes/sessions.test.ts
git commit -m "Se persiste el candidateId en la sesion y se estampa al cerrarla"
```

---

## Task 3: Indice en candidate_id

Indice para que #51/#58 consulten el historial por candidato.

**Files:**
- Modify: `apps/api/src/db/schema.ts`
- Create: `apps/api/drizzle/0001_*.sql` (+ meta, generado)
- Test: `apps/api/src/db/client.test.ts` (re-verificacion)

- [ ] **Step 1: Agregar el indice al schema**

En `apps/api/src/db/schema.ts`:

1. Agrega `index` al import de `drizzle-orm/pg-core`:
```ts
import { pgTable, uuid, text, integer, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
```

2. Agrega el tercer argumento (callback de extras) a `pgTable`, despues del objeto de columnas:
```ts
export const interviewSessions = pgTable(
  'interview_sessions',
  {
    id: uuid('id').primaryKey(),
    candidateId: uuid('candidate_id'),
    industry: text('industry').notNull(),
    level: text('level').notNull(),
    status: text('status').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true, mode: 'date' }).notNull(),
    durationMs: integer('duration_ms').notNull(),
    transcript: jsonb('transcript').$type<ConversationEntry[]>().notNull(),
    metrics: jsonb('metrics').$type<MetricsAggregate>().notNull(),
    plan: jsonb('plan').$type<ImprovementPlan>(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  // Indice para consultar el historial por candidato (#51, #58).
  (table) => [index('interview_sessions_candidate_id_idx').on(table.candidateId)],
);
```
(Conserva los tipos `InterviewSessionRow`/`NewInterviewSession` al final del archivo sin cambios.)

- [ ] **Step 2: Generar la migracion**

Desde `apps/api`:
```bash
pnpm exec drizzle-kit generate
```
Crea `apps/api/drizzle/0001_<nombre>.sql` y actualiza `drizzle/meta/`. Verifica que el SQL sea equivalente a:
```sql
CREATE INDEX "interview_sessions_candidate_id_idx" ON "interview_sessions" USING btree ("candidate_id");
```
Si drizzle-kit pidiera algo interactivo (no deberia para un indice nuevo), STOP y reporta.

- [ ] **Step 3: Verificar que las migraciones siguen aplicando idempotentes**

El migrador nativo (de #55) aplica `0000` y `0001`, y saltea lo aplicado en una segunda corrida. La suite ya cubre esto via `makeTestDb` + el test de idempotencia. Corre los tests de db:

Run: `pnpm --filter @warachikuy/api test -- --run src/db/`
Expected: PASS (incluido `runMigrations es idempotente`, que ahora aplica las dos migraciones dos veces sin error).

- [ ] **Step 4: Suite api, typecheck, lint, build**

Run: `pnpm --filter @warachikuy/api test -- --run`, `pnpm --filter @warachikuy/api typecheck`, `pnpm --filter @warachikuy/api lint`, `pnpm --filter @warachikuy/api build`
Expected: todo verde.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/db/schema.ts apps/api/drizzle
git commit -m "Se agrega un indice sobre candidate_id para el historial por candidato"
```

---

## Task 4: Frontend acuna y envia el candidateId

Lib `candidate.ts` (id estable en localStorage) y `apiClient.createSession` que lo adjunta.

**Files:**
- Create: `apps/web/src/lib/candidate.ts`
- Test: `apps/web/src/lib/candidate.test.ts`
- Modify: `apps/web/src/lib/apiClient.ts`
- Test: `apps/web/src/lib/apiClient.test.ts`

- [ ] **Step 1: Escribir los tests fallidos de candidate.ts**

Crea `apps/web/src/lib/candidate.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { getOrCreateCandidateId } from './candidate';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('getOrCreateCandidateId', () => {
  beforeEach(() => localStorage.clear());

  it('genera un uuid y lo persiste en localStorage', () => {
    const id = getOrCreateCandidateId();
    expect(id).toMatch(UUID_RE);
    expect(localStorage.getItem('warachikuy:candidateId')).toBe(id);
  });

  it('devuelve el mismo id en llamadas sucesivas', () => {
    const a = getOrCreateCandidateId();
    const b = getOrCreateCandidateId();
    expect(a).toBe(b);
  });

  it('regenera si el valor guardado no es un uuid valido', () => {
    localStorage.setItem('warachikuy:candidateId', 'basura');
    const id = getOrCreateCandidateId();
    expect(id).toMatch(UUID_RE);
    expect(localStorage.getItem('warachikuy:candidateId')).toBe(id);
  });

  it('cae a un id en memoria si localStorage no esta disponible', () => {
    const getSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denegado');
    });
    const a = getOrCreateCandidateId();
    const b = getOrCreateCandidateId();
    expect(a).toMatch(UUID_RE);
    expect(a).toBe(b);
    getSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Correr los tests para verlos fallar**

Run: `pnpm --filter @warachikuy/web test -- --run src/lib/candidate.test.ts`
Expected: FALLA con "Cannot find module './candidate'".

- [ ] **Step 3: Implementar candidate.ts**

Crea `apps/web/src/lib/candidate.ts`:
```ts
const STORAGE_KEY = 'warachikuy:candidateId';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Fallback en memoria por carga cuando localStorage no esta disponible
// (modo privado / acceso denegado): la sesion funciona, solo no se enlaza
// entre recargas.
let memoryId: string | null = null;

// Id local anonimo del candidato (#56). Estable entre sesiones del mismo
// navegador; no autenticado a proposito (la identidad real es F5).
export function getOrCreateCandidateId(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && UUID_RE.test(stored)) return stored;
    const fresh = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, fresh);
    return fresh;
  } catch {
    if (!memoryId) memoryId = crypto.randomUUID();
    return memoryId;
  }
}
```

- [ ] **Step 4: Correr los tests de candidate.ts (deben pasar)**

Run: `pnpm --filter @warachikuy/web test -- --run src/lib/candidate.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Escribir el test fallido de apiClient**

En `apps/web/src/lib/apiClient.test.ts`, agrega un test que capture el body del `POST /sessions`:
```ts
it('createSession adjunta el candidateId al body', async () => {
  const resp = {
    sessionId: '550e8400-e29b-41d4-a716-446655440000',
    websocketUrl: 'ws://localhost:3000/v1/sessions/x/ws?token=abc',
    token: 'a'.repeat(64),
  };
  const fetchMock = vi.fn(async () => ({
    ok: true,
    status: 201,
    json: async () => resp,
    statusText: 'x',
  }));
  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
  await createSession({ industry: 'backend', level: 'mid' });
  const init = fetchMock.mock.calls[0][1] as RequestInit;
  const body = JSON.parse(init.body as string);
  expect(body.candidateId).toMatch(/^[0-9a-f-]{36}$/i);
});
```
(`vi`, `createSession` ya estan importados en ese archivo; reusa el patron `vi.stubGlobal('fetch', ...)` que ya existe.)

- [ ] **Step 6: Correr el test para verlo fallar**

Run: `pnpm --filter @warachikuy/web test -- --run src/lib/apiClient.test.ts`
Expected: FALLA (`body.candidateId` es `undefined`).

- [ ] **Step 7: Adjuntar el candidateId en apiClient.createSession**

En `apps/web/src/lib/apiClient.ts`:

1. Agrega el import (con los demas):
```ts
import { getOrCreateCandidateId } from './candidate';
```

2. En `createSession`, cambia el body del fetch para incluir el id:
```ts
  const res = await fetch(`${BASE}/api/v1/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...req, candidateId: getOrCreateCandidateId() }),
  });
```
(El resto de `createSession` —parseo de la respuesta y reescritura de `websocketUrl`— no cambia.)

- [ ] **Step 8: Correr los tests de apiClient (deben pasar)**

Run: `pnpm --filter @warachikuy/web test -- --run src/lib/apiClient.test.ts`
Expected: PASS (el nuevo + los existentes; el test `createSession parsea la respuesta` sigue verde porque la respuesta no cambia).

- [ ] **Step 9: Suite web, typecheck, lint, build**

Run: `pnpm --filter @warachikuy/web test -- --run`, `pnpm --filter @warachikuy/web typecheck`, `pnpm --filter @warachikuy/web lint`, `pnpm --filter @warachikuy/web build`
Expected: todo verde.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/lib/candidate.ts apps/web/src/lib/candidate.test.ts apps/web/src/lib/apiClient.ts apps/web/src/lib/apiClient.test.ts
git commit -m "Se acuna y envia el candidateId local desde el frontend"
```

---

## Verificacion final (tras todas las tasks)

- [ ] `pnpm -r test -- --run` (shared-types + api + web) verde.
- [ ] `pnpm -r lint` y `pnpm -r typecheck` verdes.
- [ ] `pnpm --filter @warachikuy/api build` y `pnpm --filter @warachikuy/web build` verdes.
- [ ] Revisar que ningun commit incluya marcas de IA ni Conventional Commits.
- [ ] Dispatch del code-reviewer final sobre toda la rama.
- [ ] Usar superpowers:finishing-a-development-branch para abrir el PR contra `main`.
