# Persistencia durable de sesiones terminadas en Postgres (F2 #55)

- **Fecha:** 2026-06-23
- **Rama:** `feat/persistencia-sesiones`
- **Issue:** #55 (milestone F2 Personalizacion)
- **Desbloquea:** #51 (historial longitudinal), #58 (calibracion de nivel), #60 (plan relativo a la linea base)

## 1. Problema

Hoy las sesiones viven solo en Redis con TTL (1h la sesion, 2h el plan). Al vencer
el TTL se pierde todo: transcript, agregado de metricas y plan. Sin un registro
durable no puede existir historial multi-sesion, ni calibracion de nivel, ni
feedback relativo a la linea base del candidato.

`drizzle-orm` y `postgres` ya estan en las dependencias del `api` como andamiaje
sin uso. Postgres ya esta aprovisionado en `docker-compose.yml` (servicio
`postgres:17-alpine`, `DATABASE_URL` inyectada al `api`), pero no hay schema,
cliente ni migraciones.

## 2. Decisiones cerradas (aprobadas en brainstorming)

1. **Momento de escritura (dos pasos):** se inserta la fila durable en el `POST
   /end` (con el plan en `null`); cuando el plan queda listo, un `UPDATE` rellena
   la columna del plan. La sesion sobrevive aunque la generacion del plan falle.
2. **Forma del schema:** una sola tabla con metadatos como columnas tipadas y
   `transcript`/`metrics`/`plan` como columnas JSONB. Sin normalizar (YAGNI);
   #51/#58 normalizaran o consultaran con operadores JSONB cuando definan su forma.
3. **"Consultable desde el backend":** se cumple con un repositorio interno
   (`getArchivedSession`) cubierto por test, no con un endpoint HTTP publico nuevo.
4. **Tests con pglite:** Postgres real en WASM, en proceso, sin Docker (misma
   filosofia que `ioredis-mock` para Redis).

## 3. Arquitectura

Postgres es un **espejo durable aditivo**: nunca esta en el camino critico de la
entrevista en vivo (eso sigue 100% en Redis). Todas las escrituras a Postgres van
envueltas en `try/catch` y un fallo se loguea pero **no** rompe `/end` ni la
generacion del plan.

Flujo de datos:

```
POST /end  ──► gana el guard (tryStartGenerating) ──► cierra sesion en Redis
                              ├─► readHistory(redis)   -> transcript
                              ├─► readAggregate(redis) -> metricas
                              ├─► archiveSession(db, row)  [INSERT, plan=null]   (try/catch, no fatal)
                              └─► void generatePlan(...) (async, fire-and-forget)

generatePlan ──► setPlanReady(redis, plan) ──► updateArchivedPlan(db, id, plan)  (try/catch, no fatal)
```

Si el plan falla (`setPlanFailed`), la fila durable ya existe con
`transcript`/`metrics`/metadatos y `plan = null`. No se persiste un marcador de
fallo en Postgres (YAGNI): la ausencia de plan es la senal.

El transcript persistido en `/end` es el mismo `readHistory` que consume
`generatePlan`, asi que la fila durable y el plan ven la misma conversacion (una
sola fuente de verdad).

## 4. Schema

`src/db/schema.ts`, tabla `interview_sessions`:

| Columna | Tipo drizzle | Null | Origen |
|---|---|---|---|
| `id` | `uuid` PK | no | `sessionId` (`SessionState.id`) |
| `candidate_id` | `uuid` | si | reservado para #56; no se llena en este slice |
| `industry` | `text` | no | `SessionState.industry` |
| `level` | `text` | no | `SessionState.level` |
| `status` | `text` | no | `'ended'` |
| `started_at` | `timestamp` (tz) | no | `SessionState.startedAt` (epoch ms -> Date) |
| `ended_at` | `timestamp` (tz) | no | `now` en el `/end` |
| `duration_ms` | `integer` | no | `ended_at - started_at` |
| `transcript` | `jsonb` | no | `readHistory` (array de `ConversationEntry`) |
| `metrics` | `jsonb` | no | `readAggregate` (`{fluency,eye_contact,speech_rate}`) |
| `plan` | `jsonb` | si | `ImprovementPlan` (UPDATE al quedar listo) |
| `created_at` | `timestamp` (tz) default now() | no | fila creada |

Las columnas JSONB se tipan en drizzle con `.$type<...>()`: `transcript` ->
`ConversationEntry[]` e `plan` -> `ImprovementPlan` (ambos de
`@warachikuy/shared-types`); `metrics` -> `MetricsAggregate` (tipo local del api,
`interviewer/metrics-aggregator.ts`). Asi el repositorio es type-safe sin casts.

`duration_ms` se guarda calculado (en vez de derivarlo siempre en consultas) para
que #58 lea duracion sin recomputar; es barato y la sesion es inmutable tras `/end`.

## 5. Modulos

Cada archivo con una responsabilidad clara:

- **`src/db/schema.ts`** — define la tabla `interview_sessions` (drizzle) y exporta
  los tipos inferidos `InterviewSessionRow` (`$inferSelect`) y `NewInterviewSession`
  (`$inferInsert`).
- **`src/db/client.ts`** — `createDb(databaseUrl: string): Db` construye la conexion
  `postgres.js` + la instancia drizzle. Exporta el tipo `Db`
  (`PostgresJsDatabase<typeof schema>`). Tambien exporta `runMigrations(db)` que
  aplica las migraciones de la carpeta `drizzle/`.
- **`src/db/session-archive.ts`** — repositorio puro sobre `Db`, sin tocar Fastify:
  - `archiveSession(db, row: NewInterviewSession): Promise<void>` — `INSERT ...
    ON CONFLICT (id) DO NOTHING` (idempotente, como el guard de `/end`).
  - `updateArchivedPlan(db, sessionId, plan: ImprovementPlan): Promise<void>` —
    `UPDATE` de la columna `plan` por `id`.
  - `getArchivedSession(db, sessionId): Promise<InterviewSessionRow | null>` —
    lectura por `id` (lo "consultable").
- **`drizzle.config.ts`** (raiz de `apps/api`) — config de drizzle-kit (dialect
  `postgresql`, `schema: ./src/db/schema.ts`, `out: ./drizzle`).
- **`drizzle/0000_*.sql`** — migracion generada por `drizzle-kit generate`.

## 6. Cableado en lo existente (cambios minimos)

- **`src/server.ts`**:
  - Aumentar `FastifyInstance` con `db: Db`.
  - `BuildServerDeps` gana `db?: Db` (inyectable para tests, como `redis`/`gemini`).
  - `const db = deps.db ?? createDb(env.DATABASE_URL); server.decorate('db', db);`
- **`src/index.ts`**: tras `loadEnv` y antes de `buildServer`, construir el `db` y
  correr `runMigrations(db)` (idempotente); pasarlo via `deps.db`. Asi produccion
  migra al arrancar y los tests inyectan su propio `db` ya migrado.
- **`src/routes/sessions.ts`** (`/end`, despues de ganar el guard y cerrar la
  sesion en Redis): leer `readHistory` + `readAggregate`, armar la fila y
  `archiveSession(server.db, row)` dentro de `try/catch` que solo loguea
  (`req.log.error`). El INSERT no cambia el `202` de respuesta.
- **`src/interviewer/coach.service.ts`**: `CoachDeps` gana `db: Db`; tras
  `setPlanReady`, llamar `updateArchivedPlan(deps.db, sessionId, plan)` dentro de
  `try/catch` que solo loguea. El `/end` pasa `db: server.db` al construir las
  `CoachDeps`.

## 7. Manejo de errores

- Toda escritura/lectura a Postgres que ocurra dentro del flujo de la entrevista
  va envuelta en `try/catch`; un fallo se loguea con contexto (`sessionId`) y se
  degrada en silencio. Postgres caido => se pierde la durabilidad de esa sesion,
  pero la entrevista y el plan (Redis) siguen funcionando.
- `archiveSession` usa `ON CONFLICT DO NOTHING`: un `/end` repetido (idempotente)
  no duplica ni pisa la fila.
- `createDb` no hace ping en construccion; un `DATABASE_URL` invalido se manifiesta
  al primer query (logueado, no fatal). `runMigrations` en el arranque SI puede
  fallar ruidosamente: si la base no migra, es un error de despliegue legitimo.

## 8. Pruebas (vitest + pglite)

Helper de test `makeTestDb()` que crea un `Db` sobre `@electric-sql/pglite`
(in-process) y corre las migraciones, devolviendo una base limpia por test.

- **session-archive (unit):**
  - `archiveSession` + `getArchivedSession` round-trip: la fila se guarda y se lee
    con transcript/metrics/metadatos intactos.
  - `archiveSession` es idempotente: dos inserts del mismo `id` no lanzan ni
    duplican (ON CONFLICT DO NOTHING).
  - `updateArchivedPlan` rellena el plan de una fila existente; `getArchivedSession`
    lo devuelve.
  - `getArchivedSession` de un id inexistente devuelve `null`.
- **`/end` (integration, server con `db` pglite inyectado + `ioredis-mock`):**
  - tras `/end`, existe la fila en Postgres con `industry`/`level`/`duration_ms`/
    `transcript`/`metrics` correctos y `plan = null`.
  - **"sobrevive el TTL de Redis":** se borran las keys `session:*` de Redis y la
    sesion sigue consultable via `getArchivedSession` (Postgres).
  - un fallo del `db` (stub cuyo INSERT rechaza) NO cambia el `202` de `/end`.
- **coach.service (unit):** tras una generacion exitosa, `updateArchivedPlan` deja
  el plan en la fila; un fallo del `db` no impide `setPlanReady`.

Suite completa, lint, typecheck y build verdes.

## 9. Fuera de alcance (explicito)

- Identidad/ownership real del candidato (#56): solo se agrega la columna
  `candidate_id` nullable, sin poblarla.
- Endpoints de agregacion / historial longitudinal (#51).
- Calibracion de nivel (#58) y plan relativo a la linea base (#60).
- Endpoint HTTP publico para leer una sesion archivada: lo "consultable" se cumple
  con el repositorio interno + test. Un endpoint con su modelo de auth (el token
  vive en Redis y vence con la sesion) es trabajo de #56.
- Retry/reaper para reintentar escrituras de archivo fallidas.
- Normalizacion del transcript o de los puntajes por competencia.

## 10. Entrega

Rama `feat/persistencia-sesiones` -> PR contra `main` -> revision del equipo ->
merge. No cierra F2; es la base durable sobre la que siguen #51, #58 y #60.
