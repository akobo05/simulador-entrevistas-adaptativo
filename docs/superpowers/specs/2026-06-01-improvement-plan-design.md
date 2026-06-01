# Diseño del plan de mejora (Issue #40)

La pantalla de cierre de F1: tras la entrevista, el LLM Coach genera una retroalimentación multimodal (verbal + métricas del aura) que el candidato consulta. Cierra el ciclo de valor del producto (RF-07, CU03/CU04 del informe PC02). Depende del historial que persiste el LLM entrevistador (#39).

## 1. Contrato: `ImprovementPlan` (shared-types)

```typescript
// packages/shared-types/src/llm.ts
export const CompetencyNameSchema = z.enum(['fluency', 'eye_contact', 'speech_rate', 'content']);

export const PlanCompetencySchema = z.object({
  name: CompetencyNameSchema,
  score: z.number().min(0).max(100).nullable(), // null si no se midio (sin datos)
  comment: z.string(),
});

export const PlanExerciseSchema = z.object({
  title: z.string(),
  description: z.string(),
});

export const ImprovementPlanSchema = z.object({
  planId: z.string().uuid(),
  sessionId: z.string().uuid(),
  summary: z.string(),
  competencies: z.array(PlanCompetencySchema), // las 4 del prototipo
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  exercises: z.array(PlanExerciseSchema),
  generatedAt: z.number().int(),
});
export type ImprovementPlan = z.infer<typeof ImprovementPlanSchema>;
```

Decisiones del contrato:

- **4 competencias** = los 4 anillos del prototipo: `fluency`, `eye_contact`, `speech_rate` (medidas por el aura) + `content` (puntuada por el LLM evaluando las respuestas).
- Los 3 puntajes medidos vienen del **promedio real del aura** (computado, no el LLM). El `content` lo puntúa el LLM. Todos los `comment` los redacta el LLM.
- `score` es `nullable`: si una métrica no tuvo muestras (el cliente no envió `metrics.update`, o baja confianza), queda `null` y el frontend la renderiza en neutro; el `comment` lo aclara.
- Sin línea base ni comparación entre sesiones (F2). F1 = puntajes absolutos de la sesión.

## 2. Generación con Gemini en modo JSON estructurado

El `GeminiClient` de #39 solo expone `generate(systemPrompt, contents): Promise<string>`. Se extiende con:

```typescript
generateJson(systemPrompt: string, contents: GeminiTurn[], responseSchema: unknown): Promise<unknown>;
```

Usa el structured output de `@google/genai` (`config: { responseMimeType: 'application/json', responseSchema }`). Gemini garantiza JSON válido conforme al schema, evitando el parseo frágil de texto libre. La salida igual se valida con Zod por defensa (un JSON conforme al responseSchema pero con un valor fuera de rango se rechaza).

El LLM NO devuelve el `ImprovementPlan` completo: devuelve solo el subconjunto que le corresponde generar. El backend ensambla el plan final inyectando los puntajes medidos. Shape que pide el responseSchema:

```typescript
// salida del LLM Coach
{
  summary: string,
  competencyComments: { fluency: string, eye_contact: string, speech_rate: string, content: string },
  contentScore: number,            // 0-100, lo unico que el LLM puntua
  strengths: string[],
  improvements: string[],
  exercises: { title: string, description: string }[],
}
```

Ensamblado del `ImprovementPlan`:

```
competencies = [
  { name: 'fluency',     score: aggregate.fluency,     comment: out.competencyComments.fluency },
  { name: 'eye_contact', score: aggregate.eye_contact, comment: out.competencyComments.eye_contact },
  { name: 'speech_rate', score: aggregate.speech_rate, comment: out.competencyComments.speech_rate },
  { name: 'content',     score: out.contentScore,      comment: out.competencyComments.content },
]
```

El Coach recibe los valores medidos en el prompt (para comentarlos con criterio), pero no los puntúa él.

## 3. Captura de métricas del aura (cambio al handler de #39)

El handler del WS hoy ignora `metrics.update`. Ahora lo procesa con un agregador:

`apps/api/src/interviewer/metrics-aggregator.ts`:

- Mantiene un **promedio corriente en memoria** por métrica (`fluency`, `eye_contact`, `speech_rate`): suma + cuenta por nombre. Solo cuenta muestras con confianza suficiente (la spec arquitectónica 3.1: una métrica de baja confianza se omite del array, así que ya llegan filtradas).
- Persiste el agregado a Redis (`session:metrics:<id>`) con **throttle (a lo sumo 1 escritura/s)** y un flush final en el `close` del socket. Evita las 4 escrituras/s que #39 descartó, y mantiene Redis casi-fresco para que `/end` lea sin depender del orden WS-vs-/end.
- `readAggregate(redis, sessionId)` devuelve `{ fluency: number|null, eye_contact: number|null, speech_rate: number|null }` (null si una métrica no tuvo muestras).

El único cambio del handler es procesar `metrics.update` (antes ignorado) hacia el agregador, más el flush en `close`. La actividad post-cierre se cubre sin tocar el handler (ver §6).

## 4. Endpoints REST (en `routes/sessions.ts`, prefijo `/api/v1`)

```
POST /api/v1/sessions/:sessionId/end
  - lee session:<id>; si no existe -> 404 session_not_found
  - si status ya es 'ended' (idempotente): devuelve el planId ya guardado -> 200 { sessionId, planId }
  - si status 'active':
      status -> 'ended' (persiste SessionState)  // ANTES de cerrar el WS
      cierra el WS si esta abierto:
        server.connections.get(id)?.close(WS_CLOSE_CODES.SESSION_EXPIRED, 'session_ended')
      genera planId (uuid); guarda placeholder { status: 'generating' } en session:plan:<id>
      dispara la generacion ASYNC (fire-and-forget, con catch -> failed)
      -> 200 { sessionId, planId }

GET /api/v1/sessions/:sessionId/plan
  - lee session:plan:<id>
  - sin registro (nunca se llamo /end) -> 404 plan_not_found
  - status 'generating' -> 202 { status: 'generating' }   (el frontend hace polling cada 1.5s)
  - status 'ready'      -> 200 { plan: ImprovementPlan }
  - status 'failed'     -> 500 ApiError { code: 'plan_generation_failed' }
```

`POST /end` persiste `status: 'ended'` y CIERRA el WS para un lifecycle limpio: terminar la sesión termina la conexión, y el `close` del socket dispara el flush final de métricas. Se reusa `WS_CLOSE_CODES.SESSION_EXPIRED` (4001) como código de cierre: su comportamiento en el frontend (no reconectar, cierre intencional) aplica igual al cierre por `/end`, así no agregamos un código nuevo. El orden importa: primero se persiste `status='ended'` y después se cierra el socket, para que cualquier intento de reconexión sea rechazado (ver §6).

## 5. Generación async + persistencia del plan

`apps/api/src/interviewer/plan-store.ts` — persistencia en Redis:

- Key `session:plan:<id>`, valor `{ status: 'generating' | 'ready' | 'failed', plan?: ImprovementPlan }` serializado, TTL alineado a la sesión (`SESSION_REFRESH_TTL_SECONDS`).
- `setGenerating`, `setReady(plan)`, `setFailed`, `read(): { status, plan? } | null`.

`apps/api/src/interviewer/coach.service.ts` — generación:

```
generatePlan(deps, sessionId, planId):
  1. history = readHistory(redis, sessionId)     // reusa #39
  2. metrics = readAggregate(redis, sessionId)
  3. systemPrompt = buildCoachPrompt({ industry, level, metrics })  // prompts.ts
  4. out = generateJson(gemini, systemPrompt, historyAsContents, COACH_RESPONSE_SCHEMA)
  5. plan = assemble(planId, sessionId, out, metrics)   // inyecta los 3 puntajes medidos
  6. validar con ImprovementPlanSchema
  7. planStore.setReady(plan)
  on error (tras 1 reintento del transitorio): planStore.setFailed
```

- La generación es UNA llamada a Gemini (acotada por el timeout de 15s de #39).
- Fire-and-forget desde `/end`: `void generatePlan(...).catch(logAndSetFailed)`. No se await en el request.
- **Trade-off F1 (documentado):** si el proceso muere a mitad, el registro queda en `generating`. Mitigaciones: TTL del registro (un `generating` colgado expira y el GET pasa a 404), y el timeout de Gemini acota la llamada. Sin job queue (BullMQ es F2+, spec arquitectónica 1.x). El frontend deja de pollear tras un timeout suave.

## 6. Defensa contra actividad post-cierre

La sesión cerrada no debe seguir aceptando turnos. Tres capas, todas ya disponibles, sin agregar un Redis-read por mensaje:

1. **`/end` cierra el WS** (§4): el socket se cae, así que no llegan más `candidate.transcript` por esa conexión.
2. **Reconexión rechazada en el handshake:** `validateUpgrade` (de #17) ya rechaza con `410 session_expired` cualquier sesión cuyo `status !== 'active'`. Como `/end` persiste `status='ended'` ANTES de cerrar el socket, un intento de reconectar a la sesión terminada es rechazado en el upgrade.
3. **Transcript en vuelo:** si un `candidate.transcript` viajaba justo cuando `/end` cerró el socket, el orquestador de #39 ya verifica `socket.readyState === OPEN` antes de persistir/enviar y no avanza el turno.

No se agrega un chequeo de `status` por mensaje en el handler: el `SessionState` que el handler tiene en memoria es del upgrade (sería stale tras `/end`), y releer Redis en cada mensaje (4 Hz) es el costo que evitamos. Las tres capas de arriba cubren el caso.

## 7. Prompt del Coach

`apps/api/src/interviewer/prompts.ts` agrega `buildCoachPrompt({ industry, level, metrics })`. Rol distinto al entrevistador:

- Es un coach de carrera que da retroalimentación constructiva tras una entrevista de `industry`/`level`.
- Recibe los puntajes medidos (fluency/eye_contact/speech_rate, o "sin datos") para comentarlos con criterio, sin re-puntuarlos.
- Puntúa la competencia `content` (calidad de las respuestas) de 0 a 100.
- Tono: alentador pero honesto, en español neutro. Sin inventar datos que no estén en el transcript ni en las métricas.
- Resistencia a prompt injection: el transcript del candidato viaja como turnos `user` (igual que en #39), nunca en el system prompt.

## 8. Estructura de archivos

```
packages/shared-types/src/llm.ts          (modifica) ImprovementPlan + Competency + Exercise schemas
apps/api/src/interviewer/
├── gemini-client.ts                       (modifica) + generateJson(systemPrompt, contents, responseSchema)
├── gemini-client.test.ts                  (modifica)
├── prompts.ts                             (modifica) + buildCoachPrompt
├── prompts.test.ts                        (modifica)
├── metrics-aggregator.ts                  (nuevo) promedio corriente + persistencia throttled
├── metrics-aggregator.test.ts             (nuevo)
├── coach.service.ts                       (nuevo) generatePlan (history+metrics -> Gemini -> ImprovementPlan)
├── coach.service.test.ts                  (nuevo) con fake de Gemini
├── plan-store.ts                          (nuevo) persistencia Redis del plan + status
└── plan-store.test.ts                     (nuevo) con ioredis-mock
apps/api/src/routes/sessions.ts            (modifica) POST /end, GET /plan
apps/api/src/routes/sessions.test.ts       (modifica) integration de /end y /plan
apps/api/src/ws/handler.ts                 (modifica) captura metrics.update -> aggregator; flush en close
apps/api/src/ws/handler.test.ts            (modifica)
```

## 9. Testing

- **Fake de Gemini** con `generateJson` determinista (devuelve un objeto fijo) — sin API real en CI, como #39.
- **Unit:**
  - `metrics-aggregator`: promedio corriente correcto; null cuando no hubo muestras; throttle de escrituras.
  - `plan-store`: transiciones generating -> ready/failed; read devuelve null sin registro.
  - `coach.service`: ensambla el plan inyectando los 3 puntajes medidos + el content del LLM; valida contra ImprovementPlanSchema; fallo del LLM -> setFailed.
  - `prompts`: buildCoachPrompt incluye industria/nivel y los valores medidos; instruye no re-puntuar; anti-injection.
  - `generateJson`: pasa responseSchema al SDK; valida el shape (con el SDK mockeado).
- **Integration (routes):** POST /end -> 200 planId; GET /plan -> 202 (generating) luego 200 (ready) con el fake; /end idempotente (segundo /end devuelve el mismo planId); /end de sesión inexistente -> 404; GET /plan sin /end previo -> 404; /end cierra el WS (verificar con un cliente ws real).
- **No se testea la calidad del contenido del LLM** (manual, como #39, con `GEMINI_API_KEY` real).

## 10. Lo que queda fuera de scope

- Línea base / comparación entre sesiones (F2: requiere historial persistente).
- PostgreSQL / drizzle para el plan (F2; F1 usa Redis con TTL).
- Job queue (BullMQ) para la generación (F2+; F1 usa fire-and-forget single-instance).
- Render de los anillos, polling del frontend, TTS del plan (frontend de Max, integración #42).
- Regeneración manual del plan / reintento desde el cliente si quedó `failed` (F1: el candidato re-crea una sesión).

## 11. Issues que cierra

- Issue #40 — [F1] Plan de mejora: `POST /sessions/:id/end` y `GET /sessions/:id/plan`.
