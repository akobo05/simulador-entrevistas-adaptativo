# Backend de progreso longitudinal por competencia — Plan de implementacion

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exponer `GET /api/v1/candidates/:candidateId/progress`, que lee el historial durable del candidato y devuelve un `ProgressSummary` con la evolucion por competencia (sparklines) + conteos/fechas, derivado honestamente del historial.

**Architecture:** Un repositorio lee las filas del candidato de `interview_sessions` (con plan, ordenadas por `ended_at`), una funcion pura las agrega en las 4 series por competencia con latest/average/delta, y una ruta valida el `candidateId` (uuid) y responde el summary. Sin auth (uuid anonimo como capability, como #56). XP/nivel/badges/racha quedan para F4 (#50).

**Tech Stack:** shared-types (Zod 3), apps/api (Fastify 5 + drizzle-orm 0.38 + postgres + ioredis). Tests: vitest + pglite (`makeTestDb`) + ioredis-mock. Node 22, ESM/NodeNext.

**Convenciones del repo (obligatorias):** identificadores y codigo en ingles; comentarios y mensajes de commit en español natural SIN acentos ("Se agrega X"); NO Conventional Commits; sin marcas de IA (nada de Co-Authored-By ni referencias a Claude/Anthropic).

---

## Estructura de archivos

**Nuevos:**
- `packages/shared-types/src/progress.ts` — `ProgressPoint`/`CompetencyProgress`/`ProgressSummary`.
- `packages/shared-types/src/progress.test.ts` — tests del schema.
- `apps/api/src/interviewer/progress-aggregator.ts` — `buildProgressSummary` (puro).
- `apps/api/src/interviewer/progress-aggregator.test.ts`.
- `apps/api/src/routes/progress.ts` — `registerProgressRoutes`.
- `apps/api/src/routes/progress.test.ts`.

**Modificados:**
- `packages/shared-types/src/index.ts` — exporta `./progress`.
- `apps/api/src/db/session-archive.ts` — `+listCandidateSessions` (+ test en `session-archive.test.ts`).
- `apps/api/src/server.ts` — registra `registerProgressRoutes` bajo `/api/v1`.

---

## Task 1: Contrato ProgressSummary en shared-types

**Files:**
- Create: `packages/shared-types/src/progress.ts`
- Modify: `packages/shared-types/src/index.ts`
- Test: `packages/shared-types/src/progress.test.ts`

- [ ] **Step 1: Escribir el test fallido**

Crea `packages/shared-types/src/progress.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ProgressSummarySchema } from './progress';

describe('ProgressSummarySchema', () => {
  const valid = {
    candidateId: '550e8400-e29b-41d4-a716-446655440000',
    sessionCount: 2,
    firstSessionAt: 1000,
    lastSessionAt: 2000,
    competencies: [
      {
        name: 'fluency',
        points: [
          { at: 1000, score: 70 },
          { at: 2000, score: 80 },
        ],
        latest: 80,
        average: 75,
        delta: 10,
      },
    ],
  };

  it('acepta un summary valido', () => {
    expect(ProgressSummarySchema.parse(valid).sessionCount).toBe(2);
  });

  it('acepta el estado vacio (candidato sin datos)', () => {
    const empty = {
      candidateId: '550e8400-e29b-41d4-a716-446655440000',
      sessionCount: 0,
      firstSessionAt: null,
      lastSessionAt: null,
      competencies: [
        { name: 'fluency', points: [], latest: null, average: null, delta: null },
      ],
    };
    expect(ProgressSummarySchema.parse(empty).firstSessionAt).toBeNull();
  });

  it('rechaza un score fuera de rango', () => {
    const bad = {
      ...valid,
      competencies: [{ name: 'fluency', points: [{ at: 1, score: 150 }], latest: null, average: null, delta: null }],
    };
    expect(ProgressSummarySchema.safeParse(bad).success).toBe(false);
  });

  it('rechaza un candidateId que no es uuid', () => {
    expect(ProgressSummarySchema.safeParse({ ...valid, candidateId: 'x' }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Correr el test para verlo fallar**

Run: `pnpm --filter @warachikuy/shared-types test -- --run src/progress.test.ts`
Expected: FALLA con "Cannot find module './progress'".

- [ ] **Step 3: Implementar el contrato**

Crea `packages/shared-types/src/progress.ts`:

```ts
import { z } from 'zod';
import { CompetencyNameSchema } from './llm';

// Un punto de la serie por competencia: el score de una sesion en el tiempo.
export const ProgressPointSchema = z.object({
  at: z.number().int(), // ended_at en epoch ms
  score: z.number().min(0).max(100).nullable(),
});
export type ProgressPoint = z.infer<typeof ProgressPointSchema>;

// La evolucion de una competencia a lo largo del historial.
export const CompetencyProgressSchema = z.object({
  name: CompetencyNameSchema,
  points: z.array(ProgressPointSchema), // cronologico ascendente = sparkline
  latest: z.number().min(0).max(100).nullable(),
  average: z.number().min(0).max(100).nullable(), // media de los no-null, redondeada
  delta: z.number().nullable(), // latest - anterior no-null; null si <2 no-null
});
export type CompetencyProgress = z.infer<typeof CompetencyProgressSchema>;

// Resumen longitudinal del candidato para /progress. Solo datos derivables del
// historial (#51); XP/nivel/badges/racha son F4 (#50).
export const ProgressSummarySchema = z.object({
  candidateId: z.string().uuid(),
  sessionCount: z.number().int().nonnegative(), // sesiones con plan
  firstSessionAt: z.number().int().nullable(),
  lastSessionAt: z.number().int().nullable(),
  competencies: z.array(CompetencyProgressSchema), // siempre las 4, orden fijo
});
export type ProgressSummary = z.infer<typeof ProgressSummarySchema>;
```

- [ ] **Step 4: Exportar desde el barrel**

En `packages/shared-types/src/index.ts`, agrega al final (junto a los demas `export *`):

```ts
export * from './progress';
```

- [ ] **Step 5: Correr el test (debe pasar) + typecheck**

Run: `pnpm --filter @warachikuy/shared-types test -- --run src/progress.test.ts`
Expected: PASS (4 tests).
Run: `pnpm --filter @warachikuy/shared-types typecheck`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add packages/shared-types/src/progress.ts packages/shared-types/src/progress.test.ts packages/shared-types/src/index.ts
git commit -m "Se agrega el contrato ProgressSummary de progreso longitudinal"
```

---

## Task 2: listCandidateSessions en el repositorio

**Files:**
- Modify: `apps/api/src/db/session-archive.ts`
- Test: `apps/api/src/db/session-archive.test.ts`

- [ ] **Step 1: Escribir el test fallido**

En `apps/api/src/db/session-archive.test.ts` (ya define los helpers `sampleRow(over)` y `samplePlan(sessionId)`, e importa `makeTestDb`, `NewInterviewSession`, y desde `./session-archive.js` ya trae `archiveSession, updateArchivedPlan, getArchivedSession`). Agrega `listCandidateSessions` a ESE import existente (no agregues una linea de import nueva del mismo modulo, para no duplicar imports):

```ts
// el import existente pasa a:
// import { archiveSession, updateArchivedPlan, getArchivedSession, listCandidateSessions } from './session-archive.js';

describe('listCandidateSessions', () => {
  const cand = '550e8400-e29b-41d4-a716-446655440000';
  const other = '660e8400-e29b-41d4-a716-446655440001';

  it('devuelve solo las sesiones con plan del candidato, ordenadas por ended_at', async () => {
    const db = await makeTestDb();
    // Sesion mas nueva primero al insertar, para verificar el orden de la query
    const newer = sampleRow({
      id: '11111111-1111-4111-8111-111111111111',
      candidateId: cand,
      endedAt: new Date('2026-06-23T12:00:00Z'),
    });
    const older = sampleRow({
      id: '22222222-2222-4222-8222-222222222222',
      candidateId: cand,
      endedAt: new Date('2026-06-23T10:00:00Z'),
    });
    await archiveSession(db, newer);
    await archiveSession(db, older);
    await updateArchivedPlan(db, newer.id, samplePlan(newer.id));
    await updateArchivedPlan(db, older.id, samplePlan(older.id));

    const rows = await listCandidateSessions(db, cand);
    expect(rows.map((r) => r.id)).toEqual([older.id, newer.id]); // asc por ended_at
  });

  it('excluye filas sin plan y de otros candidatos', async () => {
    const db = await makeTestDb();
    const withPlan = sampleRow({ id: '33333333-3333-4333-8333-333333333333', candidateId: cand });
    const noPlan = sampleRow({ id: '44444444-4444-4444-8444-444444444444', candidateId: cand });
    const otherCand = sampleRow({ id: '55555555-5555-4555-8555-555555555555', candidateId: other });
    await archiveSession(db, withPlan);
    await archiveSession(db, noPlan); // queda con plan null
    await archiveSession(db, otherCand);
    await updateArchivedPlan(db, withPlan.id, samplePlan(withPlan.id));
    await updateArchivedPlan(db, otherCand.id, samplePlan(otherCand.id));

    const rows = await listCandidateSessions(db, cand);
    expect(rows.map((r) => r.id)).toEqual([withPlan.id]);
  });
});
```
Nota: `sampleRow` por defecto no setea `candidateId` — pasalo en el override. Si el helper existente no acepta `candidateId` en su `Partial`, igual lo acepta porque `NewInterviewSession` lo tiene como opcional; si no, ajusta el helper para que haga spread del override (ya lo hace).

- [ ] **Step 2: Correr el test para verlo fallar**

Run: `pnpm --filter @warachikuy/api test -- --run src/db/session-archive.test.ts`
Expected: FALLA (`listCandidateSessions` no existe).

- [ ] **Step 3: Implementar listCandidateSessions**

En `apps/api/src/db/session-archive.ts`:

1. Amplia el import de `drizzle-orm` (hoy es `import { eq } from 'drizzle-orm';`):

```ts
import { and, asc, eq, isNotNull } from 'drizzle-orm';
```

2. Agrega la funcion (al final del archivo):

```ts
// Historial del candidato para el progreso longitudinal (#51): solo sesiones
// con plan (las que aportan competencias), ordenadas cronologicamente. Usa el
// indice sobre candidate_id (#56).
export async function listCandidateSessions(
  db: Db,
  candidateId: string,
): Promise<InterviewSessionRow[]> {
  return db
    .select()
    .from(interviewSessions)
    .where(and(eq(interviewSessions.candidateId, candidateId), isNotNull(interviewSessions.plan)))
    .orderBy(asc(interviewSessions.endedAt));
}
```

- [ ] **Step 4: Correr los tests (deben pasar)**

Run: `pnpm --filter @warachikuy/api test -- --run src/db/session-archive.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/db/session-archive.ts apps/api/src/db/session-archive.test.ts
git commit -m "Se agrega listCandidateSessions para el historial del candidato"
```

---

## Task 3: progress-aggregator (funcion pura)

**Files:**
- Create: `apps/api/src/interviewer/progress-aggregator.ts`
- Test: `apps/api/src/interviewer/progress-aggregator.test.ts`

- [ ] **Step 1: Escribir el test fallido**

Crea `apps/api/src/interviewer/progress-aggregator.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { ImprovementPlan } from '@warachikuy/shared-types';
import type { InterviewSessionRow } from '../db/schema.js';
import { buildProgressSummary } from './progress-aggregator.js';

// Fila minima valida para el aggregator (solo le importan endedAt y plan).
function row(id: string, endedAtMs: number, fluency: number | null): InterviewSessionRow {
  const plan: ImprovementPlan = {
    planId: id,
    sessionId: id,
    summary: 's',
    competencies: [
      { name: 'fluency', score: fluency, comment: 'c' },
      { name: 'eye_contact', score: null, comment: 'c' },
      { name: 'speech_rate', score: 60, comment: 'c' },
      { name: 'content', score: 70, comment: 'c' },
    ],
    strengths: [],
    improvements: [],
    exercises: [],
    generatedAt: 1,
  };
  return {
    id,
    candidateId: '550e8400-e29b-41d4-a716-446655440000',
    industry: 'backend',
    level: 'mid',
    status: 'ended',
    startedAt: new Date(endedAtMs - 1000),
    endedAt: new Date(endedAtMs),
    durationMs: 1000,
    transcript: [],
    metrics: { fluency: null, eye_contact: null, speech_rate: null },
    plan,
    createdAt: new Date(endedAtMs),
  };
}

const cand = '550e8400-e29b-41d4-a716-446655440000';

describe('buildProgressSummary', () => {
  it('arma la serie por competencia con latest/average/delta y conteos', () => {
    const rows = [row('a', 1000, 70), row('b', 2000, 80)];
    const s = buildProgressSummary(cand, rows);
    expect(s.sessionCount).toBe(2);
    expect(s.firstSessionAt).toBe(1000);
    expect(s.lastSessionAt).toBe(2000);
    // siempre las 4 competencias, en orden fijo
    expect(s.competencies.map((c) => c.name)).toEqual([
      'fluency',
      'eye_contact',
      'speech_rate',
      'content',
    ]);
    const fluency = s.competencies.find((c) => c.name === 'fluency')!;
    expect(fluency.points).toEqual([
      { at: 1000, score: 70 },
      { at: 2000, score: 80 },
    ]);
    expect(fluency.latest).toBe(80);
    expect(fluency.average).toBe(75);
    expect(fluency.delta).toBe(10);
  });

  it('maneja scores null: hueco en points, excluido de latest/average/delta', () => {
    const rows = [row('a', 1000, null), row('b', 2000, 90)];
    const s = buildProgressSummary(cand, rows);
    const fluency = s.competencies.find((c) => c.name === 'fluency')!;
    expect(fluency.points).toEqual([
      { at: 1000, score: null },
      { at: 2000, score: 90 },
    ]);
    expect(fluency.latest).toBe(90);
    expect(fluency.average).toBe(90); // solo el no-null
    expect(fluency.delta).toBeNull(); // <2 no-null
  });

  it('sin filas devuelve el estado vacio con las 4 competencias', () => {
    const s = buildProgressSummary(cand, []);
    expect(s.sessionCount).toBe(0);
    expect(s.firstSessionAt).toBeNull();
    expect(s.lastSessionAt).toBeNull();
    expect(s.competencies).toHaveLength(4);
    expect(s.competencies[0].points).toEqual([]);
    expect(s.competencies[0].latest).toBeNull();
  });
});
```

- [ ] **Step 2: Correr el test para verlo fallar**

Run: `pnpm --filter @warachikuy/api test -- --run src/interviewer/progress-aggregator.test.ts`
Expected: FALLA (modulo no existe).

- [ ] **Step 3: Implementar el aggregator**

Crea `apps/api/src/interviewer/progress-aggregator.ts`:

```ts
import { CompetencyNameSchema } from '@warachikuy/shared-types';
import type {
  CompetencyName,
  CompetencyProgress,
  ProgressPoint,
  ProgressSummary,
} from '@warachikuy/shared-types';
import type { InterviewSessionRow } from '../db/schema.js';

// Orden fijo de las 4 competencias (el del enum de shared-types).
const COMPETENCIES = CompetencyNameSchema.options;

// Score de una competencia en la fila (null si no esta o no se midio). Las filas
// vienen de listCandidateSessions (plan no null), pero el tipo lo admite null:
// se degrada a null defensivamente.
function scoreOf(row: InterviewSessionRow, name: CompetencyName): number | null {
  const found = row.plan?.competencies.find((c) => c.name === name);
  return found ? found.score : null;
}

function buildCompetency(name: CompetencyName, rows: InterviewSessionRow[]): CompetencyProgress {
  const points: ProgressPoint[] = rows.map((r) => ({
    at: r.endedAt.getTime(),
    score: scoreOf(r, name),
  }));
  const measured = points.map((p) => p.score).filter((s): s is number => s !== null);
  const latest = measured.length > 0 ? measured[measured.length - 1]! : null;
  const average =
    measured.length > 0
      ? Math.round(measured.reduce((sum, s) => sum + s, 0) / measured.length)
      : null;
  const delta =
    measured.length >= 2 ? measured[measured.length - 1]! - measured[measured.length - 2]! : null;
  return { name, points, latest, average, delta };
}

// Agrega el historial (filas ordenadas por ended_at asc) en el resumen de
// progreso por competencia. Funcion pura: no toca DB ni Fastify.
export function buildProgressSummary(
  candidateId: string,
  rows: InterviewSessionRow[],
): ProgressSummary {
  const ended = rows.map((r) => r.endedAt.getTime());
  return {
    candidateId,
    sessionCount: rows.length,
    firstSessionAt: ended.length > 0 ? ended[0]! : null,
    lastSessionAt: ended.length > 0 ? ended[ended.length - 1]! : null,
    competencies: COMPETENCIES.map((name) => buildCompetency(name, rows)),
  };
}
```

- [ ] **Step 4: Correr los tests (deben pasar)**

Run: `pnpm --filter @warachikuy/api test -- --run src/interviewer/progress-aggregator.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/interviewer/progress-aggregator.ts apps/api/src/interviewer/progress-aggregator.test.ts
git commit -m "Se agrega el agregador de progreso longitudinal por competencia"
```

---

## Task 4: Ruta GET /candidates/:candidateId/progress + wiring

**Files:**
- Create: `apps/api/src/routes/progress.ts`
- Modify: `apps/api/src/server.ts`
- Test: `apps/api/src/routes/progress.test.ts`

- [ ] **Step 1: Escribir el test fallido**

Crea `apps/api/src/routes/progress.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import RedisMock from 'ioredis-mock';
import type Redis from 'ioredis';
import type { FastifyInstance } from 'fastify';
import type { ImprovementPlan } from '@warachikuy/shared-types';
import { buildServer } from '../server';
import { loadEnv } from '../config/env';
import { makeTestDb } from '../db/test-helpers.js';
import type { Db } from '../db/client.js';
import { archiveSession, updateArchivedPlan } from '../db/session-archive.js';
import type { NewInterviewSession } from '../db/schema.js';

const testEnv = loadEnv({
  PORT: '3000',
  DATABASE_URL: 'postgresql://x:x@x/x',
  REDIS_URL: 'redis://x:6379',
  GEMINI_API_KEY: 'k',
  LOG_LEVEL: 'silent',
  CORS_ORIGINS: 'http://localhost:5173',
  WS_BASE_URL: 'ws://test.local',
});

const cand = '550e8400-e29b-41d4-a716-446655440000';

function rowFor(id: string, endedAt: Date): NewInterviewSession {
  return {
    id,
    candidateId: cand,
    industry: 'backend',
    level: 'mid',
    status: 'ended',
    startedAt: new Date(endedAt.getTime() - 1000),
    endedAt,
    durationMs: 1000,
    transcript: [],
    metrics: { fluency: null, eye_contact: null, speech_rate: null },
  };
}

function planFor(id: string, fluency: number): ImprovementPlan {
  return {
    planId: id,
    sessionId: id,
    summary: 's',
    competencies: [
      { name: 'fluency', score: fluency, comment: 'c' },
      { name: 'eye_contact', score: null, comment: 'c' },
      { name: 'speech_rate', score: 60, comment: 'c' },
      { name: 'content', score: 70, comment: 'c' },
    ],
    strengths: [],
    improvements: [],
    exercises: [],
    generatedAt: 1,
  };
}

describe('GET /api/v1/candidates/:candidateId/progress', () => {
  let server: FastifyInstance;
  let db: Db;

  beforeEach(async () => {
    db = await makeTestDb();
    server = await buildServer(testEnv, { redis: new RedisMock() as unknown as Redis, db });
  });
  afterEach(async () => {
    await server.close();
  });

  it('devuelve la evolucion por competencia del candidato', async () => {
    const a = rowFor('11111111-1111-4111-8111-111111111111', new Date('2026-06-23T10:00:00Z'));
    const b = rowFor('22222222-2222-4222-8222-222222222222', new Date('2026-06-23T12:00:00Z'));
    await archiveSession(db, a);
    await archiveSession(db, b);
    await updateArchivedPlan(db, a.id, planFor(a.id, 70));
    await updateArchivedPlan(db, b.id, planFor(b.id, 80));

    const res = await server.inject({
      method: 'GET',
      url: `/api/v1/candidates/${cand}/progress`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.sessionCount).toBe(2);
    const fluency = body.competencies.find((c: { name: string }) => c.name === 'fluency');
    expect(fluency.latest).toBe(80);
    expect(fluency.delta).toBe(10);
  });

  it('candidato sin datos devuelve 200 con summary vacio', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/v1/candidates/${cand}/progress`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.sessionCount).toBe(0);
    expect(body.firstSessionAt).toBeNull();
    expect(body.competencies).toHaveLength(4);
  });

  it('candidateId que no es uuid devuelve 400', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/candidates/no-soy-uuid/progress',
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('invalid_input');
  });
});
```

- [ ] **Step 2: Correr el test para verlo fallar**

Run: `pnpm --filter @warachikuy/api test -- --run src/routes/progress.test.ts`
Expected: FALLA (404 en la ruta: aun no esta registrada).

- [ ] **Step 3: Implementar la ruta**

Crea `apps/api/src/routes/progress.ts`:

```ts
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { apiError } from '../errors.js';
import { listCandidateSessions } from '../db/session-archive.js';
import { buildProgressSummary } from '../interviewer/progress-aggregator.js';

export async function registerProgressRoutes(server: FastifyInstance): Promise<void> {
  server.get<{ Params: { candidateId: string } }>(
    '/candidates/:candidateId/progress',
    async (req, reply) => {
      // El candidateId es un uuid anonimo (capability de lectura, sin auth: el
      // modelo de confianza del MVP de #56; auth real es F5).
      const parsed = z.string().uuid().safeParse(req.params.candidateId);
      if (!parsed.success) {
        return reply.code(400).send(apiError('invalid_input', 'candidateId invalido'));
      }
      try {
        const rows = await listCandidateSessions(server.db, parsed.data);
        return reply.code(200).send(buildProgressSummary(parsed.data, rows));
      } catch (err) {
        req.log.error({ err, candidateId: parsed.data }, 'no se pudo leer el progreso');
        return reply.code(500).send(apiError('internal_error', 'No se pudo leer el progreso'));
      }
    },
  );
}
```

- [ ] **Step 4: Montar la ruta en el servidor**

En `apps/api/src/server.ts`:

1. Agrega el import (junto al de `registerSessionsRoutes`):

```ts
import { registerProgressRoutes } from './routes/progress.js';
```

2. En el bloque de registro con `{ prefix: '/api/v1' }` (donde se llama `registerSessionsRoutes(api)`), agrega la nueva ruta en el mismo callback:

```ts
  await server.register(
    async (api) => {
      await registerSessionsRoutes(api);
      await registerProgressRoutes(api);
    },
    { prefix: '/api/v1' },
  );
```

- [ ] **Step 5: Correr los tests (deben pasar)**

Run: `pnpm --filter @warachikuy/api test -- --run src/routes/progress.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Suite api + shared-types, typecheck, lint, build**

Run:
```bash
pnpm --filter @warachikuy/shared-types test -- --run
pnpm --filter @warachikuy/api test -- --run
pnpm --filter @warachikuy/api typecheck
pnpm --filter @warachikuy/api lint
pnpm --filter @warachikuy/api build
```
Expected: todo verde.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/progress.ts apps/api/src/routes/progress.test.ts apps/api/src/server.ts
git commit -m "Se expone el endpoint de progreso longitudinal del candidato"
```

---

## Verificacion final (tras todas las tasks)

- [ ] `pnpm -r test -- --run` (shared-types + api + web + packages) verde.
- [ ] `pnpm -r lint` y `pnpm -r typecheck` verdes.
- [ ] `pnpm --filter @warachikuy/api build` verde.
- [ ] Revisar que ningun commit incluya marcas de IA ni Conventional Commits.
- [ ] Dispatch del code-reviewer final sobre toda la rama.
- [ ] Usar superpowers:finishing-a-development-branch para abrir el PR contra `main`.
