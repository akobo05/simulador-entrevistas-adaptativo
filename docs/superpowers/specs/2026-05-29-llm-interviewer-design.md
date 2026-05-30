# Diseño del LLM entrevistador (Issue #39)

El cerebro del WebSocket de F1. El plumbing (#17) recibe los `candidate.transcript` del candidato pero nunca responde; esta pieza integra Gemini para generar las preguntas del entrevistador y conducir el arco de la entrevista. Cubre las tareas 2, 3 y la parte conversacional de la 4 de Aaron en `division-trabajo-f1.md` (RF-01, RF-02 versión mínima).

## 1. Modelo y SDK

- **SDK:** `@google/genai` (cliente oficial unificado de Google, reemplaza al deprecado `@google/generative-ai`).
- **Modelo:** `gemini-2.5-flash`. En una entrevista por voz la latencia es UX-crítica: Flash responde en ~1s vs ~3s de Pro, con calidad suficiente para preguntas de entrevista. El modelo se fija como constante; si en F5 se evalúa el modelo local (Qwen) será otro issue.
- **Sin streaming:** el frontend sintetiza la voz con `speechSynthesis` del navegador, que requiere el texto completo. El streaming token-por-token no aporta en F1. Cada `interviewer.message` se genera y envía completa.

## 2. Arco de la entrevista

El backend controla el ARCO (la fase y el turno); el LLM controla el CONTENIDO (qué pregunta exactamente). Las fases son deterministas por número de turno:

```
turnNumber 0   → warmup:       1 pregunta de romper hielo
turnNumber 1-5 → interviewing: 5 preguntas troncales del banco + follow-ups
turnNumber 6   → closing:      mensaje de cierre y despedida
```

Total: 7 turnos del entrevistador. Una entrevista dura ~5-8 minutos, adecuado para la demo de F1.

Constantes en `apps/api/src/interviewer/constants.ts`:

```typescript
export const WARMUP_TURN = 0;
export const INTERVIEWING_TURNS = 5; // turnos 1..5
export const CLOSING_TURN = 6;       // ultimo turno del entrevistador
export const MAX_INTERVIEWER_TURNS = 6;
```

La transición de fase se deriva del turno:

```
turn === 0           → 'warmup'
turn >= 1 && turn < 6 → 'interviewing'
turn === 6           → 'closing'
```

## 3. Banco de preguntas (híbrido)

Un banco curado da estructura y cobertura de dominio; el LLM lo reformula y agrega follow-ups según la respuesta del candidato.

`apps/api/src/interviewer/question-bank.ts`:

```typescript
export interface SeedQuestion {
  id: string;
  topic: string;   // ej. 'apis', 'databases', 'concurrency', 'testing', 'system-design'
  prompt: string;  // la pregunta troncal en espanol neutro
}

// 5 troncales de backend, una por tema, en orden de dificultad creciente.
export const BACKEND_QUESTION_BANK: SeedQuestion[] = [ /* ... 5 entradas ... */ ];
```

Decisiones del banco:

- En F1 solo existe la industria `backend`. El banco se indexa por industria para que F2 agregue otras sin tocar la lógica.
- El backend selecciona la troncal del turno actual (turno 1 → troncal 0, turno 2 → troncal 1, etc.). El LLM la usa como semilla: la reformula al contexto de la conversación y puede anteponerle un follow-up breve a la respuesta anterior.
- Las troncales usadas se registran (`session:asked:<id>`) para no repetir si hubiera reintentos.

## 4. Prompts por rol y fase

`apps/api/src/interviewer/prompts.ts` expone un system prompt del rol entrevistador, parametrizado por fase. El prompt deja claro:

- Es un entrevistador técnico profesional, en español neutro, tono cordial pero riguroso.
- Hace UNA pregunta por turno. No da feedback ni la respuesta correcta (eso es del plan de mejora, #40).
- En warmup: una pregunta ligera de presentación. En interviewing: usa la troncal provista, puede hacer un follow-up corto a la respuesta previa. En closing: agradece y cierra, sin nueva pregunta.
- Responde solo con el texto de la intervención, sin meta-comentarios.

El `intent` de la `InterviewerMessage` (`question` | `followup` | `clarification` | `closing`) lo fija el backend según la fase y si hubo respuesta previa, no el LLM. Esto mantiene el contrato predecible.

## 5. Servicio del entrevistador

`apps/api/src/interviewer/interviewer.service.ts`:

```typescript
export interface GenerateTurnInput {
  state: SessionState;          // industry, level, phase, turnNumber
  history: ConversationEntry[]; // turnos previos (candidato + entrevistador)
  seed?: SeedQuestion;          // troncal del turno (ausente en warmup/closing)
}

export async function generateInterviewerMessage(
  client: GeminiClient,
  input: GenerateTurnInput,
): Promise<InterviewerMessage>;
```

Función pura respecto de Redis y el socket: recibe el estado y el historial, llama a Gemini, devuelve una `InterviewerMessage` validada contra el schema de `shared-types`. El cliente Gemini se inyecta por parámetro para poder usar un fake en tests.

`apps/api/src/interviewer/gemini-client.ts` expone un factory `buildGeminiClient(env)` y una interfaz mínima `GeminiClient` (`generate(systemPrompt, contents): Promise<string>`) para que los tests inyecten un fake determinista sin pegarle a la API real.

## 6. Persistencia del historial

`apps/api/src/interviewer/conversation.ts`:

- Historial: Redis List `session:messages:<id>`. Cada entrada es un `ConversationEntry` (`{ role: 'interviewer' | 'candidate', text, timestamp }`) serializado como JSON. `RPUSH` al agregar, `LRANGE 0 -1` al leer el contexto.
- Troncales usadas: Redis Set `session:asked:<id>` con los `id` de las `SeedQuestion` ya servidas.
- Ambas keys comparten el TTL de la sesión y se renuevan con el `EXPIRE` del pong que ya existe (se extiende para cubrir estas keys).

`ConversationEntry` se define en `shared-types` para que #40 (plan de mejora) reuse el mismo tipo al leer el historial.

## 7. Integración en el handler del WS

Punto de inyección actual: `apps/api/src/ws/handler.ts` línea ~76, donde hoy recibe un mensaje válido y solo loguea.

```
on connect (warmup):
  → generar primera interviewer.message (warmup, sin seed)
  → persistir en historial
  → enviar interviewer.message + session.state (phase=warmup, turnNumber=0)

on candidate.transcript con isFinal=true:
  → si hay generacion en curso para esta sesion: ignorar (lock)
  → si turnNumber ya es MAX_INTERVIEWER_TURNS (entrevista cerrada): ignorar
  → marcar lock 'generating'
  → persistir el transcript del candidato en el historial
  → nextTurn = turnNumber + 1; phase = derivePhase(nextTurn)
  → si phase == 'closing':
       generar interviewer.message de cierre (sin seed, intent='closing')
       (el POST /sessions/:id/end de #40 disparara el plan de mejora)
  → si no (phase == 'interviewing'):
       seed = troncal correspondiente a nextTurn
       generar interviewer.message (historial + seed, intent='question'|'followup')
  → turnNumber = nextTurn
  → persistir, enviar interviewer.message + session.state
  → liberar lock (en finally)

candidate.transcript con isFinal=false:
  → ignorar (son parciales del STT, no fin de turno)

otros tipos (metrics.update, turn.event, voice.command):
  → fuera del scope de #39 (los consumen otras piezas); se ignoran aca por ahora
```

El handler pasa a necesitar el cliente Gemini. Se inyecta extendiendo `HandlerContext` con `interviewer` (el cliente) o un callback `generateTurn`, decorado en la instancia de Fastify junto a `redis` y `connections`.

## 8. Manejo de errores

- **`llm_unavailable`:** si la llamada a Gemini falla (timeout, rate limit, error de red), se reintenta UNA vez con backoff corto. Si vuelve a fallar, se emite `error{ code: 'llm_unavailable', recoverable: true }` y se mantiene el socket abierto: el candidato puede volver a hablar para reintentar el turno. El lock se libera en el finally.
- **Timeout de Gemini:** se aplica un timeout explícito (ej. 15s) a la llamada para no colgar el turno indefinidamente.
- **Race de generación:** un flag `generating` por sesión (en memoria del handler, una conexión por sesión por el ConnectionRegistry) ignora transcripts que lleguen mientras el LLM aún responde el turno anterior.
- **Validación de la salida del LLM:** la `InterviewerMessage` se arma en el backend (sessionId, intent, timestamp) y solo el `text` viene del LLM; se valida `text.min(1)` y se reccorta a un máximo razonable antes de enviar.

## 9. Variable de entorno

`GEMINI_API_KEY` ya está en el env schema (`config/env.ts`), reservada desde F0. Este issue la usa por primera vez. No se agrega ninguna env nueva; el modelo y los límites son constantes de código (mismo criterio que #34: no son knobs por ambiente).

## 10. Estructura de archivos

```
packages/shared-types/src/
└── llm.ts                          (modifica) agrega ConversationEntry

apps/api/src/interviewer/
├── constants.ts                    (nuevo) turnos, fases, timeout, modelo
├── gemini-client.ts                (nuevo) factory + interfaz GeminiClient
├── gemini-client.test.ts           (nuevo)
├── question-bank.ts                (nuevo) banco de backend + seleccion
├── question-bank.test.ts           (nuevo)
├── prompts.ts                      (nuevo) system prompt por fase
├── interviewer.service.ts          (nuevo) generateInterviewerMessage
├── interviewer.service.test.ts     (nuevo) con fake de Gemini
├── conversation.ts                 (nuevo) persistencia historial en Redis
└── conversation.test.ts            (nuevo) con ioredis-mock

apps/api/src/ws/handler.ts          (modifica) conecta el service en el punto de inyeccion
apps/api/src/ws/handler.test.ts     (modifica) cubre el loop con fake de Gemini
apps/api/src/server.ts              (modifica) construye y decora el cliente Gemini
```

## 11. Testing

- **Unit con fake de Gemini:** `GeminiClient` se inyecta como fake que devuelve texto determinista, sin pegarle a la API real (cero costo y deterministas en CI).
- **Banco:** selección de troncal por turno, no-repetición, indexado por industria.
- **Persistencia:** `RPUSH`/`LRANGE` del historial y el Set de troncales con ioredis-mock.
- **Arco de fases:** derivación correcta de phase por turno, transición a closing en el turno máximo.
- **Integration del handler:** con el fake de Gemini, un `candidate.transcript` final dispara una `interviewer.message` + `session.state` con el turno incrementado; los parciales (`isFinal:false`) se ignoran; el lock evita doble generación.
- **Errores:** el fake simula fallo → reintento → `error{llm_unavailable, recoverable:true}` sin cerrar el socket.
- **No se testea la calidad del contenido del LLM** (eso es manual / demo).

## 12. Lo que queda fuera de scope

- **Plan de mejora** (`POST /sessions/:id/end`, `GET /sessions/:id/plan`, generación del `ImprovementPlan`): es #40. Este issue solo conduce la entrevista en vivo.
- **TTS de IA** (`audioUrl`): F1 sintetiza en cliente con `speechSynthesis`; `audioUrl` queda vacío (spec arquitectónica 3.3). TTS de IA es F5.
- **Más industrias:** el banco se indexa por industria pero F1 solo carga `backend`. F2 agrega las demás.
- **Modelo local (Qwen/Ollama):** spike paralelo de Walter, no bloquea F1 (spec arquitectónica sección 2).
- **Consumo de `metrics.update` / `turn.event` / `voice.command`** en el handler: pertenecen a otras piezas de F1; este issue no los procesa.

## 13. Issues que cierra

- Issue #39 — [F1] LLM entrevistador: integración Gemini y generación de `interviewer.message`.
