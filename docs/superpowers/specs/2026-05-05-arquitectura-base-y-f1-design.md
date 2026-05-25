# Arquitectura base y especificación de la Fase F1 — Simulador de Entrevistas Laborales Adaptativo

**Fecha:** 2026-05-05
**Versión:** 1.0
**Estado:** Aprobada
**Alcance:** Este documento cumple dos roles complementarios.

1. **Arquitectura base del proyecto (foundational, secciones 1, 2, 4, 5, 6, 7).** Define el stack, la estructura del repositorio, el entorno de desarrollo, el despliegue, la integración continua y las convenciones de equipo. Estas decisiones aplican a la totalidad del proyecto (Fases F0 a F6) y no cambian entre fases.

2. **Especificación de la Fase F1 (sección 3).** Define los contratos de datos, los mensajes de WebSocket y los endpoints REST necesarios exclusivamente para la entrevista individual básica. Las fases posteriores (F2 personalización, F3 *peer mock*, F4 gamificación, F5 accesibilidad y *auth*, F6 documentación) tendrán cada una su propia especificación que reusará la arquitectura base y extenderá los contratos del paquete `shared-types` con sus propios tipos.

## 0. Contexto y propósito

El proyecto pasa de la fase de definición formal (PC02 entregada) a la construcción del MVP. La Fase F1 del Gantt (30 abr – 20 may 2026) requiere implementar la entrevista individual básica con un avatar entrevistador LLM, voz bidireccional, aura mínima y una industria de preguntas. Trabajan tres desarrolladores en paralelo (AD, MS, WP), por lo que el éxito del desarrollo depende de tener acordados los contratos de datos y la estructura del repositorio antes de escribir código.

Este documento es la base común. Cada fase posterior abre su propia especificación que reusa los contratos definidos aquí.

## 1. Stack técnico

Se adopta **TypeScript end-to-end** para minimizar el número de lenguajes principales y permitir el reuso de tipos entre el cliente y el servidor.

| Capa | Tecnología |
|---|---|
| Frontend PWA | TypeScript, React, Vite |
| Visualización 3D del aura | Three.js (WebGL) |
| Análisis multimodal en cliente | MediaPipe Web Tasks API ejecutado en un Web Worker mediante Comlink |
| Voz en cliente | Web Speech API para STT y TTS por defecto |
| Comunicación tiempo real | WebSocket nativo |
| Comunicación punto a punto (F3) | WebRTC nativo |
| Backend | Node.js, TypeScript, Fastify |
| Modelo de lenguaje | Gemini API (rol entrevistador y rol coach) |
| Base de datos | PostgreSQL accedida con Drizzle ORM |
| Caché y colas auxiliares | Redis |
| Validación de mensajes en tiempo de ejecución | Zod |
| Logger del backend | Pino (incluido por defecto en Fastify) con `traceId` por sesión |

### 1.1 Por qué Drizzle ORM y no Prisma

Se adopta Drizzle ORM porque sus esquemas conviven naturalmente con los esquemas Zod del paquete `shared-types` y mantienen el contrato extremo a extremo completamente tipado sin duplicar tipos. Es además más liviano que Prisma (no genera un cliente externo) y expone SQL legible, lo que reduce la curva de aprendizaje cuando un desarrollador necesita entender qué hace una consulta. Prisma se descartó por la dependencia del cliente generado y por la duplicación que introduce respecto a los tipos ya validados con Zod.

### 1.2 Por qué MediaPipe corre en Web Worker

La inferencia de MediaPipe Web Tasks API es computacionalmente pesada (ejecuta redes neuronales). Si corre en el hilo principal del navegador bloquea el bucle de renderizado y rompe el RNF-03 (30 fps sostenidos) en cuanto se activa el aura. Se aísla en un Web Worker dedicado y se comunica con el hilo principal mediante `Comlink`, que ofrece una interfaz basada en promesas transparentes y elimina el manejo manual de `postMessage`.

### 1.3 Punto abierto — evaluación de LLM auto-hospedado

Existe la intención de probar un modelo local (Qwen2.5 7B sobre Ollama) corriendo en una laptop gamer del equipo. Se documenta como punto abierto, sin bloquear F1. Acciones previstas:

1. F1 se desarrolla y entrega usando exclusivamente Gemini API.
2. El backend define una interfaz `LLMProvider` que abstrae la llamada al modelo, de modo que el reemplazo posterior no toque el resto del código.
3. Walter ejecuta un *spike* de uno a dos días en paralelo a F1 evaluando latencia, calidad de la conversación en español y costo operativo del modelo local.
4. La decisión final se documenta como ADR en `docs/adr/` y, si corresponde, se aplica en F2.

## 2. Estructura del repositorio

Se adopta **monorepo con pnpm workspaces**. La estructura mínima al cierre de F0 es:

```
simulador-entrevistas-adaptativo/
├── apps/
│   ├── web/                       # Frontend PWA (Max)
│   │   ├── src/
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   └── package.json
│   └── api/                       # Backend (Aaron)
│       ├── src/
│       └── package.json
├── packages/
│   ├── shared-types/              # Contratos JSON y schemas Zod (todos)
│   │   ├── src/
│   │   └── package.json
│   └── voice-pipeline/            # STT, TTS y MediaPipe (Walter)
│       ├── src/
│       └── package.json
├── docs/                          # Documentación (ya existe)
│   ├── informe-pc02/
│   ├── prototype/
│   ├── adr/                       # Architecture Decision Records (futuro)
│   └── superpowers/specs/         # Especificaciones de fase
├── .github/
│   └── workflows/                 # CI único
├── docker-compose.yml             # Levanta el stack completo en local
├── .env.example                   # Plantilla de variables de entorno
├── pnpm-workspace.yaml
├── tsconfig.base.json             # Configuración TypeScript compartida
├── package.json                   # Workspace raíz
├── README.md
└── LICENSE
```

### 2.1 Dependencias entre paquetes

- `apps/web` depende de `packages/shared-types` y `packages/voice-pipeline`.
- `apps/api` depende de `packages/shared-types`.
- `packages/shared-types` no depende de nadie.
- `packages/voice-pipeline` depende de `packages/shared-types`.

Las dependencias internas se referencian con `"workspace:*"` en los `package.json`.

### 2.2 Idioma del código

- Identificadores (variables, funciones, clases, archivos): **inglés**.
- Comentarios en el código: **español**.
- Strings de UI mostradas al usuario: **español neutro**.
- Documentación (README, ADRs, specs): **español**.

## 3. Contratos de la Fase F1

Todos los contratos viven en `packages/shared-types/src/`. Cada tipo se declara como esquema Zod y se exporta el tipo TypeScript inferido con `z.infer<>`.

### 3.1 Métricas y aura

```typescript
// packages/shared-types/src/metrics.ts
import { z } from 'zod';

export const MetricNameSchema = z.enum([
  'fluency',      // porcentaje de palabras sin muletilla en los últimos 30 segundos
  'eye_contact', // porcentaje del tiempo con mirada al centro de la cámara
  'speech_rate', // palabras por minuto, ideal entre 130 y 160
]);
export type MetricName = z.infer<typeof MetricNameSchema>;

export const AuraMetricSchema = z.object({
  name: MetricNameSchema,
  value: z.number().min(0).max(100), // valor normalizado 0-100
  confidence: z.enum(['low', 'medium', 'high']),
  timestamp: z.number().int(),       // unix ms
});
export type AuraMetric = z.infer<typeof AuraMetricSchema>;

export const AuraStateSchema = z.object({
  sessionId: z.string().uuid(),
  metrics: z.array(AuraMetricSchema).max(10),
  collectedAt: z.number().int(),
});
export type AuraState = z.infer<typeof AuraStateSchema>;
```

Decisiones de diseño:

- El campo `value` se normaliza siempre a 0–100, de modo que el frontend mapee uniformemente al color e intensidad del aura sin necesidad de conocer la naturaleza de cada métrica.
- `confidence` se modela como enum discreto y no como número de punto flotante, para que el tooltip del aura pueda leer la confianza directamente sin lógica de presentación.
- `metrics.max(10)` protege al backend de payloads malformados.

### 3.2 Eventos de turno y comandos de voz

```typescript
// packages/shared-types/src/turns.ts
export const TurnEventSchema = z.object({
  sessionId: z.string().uuid(),
  type: z.enum([
    'turn.candidate.start',   // el candidato comenzó a hablar
    'turn.candidate.end',     // STT detectó silencio
    'turn.interviewer.start', // el LLM va a hablar
    'turn.interviewer.end',   // TTS terminó
    'session.pause',
    'session.resume',
    'session.terminate',
  ]),
  timestamp: z.number().int(),
});
export type TurnEvent = z.infer<typeof TurnEventSchema>;

export const VoiceCommandSchema = z.object({
  sessionId: z.string().uuid(),
  command: z.enum(['pause', 'resume', 'repeat', 'terminate']),
  timestamp: z.number().int(),
});
export type VoiceCommand = z.infer<typeof VoiceCommandSchema>;
```

### 3.3 Mensajes del LLM y transcripción del candidato

```typescript
// packages/shared-types/src/llm.ts
export const InterviewerMessageSchema = z.object({
  sessionId: z.string().uuid(),
  text: z.string().min(1),
  intent: z.enum(['question', 'followup', 'clarification', 'closing']),
  audioUrl: z.string().url().optional(), // poblado solo si se usa TTS de IA
  timestamp: z.number().int(),
});
export type InterviewerMessage = z.infer<typeof InterviewerMessageSchema>;

export const CandidateTranscriptSchema = z.object({
  sessionId: z.string().uuid(),
  text: z.string(),
  isFinal: z.boolean(),       // true cuando el STT confirma el fin del turno
  timestamp: z.number().int(),
});
export type CandidateTranscript = z.infer<typeof CandidateTranscriptSchema>;
```

`audioUrl` queda opcional. En F1 se mantiene vacío y el frontend sintetiza con `speechSynthesis` del navegador. La migración a TTS de IA se plantea como mejora para F5 sin romper el contrato.

### 3.4 Envelope WebSocket

```typescript
// packages/shared-types/src/ws.ts
export const ClientToServerMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('metrics.update'),       payload: AuraStateSchema }),
  z.object({ type: z.literal('turn.event'),           payload: TurnEventSchema }),
  z.object({ type: z.literal('voice.command'),        payload: VoiceCommandSchema }),
  z.object({ type: z.literal('candidate.transcript'), payload: CandidateTranscriptSchema }),
]);
export type ClientToServerMessage = z.infer<typeof ClientToServerMessageSchema>;

export const ServerToClientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('interviewer.message'), payload: InterviewerMessageSchema }),
  z.object({ type: z.literal('session.state'),       payload: z.object({
    sessionId:  z.string().uuid(),
    phase:      z.enum(['warmup', 'interviewing', 'closing']),
    turnNumber: z.number().int().nonnegative(),
  }) }),
  z.object({ type: z.literal('error'),               payload: z.object({
    code:        z.enum(['llm_unavailable', 'invalid_message', 'session_expired']),
    message:     z.string(),
    recoverable: z.boolean(),
  }) }),
]);
export type ServerToClientMessage = z.infer<typeof ServerToClientMessageSchema>;
```

Reglas operativas:

- El backend valida cada mensaje entrante con `safeParse`. Si la validación falla, responde con un mensaje `error` (`invalid_message`, `recoverable: true`) y mantiene la conexión abierta.
- El frontend valida los mensajes entrantes en el límite de la capa de red para detectar deriva del servidor.
- Los mensajes de tipo `metrics.update` se emiten a una frecuencia máxima de **4 Hz** (un mensaje cada 250 ms). Cada mensaje contiene el snapshot completo de las métricas, sin diferenciales.
- Si una métrica del aura no tiene confianza suficiente para reportarse, se omite del array. El frontend la representa visualmente en estado neutro.

URL del WebSocket:

```
wss://<host>/v1/sessions/:sessionId/ws?token=<session_token>
```

### 3.5 Endpoints REST

Todos prefijados con `/api/v1/`.

```
POST   /api/v1/sessions
  body:    { industry: "backend", level: "junior" | "mid" | "senior" }
  201 OK:  { sessionId, websocketUrl, token }
  400:     ApiError

GET    /api/v1/sessions/:sessionId
  200 OK:  { session: { id, industry, level, status, turnNumber, startedAt } }
  404:     ApiError

POST   /api/v1/sessions/:sessionId/end
  body:    {}
  200 OK:  { sessionId, planId }
  Dispara la generación asincrónica del plan de mejora por el LLM Coach.

GET    /api/v1/sessions/:sessionId/plan
  200 OK:  { plan: ImprovementPlan }
  202:     { status: "generating" }
  El frontend hace polling cada 1.5 s hasta recibir 200.

GET    /api/v1/industries
  200 OK:  { industries: [{ id: "backend", name: "Backend (Software Engineer)" }] }
```

### 3.6 Esquema uniforme de errores HTTP

```typescript
export const ApiErrorSchema = z.object({
  error: z.object({
    code:    z.string(),
    message: z.string(),
    details: z.record(z.unknown()).optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
```

Códigos HTTP estándar (400 para input inválido, 404 para recursos no encontrados, 422 para validación de dominio, 500 para fallos internos). El frontend implementa un único interceptor que mapea estas respuestas a notificaciones de la interfaz.

### 3.7 Autenticación en F1

F1 **no incluye autenticación de usuario final**. La sesión se identifica por el `sessionId` y el `token` opaco devueltos por `POST /sessions`. Se aplica rate-limiting por IP en el backend (60 sesiones por hora por IP) para mitigar abuso. La autenticación de usuarios completa se incorpora en F5.

## 4. Entorno de desarrollo local

Se adopta **Docker Compose** para levantar el stack completo. Cada desarrollador necesita:

1. Node.js LTS y pnpm instalados nativamente.
2. Docker Desktop o equivalente.

Un solo comando levanta todo:

```
docker compose up
```

El `docker-compose.yml` define los servicios:

- `web` — frontend Vite con hot-reload, publicado en `:5173`
- `api` — backend Node con hot-reload, publicado en `:3000`
- `postgres` — base de datos en `:5432`
- `redis` — caché y colas en `:6379`

Los servicios `web` y `api` montan volúmenes con el código fuente para que los cambios se reflejen sin reconstruir la imagen.

## 5. Despliegue

| Componente | Proveedor | Plan |
|---|---|---|
| Frontend | Vercel | Free tier |
| Backend | Render | Free tier (Web Service) |
| Base de datos | Neon | Free tier (PostgreSQL serverless) |
| Caché | Upstash | Free tier (Redis serverless), si llega el caso |

Cada `merge` a `main` dispara despliegue automático en Vercel y Render mediante los webhooks integrados.

### 5.1 Manejo de secretos

- En local: archivo `.env` por aplicación (`apps/api/.env`, `apps/web/.env`). Estos archivos están en `.gitignore`. Se commitea un `.env.example` con las llaves vacías para que cualquier desarrollador sepa qué variables faltan.
- En producción: variables de entorno configuradas en los paneles de Vercel y Render.
- Validación: el backend valida `process.env` con un esquema Zod en el arranque y termina el proceso con un error claro si falta alguna variable.

## 6. Integración continua

GitHub Actions corre en cada `pull request` con los siguientes pasos:

1. `pnpm install --frozen-lockfile`
2. `pnpm lint` — ESLint con preset `@typescript-eslint/recommended` y `react/recommended`
3. `pnpm typecheck` — `tsc --noEmit` en todo el workspace
4. `pnpm test` — Vitest en todos los paquetes con tests
5. `pnpm build` — verifica que ambas aplicaciones compilen
6. **Lighthouse CI** — corre auditorías de accesibilidad y rendimiento sobre el *build* del frontend, con umbral mínimo Accessibility ≥ 95 conforme a RNF-08

Sin estas verificaciones en verde no se permite el merge.

## 7. Convenciones del equipo

### 7.1 Ramas y pull requests

- Una rama por entregable, nombre prefijado con la fase: `f1/sala-virtual`, `f1/llm-entrevistador`, `f1/voice-pipeline`, etc.
- Una pull request por rama, dirigida a `main`.
- La rama se elimina al cerrarse el merge.
- `main` siempre está en estado desplegable.

### 7.2 Mensajes de commit

Español neutro, modo declarativo: "Se agrega el endpoint X", "Se ajusta el manejo de Y", "Se corrige el bug de Z". Sin prefijos tipo Conventional Commits.

### 7.3 Code review

- Pull request marcada con la etiqueta `needs-review` requiere al menos un *approval* antes del merge.
- Pull request sin esa etiqueta puede auto-mergearse si la CI está en verde. Se reserva para correcciones menores, documentación y *chores*.

### 7.4 Estilo de código

- Prettier con configuración por defecto (zero-config).
- ESLint con `@typescript-eslint/recommended` y `react/recommended`.
- Husky con `lint-staged` corre Prettier, ESLint y `tsc --noEmit` sobre los archivos modificados en cada `git commit`. La verificación de tipos en el *pre-commit* atrapa errores que ESLint no detecta sin agregar latencia perceptible en máquinas modernas.

### 7.5 Accesibilidad durante el desarrollo

Adicional a la verificación en CI con Lighthouse, el paquete `@axe-core/react` se activa únicamente en modo desarrollo (`NODE_ENV === 'development'`). Imprime advertencias en la consola del navegador sobre violaciones WCAG mientras se codifica, lo que permite corregir el problema en el momento en lugar de descubrirlo al cierre de la fase.

### 7.6 Gestión de tareas

El trabajo se organiza en GitHub Projects v2 sobre el mismo repositorio:

- Columnas: `Backlog`, `Ready`, `In Progress`, `In Review`, `Done`.
- Issues etiquetados por módulo (`frontend`, `backend`, `voice-pipeline`, `shared-types`, `infra`) y por fase (`F0`, `F1`, ...).
- Milestones uno por fase del Gantt.
- Cada pull request enlaza el issue que cierra mediante `Closes #N`.

La configuración inicial del Project board se hace como última tarea de F0.

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| El throttle de 4 Hz se queda corto y el aura se ve trabada | Subir a 6 u 8 Hz si se observan saltos durante la integración |
| El backend gratuito de Render hiberna tras 15 min sin tráfico y la primera petición tras la hibernación tarda 1 a 2 segundos | Mantener un *ping* periódico desde el frontend cuando la pantalla está activa, o usar un servicio de uptime gratuito |
| El TTS del navegador entrega calidad muy desigual entre sistemas operativos | Documentar voz recomendada por SO y dejar preparada la migración a TTS de IA en F5 |
| Gemini API queda fuera de cuota gratuita antes del fin del proyecto | Compartir clave de producción solo en `main`, cada desarrollador usa su clave personal en dev. *Spike* de LLM local como contingencia |
| Falla de WebSocket en redes con NAT estricto | Usar transporte fallback a HTTP long-polling si la conexión WS no se establece en 5 segundos |

### 8.1 Herramientas diferidas hasta F5

Las siguientes herramientas se evaluaron como recomendaciones generales de arquitectura y se descartaron del alcance de F0–F4 por no aportar valor proporcional al costo durante esas fases. Quedan documentadas como candidatas a incorporar en F5 (pulido y pruebas con usuarios reales):

- **Sentry para captura de excepciones en frontend.** Útil cuando hay usuarios reales en producción y se necesita visibilidad sobre crashes no reproducibles en local. En F1–F3 el equipo es a la vez desarrollador y único probador, las consolas del navegador y los logs del backend son suficientes. Si las pruebas moderadas de F5 con representantes de los perfiles primarios (S1–S7) revelan fallos no reproducibles, se incorpora.
- **SonarCloud o Codecov con Quality Gates bloqueantes.** Útil en equipos grandes y producción de largo plazo para evitar degradación de cobertura. En un MVP académico de 12 semanas la fricción de bloquear *pull requests* por variaciones pequeñas de cobertura supera al valor. Se sustituye por un umbral simple en `vitest.config.ts` que reporta cobertura sin bloquear.

## 9. Próximos pasos

1. Cerrar F0: crear la estructura del monorepo, el `docker-compose.yml`, los esqueletos de `apps/web` y `apps/api`, los paquetes `shared-types` y `voice-pipeline`, la CI en GitHub Actions y el Project board.
2. Iniciar la implementación de F1 con la división de trabajo definida en `proyectoFinal/division-trabajo-f1.md`.
3. Abrir la especificación de F1 (`docs/superpowers/specs/<fecha>-f1-entrevista-individual-design.md`) que reuse los contratos definidos en este documento.
