# Identidad del candidato entre sesiones (F2 #56)

- **Fecha:** 2026-06-23
- **Rama:** `feat/identidad-candidato`
- **Issue:** #56 (milestone F2 Personalizacion)
- **Desbloquea:** #51 (historial longitudinal), #57 (conectar /progress), #58 (calibracion), #59 (perfil)
- **Depende de:** #55 (la tabla `interview_sessions` ya existe, con `candidate_id` nullable sin poblar)

## 1. Problema

Hoy cada `POST /api/v1/sessions` crea una sesion anonima sin dueno. La columna
`candidate_id` de `interview_sessions` (creada en #55) quedo nullable y sin
poblar. Sin reconocer al mismo candidato entre sesiones no puede existir
historial multi-sesion (#51), calibracion de nivel (#58) ni plan relativo a la
linea base (#60).

## 2. Decision cerrada (aprobada en brainstorming)

**Mecanismo MVP: id local anonimo en `localStorage`.** El frontend acuna un
`candidateId` (uuid) estable, lo guarda en `localStorage` y lo envia en cada
`POST /sessions`. El backend lo persiste en la sesion y lo estampa en
`candidate_id` al cerrar. Sin login, sin cuentas.

El id es **no autenticado** (lo provee el cliente): aceptable para un MVP
educativo sin datos sensibles. Cuentas reales (OAuth/OIDC, RNF07) quedan como
trabajo de **F5**, fuera de esta issue.

## 3. Arquitectura y flujo

```
Frontend (candidateId en localStorage)
   └─► POST /sessions { industry, level, candidateId }
         └─► createSession guarda candidateId en el SessionState (Redis)
POST /end (gana el guard)
   └─► archiveSession({ ..., candidateId: ended.candidateId ?? null })  -> candidate_id
```

`candidateId` es opcional en todo el camino: un caller que lo omite (p. ej. una
llamada directa a la API) crea una sesion anonima con `candidate_id` null, igual
que hoy. Es retrocompatible.

## 4. Componentes

### 4.1 Contratos (`packages/shared-types/src/sessions.ts`)

- `CreateSessionRequestSchema` gana `candidateId: z.string().uuid().optional()`.
- `SessionStateSchema` gana `candidateId: z.string().uuid().optional()`.

`SessionSummarySchema` NO cambia: `candidateId` no es secreto pero el resumen
publico no lo necesita (YAGNI).

### 4.2 Frontend

- **`apps/web/src/lib/candidate.ts`** (nuevo, una responsabilidad):
  `getOrCreateCandidateId(): string`. Lee la clave `warachikuy:candidateId` de
  `localStorage`; si no existe (o no es un uuid valido), genera uno con
  `crypto.randomUUID()`, lo guarda y lo devuelve. Si `localStorage` no esta
  disponible (modo privado / acceso denegado), cae a un id en memoria por carga
  (modulo-scope): la sesion funciona, solo no se enlaza entre recargas.
- **`apps/web/src/lib/apiClient.ts`** `createSession`: adjunta
  `candidateId: getOrCreateCandidateId()` al body del `POST /sessions`. Los
  callers (`SetupPage`) no cambian.

### 4.3 Backend

- **`apps/api/src/services/sessions.service.ts`** `createSession`: copia
  `request.candidateId` al `SessionState` que se persiste en Redis.
- **`apps/api/src/routes/sessions.ts`** `/end`: el bloque de archivo gana
  `candidateId: ended.candidateId ?? null` en la fila que pasa a `archiveSession`
  (hoy lo omite, quedando null). El resto del bloque no cambia.

### 4.4 Persistencia: indice en `candidate_id`

Se agrega un indice sobre `interview_sessions.candidate_id` (migracion nueva
generada por drizzle-kit). Lo necesitaran #51 y #58 para consultar el historial
por candidato; este es su hogar natural, ya que la columna recien deja de estar
muerta aqui. Se define en el schema con `.index()` y se genera la migracion
`0001_*.sql`; el migrador nativo (idempotente, de #55) la aplica al arrancar.

## 5. Manejo de errores / degradacion

- `candidateId` ausente en el request -> sesion anonima (`candidate_id` null). No
  rompe nada; retrocompatible con el contrato actual.
- `candidateId` con uuid invalido -> el `safeParse` de `CreateSessionRequestSchema`
  ya existente responde `400 invalid_input` (mismo camino que un body invalido).
- `localStorage` no disponible -> fallback a un id en memoria por carga (ver 4.2):
  degradacion honesta, sin crash.

## 6. Pruebas

- **shared-types** (`sessions.test.ts`): `CreateSessionRequestSchema` acepta un
  `candidateId` uuid valido, lo omite sin error, y rechaza un uuid invalido.
- **backend `createSession`** (`sessions.service.test.ts`): con `candidateId` en
  el request, el `SessionState` persistido en Redis lo incluye; sin el, queda
  `undefined`.
- **backend `/end`** (`sessions.test.ts`, con pglite + ioredis-mock): una sesion
  creada con `candidateId` archiva la fila con ese `candidate_id`; una sesion sin
  `candidateId` archiva con `candidate_id` null. (Reusa el patron de #55:
  `getArchivedSession` tras `/end`.)
- **frontend `candidate.ts`** (vitest + happy-dom): `getOrCreateCandidateId`
  devuelve el mismo id en llamadas sucesivas (persiste en `localStorage`) y genera
  uno valido cuando la clave no existe.
- **frontend `apiClient.createSession`**: el body del `POST /sessions` incluye el
  `candidateId`.
- Suite completa, lint, typecheck y build verdes.

## 7. Fuera de alcance (explicito)

- Cuentas reales / OAuth / OIDC (F5).
- Consultar o agregar el historial por candidato (#51) y la calibracion (#58).
- Exponer `candidateId` en `GET /sessions/:id` o en cualquier respuesta publica.
- Personalizacion por perfil/preferencias (#59) y plan relativo (#60).
- Firmar o autenticar el id (HMAC/cookie): el id es anonimo y de confianza del
  cliente a proposito; el endurecimiento es parte de la identidad real de F5.

## 8. Entrega

Rama `feat/identidad-candidato` -> PR contra `main` -> revision del equipo ->
merge. No cierra F2; habilita el historial por candidato para #51/#57/#58/#59.
