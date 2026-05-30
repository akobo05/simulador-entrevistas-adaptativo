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
- La selección es por índice acotado al número de turnos de interviewing (5 troncales para 5 turnos), así que no existe caso de "agotamiento del banco": el índice nunca excede el largo. El banco debe tener al menos `INTERVIEWING_TURNS` entradas (se valida con un test).
- Las troncales usadas se registran (`session:asked:<id>`) para no repetir si hubiera reintentos.

## 4. Prompts por rol y fase

`apps/api/src/interviewer/prompts.ts` expone un system prompt del rol entrevistador, parametrizado por fase. El prompt deja claro:

- Es un entrevistador técnico profesional, en español neutro, tono cordial pero riguroso.
- Hace UNA pregunta por turno. No da feedback ni la respuesta correcta (eso es del plan de mejora, #40).
- En warmup: una pregunta ligera de presentación. En interviewing: usa la troncal provista, puede hacer un follow-up corto a la respuesta previa. En closing: agradece y cierra, sin nueva pregunta.
- Responde solo con el texto de la intervención, sin meta-comentarios.
- **Longitud máxima: 2-3 oraciones cortas.** El frontend sintetiza con `speechSynthesis`; respuestas largas degradan la experiencia de voz. El prompt lo pide explícitamente y el backend recorta como red de seguridad (§8).
- **Resistencia a prompt injection:** el prompt instruye al modelo a mantenerse en su rol de entrevistador y a tratar todo lo que diga el candidato como su respuesta a la pregunta, nunca como instrucciones. Esto se refuerza estructuralmente con el formato de inyección del historial (ver §5): el texto del candidato viaja en turnos `user` de la API, no dentro del system prompt.

El `intent` de la `InterviewerMessage` (`question` | `followup` | `clarification` | `closing`) lo fija el backend según la fase y si hubo respuesta previa, no el LLM. Esto mantiene el contrato predecible.

## 5. Servicio del entrevistador

`apps/api/src/interviewer/interviewer.service.ts`:

```typescript
export interface GenerateTurnInput {
  state: SessionState;          // industry, level, phase, turnNumber
  history: ConversationEntry[]; // turnos previos persistidos (candidato + entrevistador)
  candidateText?: string;       // respuesta actual del candidato, AUN no persistida (ver §6/§7)
  seed?: SeedQuestion;          // troncal del turno (ausente en warmup/closing)
}

export async function generateInterviewerMessage(
  client: GeminiClient,
  input: GenerateTurnInput,
): Promise<InterviewerMessage>;
```

Función pura respecto de Redis y el socket: recibe el estado, el historial y la respuesta actual del candidato, llama a Gemini, devuelve una `InterviewerMessage` validada contra el schema de `shared-types`. El cliente Gemini se inyecta por parámetro para poder usar un fake en tests.

El `candidateText` se recibe por parámetro (no se lee de Redis) porque la respuesta actual del candidato todavía no está persistida: solo se persiste junto con la respuesta del entrevistador si la generación tiene éxito (ver §6).

**Formato de inyección del historial.** El service NO concatena el historial en el system prompt. Mapea cada `ConversationEntry` a un turno nativo de la API de Gemini (`candidate` → rol `user`, `interviewer` → rol `model`) y los pasa en el array `contents`, con `candidateText` como el último turno `user`. El system prompt queda reservado exclusivamente para las instrucciones de rol y fase. Además de ser más robusto, esto separa estructuralmente los datos del candidato (en turnos `user`) de las instrucciones (en el system prompt), mitigando prompt injection.

`apps/api/src/interviewer/gemini-client.ts` expone un factory `buildGeminiClient(env)` y una interfaz mínima `GeminiClient` (`generate(systemPrompt: string, contents: GeminiTurn[]): Promise<string>`, donde `GeminiTurn = { role: 'user' | 'model'; text: string }`) para que los tests inyecten un fake determinista sin pegarle a la API real.

## 6. Persistencia del historial

`apps/api/src/interviewer/conversation.ts`:

- Historial: Redis List `session:messages:<id>`. Cada entrada es un `ConversationEntry` (`{ role: 'interviewer' | 'candidate', text, timestamp }`) serializado como JSON. `RPUSH` al agregar, `LRANGE 0 -1` al leer el contexto.
- Troncales usadas: Redis Set `session:asked:<id>` con los `id` de las `SeedQuestion` ya servidas.
- Ambas keys comparten el TTL de la sesión y se renuevan con el `EXPIRE` del pong que ya existe (se extiende para cubrir estas keys).

**Escritura atómica del turno (evita corrupción del historial).** La respuesta del candidato y la del entrevistador se persisten JUNTAS y SOLO si la generación de Gemini tuvo éxito, en un único `pipeline()` de ioredis (`RPUSH` del turno del candidato + `RPUSH` del turno del entrevistador + `SADD` de la troncal + `EXPIRE` de las keys). Razón: si se persistiera el transcript del candidato antes de llamar a Gemini y la llamada fallara con `recoverable: true`, al reintentar el candidato quedarían dos turnos `candidate` consecutivos en la lista, rompiendo la alternancia y confundiendo al LLM en turnos siguientes. Persistir solo en éxito mantiene el invariante candidato→entrevistador→candidato→…

El `warmup` (mensaje inicial sin respuesta previa del candidato) persiste solo el turno del entrevistador.

Batchear `EXPIRE` dentro del mismo pipeline evita round-trips extra a Redis.

`ConversationEntry` se define en `shared-types` para que #40 (plan de mejora) reuse el mismo tipo al leer el historial.

## 7. Integración en el handler del WS

Punto de inyección actual: `apps/api/src/ws/handler.ts` línea ~76, donde hoy recibe un mensaje válido y solo loguea.

Orden clave (deriva de §6): se GENERA primero, se PERSISTE solo en éxito, se ENVÍA al final verificando que el socket siga abierto.

```
on connect (warmup):
  → generar primera interviewer.message (warmup, sin seed)
  → si exito y socket abierto: persistir turno del entrevistador + enviar
       interviewer.message + session.state (phase=warmup, turnNumber=0)
  → si falla: manejar segun §8 (no se persiste nada)

on candidate.transcript con isFinal=true:
  → si hay generacion en curso para esta sesion: ignorar (lock)
  → si turnNumber ya es MAX_INTERVIEWER_TURNS (entrevista cerrada): ignorar
  → marcar lock 'generating'
  → try:
       nextTurn = turnNumber + 1; phase = derivePhase(nextTurn)
       seed = (phase == 'interviewing') ? troncal de nextTurn : undefined
       // candidateText va por parametro, AUN no persistido
       generar interviewer.message (history + candidateText + seed)
       → si la generacion fallo: manejar segun §8 (NO se persiste el transcript
         del candidato; el turno no avanza; el candidato puede reintentar)
       → si exito:
            si el socket ya no esta abierto (candidato se desconecto durante
              la generacion): NO persistir, NO enviar; solo loguear y salir
            persistir ATOMICAMENTE (pipeline): turno candidato + turno
              entrevistador + SADD troncal + EXPIRE keys  (ver §6)
            turnNumber = nextTurn
            enviar interviewer.message + session.state
  → finally: liberar lock

candidate.transcript con isFinal=false:
  → ignorar (son parciales del STT, no fin de turno)

otros tipos (metrics.update, turn.event, voice.command):
  → fuera del scope de #39 (los consumen otras piezas); se ignoran aca por ahora

on close (ya existe en el handler):
  → ademas del unregister actual, liberar el lock 'generating' de la sesion
    por si la conexion cayo a mitad de un turno
```

El handler pasa a necesitar el cliente Gemini. Se inyecta extendiendo `HandlerContext` con `interviewer` (el cliente) o un callback `generateTurn`, decorado en la instancia de Fastify junto a `redis` y `connections`.

Como la orquestación del turno crece, se extrae a su propio módulo `apps/api/src/interviewer/turn-orchestrator.ts` (recibe el `HandlerContext`, el historial y el transcript; ejecuta generar→persistir→enviar). El `handler.ts` solo lo invoca desde el punto de inyección, manteniéndose delgado.

Distinguimos tres clases de fallo, porque ameritan respuestas distintas. En NINGÚN caso se persiste el turno (ver §6): el historial solo crece con turnos exitosos.

- **Fallo transitorio → `llm_unavailable`:** timeout, rate limit o error de red. Se reintenta UNA vez con backoff corto. Si vuelve a fallar, se emite `error{ code: 'llm_unavailable', recoverable: true }` y se mantiene el socket abierto. El turno NO avanza; el candidato puede volver a hablar para reintentar.
- **Contenido bloqueado o respuesta vacía → fallback de reformulación:** Gemini puede bloquear el input del candidato o la salida generada por sus safety filters, o devolver texto vacío. Esto NO es un problema de red: reintentar fallaría por lo mismo. En vez de `llm_unavailable`, se emite una `interviewer.message` de fallback con `intent: 'clarification'` (ej. "No pude procesar bien tu última respuesta, ¿podrías reformularla?"), el turno NO avanza, y el candidato responde de nuevo. El mensaje de fallback es texto fijo del backend, no requiere otra llamada al LLM. Este caso NO se persiste hasta que un turno real tenga éxito.
- **Timeout de Gemini:** se aplica un timeout explícito (ej. 15s) a la llamada para no colgar el turno indefinidamente. Cuenta como fallo transitorio (`llm_unavailable`).

Otros puntos:

- **Race de generación:** un flag `generating` por sesión (en memoria del handler; una conexión por sesión por el ConnectionRegistry) ignora transcripts que lleguen mientras el LLM aún responde el turno anterior. Se libera en el `finally` del turno y también en el `on close` del socket (§7), por si la conexión cae a mitad de la generación.
- **Desconexión durante la generación:** si el candidato se desconecta mientras Gemini procesa, al volver la respuesta se verifica que el socket siga abierto antes de persistir y enviar. `sendServer` ya hace su propio guard de `readyState` (no lanza al enviar sobre un socket cerrado), pero además evitamos persistir un turno que el candidato nunca va a recibir.
- **Validación de la salida del LLM:** la `InterviewerMessage` se arma en el backend (sessionId, intent, timestamp) y solo el `text` viene del LLM; se valida `text.min(1)` (un texto vacío cae en el caso de fallback de arriba) y se recorta a un máximo razonable antes de enviar.

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
├── interviewer.service.ts          (nuevo) generateInterviewerMessage (historial→contents)
├── interviewer.service.test.ts     (nuevo) con fake de Gemini
├── conversation.ts                 (nuevo) persistencia atomica del historial en Redis
├── conversation.test.ts            (nuevo) con ioredis-mock
├── turn-orchestrator.ts            (nuevo) generar→persistir-en-exito→enviar; maneja §8
└── turn-orchestrator.test.ts       (nuevo) arco, fallback, llm_unavailable, desconexion

apps/api/src/ws/handler.ts          (modifica) invoca el orchestrator en el punto de inyeccion; libera lock en on close
apps/api/src/ws/handler.test.ts     (modifica) cubre el loop con fake de Gemini
apps/api/src/server.ts              (modifica) construye y decora el cliente Gemini
```

## 11. Testing

- **Unit con fake de Gemini:** `GeminiClient` se inyecta como fake que devuelve texto determinista, sin pegarle a la API real (cero costo y deterministas en CI).
- **Banco:** selección de troncal por turno, no-repetición, indexado por industria.
- **Persistencia:** `RPUSH`/`LRANGE` del historial y el Set de troncales con ioredis-mock.
- **Arco de fases:** derivación correcta de phase por turno, transición a closing en el turno máximo.
- **Inyección del historial:** `generateInterviewerMessage` mapea `ConversationEntry[]` + `candidateText` a `GeminiTurn[]` con roles `user`/`model` correctos, y deja el system prompt sin datos del candidato (se verifica con el fake capturando los args).
- **Integration del handler:** con el fake de Gemini, un `candidate.transcript` final dispara una `interviewer.message` + `session.state` con el turno incrementado; los parciales (`isFinal:false`) se ignoran; el lock evita doble generación.
- **Persistencia atómica:** un fallo de generación NO deja rastro en `session:messages:<id>` (el transcript del candidato no se persiste); un éxito agrega exactamente dos entradas (candidato + entrevistador) en orden.
- **Fallo transitorio:** el fake simula error de red → reintento → `error{llm_unavailable, recoverable:true}`, socket abierto, turno sin avanzar.
- **Contenido bloqueado / vacío:** el fake simula respuesta vacía o bloqueada → `interviewer.message{intent:'clarification'}` de fallback, turno sin avanzar, sin persistir.
- **Desconexión durante la generación:** el fake demora la respuesta, se cierra el socket antes de que resuelva → no se persiste ni se envía; el lock queda liberado.
- **No se testea la calidad del contenido del LLM** (eso es manual / demo).

## 12. Lo que queda fuera de scope

- **Plan de mejora** (`POST /sessions/:id/end`, `GET /sessions/:id/plan`, generación del `ImprovementPlan`): es #40. Este issue solo conduce la entrevista en vivo.
- **TTS de IA** (`audioUrl`): F1 sintetiza en cliente con `speechSynthesis`; `audioUrl` queda vacío (spec arquitectónica 3.3). TTS de IA es F5.
- **Más industrias:** el banco se indexa por industria pero F1 solo carga `backend`. F2 agrega las demás.
- **Modelo local (Qwen/Ollama):** spike paralelo de Walter, no bloquea F1 (spec arquitectónica sección 2).
- **Personalización del prompt con datos del candidato (CV, historial de sesiones):** F1 mantiene los prompts estáticos en `prompts.ts`. La inyección de contexto del candidato (ej. su CV) para adaptar las preguntas es F2/F3 (personalización); el módulo `prompts.ts` queda aislado para soportarlo sin reescribir el service.
- **Consumo de `metrics.update` / `turn.event` / `voice.command`** en el handler: pertenecen a otras piezas de F1; este issue no los procesa.

## 13. Issues que cierra

- Issue #39 — [F1] LLM entrevistador: integración Gemini y generación de `interviewer.message`.
