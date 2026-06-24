# Plan de mejora relativo a la linea base del candidato — Diseño

**Fecha:** 2026-06-24
**Issue:** #60 (F2 Personalizacion)
**Estado:** Aprobado
**Alcance:** Backend (apps/api). Sin cambios en shared-types ni frontend.

## 0. Contexto y objetivo

Hoy el LLM Coach (`apps/api/src/interviewer/coach.service.ts`) evalua cada
sesion de forma aislada: el plan de mejora no sabe si el candidato mejoro o
empeoro respecto a su historial. Con la persistencia durable (#55), la
identidad anonima del candidato (#56) y la agregacion longitudinal (#51) ya
mergeadas, podemos pasarle al coach la **linea base** del candidato (su
promedio previo por competencia) para que el plan hable de **mejora relativa**.

**Criterio de cierre (del issue):** cuando existen sesiones previas, el plan
menciona la tendencia por competencia (subio / bajo / se mantuvo respecto a su
promedio previo); cuando no, lo dice honestamente (no inventa tendencia).

**Guardia RNF14:** solo se compara lo realmente medido. Nunca se afirma una
tendencia para una competencia sin linea base, ni se inventan numeros.

## 1. Decisiones de diseño

- **Referencia de comparacion:** el **promedio de TODAS las sesiones previas con
  plan** (no la ultima sesion). Reusa el campo `average` por competencia que ya
  calcula `buildProgressSummary` (#51).
- **Donde vive la tendencia:** en la **prosa** del plan (resumen, comentario por
  competencia, aspectos a mejorar). NO se agrega un campo estructurado al
  `ImprovementPlan`: el criterio de cierre es sobre el contenido del plan y el
  issue es `module:backend`. Por eso no se tocan `shared-types` ni el frontend.
- **Como se calcula la tendencia:** enfoque "comparacion en el prompt". El
  backend coloca en el prompt, por competencia, el valor actual (los 3 medidos
  ya aparecen hoy) junto al **promedio previo real**, e instruye al LLM a
  describir la direccion. Ambos numeros son reales y estan presentes, asi que el
  LLM solo describe; no inventa ni hace aritmetica a ciegas. Para `content`, el
  LLM dispone del promedio previo y de su propio score nuevo.
- **Exclusion de la sesion actual:** en `POST /end` la sesion actual se archiva
  con `plan = null` ANTES de disparar `generatePlan` (`routes/sessions.ts:107`),
  y `listCandidateSessions` filtra `plan IS NOT NULL`. Por lo tanto la sesion
  actual queda excluida de la linea base sin logica extra.

## 2. Arquitectura y flujo de datos

```
POST /end
  -> archiveSession(db, { ..., plan implicitamente null })
  -> generatePlan({ redis, gemini, log, db }, ended, planId)   (fire-and-forget)
       1. history  = readHistory(redis, sessionId)
       2. metrics  = readAggregate(redis, sessionId)
       3. baseline = undefined
          si ended.candidateId:
            try:
              priorRows = listCandidateSessions(db, ended.candidateId)  // plan IS NOT NULL, asc
              baseline  = buildBaseline(ended.candidateId, priorRows)
            catch: log no-fatal; baseline queda undefined (plan absoluto)
       4. systemPrompt = buildCoachPrompt({ industry, level, metrics, baseline })
       5. raw  = gemini.generateJson(systemPrompt, contents, COACH_RESPONSE_SCHEMA)
       6. plan = assemble(...)  (sin cambios)
       7. setPlanReady + updateArchivedPlan  (sin cambios)
```

`generatePlan` sigue sin rechazar nunca; cualquier fallo termina en
`setPlanFailed` igual que hoy. La obtencion de la linea base es best-effort: si
Postgres no esta disponible, se genera el plan absoluto.

## 3. Unidades (archivos)

### 3.1 `apps/api/src/interviewer/baseline.ts` (NUEVO, puro)

```ts
import type { CompetencyName } from '@warachikuy/shared-types';
import type { InterviewSessionRow } from '../db/schema.js';

export interface CompetencyBaseline {
  name: CompetencyName;
  priorAverage: number | null; // promedio previo redondeado; null si no hay medicion previa
}

export interface CoachBaseline {
  priorSessionCount: number;        // sesiones previas con plan
  competencies: CompetencyBaseline[]; // siempre las 4, orden fijo
}

// Deriva la linea base reusando buildProgressSummary (#51). Funcion pura.
export function buildBaseline(
  candidateId: string,
  priorRows: InterviewSessionRow[],
): CoachBaseline;
```

`buildBaseline` llama a `buildProgressSummary(candidateId, priorRows)` y mapea
cada `CompetencyProgress` a `{ name, priorAverage: average }`;
`priorSessionCount = summary.sessionCount`.

### 3.2 `apps/api/src/interviewer/prompts.ts` (MODIFICA)

- `CoachPromptInput` gana `baseline?: CoachBaseline`.
- `buildCoachPrompt` agrega una seccion "Linea base" segun el caso:
  - **`baseline` presente y `priorSessionCount >= 1`:** lista el promedio previo
    por competencia (`fmtMetric(priorAverage)`, que ya imprime `sin datos`
    cuando es null), e instruye: "Para cada competencia con linea base, indica
    en su comentario si mejoro, empeoro o se mantuvo respecto a su promedio
    previo, y refleja la tendencia en el resumen y en los aspectos a mejorar. NO
    afirmes ninguna tendencia para una competencia sin linea base."
  - **`baseline` presente y `priorSessionCount === 0`:** una linea —
    "Es la primera sesion del candidato (sin linea base): evalua en terminos
    absolutos y no afirmes ninguna tendencia respecto a sesiones anteriores."
  - **`baseline` ausente (sesion sin `candidateId`):** sin cambios respecto a
    hoy; el prompt no menciona tendencia (honesto por omision).

### 3.3 `apps/api/src/interviewer/coach.service.ts` (MODIFICA)

En `generatePlan`, tras leer `metrics`, construir el `baseline` cuando
`state.candidateId` exista (con `listCandidateSessions` envuelto en try/catch
no fatal) y pasarlo a `buildCoachPrompt`. Importa `listCandidateSessions` de
`../db/session-archive.js` y `buildBaseline` de `./baseline.js`.

## 4. Manejo de errores

| Situacion | Comportamiento |
|---|---|
| Sin `candidateId` | `baseline = undefined` -> plan absoluto (sin tendencia) |
| `candidateId` sin sesiones previas con plan | `priorSessionCount = 0` -> el prompt dice "primera sesion" honestamente |
| Competencia sin medicion previa | `priorAverage = null` -> "sin linea base" para esa competencia |
| Postgres caido al leer historial | try/catch no fatal -> plan absoluto |
| Fallo de Gemini / parse | `setPlanFailed` (igual que hoy) |

## 5. Testing

- **`baseline.test.ts` (nuevo):** `buildBaseline` sobre filas con planes ->
  promedio previo correcto por competencia y `priorSessionCount`; filas vacias
  -> count 0 y todas `priorAverage = null`; competencia con scores null en las
  previas -> `priorAverage = null`.
- **`prompts.test.ts` (extiende):** `buildCoachPrompt` con baseline
  (`count >= 1`) incluye la seccion de linea base con los promedios previos y la
  instruccion de tendencia; con `count === 0` incluye la linea de "primera
  sesion"; sin baseline el prompt no menciona tendencia (comportamiento actual).
- **`coach.service.test.ts` (extiende):** con `candidateId` y pglite
  (`makeTestDb`) sembrado con sesiones previas archivadas con plan,
  `generatePlan` llama a `listCandidateSessions` y el `systemPrompt` capturado
  por un fake `gemini` contiene los promedios previos; sin `candidateId` el
  prompt no cambia; con Postgres que lanza, se cae con gracia al plan absoluto y
  el plan igual se genera.

## 6. Fuera de alcance

- Campo estructurado de tendencia en `ImprovementPlan` y flechas en el frontend.
- Calibracion de nivel del candidato (#58).
- Comparar contra la ultima sesion en vez del promedio.
