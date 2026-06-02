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

Este shape entra limpio en el subconjunto de responseSchema de `@google/genai` (Type.OBJECT con propiedades fijas, Type.ARRAY, Type.STRING, Type.NUMBER): no usa claves dinámicas ni campos nullable (los `score: null` los pone el backend al ensamblar, no el LLM). `competencyComments` es un objeto con 4 claves fijas conocidas.

## 3. Captura de métricas del aura (cambio al handler de #39)

El handler del WS hoy ignora `metrics.update`. Ahora lo procesa con un agregador:

`apps/api/src/interviewer/metrics-aggregator.ts`:

- Mantiene un **promedio corriente en memoria** por métrica (`fluency`, `eye_contact`, `speech_rate`): suma + cuenta por nombre. Solo cuenta muestras con confianza suficiente (la spec arquitectónica 3.1: una métrica de baja confianza se omite del array, así que ya llegan filtradas).
- Persiste el agregado a Redis (`session:metrics:<id>`) con **throttle (a lo sumo 1 escritura/s)**. Un flush en el `close` del socket es best-effort para el último tramo, pero NO es una dependencia (ver el párrafo de la race abajo).
- `readAggregate(redis, sessionId)` devuelve `{ fluency: number|null, eye_contact: number|null, speech_rate: number|null }` (null si una métrica no tuvo muestras).

**Evitar la race flush-vs-generación.** El agregador NO depende del flush-on-close: la generación del plan lee de Redis el agregado escrito por el throttle (≤1s de antigüedad), sin esperar a que el `close` del socket termine de escribir. Razón: `/end` cierra el WS y dispara la generación async casi al mismo tiempo; si la generación dependiera del flush-on-close, podría leer antes de que ese flush escriba y usar métricas viejas. Al leer siempre el agregado throttled, el peor caso es perder ≤1s de cola de métricas — despreciable sobre un promedio de 5-7 min, y sin race entre contextos. El flush-on-close solo mejora el resultado cuando alcanza a escribir antes de la lectura; nunca es necesario.

El único cambio del handler es procesar `metrics.update` (antes ignorado) hacia el agregador, más el flush best-effort en `close`. La actividad post-cierre se cubre sin tocar el handler (ver §6).

## 4. Endpoints REST (en `routes/sessions.ts`, prefijo `/api/v1`)

```
POST /api/v1/sessions/:sessionId/end
  - lee session:<id>; si no existe -> 404 session_not_found
  - genera planId (uuid) y arma el placeholder { status:'generating', planId, generatingSince: now }
  - GUARD ATOMICO: SET session:plan:<id> <placeholder> NX EX PLAN_TTL_SECONDS
      - si NX gano (primer /end de esta sesion):
          status -> 'ended' (persiste SessionState)  // antes de cerrar el WS
          cierra el WS: server.connections.get(id)?.close(WS_CLOSE_CODES.SESSION_EXPIRED, 'session_ended')
          dispara la generacion ASYNC (fire-and-forget, con catch -> setFailed)
          -> 202 { sessionId, planId }
      - si NX perdio (ya habia un /end): lee el placeholder existente y
          -> 202 { sessionId, planId: existente.planId }   (idempotente)

GET /api/v1/sessions/:sessionId/plan
  - lee session:plan:<id>
  - sin registro (nunca se llamo /end) -> 404 plan_not_found
  - status 'ready'      -> 200 { plan: ImprovementPlan }
  - status 'failed'     -> 200 { status: 'failed' }
  - status 'generating':
      - si now - generatingSince > GENERATION_TIMEOUT_SECONDS -> 200 { status: 'failed' }
        (timeout: el proceso pudo morir a mitad; acota el polling sin depender del frontend)
      - si no -> 202 { status: 'generating' }
```

Decisiones del contrato:

- **`POST /end` devuelve `202`** (no 200): la sesión se cierra sincrónicamente, pero el plan se crea de forma async; `202 Accepted` refleja "pedido aceptado, consultá `/plan`".
- **Idempotencia y concurrencia por `SET NX` atómico** sobre `session:plan:<id>`. Si dos `POST /end` llegan casi simultáneos (reintento del cliente), solo uno gana el `NX` y dispara la generación; el otro lee el placeholder y devuelve el mismo `planId`. Sin doble llamada al LLM ni planId pisado. El `status='ended'` del SessionState es idempotente (se escribe igual), pero el guard real de la generación es el `NX` del plan.
- **`GET /plan` con `failed` devuelve `200 { status:'failed' }`, no 500.** Así el frontend que pollea distingue un fallo terminal del plan (deja de pollear) de un 5xx de red/servidor (reintenta). Los 5xx quedan reservados para excepciones no atrapadas.
- **`generatingSince` + `GENERATION_TIMEOUT_SECONDS`**: si un `generating` queda colgado (el proceso murió a mitad), el `GET /plan` lo fuerza a `failed` tras el timeout (holgado sobre los 15s de Gemini, ej. 45s), sin depender de que el frontend deje de pollear.
- **Cierre del WS:** se reusa `WS_CLOSE_CODES.SESSION_EXPIRED` (4001); su comportamiento en el frontend (no reconectar) aplica igual al cierre por `/end`. El orden importa: primero `status='ended'`, después cerrar el socket, para que una reconexión sea rechazada (ver §6).
- **Rate-limit:** `GET /plan` se pollea cada 1.5s, pero acotado por `GENERATION_TIMEOUT_SECONDS` (~45s) son ~30 requests por plan — muy por debajo del límite global de 1000/h por IP (#34). No requiere override propio en F1.
- **Si el candidato nunca llama `/end`** (cierra el tab): la sesión expira por TTL sin generar plan. Aceptado para F1; no hay job que auto-cierre sesiones huérfanas (eso es F2+).

## 5. Generación async + persistencia del plan

`apps/api/src/interviewer/plan-store.ts` — persistencia en Redis:

- Key `session:plan:<id>`, valor `{ status: 'generating' | 'ready' | 'failed', planId, generatingSince, plan?: ImprovementPlan }` serializado.
- **TTL propio del plan (`PLAN_TTL_SECONDS`), desacoplado del TTL de la sesión.** Si fuera igual al de la sesión (1h) y la generación tardara, el plan podría desaparecer mientras el candidato lo consulta. El plan vive su propia ventana holgada desde que se crea (ej. 2h), independiente de que la sesión expire. Al `setReady` se renueva ese TTL para dar margen de lectura.
- `setReady(plan)` (status ready + plan, renueva TTL), `setFailed`, `read(): { status, planId, generatingSince, plan? } | null`. El placeholder inicial lo crea el `SET NX` de `/end` (§4), no `plan-store`.

`apps/api/src/interviewer/coach.service.ts` — generación:

```
generatePlan(deps, sessionId, planId):
  1. history = readHistory(redis, sessionId)        // reusa #39
  2. metrics = readAggregate(redis, sessionId)       // agregado throttled, sin esperar el flush-on-close (§3)
  3. systemPrompt = buildCoachPrompt({ industry, level, metrics })  // prompts.ts
  4. out = generateJson(gemini, systemPrompt, historyAsContents, COACH_RESPONSE_SCHEMA)
  5. plan = assemble(planId, sessionId, out, metrics)   // inyecta los 3 puntajes medidos
  6. validar con ImprovementPlanSchema
  7. planStore.setReady(plan)
  on GeminiBlockedError o tras 1 reintento del transitorio: planStore.setFailed
```

- La generación es UNA llamada a Gemini (acotada por el timeout de 15s de #39); reusa el reintento-1-vez de `generateWithRetry`.
- Fire-and-forget desde `/end`: `void generatePlan(...).catch(logAndSetFailed)`. No se await en el request.
- **Bloqueo por safety / salida pobre:** un `GeminiBlockedError` -> `setFailed` (a diferencia del entrevistador, acá no hay fallback de reformulación: el plan se genera una vez al cierre). El GET devuelve `200 { status:'failed' }` y el frontend muestra que el plan no se pudo generar.
- **Proceso muere a mitad:** el registro queda en `generating`, pero el `generatingSince` + `GENERATION_TIMEOUT_SECONDS` del `GET /plan` (§4) lo fuerza a `failed` tras el timeout, sin depender del frontend ni del TTL. Sin job queue (BullMQ es F2+, spec arquitectónica 1.x).

## 6. Defensa contra actividad post-cierre

La sesión cerrada no debe seguir aceptando turnos. Tres capas, todas ya disponibles, sin agregar un Redis-read por mensaje:

1. **`/end` cierra el WS** (§4): el socket se cae, así que no llegan más `candidate.transcript` por esa conexión.
2. **Reconexión rechazada en el handshake:** `validateUpgrade` (de #17) ya rechaza con `410 session_expired` cualquier sesión cuyo `status !== 'active'`. Como `/end` persiste `status='ended'` ANTES de cerrar el socket, un intento de reconectar a la sesión terminada es rechazado en el upgrade.
3. **Transcript en vuelo:** si un `candidate.transcript` viajaba justo cuando `/end` cerró el socket, el orquestador de #39 ya verifica `socket.readyState === OPEN` antes de persistir/enviar y no avanza el turno.

No se agrega un chequeo de `status` por mensaje en el handler: el `SessionState` que el handler tiene en memoria es del upgrade (sería stale tras `/end`), y releer Redis en cada mensaje (4 Hz) es el costo que evitamos. Las tres capas de arriba cubren el caso.

## 7. Prompt del Coach

`apps/api/src/interviewer/prompts.ts` agrega `buildCoachPrompt({ industry, level, metrics })`. Rol distinto al entrevistador:

- Es un coach de carrera que da retroalimentación constructiva tras una entrevista de `industry`/`level`.
- Recibe los puntajes medidos (fluency/eye_contact/speech_rate, o "sin datos") para comentarlos con criterio, sin re-puntuarlos. Los valores medidos son datos del backend (confiables), no del candidato.
- Puntúa la competencia `content` (calidad de las respuestas) de 0 a 100. **Con rúbrica anclada** para que el puntaje sea consistente entre sesiones (sin la rúbrica, el LLM califica de forma arbitraria): el prompt define la escala (ej. 0-40 = respuestas vagas o incorrectas; 40-70 = correctas pero superficiales; 70-100 = correctas, profundas y bien estructuradas) y los criterios (correctitud técnica, profundidad, claridad, uso de ejemplos). El nivel (`junior`/`mid`/`senior`) ajusta la exigencia.
- Si una métrica viene "sin datos" (null), el comentario lo dice explícitamente ("no se capturaron datos de contacto visual en esta sesión") en vez de inventar.
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
  - `plan-store`: transiciones generating -> ready/failed; read devuelve null sin registro; el setReady renueva el TTL propio del plan.
  - `coach.service`: ensambla el plan inyectando los 3 puntajes medidos + el content del LLM; valida contra ImprovementPlanSchema; GeminiBlockedError / fallo transitorio -> setFailed.
  - `prompts`: buildCoachPrompt incluye industria/nivel, los valores medidos y la rúbrica del content; instruye no re-puntuar las métricas; maneja "sin datos"; anti-injection.
  - `generateJson`: pasa responseSchema al SDK; valida el shape (con el SDK mockeado).
- **Integration (routes):**
  - POST /end -> 202 con planId; GET /plan -> 202 (generating) luego 200 (ready) con el fake.
  - **Idempotencia/concurrencia:** dos POST /end devuelven el mismo planId y la generación se dispara UNA sola vez (verificar que el fake de Gemini se llamó una vez aunque /end se invoque dos veces).
  - **Timeout de generating:** un placeholder con `generatingSince` viejo -> GET /plan devuelve 200 { status:'failed' }.
  - **failed -> 200** { status:'failed' } (no 500).
  - /end de sesión inexistente -> 404; GET /plan sin /end previo -> 404.
  - /end cierra el WS (verificar con un cliente ws real que recibe el close 4001).
- **No se testea la calidad del contenido del LLM** (manual, como #39, con `GEMINI_API_KEY` real).

## 10. Lo que queda fuera de scope

- Línea base / comparación entre sesiones (F2: requiere historial persistente).
- PostgreSQL / drizzle para el plan (F2; F1 usa Redis con TTL).
- Job queue (BullMQ) para la generación (F2+; F1 usa fire-and-forget single-instance).
- Job que auto-cierre sesiones huérfanas (el candidato cerró el tab sin llamar `/end`): en F1 esas sesiones expiran por TTL sin plan; un cierre automático es F2+.
- Ponderación temporal de las métricas (privilegiar el final de la sesión para ver recuperación del estrés): F1 usa promedio plano; la ponderación es F2.
- Render de los anillos, polling con backoff del frontend, TTS del plan (frontend de Max, integración #42).
- Regeneración manual del plan / reintento desde el cliente si quedó `failed` (F1: el candidato re-crea una sesión).

## 11. Issues que cierra

- Issue #40 — [F1] Plan de mejora: `POST /sessions/:id/end` y `GET /sessions/:id/plan`.
