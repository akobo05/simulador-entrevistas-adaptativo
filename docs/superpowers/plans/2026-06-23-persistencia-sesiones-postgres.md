# Persistencia durable de sesiones en Postgres — Plan de implementacion

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Al cerrar una sesion (`POST /end`) persistir de forma durable en Postgres la sesion (transcript, agregado de metricas, industria/nivel, duracion) y, cuando el plan queda listo, rellenar su columna; la sesion sobrevive el TTL de Redis y es consultable desde el backend.

**Architecture:** Postgres es un espejo durable aditivo: nunca en el camino critico de la entrevista (eso sigue en Redis). Se inserta la fila en `/end` (plan = null) y un `UPDATE` la completa cuando el plan queda `ready`. Toda escritura/lectura a Postgres va en `try/catch` no fatal. Una sola tabla `interview_sessions` con metadatos tipados + `transcript`/`metrics`/`plan` como JSONB. El cliente usa pglite en proceso cuando `DATABASE_URL` arranca con `mock://` (dev sin infra y tests), o `postgres.js` real en otro caso.

**Tech Stack:** Fastify 5, drizzle-orm 0.38, postgres.js 3.4, @electric-sql/pglite (nuevo devDep), drizzle-kit 0.30, vitest 3, ioredis-mock. Node 22, ESM, TypeScript strict.

**Convenciones del repo (obligatorias):** identificadores y codigo en ingles; comentarios y mensajes de commit en español natural SIN acentos ("Se agrega X"), NO Conventional Commits; sin marcas de IA (nada de Co-Authored-By ni referencias a Claude/Anthropic).

---

## Estructura de archivos

**Nuevos:**
- `apps/api/src/db/schema.ts` — tabla drizzle `interview_sessions` + tipos inferidos.
- `apps/api/src/db/client.ts` — `createDb(databaseUrl)` (pglite/postgres.js) + `runMigrations(db)` + tipo `Db`.
- `apps/api/src/db/session-archive.ts` — repositorio: `archiveSession`, `updateArchivedPlan`, `getArchivedSession`.
- `apps/api/src/db/test-helpers.ts` — `makeTestDb()` (pglite migrada para tests).
- `apps/api/drizzle.config.ts` — config de drizzle-kit.
- `apps/api/drizzle/0000_*.sql` — migracion generada por drizzle-kit.
- `apps/api/src/db/client.test.ts`, `apps/api/src/db/session-archive.test.ts` — tests nuevos.

**Modificados:**
- `apps/api/package.json` — agrega devDependency `@electric-sql/pglite`.
- `apps/api/src/server.ts` — decora `server.db`; `BuildServerDeps.db?`.
- `apps/api/src/index.ts` — crea el db real, corre migraciones y lo inyecta.
- `apps/api/src/routes/sessions.ts` — archiva la sesion en `/end`.
- `apps/api/src/routes/sessions.test.ts` — inyecta db pglite + asserts de persistencia.
- `apps/api/src/interviewer/coach.service.ts` — `CoachDeps.db`; update del plan archivado.
- `apps/api/src/interviewer/coach.service.test.ts` — inyecta db + assert del update.

---

## Task 1: Fundacion de la base de datos (schema, cliente, migracion, helper de test)

Crea el schema, el cliente con los dos drivers, la migracion generada y el helper de tests, con un primer test que prueba que la tabla migrada existe y es consultable.

**Files:**
- Modify: `apps/api/package.json`
- Create: `apps/api/src/db/schema.ts`
- Create: `apps/api/drizzle.config.ts`
- Create: `apps/api/drizzle/0000_*.sql` (generado)
- Create: `apps/api/src/db/client.ts`
- Create: `apps/api/src/db/test-helpers.ts`
- Test: `apps/api/src/db/client.test.ts`

- [ ] **Step 1: Agregar la devDependency de pglite**

Desde la raiz del repo:

```bash
pnpm --filter @warachikuy/api add -D @electric-sql/pglite@^0.2.0
```

Verifica que quedo en `apps/api/package.json` bajo `devDependencies` y que `pnpm install` no rompio nada.

- [ ] **Step 2: Escribir el schema de la tabla**

Crea `apps/api/src/db/schema.ts`:

```ts
import { pgTable, uuid, text, integer, jsonb, timestamp } from 'drizzle-orm/pg-core';
import type { ConversationEntry, ImprovementPlan } from '@warachikuy/shared-types';
import type { MetricsAggregate } from '../interviewer/metrics-aggregator.js';

// Espejo durable de una sesion terminada. Los metadatos van como columnas
// tipadas; transcript/metrics/plan como JSONB (ver spec seccion 4). candidate_id
// queda nullable reservado para la identidad del candidato (#56).
export const interviewSessions = pgTable('interview_sessions', {
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
});

export type InterviewSessionRow = typeof interviewSessions.$inferSelect;
export type NewInterviewSession = typeof interviewSessions.$inferInsert;
```

- [ ] **Step 3: Escribir la config de drizzle-kit**

Crea `apps/api/drizzle.config.ts`:

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
});
```

- [ ] **Step 4: Generar la migracion**

Desde `apps/api`:

```bash
pnpm exec drizzle-kit generate
```

Esto crea `apps/api/drizzle/0000_<nombre>.sql`. Verifica que su contenido sea equivalente a:

```sql
CREATE TABLE "interview_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"candidate_id" uuid,
	"industry" text NOT NULL,
	"level" text NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"duration_ms" integer NOT NULL,
	"transcript" jsonb NOT NULL,
	"metrics" jsonb NOT NULL,
	"plan" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
```

Si drizzle-kit pregunta algo de forma interactiva, no deberia: `generate` solo lee el schema y escribe el SQL.

- [ ] **Step 5: Escribir el cliente y el migrador**

Crea `apps/api/src/db/client.ts`:

```ts
import { createRequire } from 'node:module';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema.js';

// Tipo comun a los dos drivers: tanto PgliteDatabase como PostgresJsDatabase
// extienden PgDatabase, asi el repositorio es agnostico del driver.
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const require = createRequire(import.meta.url);
// Carpeta de migraciones relativa a este archivo (apps/api/drizzle).
const MIGRATIONS_DIR = fileURLToPath(new URL('../../drizzle', import.meta.url));

// Construye la instancia drizzle. Con prefijo mock:// usa pglite en proceso
// (dev sin infra y tests), cargado dinamicamente para no arrastrar
// @electric-sql/pglite al bundle de produccion (igual que #64 con ioredis-mock).
export function createDb(databaseUrl: string): Db {
  if (databaseUrl.startsWith('mock://')) {
    const { PGlite } = require('@electric-sql/pglite');
    const { drizzle: drizzlePglite } = require('drizzle-orm/pglite');
    return drizzlePglite(new PGlite(), { schema }) as Db;
  }
  return drizzlePostgres(postgres(databaseUrl), { schema });
}

// Aplica las migraciones generadas ejecutando su SQL sentencia por sentencia.
// Es agnostico del driver (db.execute existe en ambos), asi el mismo codigo
// migra pglite y Postgres real. drizzle-kit separa sentencias con un breakpoint.
export async function runMigrations(db: Db): Promise<void> {
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const content = await readFile(`${MIGRATIONS_DIR}/${file}`, 'utf8');
    for (const statement of content.split('--> statement-breakpoint')) {
      const trimmed = statement.trim();
      if (trimmed) await db.execute(sql.raw(trimmed));
    }
  }
}
```

- [ ] **Step 6: Escribir el helper de tests**

Crea `apps/api/src/db/test-helpers.ts`:

```ts
import { createDb, runMigrations, type Db } from './client.js';

// Base pglite limpia y migrada para cada test (instancia nueva en memoria).
export async function makeTestDb(): Promise<Db> {
  const db = createDb('mock://test');
  await runMigrations(db);
  return db;
}
```

- [ ] **Step 7: Escribir el test fallido del cliente**

Crea `apps/api/src/db/client.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from './test-helpers.js';
import { interviewSessions } from './schema.js';

describe('createDb + runMigrations (pglite)', () => {
  it('crea la tabla interview_sessions y la deja consultable vacia', async () => {
    const db = await makeTestDb();
    const rows = await db.select().from(interviewSessions).where(eq(interviewSessions.id, 'x'));
    expect(rows).toEqual([]);
  });
});
```

- [ ] **Step 8: Correr el test (debe fallar antes de tener todo en su sitio)**

Run: `pnpm --filter @warachikuy/api test -- --run src/db/client.test.ts`
Expected: si algun archivo falta o la migracion no se genero, FALLA (import/SQL). Una vez completados los steps 1-6, el test debe PASAR (la query devuelve `[]`).

- [ ] **Step 9: Typecheck**

Run: `pnpm --filter @warachikuy/api typecheck`
Expected: sin errores. Si `Db` da fricciones de tipos al usar `db.select()`, confirma que `interviewSessions` viene de `./schema.js` y que `Db` es `PgDatabase<PgQueryResultHKT, typeof schema>`.

- [ ] **Step 10: Commit**

```bash
git add apps/api/package.json apps/api/pnpm-lock.yaml apps/api/src/db/schema.ts apps/api/drizzle.config.ts apps/api/drizzle apps/api/src/db/client.ts apps/api/src/db/test-helpers.ts apps/api/src/db/client.test.ts
git commit -m "Se agrega la base de datos durable con drizzle y pglite para tests"
```

Nota: el lockfile puede estar en la raiz (`pnpm-lock.yaml`). Incluyelo en el `git add` si cambio.

---

## Task 2: Repositorio session-archive

Las tres operaciones puras sobre `Db`: insertar (idempotente), actualizar el plan y leer.

**Files:**
- Create: `apps/api/src/db/session-archive.ts`
- Test: `apps/api/src/db/session-archive.test.ts`

- [ ] **Step 1: Escribir los tests fallidos**

Crea `apps/api/src/db/session-archive.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { ImprovementPlan } from '@warachikuy/shared-types';
import { makeTestDb } from './test-helpers.js';
import { archiveSession, updateArchivedPlan, getArchivedSession } from './session-archive.js';
import type { NewInterviewSession } from './schema.js';

function sampleRow(over: Partial<NewInterviewSession> = {}): NewInterviewSession {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    industry: 'backend',
    level: 'mid',
    status: 'ended',
    startedAt: new Date('2026-06-23T10:00:00Z'),
    endedAt: new Date('2026-06-23T10:12:00Z'),
    durationMs: 12 * 60 * 1000,
    transcript: [{ role: 'interviewer', text: 'Hola', timestamp: 1 }],
    metrics: { fluency: 80, eye_contact: null, speech_rate: 60 },
    ...over,
  };
}

function samplePlan(sessionId: string): ImprovementPlan {
  return {
    planId: '22222222-2222-4222-8222-222222222222',
    sessionId,
    summary: 'Buen desempeno',
    competencies: [
      { name: 'fluency', score: 80, comment: 'ok' },
      { name: 'eye_contact', score: null, comment: 'sin datos' },
      { name: 'speech_rate', score: 60, comment: 'ok' },
      { name: 'content', score: 70, comment: 'ok' },
    ],
    strengths: ['claridad'],
    improvements: ['ejemplos'],
    exercises: [{ title: 'STAR', description: 'practica STAR' }],
    generatedAt: 1,
  };
}

describe('session-archive', () => {
  it('archiveSession + getArchivedSession hacen round-trip con los datos intactos', async () => {
    const db = await makeTestDb();
    const row = sampleRow();
    await archiveSession(db, row);
    const got = await getArchivedSession(db, row.id);
    expect(got?.industry).toBe('backend');
    expect(got?.durationMs).toBe(720000);
    expect(got?.transcript).toEqual(row.transcript);
    expect(got?.metrics).toEqual(row.metrics);
    expect(got?.plan).toBeNull();
  });

  it('archiveSession es idempotente: dos inserts del mismo id no lanzan ni duplican', async () => {
    const db = await makeTestDb();
    const row = sampleRow();
    await archiveSession(db, row);
    await archiveSession(db, { ...row, industry: 'frontend' });
    const got = await getArchivedSession(db, row.id);
    // ON CONFLICT DO NOTHING: gana el primero, no se pisa
    expect(got?.industry).toBe('backend');
  });

  it('updateArchivedPlan rellena el plan de una fila existente', async () => {
    const db = await makeTestDb();
    const row = sampleRow();
    await archiveSession(db, row);
    const plan = samplePlan(row.id);
    await updateArchivedPlan(db, row.id, plan);
    const got = await getArchivedSession(db, row.id);
    expect(got?.plan).toEqual(plan);
  });

  it('getArchivedSession devuelve null si el id no existe', async () => {
    const db = await makeTestDb();
    const got = await getArchivedSession(db, '99999999-9999-4999-8999-999999999999');
    expect(got).toBeNull();
  });
});
```

- [ ] **Step 2: Correr los tests para verlos fallar**

Run: `pnpm --filter @warachikuy/api test -- --run src/db/session-archive.test.ts`
Expected: FALLA con "Cannot find module './session-archive.js'".

- [ ] **Step 3: Implementar el repositorio**

Crea `apps/api/src/db/session-archive.ts`:

```ts
import { eq } from 'drizzle-orm';
import type { ImprovementPlan } from '@warachikuy/shared-types';
import type { Db } from './client.js';
import { interviewSessions, type InterviewSessionRow, type NewInterviewSession } from './schema.js';

// Inserta el espejo durable. ON CONFLICT DO NOTHING lo hace idempotente igual
// que el guard de /end: un /end repetido no duplica ni pisa la fila.
export async function archiveSession(db: Db, row: NewInterviewSession): Promise<void> {
  await db.insert(interviewSessions).values(row).onConflictDoNothing();
}

// Rellena el plan generado en la fila ya existente (segundo paso de la escritura).
export async function updateArchivedPlan(
  db: Db,
  sessionId: string,
  plan: ImprovementPlan,
): Promise<void> {
  await db.update(interviewSessions).set({ plan }).where(eq(interviewSessions.id, sessionId));
}

// Lectura por id: esto es lo "consultable desde el backend" de la issue.
export async function getArchivedSession(
  db: Db,
  sessionId: string,
): Promise<InterviewSessionRow | null> {
  const rows = await db
    .select()
    .from(interviewSessions)
    .where(eq(interviewSessions.id, sessionId))
    .limit(1);
  return rows[0] ?? null;
}
```

- [ ] **Step 4: Correr los tests (deben pasar)**

Run: `pnpm --filter @warachikuy/api test -- --run src/db/session-archive.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/db/session-archive.ts apps/api/src/db/session-archive.test.ts
git commit -m "Se agrega el repositorio de archivo durable de sesiones"
```

---

## Task 3: Decorar server.db e inyeccion por deps

Expone `server.db` siguiendo el patron de `server.redis`/`server.gemini`, inyectable en tests.

**Files:**
- Modify: `apps/api/src/server.ts`

- [ ] **Step 1: Escribir el test fallido**

Agrega este bloque al final de `apps/api/src/server.test.ts` (deja los imports existentes; agrega los que falten):

```ts
import { makeTestDb } from './db/test-helpers.js';

describe('decoracion de db', () => {
  it('expone server.db cuando se inyecta por deps', async () => {
    const RedisMock = (await import('ioredis-mock')).default;
    const redis = new RedisMock() as unknown as import('ioredis').default;
    const db = await makeTestDb();
    const server = await buildServer(testEnv, { redis, db });
    expect(server.db).toBe(db);
    await server.close();
  });
});
```

Si `server.test.ts` ya define `testEnv` y `buildServer` importado, reutilizalos; si el nombre de la env de test difiere, usa el que ya exista en ese archivo.

- [ ] **Step 2: Correr el test para verlo fallar**

Run: `pnpm --filter @warachikuy/api test -- --run src/server.test.ts`
Expected: FALLA (typecheck/runtime: `server.db` no existe / `db` no es opcion valida de deps).

- [ ] **Step 3: Implementar la decoracion**

En `apps/api/src/server.ts`:

1. Agrega el import:

```ts
import { createDb, type Db } from './db/client.js';
```

2. En el bloque `declare module 'fastify'`, agrega `db`:

```ts
declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis;
    env: Env;
    connections: ConnectionRegistry;
    gemini: GeminiClient;
    db: Db;
  }
}
```

3. En `BuildServerDeps`, agrega:

```ts
  /** Instancia de base de datos a usar. Si no se provee, se construye con `createDb(env.DATABASE_URL)`. */
  db?: Db;
```

4. Junto a las otras decoraciones (despues de `server.decorate('redis', redis)`), agrega:

```ts
  const db = deps.db ?? createDb(env.DATABASE_URL);
  server.decorate('db', db);
```

- [ ] **Step 4: Correr el test (debe pasar)**

Run: `pnpm --filter @warachikuy/api test -- --run src/server.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @warachikuy/api typecheck`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/server.ts apps/api/src/server.test.ts
git commit -m "Se decora la instancia de base de datos en el servidor"
```

---

## Task 4: Persistir la sesion en POST /end

Tras ganar el guard, lee transcript+metricas de Redis e inserta la fila durable. Falla no fatal.

**Files:**
- Modify: `apps/api/src/routes/sessions.ts`
- Test: `apps/api/src/routes/sessions.test.ts`

- [ ] **Step 1: Inyectar db en el harness de los tests de /end**

En `apps/api/src/routes/sessions.test.ts`, en el/los `beforeEach` que construyen el server, agrega un db pglite. Cambia:

```ts
    redis = new RedisMock() as unknown as Redis;
    server = await buildServer(testEnv, { redis });
```

por:

```ts
    redis = new RedisMock() as unknown as Redis;
    db = await makeTestDb();
    server = await buildServer(testEnv, { redis, db });
```

Agrega el import y la declaracion de `db` en el scope del describe:

```ts
import { makeTestDb } from '../db/test-helpers.js';
import type { Db } from '../db/client.js';
import { getArchivedSession } from '../db/session-archive.js';
// dentro del describe, junto a `let redis: Redis;`
  let db: Db;
```

- [ ] **Step 2: Escribir los tests fallidos de persistencia**

Agrega estos tests dentro del describe de `/end` (usa los helpers ya existentes del archivo para crear una sesion; el patron tipico es hacer `POST /api/v1/sessions` y luego `POST .../end?token=...`). Si el archivo ya tiene un helper que crea la sesion y devuelve `{sessionId, token}`, reusalo; si no, este patron funciona:

```ts
  it('archiva la sesion en Postgres al cerrarla y sobrevive el TTL de Redis', async () => {
    const create = await server.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      payload: { industry: 'backend', level: 'mid' },
    });
    const { sessionId, token } = JSON.parse(create.body);

    const end = await server.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/end?token=${token}`,
    });
    expect(end.statusCode).toBe(202);

    // La fila durable existe con los metadatos correctos y el plan aun en null
    const archived = await getArchivedSession(db, sessionId);
    expect(archived?.industry).toBe('backend');
    expect(archived?.level).toBe('mid');
    expect(archived?.status).toBe('ended');
    expect(archived?.durationMs).toBeGreaterThanOrEqual(0);
    expect(archived?.plan).toBeNull();

    // "Sobrevive el TTL de Redis": vaciamos Redis y la sesion sigue consultable
    await redis.flushall();
    const stillThere = await getArchivedSession(db, sessionId);
    expect(stillThere?.id).toBe(sessionId);
  });

  it('si el archivo en Postgres falla, /end igual responde 202', async () => {
    const failingDb = {
      insert: () => ({
        values: () => ({
          onConflictDoNothing: () => Promise.reject(new Error('db caida')),
        }),
      }),
      select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) }),
    } as unknown as Db;
    const failServer = await buildServer(testEnv, { redis: new RedisMock() as unknown as Redis, db: failingDb });

    const create = await failServer.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      payload: { industry: 'backend', level: 'mid' },
    });
    const { sessionId, token } = JSON.parse(create.body);
    const end = await failServer.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/end?token=${token}`,
    });
    expect(end.statusCode).toBe(202);
    await failServer.close();
  });
```

- [ ] **Step 3: Correr los tests para verlos fallar**

Run: `pnpm --filter @warachikuy/api test -- --run src/routes/sessions.test.ts`
Expected: FALLA: `getArchivedSession` devuelve `null` (todavia no se archiva en `/end`).

- [ ] **Step 4: Implementar el archivo en /end**

En `apps/api/src/routes/sessions.ts`:

1. Agrega los imports:

```ts
import { readHistory } from '../interviewer/conversation.js';
import { readAggregate } from '../interviewer/metrics-aggregator.js';
import { archiveSession } from '../db/session-archive.js';
```

2. En el handler de `/end`, despues de reescribir la sesion `ended` en Redis y antes (o despues) de disparar `generatePlan`, agrega el bloque de archivo. Insertalo justo despues de:

```ts
      await server.redis.set(`session:${sessionId}`, JSON.stringify(ended), 'EX', PLAN_TTL_SECONDS);
      server.connections.get(sessionId)?.close(WS_CLOSE_CODES.SESSION_EXPIRED, 'session_ended');
```

agrega:

```ts
      // Espejo durable en Postgres (aditivo): la sesion debe sobrevivir el TTL
      // de Redis para el historial (#51), la calibracion (#58) y el plan relativo
      // (#60). Falla NO fatal: la entrevista y el plan viven en Redis.
      try {
        const transcript = await readHistory(server.redis, sessionId, req.log);
        const metrics = await readAggregate(server.redis, sessionId, req.log);
        await archiveSession(server.db, {
          id: sessionId,
          industry: ended.industry,
          level: ended.level,
          status: ended.status,
          startedAt: new Date(ended.startedAt),
          endedAt: new Date(now),
          durationMs: now - ended.startedAt,
          transcript,
          metrics,
        });
      } catch (err) {
        req.log.error({ err, sessionId }, 'no se pudo archivar la sesion en Postgres');
      }
```

- [ ] **Step 5: Correr los tests (deben pasar)**

Run: `pnpm --filter @warachikuy/api test -- --run src/routes/sessions.test.ts`
Expected: PASS (los nuevos + los existentes de `/end`).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/sessions.ts apps/api/src/routes/sessions.test.ts
git commit -m "Se archiva la sesion en Postgres al cerrarla en /end"
```

---

## Task 5: Rellenar el plan archivado en coach.service

Cuando el plan queda `ready`, actualizar la columna `plan` de la fila durable. Falla no fatal.

**Files:**
- Modify: `apps/api/src/interviewer/coach.service.ts`
- Modify: `apps/api/src/routes/sessions.ts` (pasar `db` a `generatePlan`)
- Test: `apps/api/src/interviewer/coach.service.test.ts`

- [ ] **Step 1: Preparar el harness y escribir el test fallido**

En `apps/api/src/interviewer/coach.service.test.ts` el patron real es: `silentLog()`, `makeState(overrides)`, la constante `COACH_OUTPUT`, y el gemini fake inline `{ generate: async () => '', generateJson: async () => COACH_OUTPUT }`.

1. Agrega los imports nuevos (junto a los existentes):

```ts
import { makeTestDb } from '../db/test-helpers.js';
import type { Db } from '../db/client.js';
import { archiveSession, getArchivedSession } from '../db/session-archive.js';
```

2. Dentro del `describe('generatePlan', ...)`, agrega un db fresco por test (un `beforeEach` adicional, vitest permite varios):

```ts
  let db: Db;
  beforeEach(async () => {
    db = await makeTestDb();
  });
```

3. Agrega el test nuevo (mirrorea el fake real del archivo):

```ts
  it('tras generar el plan, lo escribe en la fila archivada de Postgres', async () => {
    const redis = new RedisMock() as unknown as Redis;
    const state = makeState();
    // La fila ya existe (como la dejaria /end), con el plan en null
    await archiveSession(db, {
      id: state.id,
      industry: state.industry,
      level: state.level,
      status: 'ended',
      startedAt: new Date(state.startedAt),
      endedAt: new Date(state.startedAt + 1000),
      durationMs: 1000,
      transcript: [],
      metrics: { fluency: null, eye_contact: null, speech_rate: null },
    });
    const gemini: GeminiClient = {
      generate: async () => '',
      generateJson: async () => COACH_OUTPUT,
    };
    await generatePlan(
      { redis, gemini, log: silentLog(), db },
      state,
      '550e8400-e29b-41d4-a716-446655440099',
    );
    const archived = await getArchivedSession(db, state.id);
    expect(archived?.plan?.planId).toBe('550e8400-e29b-41d4-a716-446655440099');
  });
```

- [ ] **Step 2: Correr el test para verlo fallar**

Run: `pnpm --filter @warachikuy/api test -- --run src/interviewer/coach.service.test.ts`
Expected: FALLA al compilar: el literal `{ redis, gemini, log: silentLog(), db }` tiene una propiedad `db` que `CoachDeps` aun no declara (excess property).

- [ ] **Step 3: Implementar el update en coach.service**

En `apps/api/src/interviewer/coach.service.ts`:

1. Agrega los imports:

```ts
import type { Db } from '../db/client.js';
import { updateArchivedPlan } from '../db/session-archive.js';
```

2. En la interface `CoachDeps`, agrega `db` (requerido):

```ts
export interface CoachDeps {
  redis: Redis;
  gemini: GeminiClient;
  log: FastifyBaseLogger;
  db: Db;
}
```

3. En `generatePlan`, justo despues de `await setPlanReady(deps.redis, sessionId, plan);`, agrega:

```ts
    // Completa la fila durable con el plan generado (segundo paso de la
    // escritura, ver spec seccion 3). Falla NO fatal: el plan ya vive en Redis.
    // Si la fila no existe (p. ej. Postgres estaba caido en /end), el UPDATE
    // afecta 0 filas sin error.
    try {
      await updateArchivedPlan(deps.db, sessionId, plan);
    } catch (err) {
      deps.log.error({ err, sessionId }, 'no se pudo actualizar el plan archivado en Postgres');
    }
```

- [ ] **Step 4: Actualizar todas las llamadas existentes a generatePlan en el test**

Ahora que `CoachDeps.db` es requerido, TODAS las llamadas previas `generatePlan({ redis, gemini, log: silentLog() }, ...)` del archivo no compilan (falta `db`). En cada una agrega `, db` al objeto de deps: `generatePlan({ redis, gemini, log: silentLog(), db }, ...)`. Son varias en el archivo; actualizalas todas. Las que no archivan fila previa siguen verdes: `updateArchivedPlan` sobre una fila inexistente es un UPDATE de 0 filas, no un error.

- [ ] **Step 5: Pasar db a generatePlan desde /end**

En `apps/api/src/routes/sessions.ts`, en la llamada `void generatePlan({ ... }, ended, planId)`, agrega `db: server.db` al objeto de deps:

```ts
      void generatePlan(
        { redis: server.redis, gemini: server.gemini, log: req.log, db: server.db },
        ended,
        planId,
      ).catch((err: unknown) => {
        req.log.error({ err, sessionId }, 'generatePlan rechazo inesperado');
        return setPlanFailed(server.redis, sessionId, planId);
      });
```

- [ ] **Step 6: Correr los tests (deben pasar)**

Run: `pnpm --filter @warachikuy/api test -- --run src/interviewer/coach.service.test.ts src/routes/sessions.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/interviewer/coach.service.ts apps/api/src/interviewer/coach.service.test.ts apps/api/src/routes/sessions.ts
git commit -m "Se completa el plan en la fila archivada al quedar listo"
```

---

## Task 6: Cablear el db real en el arranque

`index.ts` crea el db real, corre las migraciones y lo inyecta en `buildServer`. Asi produccion migra al arrancar.

**Files:**
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Implementar el wiring en index.ts**

En `apps/api/src/index.ts`:

1. Agrega el import:

```ts
import { createDb, runMigrations } from './db/client.js';
```

2. Despues de cargar `env` y antes de `const server = await buildServer(env);`, crea y migra el db, y pasalo a `buildServer`:

```ts
  const db = createDb(env.DATABASE_URL);
  try {
    await runMigrations(db);
  } catch (err) {
    console.error('Fallo aplicando migraciones de la base de datos:');
    console.error(err);
    process.exit(1);
  }

  const server = await buildServer(env, { db });
```

(Reemplaza la linea existente `const server = await buildServer(env);`.)

- [ ] **Step 2: Verificar arranque en modo mock:// (sin infra)**

Run:
```bash
cd apps/api && DATABASE_URL='mock://local' REDIS_URL='mock://local' GEMINI_API_KEY='k' WS_BASE_URL='ws://localhost:3000' PORT='3000' pnpm exec tsx -e "import('./src/index.ts')" &
sleep 2 && curl -s localhost:3000/health && kill %1
```
Expected: `{"status":"ok"}` (arranca, migra pglite en memoria, responde). Si `tsx -e` con import da problemas, alternativa: `DATABASE_URL='mock://local' REDIS_URL='mock://local' GEMINI_API_KEY='k' pnpm dev` y luego `curl localhost:3000/health`, cortando con Ctrl-C.

- [ ] **Step 3: Suite completa, lint, typecheck y build**

Run:
```bash
pnpm --filter @warachikuy/api test -- --run
pnpm --filter @warachikuy/api lint
pnpm --filter @warachikuy/api typecheck
pnpm --filter @warachikuy/api build
```
Expected: todo verde.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/index.ts
git commit -m "Se crea y migra la base de datos real al arrancar el backend"
```

---

## Verificacion final (tras todas las tasks)

- [ ] `pnpm -r test -- --run` (api + web + packages) verde.
- [ ] `pnpm -r lint` y `pnpm -r typecheck` verdes.
- [ ] `pnpm --filter @warachikuy/api build` verde.
- [ ] Revisar que ningun commit incluya marcas de IA ni Conventional Commits.
- [ ] Dispatch del code-reviewer final sobre toda la rama.
- [ ] Usar superpowers:finishing-a-development-branch para abrir el PR contra `main`.
