# Diseño del endpoint POST /api/v1/sessions (Issue #16)

Especificación del primer endpoint REST del backend Warachikuy. Crea una sesión de entrevista y devuelve los datos necesarios para que el cliente abra la conexión WebSocket de F1.3.

## 1. Contrato

### 1.1 Request

```typescript
// packages/shared-types/src/sessions.ts
export const IndustrySchema = z.enum(['backend', 'frontend', 'data', 'fullstack']);
export type Industry = z.infer<typeof IndustrySchema>;

export const LevelSchema = z.enum(['junior', 'mid', 'senior']);
export type Level = z.infer<typeof LevelSchema>;

export const CreateSessionRequestSchema = z.object({
  industry: IndustrySchema,
  level: LevelSchema,
});
export type CreateSessionRequest = z.infer<typeof CreateSessionRequestSchema>;
```

### 1.2 Response (201)

```typescript
export const CreateSessionResponseSchema = z.object({
  sessionId: z.string().uuid(),
  websocketUrl: z.string().url(),
  token: z.string().length(64),
});
export type CreateSessionResponse = z.infer<typeof CreateSessionResponseSchema>;
```

Decisiones del contrato:

- Cuatro industrias en F1: `frontend`, `backend`, `data`, `fullstack`. Si en F2 aparecen más, se agregan al enum.
- `level` mantiene el conjunto definido en la spec arquitectónica.
- Los schemas viven en `packages/shared-types` para que el frontend pueda validar la respuesta en F1.2 y compartir el formulario.

## 2. Estado de la sesión en Redis

### 2.1 Schema

```typescript
export const SessionPhaseSchema = z.enum(['warmup', 'interviewing', 'closing']);
export const SessionStatusSchema = z.enum(['active', 'ended', 'expired']);

export const SessionStateSchema = z.object({
  id: z.string().uuid(),
  industry: IndustrySchema,
  level: LevelSchema,
  status: SessionStatusSchema,
  phase: SessionPhaseSchema,
  turnNumber: z.number().int().nonnegative(),
  startedAt: z.number().int(),
  token: z.string().length(64),
});
export type SessionState = z.infer<typeof SessionStateSchema>;
```

`phase` se incluye porque el mensaje WS `session.state` definido en la spec arquitectónica (sección 3.4) lo requiere. Aunque en F1.1 (este endpoint) siempre se inicializa en `'warmup'`, la transición a `'interviewing'` y `'closing'` la conducirá el LLM Coach en F1.3/F1.4. Persistirlo desde el inicio evita que el WS tenga que reconstruirlo.

### 2.2 Persistencia

- **Key:** `session:<sessionId>` (sessionId es UUID v4).
- **Value:** `JSON.stringify(SessionState)`.
- **TTL:** 3600 segundos (una hora).
- **Refresh implícito:** cada operación que modifique la sesión (WebSocket, `POST /sessions/:id/end`) renueva el TTL para mantener viva la entrevista en curso.

### 2.3 Inicialización en `POST /sessions`

```typescript
{
  id: <uuid v4>,
  industry: <del request>,
  level: <del request>,
  status: 'active',
  phase: 'warmup',
  turnNumber: 0,
  startedAt: Date.now(),
  token: <64 hex chars>,
}
```

### 2.4 Decisión de scope: Redis-only en F1

F1 utiliza únicamente Redis para el estado de sesión, sin tocar PostgreSQL ni drizzle-kit. Razones:

- Una sesión es efímera (duración típica: 30 min) y termina en `POST /sessions/:id/end`.
- El TTL natural de Redis evita escribir lógica de limpieza propia.
- PostgreSQL y drizzle-kit se incorporan en F2, cuando aparezca `ImprovementPlan` (que sí es persistente por diseño).

Consecuencia conocida: si el container del backend se reinicia, las sesiones en curso pueden perderse. Trade-off aceptado para F1; el usuario simplemente vuelve a crear una sesión.

## 3. Estructura del backend

### 3.1 Nuevos archivos

```
apps/api/src/
├── config/
│   └── env.ts                       (existente, se modifica para agregar WS_BASE_URL)
├── routes/
│   ├── sessions.ts                  (nuevo) handler HTTP de POST /api/v1/sessions
│   └── sessions.test.ts             (nuevo) tests de integración del handler
├── services/
│   ├── redis.ts                     (nuevo) buildRedisClient(env) factory
│   ├── sessions.service.ts          (nuevo) createSession() pura, testeable
│   └── sessions.service.test.ts     (nuevo) tests unitarios del service
├── errors.ts                        (nuevo) helper apiError(code, message, details?)
├── index.ts                         (existente)
├── server.ts                        (se modifica) registra rate-limit y rutas
└── server.test.ts                   (existente)
```

### 3.2 Separación de capas

- **`routes/sessions.ts`** se ocupa solo del HTTP: parsear body, validar con Zod, mapear errores a status codes, formatear la respuesta. Sin lógica de negocio.
- **`services/sessions.service.ts`** expone `createSession(redis, request, env): Promise<CreateSessionResponse>` como función pura. Recibe el cliente Redis por parámetro para poder inyectar un fake en tests.
- **`services/redis.ts`** expone `buildRedisClient(env): Redis` para que `server.ts` lo construya una vez al iniciar y lo decore en la instancia de Fastify.

### 3.3 Flujo del handler

```typescript
async function handler(req, reply) {
  const parsed = CreateSessionRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return reply.code(400).send(
      apiError('invalid_input', 'Body invalido', parsed.error.format()),
    );
  }
  try {
    const response = await createSession(req.server.redis, parsed.data, req.server.env);
    return reply.code(201).send(response);
  } catch (err) {
    req.log.error({ err }, 'Error creando sesion');
    return reply.code(500).send(apiError('internal_error', 'No se pudo crear la sesion'));
  }
}
```

### 3.4 Servicio `createSession`

```typescript
export async function createSession(
  redis: Redis,
  request: CreateSessionRequest,
  env: Env,
): Promise<CreateSessionResponse> {
  const sessionId = crypto.randomUUID();
  const token = crypto.randomBytes(32).toString('hex');
  const state: SessionState = {
    id: sessionId,
    industry: request.industry,
    level: request.level,
    status: 'active',
    phase: 'warmup',
    turnNumber: 0,
    startedAt: Date.now(),
    token,
  };
  await redis.set(`session:${sessionId}`, JSON.stringify(state), 'EX', 3600);
  return {
    sessionId,
    websocketUrl: `${env.WS_BASE_URL}/v1/sessions/${sessionId}/ws?token=${token}`,
    token,
  };
}
```

### 3.5 Cambios en `server.ts`

- Registrar `@fastify/rate-limit` con 60 requests por hora por IP, aplicado únicamente a `POST /api/v1/sessions`.
- Construir el cliente Redis con `buildRedisClient(env)` y decorar `server.redis`.
- Decorar `server.env` para acceso desde handlers.
- Registrar las rutas con prefix `/api/v1`.

### 3.6 Códigos de respuesta

| Status | Cuándo | Body |
|---|---|---|
| 201 | Sesión creada correctamente | `CreateSessionResponse` |
| 400 | Body inválido (Zod rechaza) | `ApiError` con `code: 'invalid_input'` y `details` con `parsed.error.format()` |
| 429 | Excedido rate limit (60/h por IP) | `ApiError` con `code: 'rate_limited'`, generado por el plugin |
| 500 | Redis caído u otro error interno | `ApiError` con `code: 'internal_error'`, sin exponer el stack |

### 3.7 Variable de entorno nueva

`WS_BASE_URL` se agrega al schema en `config/env.ts`:

```typescript
WS_BASE_URL: z.string().url().default('ws://localhost:3000'),
```

Default sensato para desarrollo local. En producción se sobreescribe con `wss://api.warachikuy.com` o similar.

### 3.8 Dependencias nuevas

- `ioredis` (cliente de Redis usado por el service y por el rate-limit).
- `@fastify/rate-limit` (plugin oficial de Fastify).
- `ioredis-mock` (devDependency, mock in-memory para los tests del handler).

## 4. Testing

### 4.1 Estrategia

Dos niveles:

- **Service (unit):** `sessions.service.test.ts` con un fake mínimo de Redis (objeto con `set` mock). Rápidos y deterministas.
- **Handler (integration):** `routes/sessions.test.ts` con `server.inject()` de Fastify y `ioredis-mock`. Cubre el flujo HTTP completo sin levantar Redis real.

`ioredis-mock` soporta `SET key value EX seconds` correctamente, suficiente para F1. Si en F2 necesitamos features avanzadas (streams, pub/sub), migraremos a `testcontainers`.

### 4.2 Casos del service

```
- createSession con request válida escribe SessionState en Redis con key 'session:<uuid>'
- createSession genera sessionId UUID v4 distinto entre llamadas
- createSession genera token de 64 chars hexadecimales
- createSession llama SET con TTL 3600 segundos
- El SessionState guardado tiene status='active', phase='warmup', turnNumber=0
- response.websocketUrl incluye sessionId y token coherentes con lo guardado
```

### 4.3 Casos del handler

```
- POST con body válido devuelve 201 y la shape de CreateSessionResponse
- POST sin body devuelve 400 con ApiError code='invalid_input'
- POST con industry desconocida devuelve 400 con detalle de Zod
- POST con level desconocido devuelve 400 con detalle de Zod
- POST con body no-JSON devuelve 400
- Si redis.set lanza, devuelve 500 con ApiError code='internal_error' sin exponer stack
```

### 4.4 Lo que no se testea en este PR

- **Rate limit (60/h).** El plugin `@fastify/rate-limit` ya está testeado upstream. Forzar el límite real en tests requiere fast-forward del store o un patrón complejo de tiempo. Si más adelante queremos cobertura del límite específico, se hace en un PR dedicado.
- **Persistencia post-restart.** Como aceptamos perder sesiones en F1 si el container reinicia, no aplica test.

## 5. Lo que queda fuera de scope

Decisiones deferidas a sub-fases posteriores. Documentadas acá para no perderlas.

- **Almacenamiento del historial de mensajes (transcripts del candidato y respuestas del entrevistador).** Pregunta válida de Gemini en la review del diseño. Se decide en F1.3 (WebSocket) cuando aparezcan `CandidateTranscript` e `InterviewerMessage` reales. Opciones probables: Redis Lists bajo `session:messages:<id>`, o flush a Postgres en `POST /sessions/:id/end` cuando se persista el `ImprovementPlan`.
- **Persistencia del `ImprovementPlan` a Postgres.** Se diseña al implementar `POST /sessions/:id/end` en F1.4. Drizzle-kit y migraciones se introducen en ese momento.
- **GET /sessions/:id, POST /sessions/:id/end, GET /sessions/:id/plan, GET /industries.** Otros endpoints REST definidos en la spec arquitectónica sección 3.5, fuera del scope del Issue #16.
- **Autenticación de usuario final.** F1 no la incluye (spec sección 3.7). Llega en F5.

## 6. Issues que cierra

- Issue #16 — [F1] Endpoint POST /sessions
