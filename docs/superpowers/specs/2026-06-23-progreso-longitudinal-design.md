# Backend de progreso longitudinal por competencia (F2 #51)

- **Fecha:** 2026-06-23
- **Rama:** `feat/progreso-longitudinal`
- **Issue:** #51 (milestone F2 Personalizacion)
- **Depende de:** #55 (sesiones durables en Postgres) y #56 (candidate_id + indice)
- **Habilita:** #57 (conectar /progress al historial), #58 (calibracion), #60 (plan relativo)

## 1. Problema

La pantalla `/progress` (MyProgress, mock recuperado en #54) muestra evolucion por
competencia, XP/nivel, racha y logros con datos simulados. Este issue cubre el
backend real de la parte **derivable y honesta**: la evolucion longitudinal por
competencia del candidato, agregada desde su historial, expuesta por un endpoint.

La base ya existe: cada sesion terminada se persiste durable en `interview_sessions`
(#55) con `candidate_id` poblado (#56) y un indice sobre esa columna. El plan
(`ImprovementPlan`) de cada fila trae `competencies[]` con
`{ name: fluency|eye_contact|speech_rate|content, score: 0-100|null, comment }`.

## 2. Decision cerrada (aprobada en brainstorming)

**Solo lo derivable honesto.** El endpoint expone la evolucion por competencia
(serie de score en el tiempo = sparklines) + conteo de sesiones + rango de fechas
+ por competencia el ultimo valor, promedio y delta. **XP/nivel/rank/badges/logros
y la racha quedan para F4 gamificacion (#50)**: derivarlos exigiria inventar un
modelo de gamificacion, lo que violaria la honestidad (RNF14: solo mostrar lo
medido).

## 3. Arquitectura y flujo

```
GET /api/v1/candidates/:candidateId/progress
  └─► listCandidateSessions(db, candidateId)   -- WHERE candidate_id = :id AND plan IS NOT NULL,
  │                                               ORDER BY ended_at ASC (usa el indice de #56)
  └─► buildProgressSummary(candidateId, rows)  -- funcion pura: arma las 4 series + conteos
  └─► 200 ProgressSummary
```

**Sin auth.** El `candidateId` es un uuid anonimo e inadivinable que funciona como
capability de lectura (mismo modelo de confianza que el MVP de #56; auth real es
F5). Se documenta explicito. El uuid va en la URL; al ser de alta entropia, conocerlo
es la condicion de acceso.

## 4. Contrato (shared-types)

Nuevo archivo `packages/shared-types/src/progress.ts`, exportado desde `index.ts`:

```ts
export const ProgressPointSchema = z.object({
  at: z.number().int(),            // ended_at en epoch ms
  score: z.number().min(0).max(100).nullable(),
});

export const CompetencyProgressSchema = z.object({
  name: CompetencyNameSchema,      // reusa el enum de llm.ts
  points: z.array(ProgressPointSchema),  // cronologico ascendente = sparkline
  latest: z.number().min(0).max(100).nullable(),
  average: z.number().min(0).max(100).nullable(),  // media de los no-null, redondeada
  delta: z.number().nullable(),    // latest - anterior no-null; null si <2 no-null
});

export const ProgressSummarySchema = z.object({
  candidateId: z.string().uuid(),
  sessionCount: z.number().int().nonnegative(),   // sesiones CON plan
  firstSessionAt: z.number().int().nullable(),
  lastSessionAt: z.number().int().nullable(),
  competencies: z.array(CompetencyProgressSchema),  // SIEMPRE las 4, orden fijo
});
export type ProgressSummary = z.infer<typeof ProgressSummarySchema>;
```

Shape estable para el frontend: `competencies` trae **siempre las 4** (fluency,
eye_contact, speech_rate, content) aunque esten vacias. Candidato nuevo / sin
sesiones con plan -> `sessionCount 0`, `firstSessionAt/lastSessionAt null`, cada
competencia con `points []` y `latest/average/delta null`. Estado vacio honesto.

## 5. Componentes (cada uno una responsabilidad)

- **`apps/api/src/db/session-archive.ts`** gana
  `listCandidateSessions(db, candidateId): Promise<InterviewSessionRow[]>`:
  `SELECT * FROM interview_sessions WHERE candidate_id = :id AND plan IS NOT NULL
  ORDER BY ended_at ASC`. Usa `isNotNull` de drizzle para el filtro del plan.
- **`apps/api/src/interviewer/progress-aggregator.ts`** (nuevo, puro):
  `buildProgressSummary(candidateId: string, rows: InterviewSessionRow[]): ProgressSummary`.
  Recorre las filas (ya ordenadas), extrae de cada `row.plan.competencies` el score
  por competencia + `row.endedAt`, arma las 4 series y calcula latest/average/delta
  y los conteos/fechas. No toca Fastify ni la DB.
- **`apps/api/src/routes/progress.ts`** (nuevo): `registerProgressRoutes(server)`
  registra `GET /candidates/:candidateId/progress`. Valida `candidateId` como uuid
  (Zod; 400 `invalid_input` si no), llama al repo + aggregator, responde 200. Se
  monta en `server.ts` bajo el mismo prefijo `/api/v1` que las rutas de sesiones.

## 6. Reglas de agregacion (precisas)

Para cada una de las 4 competencias, en orden cronologico (filas por `ended_at` asc):

- `points`: un punto `{ at: row.endedAt (epoch ms), score }` por cada sesion, donde
  `score` es el de esa competencia en `row.plan.competencies` (o `null` si la
  competencia no aparece o su score es null). Se incluyen TODAS las sesiones con
  plan (un null en una sesion es un hueco honesto en el sparkline).
- `latest`: el ultimo `score` no-null de la serie (o null si todos son null).
- `average`: media de los scores no-null, redondeada a entero (consistente con como
  el plan ya redondea); null si no hay ninguno.
- `delta`: `latest - (anterior score no-null)`; null si hay menos de 2 no-null.

`sessionCount` = cantidad de filas (todas tienen plan por el filtro).
`firstSessionAt`/`lastSessionAt` = `endedAt` de la primera/ultima fila (null si no hay).

`endedAt` es un `Date` (columna timestamptz); se serializa a epoch ms con
`.getTime()` al construir los puntos.

## 7. Manejo de errores

- `candidateId` no-uuid -> `400 invalid_input` (Zod, mismo envelope `apiError`).
- Fallo de lectura a Postgres -> `500 internal_error`. A diferencia del archivo
  no-fatal de #55, esto SI es el camino critico de un request: si la lectura falla,
  no hay respuesta valida. El handler global de errores ya devuelve el envelope.
- Candidato desconocido / sin sesiones con plan -> `200` con summary vacio (NO 404):
  "todavia no hay datos" es un estado valido para un candidato nuevo.

## 8. Pruebas (vitest + pglite + ioredis-mock)

- **aggregator (unit, sin DB):** dadas filas armadas a mano:
  - varias sesiones -> series en orden cronologico, `latest`/`average`/`delta`
    correctos; una competencia con score null en una sesion -> hueco en points y se
    excluye de average/latest; las 4 competencias siempre presentes.
  - filas vacias -> summary vacio (sessionCount 0, fechas null, series vacias).
- **listCandidateSessions (pglite):** devuelve solo las filas con plan de ESE
  candidato, ordenadas por `ended_at`; excluye otros candidatos y filas con plan null.
- **route (integration, server + pglite + ioredis-mock):** sembrar 2 sesiones del
  candidato (archiveSession + updateArchivedPlan con planes de distinto score), GET
  progress -> shape y valores correctos (delta entre las dos sesiones); candidato
  desconocido -> 200 summary vacio; uuid invalido -> 400.
- Suite completa, lint, typecheck y build verdes.

## 9. Fuera de alcance (explicito)

- XP / nivel / rank / badges / logros / **racha** -> F4 gamificacion (#50).
- Auth / ownership mas alla del uuid anonimo -> F5.
- El cableado del frontend `/progress` -> #57 (Max).
- Paginacion y filtros por industria/nivel (YAGNI; se devuelve todo el historial).
- Indice parcial sobre `candidate_id` (nota de la revision de #56): si el volumen
  anonimo crece, evaluarlo; no es necesario para este slice.

## 10. Entrega

Rama `feat/progreso-longitudinal` -> PR contra `main` -> revision del equipo ->
merge. No cierra F2; habilita el frontend de progreso (#57) y alimenta #58/#60.
