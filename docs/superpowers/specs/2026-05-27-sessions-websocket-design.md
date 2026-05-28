# Diseño del WebSocket /v1/sessions/:sessionId/ws (Issue #17)

Segundo endpoint del backend Warachikuy. Sostiene la conexión bidireccional entre el cliente y el servidor durante una entrevista activa. Este PR cubre el plumbing del WS: handshake autenticado, validación de mensajes con los discriminated unions de `shared-types/ws`, ciclo de vida del socket y observabilidad. La generación de `interviewer.message` por parte del LLM Coach queda fuera de scope y se implementa en un issue posterior.

## 1. Contrato

Los schemas viven en `packages/shared-types/src/ws.ts` y se consumen sin modificarlos:

```typescript
export const ClientToServerMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('metrics.update'), payload: AuraStateSchema }),
  z.object({ type: z.literal('turn.event'), payload: TurnEventSchema }),
  z.object({ type: z.literal('voice.command'), payload: VoiceCommandSchema }),
  z.object({ type: z.literal('candidate.transcript'), payload: CandidateTranscriptSchema }),
]);

export const ServerToClientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('interviewer.message'), payload: InterviewerMessageSchema }),
  z.object({ type: z.literal('session.state'), payload: z.object({
    sessionId: z.string().uuid(),
    phase: z.enum(['warmup', 'interviewing', 'closing']),
    turnNumber: z.number().int().nonnegative(),
  }) }),
  z.object({ type: z.literal('error'), payload: z.object({
    code: z.enum(['llm_unavailable', 'invalid_message', 'session_expired']),
    message: z.string(),
    recoverable: z.boolean(),
  }) }),
]);
```

URL del WS:

```
ws://<host>/v1/sessions/:sessionId/ws?token=<hex64>
```

## 2. Plugin y handshake

Se usa `@fastify/websocket` (oficial, compatible con Fastify 5). La ruta se registra dentro del scope `/api/v1` que ya existe en `server.ts`, lo que hace que la URL pública sea `/api/v1/v1/sessions/...`. Para evitar el doble prefijo, el WS se registra en un scope hermano sin prefijo `/api/v1`. La URL pública queda como `/v1/sessions/:sessionId/ws`, alineada con la spec arquitectónica sección 3.4.

El flujo del handshake es:

1. Cliente envía `GET /v1/sessions/:sessionId/ws?token=<hex64>` con `Upgrade: websocket`.
2. Un hook `preValidation` corre en HTTP normal (antes del upgrade). Primero valida el shape del query con Zod (`z.object({ token: z.string().regex(/^[0-9a-f]{64}$/) })`). Esto rechaza tokens malformados y, de paso, defiende contra el caso `?token=A&token=B` si el querystring parser de Fastify cambiara en el futuro a uno que devuelve array: `z.string()` rechaza arrays automáticamente. Después lee `session:<sessionId>` en Redis y aplica esta tabla de decisión:

| Condición | Respuesta HTTP |
|---|---|
| `query.token` no pasa el schema (ausente, no string, no 64 hex chars) | `400` con `ApiError { code: 'invalid_input' }` |
| Key no existe en Redis | `404` con `ApiError { code: 'session_not_found' }` |
| `state.token !== query.token` | `401` con `ApiError { code: 'invalid_token' }` |
| `state.status !== 'active'` | `410` con `ApiError { code: 'session_expired' }` |
| Todo OK | Continúa el upgrade |

3. Si el handshake fue aceptado, `@fastify/websocket` completa el upgrade y dispara `onConnection`.

El rechazo pre-upgrade vuela como `4xx` HTTP estándar y no como close code de WebSocket. Esto permite que curl o herramientas que no implementan WS reciban el error claro.

### 2.1 Configuración del plugin

```typescript
await server.register(websocket, {
  options: {
    maxPayload: MAX_WS_PAYLOAD_BYTES, // 16 KB
  },
});
```

`maxPayload: 16384` bytes protege el event loop frente a clientes que envían payloads gigantes. AuraState con 10 métricas pesa ~1 KB y un transcript de turno completo (~600 palabras a 130wpm) pesa ~4 KB. 16 KB deja margen 3x sin abrir la puerta a payloads abusivos.

## 3. Connection registry

Una sesión solo puede tener una conexión activa a la vez. Cuando llega un upgrade para un `sessionId` que ya tiene socket, cerramos el previo y aceptamos el nuevo. Esto cubre el caso natural de reconexión por red intermitente sin tener que rastrear UUIDs de "conexión".

El registry vive en memoria del proceso. F1 corre en una sola instancia (Docker Compose, MVP académico) así que el invariante "una conexión por sesión" se cumple. Si en F5 escalamos a múltiples réplicas habrá que pasar a Redis con pub/sub para kick remoto; queda documentado en sección 11.

### 3.1 Interfaz

```typescript
// apps/api/src/services/connection-registry.ts

import type { WebSocket } from 'ws';

export class ConnectionRegistry {
  private conns = new Map<string, WebSocket>();

  register(sessionId: string, socket: WebSocket): void {
    const prev = this.conns.get(sessionId);
    if (prev) {
      prev.close(4000, 'session_replaced');
    }
    this.conns.set(sessionId, socket);
  }

  unregister(sessionId: string, socket: WebSocket): void {
    // Solo borra si el socket actual coincide. Evita el race en el que
    // un register() reciente reemplazó la entrada y el unregister() del
    // socket viejo borraría la entrada del nuevo.
    if (this.conns.get(sessionId) === socket) {
      this.conns.delete(sessionId);
    }
  }

  get(sessionId: string): WebSocket | undefined {
    return this.conns.get(sessionId);
  }

  size(): number {
    return this.conns.size;
  }
}
```

Se decora en la instancia de Fastify como `server.connections` para que tests puedan inspeccionar el estado y otros handlers (en futuros issues) puedan emitir a una sesión específica.

## 4. Lifecycle del socket

Una vez aceptado el upgrade, el handler corre:

```
on('connection', socket, req)
  → log = req.log.child({ sessionId, ws: true })
  → connections.register(sessionId, socket)         // kick previa si existe
  → socket.send(JSON.stringify({
      type: 'session.state',
      payload: { sessionId, phase, turnNumber },    // del SessionState leído en handshake
    }))
  → startHeartbeat(socket, log)
  → log.info('ws connected')

on('message', raw)
  → let json: unknown
    try {
      json = JSON.parse(raw.toString())
    } catch {
      handleInvalid('json_parse_error'); return
    }
  → const parsed = ClientToServerMessageSchema.safeParse(json)
  → si !parsed.success:
      handleInvalid('schema_validation_failed'); return
  → invalidCount = 0                              // reset al primer válido
    log.debug({ type: parsed.data.type }, 'ws message received')
    // F1.2: sin lógica de negocio; la generación de respuesta
    // (interviewer.message) llega en un issue posterior.

function handleInvalid(reason):
  invalidCount++
  socket.send({ type: 'error', payload: { code: 'invalid_message', message: reason, recoverable: true } })
  log.warn({ invalidCount, reason }, 'invalid ws message')
  if invalidCount >= MAX_CONSECUTIVE_INVALID_MESSAGES:
    socket.close(1008, 'policy_violation')

on('pong')
  → markAlive(socket)                               // resetea timer del heartbeat
  → redis.expire(`session:${sessionId}`, 3600)      // renueva TTL una vez cada 30s
  → log.trace('pong received')

on('close', code, reason)
  → connections.unregister(sessionId, socket)
  → stopHeartbeat(socket)
  → log.info({ code, reason: reason?.toString() }, 'ws closed')

on('error', err)
  → log.error({ err }, 'ws error')
  // socket emite 'close' después automáticamente; no llamamos close() acá
  // para evitar doble cleanup
```

### 4.1 TTL refresh atado al pong

El refresh del TTL en Redis (`EXPIRE session:<id> 3600`) se ejecuta en `on('pong')`, no en `on('message')`. Razones:

- `metrics.update` llega a 4 Hz por sesión. Con 10 sesiones concurrentes serían 40 `EXPIRE` por segundo, todos redundantes.
- Un cliente vivo responde pongs cada 30s. Si no los responde, el heartbeat lo cierra en el siguiente ciclo (≤60s desde el último pong) y el TTL natural de Redis maneja el cleanup.
- Reduce la carga a 1 `EXPIRE` cada 30s por sesión activa, sin perder garantía.

### 4.2 Contador de inválidos consecutivos

`invalidCount` se incrementa cuando un mensaje falla parsing JSON o la validación Zod. Se resetea a 0 cuando llega un mensaje válido. Al llegar a `MAX_CONSECUTIVE_INVALID_MESSAGES` (5), cerramos con `close(1008, 'policy_violation')`. Un cliente legítimo se equivoca 1-2 veces durante reconexión o deriva de schema, no 5 seguidos.

## 5. Heartbeat

`apps/api/src/ws/heartbeat.ts` implementa ping/pong manual porque `@fastify/websocket` (y `ws` debajo) no lo hace automático.

```typescript
const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 10_000;

export function startHeartbeat(socket: WebSocket, log: Logger): void {
  let isAlive = true;
  socket.on('pong', () => { isAlive = true; });

  const interval = setInterval(() => {
    if (!isAlive) {
      log.warn('heartbeat timeout, closing socket');
      socket.close(1011, 'keepalive_failure');
      return;
    }
    isAlive = false;
    socket.ping();
  }, HEARTBEAT_INTERVAL_MS);

  socket.on('close', () => clearInterval(interval));
}
```

`HEARTBEAT_TIMEOUT_MS` no se usa como timer separado: el ciclo del `setInterval` ya da la ventana de tolerancia. Si en el próximo tick (30s después de emitir el ping) no llegó un pong, el flag sigue false y cerramos. La constante existe en código por si en el futuro queremos timers separados; por ahora es documental.

## 6. Logging y traceId (RNF-12)

Fastify 5 genera `reqId` por request por default y Pino lo emite en cada log line. No necesitamos `@fastify/request-id`; la nota del issue dice "o equivalente". En el `onConnection` del WS hacemos un child logger:

```typescript
const wsLog = req.log.child({ sessionId, ws: true });
```

Todos los logs del socket llevan `reqId` (del handshake) + `sessionId`. Suficiente para correlacionar.

### 6.1 Redacción del token en logs

Por default Pino loguea `req.url` completo, lo que incluye `?token=<hex64>` en el handshake del WS. El token es opaco y por-sesión (TTL 1h) pero los logs se exportan a colectores con perfiles de retención y acceso distintos, así que tratamos el token como secreto.

En `server.ts` configuramos el logger con un serializer custom de `req` que reemplaza el query param `token`:

```typescript
const REDACTED_TOKEN_URL = (url: string): string =>
  url.replace(/([?&]token=)[^&]+/g, '$1REDACTED');

const server = Fastify({
  logger: {
    level: env.LOG_LEVEL,
    serializers: {
      req: (req) => ({
        method: req.method,
        url: REDACTED_TOKEN_URL(req.url),
        remoteAddress: req.ip,
      }),
    },
  },
});
```

Esto cubre el WS y cualquier ruta futura que reciba un token por query string.

## 7. Estructura del backend

### 7.1 Archivos nuevos y modificados

```
packages/shared-types/src/
└── ws.ts                                     (modifica) agrega WS_CLOSE_CODES + WsCloseCode

apps/api/src/
├── config/
│   └── env.ts                                (no cambia)
├── routes/
│   ├── sessions.ts                           (existente)
│   └── sessions.ws.ts                        (nuevo) registra ruta WS
├── services/
│   ├── sessions.service.ts                   (existente)
│   ├── connection-registry.ts                (nuevo) Map + register/unregister
│   └── connection-registry.test.ts           (nuevo) unit tests
├── ws/
│   ├── constants.ts                          (nuevo) MAX_WS_PAYLOAD_BYTES, etc
│   ├── auth.ts                               (nuevo) validateUpgrade(redis, sessionId, token)
│   ├── auth.test.ts                          (nuevo) unit tests
│   ├── handler.ts                            (nuevo) onConnection/onMessage/onClose
│   ├── handler.test.ts                       (nuevo) integration con cliente ws real
│   └── heartbeat.ts                          (nuevo) startHeartbeat(socket, log)
├── server.ts                                 (modifica) registra @fastify/websocket + ruta WS + serializer req
└── server.test.ts                            (existente, puede ajustarse)
```

### 7.2 Separación de capas

- **`routes/sessions.ws.ts`** registra la ruta con `@fastify/websocket` y delega a `handler.ts`.
- **`ws/auth.ts`** valida el handshake. Función pura `validateUpgrade(redis, sessionId, token): Promise<Result>` que devuelve `{ ok: true, state }` o `{ ok: false, reason, status }`. Testeable sin Fastify.
- **`ws/handler.ts`** maneja los eventos del socket (`message`, `pong`, `close`, `error`). Recibe el registry y el logger por parámetro.
- **`ws/heartbeat.ts`** maneja el ping/pong. Aislado para poder testear con timers fake.
- **`services/connection-registry.ts`** maneja el Map. Sin dependencias externas, trivial de testear.

## 8. Close codes y semántica para el frontend

Codes que emite el backend, con la semántica esperada del frontend:

| Code | Significado | ¿Frontend reconecta? |
|---|---|---|
| `1000` | Cierre normal (cliente o servidor) | No |
| `1008` | Policy violation (inválidos consecutivos) | No |
| `1011` | Keepalive failure (no respondió pongs) | Sí, con backoff |
| `4000` | `session_replaced` (otra pestaña tomó el control) | No |
| `4001` | `session_expired` (server validó y el state ya no está activo) | No |

El rango 4000-4999 está reservado por RFC 6455 para uso de aplicación. El frontend debe mantener este mapeo para no reconectar ciegamente en bucle cuando el motivo del cierre es intencional.

### 8.1 Exportación en `shared-types`

Para que backend y frontend usen la misma fuente de verdad y no aparezcan magic numbers desperdigados, los códigos se exportan en `packages/shared-types/src/ws.ts`:

```typescript
export const WS_CLOSE_CODES = {
  NORMAL: 1000,
  POLICY_VIOLATION: 1008,
  KEEPALIVE_FAILURE: 1011,
  SESSION_REPLACED: 4000,
  SESSION_EXPIRED: 4001,
} as const;

export type WsCloseCode = (typeof WS_CLOSE_CODES)[keyof typeof WS_CLOSE_CODES];
```

El backend importa estas constantes en `connection-registry.ts`, `handler.ts` y `heartbeat.ts`. Cuando el frontend implemente el cliente WS (F1 de Max), evaluará `event.code` contra el mismo objeto.

## 9. Constantes y configuración

`apps/api/src/ws/constants.ts`:

```typescript
export const MAX_WS_PAYLOAD_BYTES = 16384;            // 16 KB
export const MAX_CONSECUTIVE_INVALID_MESSAGES = 5;
export const HEARTBEAT_INTERVAL_MS = 30_000;
export const HEARTBEAT_TIMEOUT_MS = 10_000;           // documental, ver §5
export const SESSION_REFRESH_TTL_SECONDS = 3600;
```

Estos valores son hardcoded con nombre claro. No viven en `env.ts` porque no son knobs que cambien entre dev y prod (dependen del contrato y de los recursos de un proceso Node, no del ambiente). Si en F5 aparece evidencia de load testing o ajuste dinámico, se promocionan a env en ese momento.

## 10. Testing

### 10.1 Unit tests

| Archivo | Cobertura |
|---|---|
| `connection-registry.test.ts` | register/unregister/get/size; reemplazo de previa; race de unregister tras replace |
| `auth.test.ts` | token válido devuelve state; token incorrecto rechaza; sessionId no existe rechaza; status no `active` rechaza; token con formato no hex rechaza |

ioredis-mock se reutiliza igual que en POST /sessions.

### 10.2 Integration tests del handler

`handler.test.ts` levanta el server real con puerto efímero y se conecta con un cliente `ws` desde el mismo test. Esto valida el plumbing completo end-to-end sin necesidad de Docker.

```typescript
const server = await buildServer(testEnv, { redis: new RedisMock() });
const { port } = await server.listen({ port: 0, host: '127.0.0.1' });
const ws = new WebSocket(`ws://127.0.0.1:${port}/v1/sessions/${sessionId}/ws?token=${token}`);
// ...
await server.close();
```

Casos:

```
- Conectar con token válido recibe primer mensaje session.state con phase y turnNumber correctos
- Conectar con token inválido recibe 401 antes del upgrade
- Conectar con sessionId desconocido recibe 404
- Conectar con sesión cuyo status != active recibe 410
- Enviar mensaje válido (metrics.update) no rompe la conexión y el log lo registra
- Enviar JSON inválido recibe error{invalid_message, recoverable:true} y socket sigue abierto
- Enviar payload que no matchea schema recibe error similar
- Tras 5 inválidos consecutivos, el servidor cierra con 1008
- Un mensaje válido entre inválidos resetea el contador
- Abrir segunda conexión para el mismo sessionId cierra la primera con code 4000
- Cerrar el cliente limpia el registry (server.connections.size() vuelve a 0)
- TTL en Redis se renueva tras pong (verificar redis.ttl())
- Pong no llega en HEARTBEAT_INTERVAL_MS+ε → servidor cierra con 1011 (timers fake)
```

### 10.3 Test de redacción del token

`server.test.ts` agrega un caso: hacer un request al WS y capturar la línea de log del request. Verificar que `?token=` aparece como `?token=REDACTED` y nunca el valor real.

### 10.4 Lo que no se testea

- Carga real concurrente (>100 sesiones). No es necesario para el MVP.
- Recuperación tras restart del proceso. Las conexiones WS se pierden por diseño; el cliente reconecta.

## 11. Lo que queda fuera de scope (F1)

Decisiones diferidas, documentadas para no perderlas:

- **Generación de `interviewer.message` por LLM Coach.** Issue separado dentro de F1. Cuando exista, escribirá al socket vía `server.connections.get(sessionId)?.send(...)`.
- **Persistencia del historial de mensajes (transcripts del candidato y respuestas del entrevistador).** Se decide en el issue del LLM Coach. Opciones probables: Redis Lists bajo `session:messages:<id>`, o flush a Postgres en `POST /sessions/:id/end`.
- **Múltiples réplicas del backend.** F1 corre con una sola. Si en F5 escalamos: registry en Redis con pub/sub para kick remoto, o sticky sessions por load balancer.
- **Rate limit por mensaje dentro del socket.** La protección actual (maxPayload + 5 inválidos consecutivos) cubre los ataques baratos. Un rate limit más fino (ej. 10 metrics.update/s máx) se evalúa si aparece abuso real.

## 12. Dependencias nuevas

Runtime:

- `@fastify/websocket` (plugin oficial; trae `ws` como peer)
- `ws` (peer explícito; sirve también para el cliente de tests)

Dev:

- `@types/ws`

## 13. Issues que cierra

- Issue #17 — [F1] WebSocket /sessions/:id/ws
