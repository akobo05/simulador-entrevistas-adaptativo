# Plan de mejora Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generar el plan de mejora post-entrevista: `POST /sessions/:id/end` cierra la sesión y dispara la generación async del `ImprovementPlan` por el LLM Coach (transcript + métricas del aura), y `GET /sessions/:id/plan` lo entrega con polling.

**Architecture:** El handler del WS (de #39) empieza a agregar los `metrics.update` (promedio corriente, persistido throttled a Redis). `POST /end` usa un `SET NX` atómico como guard de idempotencia/concurrencia, cierra el WS, y dispara `coach.service.generatePlan` (fire-and-forget). El Coach lee historial + métricas, llama a Gemini en modo JSON estructurado, ensambla el `ImprovementPlan` inyectando los 3 puntajes medidos, y lo guarda en Redis con TTL propio. `GET /plan` devuelve 200/202/404 y fuerza `failed` si un `generating` supera el timeout.

**Tech Stack:** Fastify 5 + Zod 3 + ioredis + @google/genai + Node 22 + vitest + ioredis-mock

**Spec:** `docs/superpowers/specs/2026-06-01-improvement-plan-design.md`

---

## Tipos y firmas (fijadas para consistencia entre tareas)

```typescript
// shared-types/src/llm.ts
CompetencyName = 'fluency' | 'eye_contact' | 'speech_rate' | 'content'
PlanCompetency = { name: CompetencyName; score: number | null; comment: string }
PlanExercise = { title: string; description: string }
ImprovementPlan = { planId: uuid; sessionId: uuid; summary: string; competencies: PlanCompetency[];
                    strengths: string[]; improvements: string[]; exercises: PlanExercise[]; generatedAt: number }

// interviewer/constants.ts
PLAN_TTL_SECONDS = 7200            // 2h, TTL propio del plan (desacoplado de la sesion)
GENERATION_TIMEOUT_SECONDS = 45    // un 'generating' mas viejo que esto -> failed
METRICS_FLUSH_INTERVAL_MS = 1000   // throttle de la persistencia del agregado

// interviewer/metrics-aggregator.ts
MetricsAggregate = { fluency: number | null; eye_contact: number | null; speech_rate: number | null }
class MetricsAggregator { add(state: AuraState): void; snapshot(): MetricsAggregate }
persistAggregate(redis, sessionId, agg: MetricsAggregate): Promise<void>
readAggregate(redis, sessionId): Promise<MetricsAggregate>

// interviewer/gemini-client.ts
GeminiClient.generateJson(systemPrompt: string, contents: GeminiTurn[], responseSchema: unknown): Promise<unknown>

// interviewer/prompts.ts
buildCoachPrompt(input: { industry: Industry; level: Level; metrics: MetricsAggregate }): string

// interviewer/coach.service.ts
CoachDeps = { redis: Redis; gemini: GeminiClient; log: FastifyBaseLogger }
generatePlan(deps: CoachDeps, state: SessionState, planId: string): Promise<void>

// interviewer/plan-store.ts
PlanStatus = 'generating' | 'ready' | 'failed'
PlanRecord = { status: PlanStatus; planId: string; generatingSince?: number; plan?: ImprovementPlan }
tryStartGenerating(redis, sessionId, planId, now): Promise<boolean>   // SET NX; true si gano
readPlan(redis, sessionId): Promise<PlanRecord | null>
setPlanReady(redis, sessionId, plan: ImprovementPlan): Promise<void>
setPlanFailed(redis, sessionId, planId): Promise<void>
```

---

## Task 1: Schema ImprovementPlan en shared-types + constantes

**Files:**
- Modify: `packages/shared-types/src/llm.ts`
- Test: `packages/shared-types/src/llm.test.ts`
- Modify: `apps/api/src/interviewer/constants.ts`
- Test: `apps/api/src/interviewer/constants.test.ts`

- [ ] **Step 1: Escribir el test del schema (append a `packages/shared-types/src/llm.test.ts`)**

```typescript
import { ImprovementPlanSchema } from './llm';

describe('ImprovementPlanSchema', () => {
  const valid = {
    planId: '550e8400-e29b-41d4-a716-446655440000',
    sessionId: '550e8400-e29b-41d4-a716-446655440001',
    summary: 'Buen desempeno general.',
    competencies: [
      { name: 'fluency', score: 80, comment: 'fluida' },
      { name: 'eye_contact', score: null, comment: 'sin datos' },
      { name: 'speech_rate', score: 65, comment: 'ok' },
      { name: 'content', score: 70, comment: 'respuestas correctas' },
    ],
    strengths: ['claridad'],
    improvements: ['profundizar'],
    exercises: [{ title: 'Practicar STAR', description: 'Estructura tus respuestas.' }],
    generatedAt: 1,
  };

  it('acepta un plan valido (score null permitido)', () => {
    expect(ImprovementPlanSchema.parse(valid)).toEqual(valid);
  });

  it('rechaza un competency name desconocido', () => {
    const bad = { ...valid, competencies: [{ name: 'postura', score: 50, comment: 'x' }] };
    expect(ImprovementPlanSchema.safeParse(bad).success).toBe(false);
  });

  it('rechaza score fuera de 0-100', () => {
    const bad = { ...valid, competencies: [{ name: 'fluency', score: 150, comment: 'x' }] };
    expect(ImprovementPlanSchema.safeParse(bad).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run para verificar fallo**

Run: `pnpm --filter @warachikuy/shared-types test llm`
Expected: FAIL ("ImprovementPlanSchema is not exported").

- [ ] **Step 3: Agregar a `packages/shared-types/src/llm.ts` (al final)**

```typescript
export const CompetencyNameSchema = z.enum(['fluency', 'eye_contact', 'speech_rate', 'content']);
export type CompetencyName = z.infer<typeof CompetencyNameSchema>;

export const PlanCompetencySchema = z.object({
  name: CompetencyNameSchema,
  score: z.number().min(0).max(100).nullable(), // null si no se midio
  comment: z.string(),
});
export type PlanCompetency = z.infer<typeof PlanCompetencySchema>;

export const PlanExerciseSchema = z.object({
  title: z.string(),
  description: z.string(),
});
export type PlanExercise = z.infer<typeof PlanExerciseSchema>;

export const ImprovementPlanSchema = z.object({
  planId: z.string().uuid(),
  sessionId: z.string().uuid(),
  summary: z.string(),
  competencies: z.array(PlanCompetencySchema),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  exercises: z.array(PlanExerciseSchema),
  generatedAt: z.number().int(),
});
export type ImprovementPlan = z.infer<typeof ImprovementPlanSchema>;
```

(`z` ya esta importado al tope de llm.ts. No duplicar el import.)

- [ ] **Step 4: Run para verificar pase**

Run: `pnpm --filter @warachikuy/shared-types test llm`
Expected: PASS.

- [ ] **Step 5: Escribir el test de constantes (append a `apps/api/src/interviewer/constants.test.ts`)**

```typescript
import {
  PLAN_TTL_SECONDS,
  GENERATION_TIMEOUT_SECONDS,
  METRICS_FLUSH_INTERVAL_MS,
} from './constants';

describe('constantes del plan de mejora', () => {
  it('PLAN_TTL_SECONDS es mayor que el TTL de la sesion (1h)', () => {
    expect(PLAN_TTL_SECONDS).toBeGreaterThan(3600);
  });
  it('GENERATION_TIMEOUT_SECONDS es holgado sobre el timeout de Gemini (15s)', () => {
    expect(GENERATION_TIMEOUT_SECONDS).toBeGreaterThan(15);
  });
  it('METRICS_FLUSH_INTERVAL_MS evita escrituras a 4 Hz', () => {
    expect(METRICS_FLUSH_INTERVAL_MS).toBeGreaterThanOrEqual(1000);
  });
});
```

- [ ] **Step 6: Run para verificar fallo**

Run: `pnpm --filter @warachikuy/api test interviewer/constants`
Expected: FAIL (constantes no exportadas).

- [ ] **Step 7: Agregar a `apps/api/src/interviewer/constants.ts` (al final)**

```typescript
// TTL propio del plan de mejora (2h), desacoplado del TTL de la sesion para que
// el candidato no lo pierda si tarda en consultarlo.
export const PLAN_TTL_SECONDS = 7200;

// Si un registro 'generating' es mas viejo que esto, el GET /plan lo fuerza a
// 'failed' (el proceso pudo morir a mitad). Holgado sobre los 15s de Gemini.
export const GENERATION_TIMEOUT_SECONDS = 45;

// Throttle de la persistencia del agregado de metricas a Redis (a lo sumo 1/s),
// para no escribir a la frecuencia de los metrics.update (~4 Hz).
export const METRICS_FLUSH_INTERVAL_MS = 1000;
```

- [ ] **Step 8: Run tests + typecheck**

Run: `pnpm --filter @warachikuy/api test interviewer/constants && pnpm -r typecheck`
Expected: PASS, typecheck limpio.

- [ ] **Step 9: Commit**

```bash
git add packages/shared-types/src/llm.ts packages/shared-types/src/llm.test.ts apps/api/src/interviewer/constants.ts apps/api/src/interviewer/constants.test.ts
git commit -m "Se agrega el schema ImprovementPlan y las constantes del plan de mejora"
```

---

## Task 2: Agregador de métricas del aura

**Files:**
- Create: `apps/api/src/interviewer/metrics-aggregator.ts`
- Test: `apps/api/src/interviewer/metrics-aggregator.test.ts`

- [ ] **Step 1: Escribir los tests (TDD)**

Create `apps/api/src/interviewer/metrics-aggregator.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import RedisMock from 'ioredis-mock';
import type Redis from 'ioredis';
import type { AuraState } from '@warachikuy/shared-types';
import { MetricsAggregator, persistAggregate, readAggregate } from './metrics-aggregator';

function aura(metrics: { name: string; value: number }[]): AuraState {
  return {
    sessionId: '550e8400-e29b-41d4-a716-446655440000',
    metrics: metrics.map((m) => ({
      name: m.name as AuraState['metrics'][number]['name'],
      value: m.value,
      confidence: 'high',
      timestamp: 1,
    })),
    collectedAt: 1,
  };
}

describe('MetricsAggregator', () => {
  it('promedia por metrica sobre varias muestras', () => {
    const agg = new MetricsAggregator();
    agg.add(aura([{ name: 'fluency', value: 80 }, { name: 'eye_contact', value: 60 }]));
    agg.add(aura([{ name: 'fluency', value: 100 }]));
    expect(agg.snapshot()).toEqual({ fluency: 90, eye_contact: 60, speech_rate: null });
  });

  it('devuelve null para una metrica sin muestras', () => {
    expect(new MetricsAggregator().snapshot()).toEqual({
      fluency: null,
      eye_contact: null,
      speech_rate: null,
    });
  });

  it('ignora nombres de metrica fuera de las tres rastreadas', () => {
    const agg = new MetricsAggregator();
    agg.add(aura([{ name: 'posture', value: 50 }]));
    expect(agg.snapshot()).toEqual({ fluency: null, eye_contact: null, speech_rate: null });
  });
});

describe('persistAggregate / readAggregate', () => {
  beforeEach(async () => {
    await (new RedisMock() as unknown as Redis).flushall();
  });

  it('readAggregate devuelve todo null si no hay registro', async () => {
    const redis = new RedisMock() as unknown as Redis;
    expect(await readAggregate(redis, 'nope')).toEqual({
      fluency: null,
      eye_contact: null,
      speech_rate: null,
    });
  });

  it('persistAggregate guarda y readAggregate recupera', async () => {
    const redis = new RedisMock() as unknown as Redis;
    await persistAggregate(redis, 's1', { fluency: 70, eye_contact: null, speech_rate: 55 });
    expect(await readAggregate(redis, 's1')).toEqual({
      fluency: 70,
      eye_contact: null,
      speech_rate: 55,
    });
  });
});
```

- [ ] **Step 2: Run para verificar fallo**

Run: `pnpm --filter @warachikuy/api test interviewer/metrics-aggregator`
Expected: FAIL ("Cannot find module './metrics-aggregator'").

- [ ] **Step 3: Implementar `apps/api/src/interviewer/metrics-aggregator.ts`**

```typescript
import type Redis from 'ioredis';
import type { AuraState } from '@warachikuy/shared-types';
import { SESSION_REFRESH_TTL_SECONDS } from '../ws/constants.js';

const TRACKED = ['fluency', 'eye_contact', 'speech_rate'] as const;
type TrackedMetric = (typeof TRACKED)[number];

export type MetricsAggregate = Record<TrackedMetric, number | null>;

// Promedio corriente en memoria por metrica del aura. Vive por conexion en el
// handler del WS; una conexion por sesion (ConnectionRegistry).
export class MetricsAggregator {
  private acc: Record<TrackedMetric, { sum: number; count: number }> = {
    fluency: { sum: 0, count: 0 },
    eye_contact: { sum: 0, count: 0 },
    speech_rate: { sum: 0, count: 0 },
  };

  add(state: AuraState): void {
    for (const m of state.metrics) {
      const acc = this.acc[m.name as TrackedMetric];
      // Solo las 3 rastreadas; la spec arquitectonica 3.1 ya filtra baja
      // confianza (la metrica se omite del array), asi que llegan utiles.
      if (acc) {
        acc.sum += m.value;
        acc.count += 1;
      }
    }
  }

  snapshot(): MetricsAggregate {
    const out = {} as MetricsAggregate;
    for (const k of TRACKED) {
      out[k] = this.acc[k].count > 0 ? this.acc[k].sum / this.acc[k].count : null;
    }
    return out;
  }
}

function metricsKey(sessionId: string): string {
  return `session:metrics:${sessionId}`;
}

export async function persistAggregate(
  redis: Redis,
  sessionId: string,
  agg: MetricsAggregate,
): Promise<void> {
  await redis.set(metricsKey(sessionId), JSON.stringify(agg), 'EX', SESSION_REFRESH_TTL_SECONDS);
}

export async function readAggregate(redis: Redis, sessionId: string): Promise<MetricsAggregate> {
  const raw = await redis.get(metricsKey(sessionId));
  if (!raw) return { fluency: null, eye_contact: null, speech_rate: null };
  return JSON.parse(raw) as MetricsAggregate;
}
```

- [ ] **Step 4: Run para verificar pase**

Run: `pnpm --filter @warachikuy/api test interviewer/metrics-aggregator`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/interviewer/metrics-aggregator.ts apps/api/src/interviewer/metrics-aggregator.test.ts
git commit -m "Se agrega el agregador de metricas del aura con persistencia en Redis"
```

---

## Task 3: `generateJson` en el cliente de Gemini

**Files:**
- Modify: `apps/api/src/interviewer/gemini-client.ts`
- Test: `apps/api/src/interviewer/gemini-client.test.ts`

- [ ] **Step 1: Escribir los tests (append al `describe('buildGeminiClient', ...)` de `gemini-client.test.ts`)**

```typescript
  it('generateJson parsea el JSON estructurado que devuelve el SDK', async () => {
    generateContentMock.mockResolvedValue({ text: '{"ok":true,"n":3}' });
    const client = buildGeminiClient(fakeEnv);
    const out = await client.generateJson('sys', [{ role: 'user', text: 'x' }], { type: 'object' });
    expect(out).toEqual({ ok: true, n: 3 });
  });

  it('generateJson pasa responseSchema y responseMimeType al SDK', async () => {
    generateContentMock.mockResolvedValue({ text: '{}' });
    const client = buildGeminiClient(fakeEnv);
    const schema = { type: 'object' };
    await client.generateJson('sys', [], schema);
    const cfg = (generateContentMock.mock.calls[0]![0] as { config: Record<string, unknown> }).config;
    expect(cfg.responseMimeType).toBe('application/json');
    expect(cfg.responseSchema).toBe(schema);
  });

  it('generateJson lanza GeminiBlockedError ante salida vacia', async () => {
    generateContentMock.mockResolvedValue({ text: '' });
    const client = buildGeminiClient(fakeEnv);
    await expect(client.generateJson('sys', [], {})).rejects.toBeInstanceOf(GeminiBlockedError);
  });

  it('generateJson envuelve un rechazo del SDK como GeminiTransientError', async () => {
    generateContentMock.mockRejectedValue(new Error('net'));
    const client = buildGeminiClient(fakeEnv);
    await expect(client.generateJson('sys', [], {})).rejects.toBeInstanceOf(GeminiTransientError);
  });
```

- [ ] **Step 2: Run para verificar fallo**

Run: `pnpm --filter @warachikuy/api test interviewer/gemini-client`
Expected: FAIL ("generateJson is not a function").

- [ ] **Step 3: Modificar `apps/api/src/interviewer/gemini-client.ts`**

a. Agregar `generateJson` a la interfaz `GeminiClient`:

```typescript
export interface GeminiClient {
  generate(systemPrompt: string, contents: GeminiTurn[]): Promise<string>;
  generateJson(systemPrompt: string, contents: GeminiTurn[], responseSchema: unknown): Promise<unknown>;
}
```

b. En `buildGeminiClient`, agregar el metodo `generateJson` al objeto retornado (junto a `generate`). Refactorizar el cuerpo comun de la llamada en un helper interno `callGemini` para no duplicar el manejo de timeout/errores:

```typescript
export function buildGeminiClient(env: Env): GeminiClient {
  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

  // Llamada comun con timeout y mapeo de errores. extraConfig agrega
  // responseMimeType/responseSchema para el modo JSON.
  async function callGemini(
    systemPrompt: string,
    contents: GeminiTurn[],
    extraConfig: Record<string, unknown>,
  ): Promise<string> {
    let response;
    try {
      response = await withTimeout(
        ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: contents.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
          config: { systemInstruction: systemPrompt, ...extraConfig },
        }),
        GEMINI_TIMEOUT_MS,
      );
    } catch (err) {
      if (err instanceof GeminiTransientError) throw err;
      if (
        err instanceof TypeError ||
        err instanceof ReferenceError ||
        err instanceof RangeError ||
        err instanceof SyntaxError
      ) {
        throw err;
      }
      throw new GeminiTransientError(err instanceof Error ? err.message : 'gemini error', {
        cause: err,
      });
    }
    const text = response.text;
    if (!text || text.trim().length === 0) {
      throw new GeminiBlockedError('gemini devolvio salida vacia o bloqueada');
    }
    return text;
  }

  return {
    async generate(systemPrompt, contents) {
      return callGemini(systemPrompt, contents, {});
    },
    async generateJson(systemPrompt, contents, responseSchema) {
      const text = await callGemini(systemPrompt, contents, {
        responseMimeType: 'application/json',
        responseSchema,
      });
      return JSON.parse(text);
    },
  };
}
```

(Esto reemplaza el `return { async generate... }` existente. El comentario sobre la deteccion de bloqueo por texto vacio se conserva dentro de `callGemini`.)

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm --filter @warachikuy/api test interviewer/gemini-client && pnpm --filter @warachikuy/api typecheck`
Expected: PASS, typecheck limpio. (Los fakes de GeminiClient en otros tests deben agregar `generateJson`; si typecheck o algun test del orquestador falla porque su fake no implementa `generateJson`, agregar `generateJson: async () => ({})` a esos fakes. Reportar cuales se tocaron.)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/interviewer/gemini-client.ts apps/api/src/interviewer/gemini-client.test.ts
git commit -m "Se agrega generateJson al cliente de Gemini para salida estructurada"
```

---

## Task 4: Prompt del Coach

**Files:**
- Modify: `apps/api/src/interviewer/prompts.ts`
- Test: `apps/api/src/interviewer/prompts.test.ts`

- [ ] **Step 1: Escribir los tests (append a `prompts.test.ts`)**

```typescript
import { buildCoachPrompt } from './prompts';

describe('buildCoachPrompt', () => {
  it('incluye el rol de coach, industria y nivel', () => {
    const p = buildCoachPrompt({
      industry: 'backend',
      level: 'mid',
      metrics: { fluency: 80, eye_contact: 60, speech_rate: 70 },
    });
    expect(p.toLowerCase()).toContain('coach');
    expect(p).toContain('backend');
    expect(p).toContain('mid');
  });

  it('inyecta los valores medidos para comentarlos sin re-puntuarlos', () => {
    const p = buildCoachPrompt({
      industry: 'backend',
      level: 'mid',
      metrics: { fluency: 80, eye_contact: 60, speech_rate: 70 },
    });
    expect(p).toContain('80');
    expect(p.toLowerCase()).toContain('no vuelvas a puntuar');
  });

  it('marca las metricas sin datos', () => {
    const p = buildCoachPrompt({
      industry: 'backend',
      level: 'mid',
      metrics: { fluency: null, eye_contact: null, speech_rate: null },
    });
    expect(p.toLowerCase()).toContain('sin datos');
  });

  it('incluye la rubrica del puntaje de content', () => {
    const p = buildCoachPrompt({
      industry: 'backend',
      level: 'senior',
      metrics: { fluency: 80, eye_contact: 60, speech_rate: 70 },
    });
    expect(p.toLowerCase()).toContain('rubrica');
    expect(p).toContain('content');
  });
});
```

- [ ] **Step 2: Run para verificar fallo**

Run: `pnpm --filter @warachikuy/api test interviewer/prompts`
Expected: FAIL ("buildCoachPrompt is not exported").

- [ ] **Step 3: Agregar a `apps/api/src/interviewer/prompts.ts`**

Agregar el import del tipo del agregado al tope:

```typescript
import type { MetricsAggregate } from './metrics-aggregator.js';
```

Y al final del archivo:

```typescript
export interface CoachPromptInput {
  industry: Industry;
  level: Level;
  metrics: MetricsAggregate;
}

function fmtMetric(value: number | null): string {
  return value === null ? 'sin datos' : `${Math.round(value)}/100`;
}

// System prompt del LLM Coach: genera el plan de mejora tras la entrevista.
// Rol distinto al entrevistador. El transcript NO va aca (viaja como contents),
// solo las instrucciones y los valores medidos (datos del backend, confiables).
export function buildCoachPrompt(input: CoachPromptInput): string {
  const { industry, level, metrics } = input;
  return [
    `Eres un coach de carrera que da retroalimentacion constructiva tras una entrevista tecnica de ${industry}, nivel ${level}.`,
    'Analizas la conversacion (que recibes como el historial de mensajes) y devuelves un plan de mejora en JSON.',
    'Idioma: espanol neutro. Tono alentador pero honesto. No inventes datos que no esten en el transcript ni en las metricas.',
    '',
    'Metricas no verbales ya MEDIDAS por el sistema (NO vuelvas a puntuarlas, solo comentalas con criterio):',
    `- fluidez verbal: ${fmtMetric(metrics.fluency)}`,
    `- contacto visual: ${fmtMetric(metrics.eye_contact)}`,
    `- ritmo del habla: ${fmtMetric(metrics.speech_rate)}`,
    'Si una metrica dice "sin datos", dilo explicitamente en su comentario en vez de inventar un valor.',
    '',
    'Puntua SOLO la competencia "content" (calidad de las respuestas) de 0 a 100, con esta rubrica:',
    '- 0-40: respuestas vagas, incorrectas o evasivas.',
    '- 40-70: correctas pero superficiales o poco estructuradas.',
    '- 70-100: correctas, profundas, bien estructuradas y con ejemplos.',
    `Ajusta la exigencia al nivel ${level}. Criterios: correctitud tecnica, profundidad, claridad y uso de ejemplos.`,
    '',
    'Devuelve: un resumen breve, un comentario por cada competencia (fluency, eye_contact, speech_rate, content), el contentScore, una lista de fortalezas, una lista de aspectos a mejorar, y ejercicios priorizados (titulo + descripcion).',
  ].join('\n');
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm --filter @warachikuy/api test interviewer/prompts && pnpm --filter @warachikuy/api typecheck`
Expected: PASS, 4 tests nuevos + los previos.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/interviewer/prompts.ts apps/api/src/interviewer/prompts.test.ts
git commit -m "Se agrega el prompt del Coach con rubrica del puntaje de content"
```

---

## Task 5: plan-store (persistencia del plan + status)

**Files:**
- Create: `apps/api/src/interviewer/plan-store.ts`
- Test: `apps/api/src/interviewer/plan-store.test.ts`

- [ ] **Step 1: Escribir los tests (TDD)**

Create `apps/api/src/interviewer/plan-store.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import RedisMock from 'ioredis-mock';
import type Redis from 'ioredis';
import type { ImprovementPlan } from '@warachikuy/shared-types';
import { tryStartGenerating, readPlan, setPlanReady, setPlanFailed } from './plan-store';

const plan: ImprovementPlan = {
  planId: 'p1',
  sessionId: 's1',
  summary: 'ok',
  competencies: [],
  strengths: [],
  improvements: [],
  exercises: [],
  generatedAt: 1,
};

describe('plan-store', () => {
  beforeEach(async () => {
    await (new RedisMock() as unknown as Redis).flushall();
  });

  it('readPlan devuelve null sin registro', async () => {
    const redis = new RedisMock() as unknown as Redis;
    expect(await readPlan(redis, 'nope')).toBeNull();
  });

  it('tryStartGenerating gana la primera vez y pierde la segunda (NX)', async () => {
    const redis = new RedisMock() as unknown as Redis;
    expect(await tryStartGenerating(redis, 's1', 'p1', 1000)).toBe(true);
    expect(await tryStartGenerating(redis, 's1', 'p2', 2000)).toBe(false);
    const rec = await readPlan(redis, 's1');
    expect(rec).toMatchObject({ status: 'generating', planId: 'p1', generatingSince: 1000 });
  });

  it('setPlanReady guarda el plan con status ready', async () => {
    const redis = new RedisMock() as unknown as Redis;
    await tryStartGenerating(redis, 's1', 'p1', 1000);
    await setPlanReady(redis, 's1', plan);
    const rec = await readPlan(redis, 's1');
    expect(rec?.status).toBe('ready');
    expect(rec?.plan).toEqual(plan);
  });

  it('setPlanFailed marca el registro como failed', async () => {
    const redis = new RedisMock() as unknown as Redis;
    await tryStartGenerating(redis, 's1', 'p1', 1000);
    await setPlanFailed(redis, 's1', 'p1');
    const rec = await readPlan(redis, 's1');
    expect(rec?.status).toBe('failed');
    expect(rec?.planId).toBe('p1');
  });
});
```

- [ ] **Step 2: Run para verificar fallo**

Run: `pnpm --filter @warachikuy/api test interviewer/plan-store`
Expected: FAIL ("Cannot find module './plan-store'").

- [ ] **Step 3: Implementar `apps/api/src/interviewer/plan-store.ts`**

```typescript
import type Redis from 'ioredis';
import type { ImprovementPlan } from '@warachikuy/shared-types';
import { PLAN_TTL_SECONDS } from './constants.js';

export type PlanStatus = 'generating' | 'ready' | 'failed';

export interface PlanRecord {
  status: PlanStatus;
  planId: string;
  generatingSince?: number;
  plan?: ImprovementPlan;
}

function planKey(sessionId: string): string {
  return `session:plan:${sessionId}`;
}

// Guard atomico de idempotencia/concurrencia: crea el placeholder 'generating'
// SOLO si no existe. Devuelve true si gano (este es el primer /end). El SET NX
// es atomico, asi que dos /end simultaneos: solo uno gana.
export async function tryStartGenerating(
  redis: Redis,
  sessionId: string,
  planId: string,
  now: number,
): Promise<boolean> {
  const record: PlanRecord = { status: 'generating', planId, generatingSince: now };
  const res = await redis.set(planKey(sessionId), JSON.stringify(record), 'EX', PLAN_TTL_SECONDS, 'NX');
  return res === 'OK';
}

export async function readPlan(redis: Redis, sessionId: string): Promise<PlanRecord | null> {
  const raw = await redis.get(planKey(sessionId));
  if (!raw) return null;
  return JSON.parse(raw) as PlanRecord;
}

export async function setPlanReady(
  redis: Redis,
  sessionId: string,
  plan: ImprovementPlan,
): Promise<void> {
  const record: PlanRecord = { status: 'ready', planId: plan.planId, plan };
  // Renueva el TTL propio del plan para dar margen de lectura al candidato.
  await redis.set(planKey(sessionId), JSON.stringify(record), 'EX', PLAN_TTL_SECONDS);
}

export async function setPlanFailed(redis: Redis, sessionId: string, planId: string): Promise<void> {
  const record: PlanRecord = { status: 'failed', planId };
  await redis.set(planKey(sessionId), JSON.stringify(record), 'EX', PLAN_TTL_SECONDS);
}
```

- [ ] **Step 4: Run para verificar pase**

Run: `pnpm --filter @warachikuy/api test interviewer/plan-store`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/interviewer/plan-store.ts apps/api/src/interviewer/plan-store.test.ts
git commit -m "Se agrega plan-store con guard NX atomico y estados del plan"
```

---

## Task 6: coach.service (generación del plan)

**Files:**
- Create: `apps/api/src/interviewer/coach.service.ts`
- Test: `apps/api/src/interviewer/coach.service.test.ts`

- [ ] **Step 1: Escribir los tests (TDD)**

Create `apps/api/src/interviewer/coach.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import RedisMock from 'ioredis-mock';
import type Redis from 'ioredis';
import type { FastifyBaseLogger } from 'fastify';
import type { SessionState } from '@warachikuy/shared-types';
import type { GeminiClient } from './gemini-client';
import { GeminiTransientError } from './gemini-client';
import { generatePlan } from './coach.service';
import { readPlan } from './plan-store';
import { persistAggregate } from './metrics-aggregator';

function silentLog(): FastifyBaseLogger {
  const l = {
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn(), fatal: vi.fn(),
    child: () => l, level: 'silent', silent: vi.fn(),
  } as unknown as FastifyBaseLogger;
  return l;
}

function makeState(overrides: Partial<SessionState> = {}): SessionState {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    industry: 'backend', level: 'mid', status: 'ended',
    phase: 'closing', turnNumber: 6, startedAt: 1, token: 'a'.repeat(64), ...overrides,
  };
}

const COACH_OUTPUT = {
  summary: 'Buen desempeno.',
  competencyComments: { fluency: 'fluida', eye_contact: 'sin datos', speech_rate: 'ok', content: 'solido' },
  contentScore: 75,
  strengths: ['claridad'],
  improvements: ['profundizar'],
  exercises: [{ title: 'STAR', description: 'Estructura tus respuestas.' }],
};

describe('generatePlan', () => {
  beforeEach(async () => {
    await (new RedisMock() as unknown as Redis).flushall();
  });

  it('ensambla el plan inyectando los puntajes medidos y lo marca ready', async () => {
    const redis = new RedisMock() as unknown as Redis;
    await persistAggregate(redis, makeState().id, { fluency: 88, eye_contact: null, speech_rate: 62 });
    const gemini: GeminiClient = {
      generate: async () => '',
      generateJson: async () => COACH_OUTPUT,
    };
    await generatePlan({ redis, gemini, log: silentLog() }, makeState(), 'plan-1');
    const rec = await readPlan(redis, makeState().id);
    expect(rec?.status).toBe('ready');
    const comp = Object.fromEntries(rec!.plan!.competencies.map((c) => [c.name, c.score]));
    expect(comp.fluency).toBe(88);          // medido
    expect(comp.eye_contact).toBeNull();     // sin datos
    expect(comp.speech_rate).toBe(62);       // medido
    expect(comp.content).toBe(75);           // del LLM
    expect(rec!.plan!.summary).toBe('Buen desempeno.');
  });

  it('marca failed si el LLM falla tras el reintento', async () => {
    const redis = new RedisMock() as unknown as Redis;
    const generateJson = vi.fn().mockRejectedValue(new GeminiTransientError('net'));
    await generatePlan({ redis, gemini: { generate: async () => '', generateJson }, log: silentLog() }, makeState(), 'plan-1');
    expect(generateJson).toHaveBeenCalledTimes(2); // intento + reintento
    const rec = await readPlan(redis, makeState().id);
    expect(rec?.status).toBe('failed');
  });

  it('marca failed si la salida del LLM no matchea el schema esperado', async () => {
    const redis = new RedisMock() as unknown as Redis;
    const gemini: GeminiClient = { generate: async () => '', generateJson: async () => ({ garbage: true }) };
    await generatePlan({ redis, gemini, log: silentLog() }, makeState(), 'plan-1');
    expect((await readPlan(redis, makeState().id))?.status).toBe('failed');
  });
});
```

- [ ] **Step 2: Run para verificar fallo**

Run: `pnpm --filter @warachikuy/api test interviewer/coach.service`
Expected: FAIL ("Cannot find module './coach.service'").

- [ ] **Step 3: Implementar `apps/api/src/interviewer/coach.service.ts`**

```typescript
import { z } from 'zod';
import { Type } from '@google/genai';
import type Redis from 'ioredis';
import type { FastifyBaseLogger } from 'fastify';
import type { ConversationEntry, ImprovementPlan, SessionState } from '@warachikuy/shared-types';
import { ImprovementPlanSchema } from '@warachikuy/shared-types';
import { GeminiTransientError, type GeminiClient, type GeminiTurn } from './gemini-client.js';
import { readHistory } from './conversation.js';
import { readAggregate, type MetricsAggregate } from './metrics-aggregator.js';
import { buildCoachPrompt } from './prompts.js';
import { setPlanReady, setPlanFailed } from './plan-store.js';

export interface CoachDeps {
  redis: Redis;
  gemini: GeminiClient;
  log: FastifyBaseLogger;
}

// Shape que el LLM debe devolver (subconjunto; los 3 puntajes medidos los pone
// el backend). Se valida con Zod por defensa sobre la salida de Gemini.
const CoachOutputSchema = z.object({
  summary: z.string().min(1),
  competencyComments: z.object({
    fluency: z.string(),
    eye_contact: z.string(),
    speech_rate: z.string(),
    content: z.string(),
  }),
  contentScore: z.number().min(0).max(100),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  exercises: z.array(z.object({ title: z.string(), description: z.string() })),
});
type CoachOutput = z.infer<typeof CoachOutputSchema>;

// responseSchema para el modo JSON de @google/genai (Type es del SDK).
const COACH_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING },
    competencyComments: {
      type: Type.OBJECT,
      properties: {
        fluency: { type: Type.STRING },
        eye_contact: { type: Type.STRING },
        speech_rate: { type: Type.STRING },
        content: { type: Type.STRING },
      },
      required: ['fluency', 'eye_contact', 'speech_rate', 'content'],
    },
    contentScore: { type: Type.NUMBER },
    strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
    improvements: { type: Type.ARRAY, items: { type: Type.STRING } },
    exercises: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { title: { type: Type.STRING }, description: { type: Type.STRING } },
        required: ['title', 'description'],
      },
    },
  },
  required: ['summary', 'competencyComments', 'contentScore', 'strengths', 'improvements', 'exercises'],
};

function toContents(history: ConversationEntry[]): GeminiTurn[] {
  const contents: GeminiTurn[] = history.map((e) => ({
    role: e.role === 'interviewer' ? 'model' : 'user',
    text: e.text,
  }));
  // Turno final que dispara la generacion y garantiza contents no vacio
  // (Gemini rechaza un contents vacio).
  contents.push({ role: 'user', text: 'Genera ahora el plan de mejora de esta entrevista.' });
  return contents;
}

function assemble(
  planId: string,
  sessionId: string,
  out: CoachOutput,
  metrics: MetricsAggregate,
): ImprovementPlan {
  return {
    planId,
    sessionId,
    summary: out.summary,
    competencies: [
      { name: 'fluency', score: metrics.fluency, comment: out.competencyComments.fluency },
      { name: 'eye_contact', score: metrics.eye_contact, comment: out.competencyComments.eye_contact },
      { name: 'speech_rate', score: metrics.speech_rate, comment: out.competencyComments.speech_rate },
      { name: 'content', score: out.contentScore, comment: out.competencyComments.content },
    ],
    strengths: out.strengths,
    improvements: out.improvements,
    exercises: out.exercises,
    generatedAt: Date.now(),
  };
}

// Genera el plan de mejora. Pensada para fire-and-forget desde POST /end: nunca
// rechaza; cualquier fallo termina en setPlanFailed.
export async function generatePlan(
  deps: CoachDeps,
  state: SessionState,
  planId: string,
): Promise<void> {
  const sessionId = state.id;
  try {
    const history = await readHistory(deps.redis, sessionId, deps.log);
    const metrics = await readAggregate(deps.redis, sessionId);
    const systemPrompt = buildCoachPrompt({ industry: state.industry, level: state.level, metrics });
    const contents = toContents(history);

    let raw: unknown;
    try {
      raw = await deps.gemini.generateJson(systemPrompt, contents, COACH_RESPONSE_SCHEMA);
    } catch (err) {
      if (err instanceof GeminiTransientError) {
        deps.log.warn({ err }, 'coach: gemini transient, reintentando una vez');
        raw = await deps.gemini.generateJson(systemPrompt, contents, COACH_RESPONSE_SCHEMA);
      } else {
        throw err;
      }
    }

    const out = CoachOutputSchema.parse(raw);
    const plan = assemble(planId, sessionId, out, metrics);
    ImprovementPlanSchema.parse(plan); // defensa
    await setPlanReady(deps.redis, sessionId, plan);
  } catch (err) {
    deps.log.error({ err, sessionId }, 'fallo la generacion del plan de mejora');
    await setPlanFailed(deps.redis, sessionId, planId);
  }
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm --filter @warachikuy/api test interviewer/coach.service && pnpm --filter @warachikuy/api typecheck`
Expected: PASS, 3 tests. (Si `Type` no se exporta de '@google/genai', leer los tipos del paquete instalado y usar la forma correcta — ej. strings 'OBJECT'/'STRING' o `SchemaType`. Reportar el ajuste.)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/interviewer/coach.service.ts apps/api/src/interviewer/coach.service.test.ts
git commit -m "Se agrega coach.service que genera el ImprovementPlan con Gemini JSON"
```

---

## Task 7: Endpoints REST POST /end y GET /plan

**Files:**
- Modify: `apps/api/src/routes/sessions.ts`
- Test: `apps/api/src/routes/sessions.test.ts`

- [ ] **Step 1: Escribir los tests de integración (append a `routes/sessions.test.ts`)**

Asume que el archivo ya tiene helpers: `buildServer`/`testEnv`/`RedisMock` y un fake de Gemini inyectable. Si no existe un fake con `generateJson`, agregarlo en el setup. Tests:

```typescript
import { readPlan, setPlanReady } from '../interviewer/plan-store';
// (usar el RedisMock inyectado al server como `redis`)

function seedEnded(redis, id) {
  const state = {
    id, industry: 'backend', level: 'mid', status: 'active',
    phase: 'warmup', turnNumber: 0, startedAt: 1, token: 'a'.repeat(64),
  };
  return redis.set(`session:${id}`, JSON.stringify(state), 'EX', 3600);
}

describe('POST /sessions/:id/end y GET /plan', () => {
  it('POST /end devuelve 202 con planId y deja el plan listo (fake)', async () => {
    const id = '550e8400-e29b-41d4-a716-446655440010';
    await seedEnded(redis, id);
    const res = await server.inject({ method: 'POST', url: `/api/v1/sessions/${id}/end` });
    expect(res.statusCode).toBe(202);
    const body = JSON.parse(res.body);
    expect(body.sessionId).toBe(id);
    expect(typeof body.planId).toBe('string');
    // el fake de Gemini resuelve sincronicamente -> el plan deberia quedar ready
    await vi.waitFor(async () => {
      const get = await server.inject({ method: 'GET', url: `/api/v1/sessions/${id}/plan` });
      expect(get.statusCode).toBe(200);
    });
  });

  it('POST /end es idempotente: dos llamadas devuelven el mismo planId', async () => {
    const id = '550e8400-e29b-41d4-a716-446655440011';
    await seedEnded(redis, id);
    const a = JSON.parse((await server.inject({ method: 'POST', url: `/api/v1/sessions/${id}/end` })).body);
    const b = JSON.parse((await server.inject({ method: 'POST', url: `/api/v1/sessions/${id}/end` })).body);
    expect(b.planId).toBe(a.planId);
  });

  it('POST /end de sesion inexistente -> 404', async () => {
    const res = await server.inject({ method: 'POST', url: '/api/v1/sessions/00000000-0000-4000-a000-000000000000/end' });
    expect(res.statusCode).toBe(404);
  });

  it('GET /plan sin /end previo -> 404', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/v1/sessions/00000000-0000-4000-a000-000000000001/plan' });
    expect(res.statusCode).toBe(404);
  });

  it('GET /plan con un generating viejo -> 200 failed (timeout)', async () => {
    const id = '550e8400-e29b-41d4-a716-446655440012';
    // placeholder generating con generatingSince muy viejo
    await redis.set(
      `session:plan:${id}`,
      JSON.stringify({ status: 'generating', planId: 'p', generatingSince: 1 }),
      'EX',
      7200,
    );
    const res = await server.inject({ method: 'GET', url: `/api/v1/sessions/${id}/plan` });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).status).toBe('failed');
  });
});
```

- [ ] **Step 2: Run para verificar fallo**

Run: `pnpm --filter @warachikuy/api test routes/sessions`
Expected: FAIL (404 en /end porque la ruta no existe aun).

- [ ] **Step 3: Implementar las rutas en `apps/api/src/routes/sessions.ts`**

Agregar imports al tope:

```typescript
import crypto from 'node:crypto';
import { SessionStateSchema, WS_CLOSE_CODES } from '@warachikuy/shared-types';
import { tryStartGenerating, readPlan, setPlanFailed } from '../interviewer/plan-store.js';
import { generatePlan } from '../interviewer/coach.service.js';
import { GENERATION_TIMEOUT_SECONDS } from '../interviewer/constants.js';
```

Dentro de `registerSessionsRoutes(server)`, despues del `server.post('/sessions', ...)` existente, agregar:

```typescript
  server.post<{ Params: { sessionId: string } }>(
    '/sessions/:sessionId/end',
    async (req, reply) => {
      const { sessionId } = req.params;
      const raw = await server.redis.get(`session:${sessionId}`);
      if (!raw) {
        return reply.code(404).send(apiError('session_not_found', 'Sesion no encontrada'));
      }
      const parsedState = SessionStateSchema.safeParse(JSON.parse(raw));
      if (!parsedState.success) {
        return reply.code(500).send(apiError('internal_error', 'Estado de sesion corrupto'));
      }
      const state = parsedState.data;

      const planId = crypto.randomUUID();
      const now = Date.now();
      const won = await tryStartGenerating(server.redis, sessionId, planId, now);

      if (!won) {
        // Otro /end ya arranco la generacion: idempotente, devolvemos su planId.
        const existing = await readPlan(server.redis, sessionId);
        return reply.code(202).send({ sessionId, planId: existing?.planId ?? planId });
      }

      // Ganamos el guard: cerramos la sesion y disparamos la generacion async.
      const ended = { ...state, status: 'ended' as const };
      await server.redis.set(`session:${sessionId}`, JSON.stringify(ended), 'EX', 3600);
      server.connections.get(sessionId)?.close(WS_CLOSE_CODES.SESSION_EXPIRED, 'session_ended');

      void generatePlan(
        { redis: server.redis, gemini: server.gemini, log: req.log },
        ended,
        planId,
      ).catch((err) => {
        req.log.error({ err, sessionId }, 'generatePlan rechazo inesperado');
        return setPlanFailed(server.redis, sessionId, planId);
      });

      return reply.code(202).send({ sessionId, planId });
    },
  );

  server.get<{ Params: { sessionId: string } }>(
    '/sessions/:sessionId/plan',
    async (req, reply) => {
      const { sessionId } = req.params;
      const record = await readPlan(server.redis, sessionId);
      if (!record) {
        return reply.code(404).send(apiError('plan_not_found', 'Plan no encontrado'));
      }
      if (record.status === 'ready') {
        return reply.code(200).send({ plan: record.plan });
      }
      if (record.status === 'failed') {
        return reply.code(200).send({ status: 'failed' });
      }
      // generating: si supero el timeout, lo damos por fallido (proceso colgado).
      const age = Date.now() - (record.generatingSince ?? 0);
      if (age > GENERATION_TIMEOUT_SECONDS * 1000) {
        await setPlanFailed(server.redis, sessionId, record.planId);
        return reply.code(200).send({ status: 'failed' });
      }
      return reply.code(202).send({ status: 'generating' });
    },
  );
```

- [ ] **Step 4: Run tests + typecheck + lint**

Run: `pnpm --filter @warachikuy/api test routes/sessions && pnpm --filter @warachikuy/api typecheck && pnpm --filter @warachikuy/api lint`
Expected: PASS. (Si el setup del test de routes no inyecta un fake de Gemini con `generateJson`, agregarlo al `buildServer(testEnv, { redis, gemini })`. Si `server.gemini` no esta disponible en el test, inyectarlo.)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/sessions.ts apps/api/src/routes/sessions.test.ts
git commit -m "Se agregan los endpoints POST /sessions/:id/end y GET /sessions/:id/plan"
```

---

## Task 8: Captura de métricas en el handler del WS

**Files:**
- Modify: `apps/api/src/ws/handler.ts`
- Test: `apps/api/src/ws/handler.test.ts`

- [ ] **Step 1: Modificar `apps/api/src/ws/handler.ts`**

Agregar imports:

```typescript
import { MetricsAggregator, persistAggregate } from '../interviewer/metrics-aggregator.js';
import { METRICS_FLUSH_INTERVAL_MS } from '../interviewer/constants.js';
```

Dentro de `attachHandlers`, despues de `let generating = false;` (cerca del setup), agregar el agregador por conexion:

```typescript
  const metrics = new MetricsAggregator();
  let lastMetricsPersist = 0;
```

En el `on('message')`, dentro del bloque que procesa un mensaje valido (despues del dispatch de `candidate.transcript`), agregar el manejo de `metrics.update`:

```typescript
    if (data.type === 'metrics.update') {
      metrics.add(data.payload);
      const now = Date.now();
      // Throttle: a lo sumo una escritura por METRICS_FLUSH_INTERVAL_MS, en vez
      // de a la frecuencia de los metrics.update (~4 Hz).
      if (now - lastMetricsPersist >= METRICS_FLUSH_INTERVAL_MS) {
        lastMetricsPersist = now;
        void persistAggregate(redis, sessionId, metrics.snapshot()).catch((err: unknown) => {
          log.error({ err }, 'fallo al persistir el agregado de metricas');
        });
      }
    }
```

En el `on('close')`, agregar el flush final (best-effort) junto al cleanup existente:

```typescript
  socket.on('close', (code, reason) => {
    connections.unregister(sessionId, socket);
    generating = false;
    // Flush best-effort del agregado de metricas (la generacion del plan NO
    // depende de esto: lee el agregado throttled).
    void persistAggregate(redis, sessionId, metrics.snapshot()).catch(() => {});
    log.info({ code, reason: reason?.toString() }, 'ws closed');
  });
```

(El comentario placeholder `// metrics.update, turn.event, voice.command y los parciales ...` se actualiza para reflejar que metrics.update ahora SI se procesa; turn.event y voice.command siguen fuera de scope.)

- [ ] **Step 2: Escribir el test de integración (append a `handler.test.ts`)**

```typescript
  it('agrega los metrics.update del candidato y los persiste en Redis', async () => {
    const state = makeState();
    await seedSession(redis, state);
    const received: Array<{ type: string }> = [];
    const ws = new WebSocket(url(state));
    ws.on('message', (d) => received.push(JSON.parse(d.toString())));
    await new Promise<void>((resolve) => ws.once('open', () => resolve()));
    await vi.waitFor(() => expect(received.length).toBeGreaterThanOrEqual(2)); // connect

    ws.send(
      JSON.stringify({
        type: 'metrics.update',
        payload: {
          sessionId: state.id,
          metrics: [
            { name: 'fluency', value: 80, confidence: 'high', timestamp: Date.now() },
            { name: 'eye_contact', value: 60, confidence: 'high', timestamp: Date.now() },
          ],
          collectedAt: Date.now(),
        },
      }),
    );

    // El agregado se persiste throttled; esperamos a que aparezca en Redis.
    await vi.waitFor(async () => {
      const raw = await redis.get(`session:metrics:${state.id}`);
      expect(raw).toBeTruthy();
      const agg = JSON.parse(raw as string);
      expect(agg.fluency).toBe(80);
      expect(agg.eye_contact).toBe(60);
    });
    ws.close();
  });
```

- [ ] **Step 3: Run el suite del handler**

Run: `pnpm --filter @warachikuy/api test ws/handler`
Expected: PASS (los tests previos + el nuevo). Correr 2-3 veces para confirmar estabilidad del vi.waitFor.

- [ ] **Step 4: Run typecheck + lint**

Run: `pnpm --filter @warachikuy/api typecheck && pnpm --filter @warachikuy/api lint`
Expected: limpio.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/ws/handler.ts apps/api/src/ws/handler.test.ts
git commit -m "Se capturan los metrics.update del aura en el handler con persistencia throttled"
```

---

## Task 9: Verificación integral

**Files:** (sin cambios de codigo; solo verificacion)

- [ ] **Step 1: Suite completa del api**

Run: `pnpm --filter @warachikuy/api test`
Expected: PASS, todos los tests (los previos de #16/#17/#34/#39 + los nuevos de #40).

- [ ] **Step 2: Typecheck + lint del monorepo**

Run: `pnpm -r typecheck && pnpm --filter @warachikuy/api lint`
Expected: limpio.

- [ ] **Step 3: Tests de shared-types**

Run: `pnpm --filter @warachikuy/shared-types test`
Expected: PASS (incluye ImprovementPlanSchema).

- [ ] **Step 4: Commit (si quedo algo pendiente, si no, saltar)**

```bash
git status
```

---

## Notas finales

- **Branch:** `feat/improvement-plan` (ya creada, contiene el spec).
- **PR target:** `main`. Crear PR al terminar.
- **No mergear hasta:** suite del api al 100% + typecheck + lint del monorepo verdes.
- **Prueba manual (post-merge, no en CI):** con `GEMINI_API_KEY` real y docker, hacer una entrevista, `POST /end`, y pollear `GET /plan` hasta el 200, verificando que el plan (resumen, competencias, ejercicios) tiene sentido. Es lo unico que valida la calidad del LLM Coach.
- **Gap consciente:** la calidad del contenido del plan no se testea (fake determinista en CI). La race de metricas se resolvio leyendo el agregado throttled (no se depende del flush-on-close); ver spec §3.
- **Depende para integracion:** #42 (frontend de Max) consume `GET /plan` con polling para la pantalla de cierre.
