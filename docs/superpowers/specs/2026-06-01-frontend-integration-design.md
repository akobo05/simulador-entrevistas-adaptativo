# Diseño: Rebanada frontend de la integracion F1 (Issue #42)

## Contexto

El backend de F1 esta completo y respondiendo (POST /sessions, GET /industries,
WS /v1/sessions/:id/ws, POST /end, GET /plan). El frontend (apps/web, base de
Max ya mergeada en #37) tiene la estetica (Home con orbe 3D, layout, MessageBubble,
ChatForm) pero corre sobre stubs: `useCustomWebSocket` no abre ninguna conexion.

Esta rebanada cablea el frontend al backend real para **cerrar el loop con input
tecleado**: el candidato configura una sesion, entrevista escribiendo respuestas,
y al cerrar ve su plan de mejora. La voz (STT/TTS) y el aura (camara/MediaPipe)
son de Walter y se difieren; esta rebanada deja el seam listo para que enchufen
sin reescribir nada.

Es independiente de las otras dos partes de #42: no depende de Walter (input
tecleado, seam listo) ni de mas trabajo de Max (su base ya esta en main; se
extiende).

## Scope

Dentro:
1. Cliente HTTP tipado contra el backend (`lib/apiClient.ts`).
2. Estado de sesion compartido entre pantallas (`SessionContext`, persistido en
   sessionStorage).
3. Hook de WebSocket real (`useInterviewSocket`) que reemplaza el stub, usando los
   contratos de `@warachikuy/shared-types`.
4. Pantalla de configuracion de sesion (`SetupPage`).
5. Sala de entrevista real (`InterviewPage`, rework de ChatRoom).
6. Pantalla del plan (`PlanPage`) con polling y render del `ImprovementPlan` (4
   anillos de competencias + listas).
7. Ruteo entre las pantallas.

Fuera (lo deja explicito):
- STT, TTS, captura de camara/mic, worker de MediaPipe, emision real de
  `metrics.update` y `candidate.transcript` por voz -> parte de Walter.
- Metricas reales del aura: las 3 competencias medidas salen "sin datos".
- Pulido del avatar/sala 3D mas alla de reusar el orbe existente.
- Persistencia en Postgres (F2). Recuperacion de sesion via GET /sessions/:id
  (existe en el backend, pero el happy-path no lo necesita).

## Decisiones tomadas (brainstorming)

- Input tecleado (la voz es de Walter).
- Plan renderizado con anillos/gauges (conic-gradient CSS), fiel al prototipo PC02.
- 3 metricas medidas: "sin datos" honesto + nota "pendiente: modulo de voz". No se
  simulan numeros.
- Una ruta por pantalla.
- Estado de sesion en un React Context respaldado por sessionStorage (sobrevive un
  refresh durante el polling del plan).

## Arquitectura / flujo

```
/  (Home, existe)                 CTA "Comenzar" -> /setup
   |
/setup  (SetupPage)              GET /industries -> form -> POST /sessions
   |                              guarda {sessionId, token, websocketUrl} en contexto
/interview/:sessionId            WS real: candidate.transcript <-> interviewer.message
   (InterviewPage)               al cerrar (intent:closing o boton) -> POST /end
   |
/plan/:sessionId  (PlanPage)     polling GET /plan -> render del ImprovementPlan
```

El `websocketUrl` que devuelve POST /sessions ya trae el `?token=`, asi que el hook
se conecta directo sin construir la URL. El `token` se reusa para POST /end y
GET /plan.

## Unidades (archivos, responsabilidad e interfaz)

### lib/apiClient.ts
Cliente HTTP tipado. Base: `import.meta.env.VITE_API_URL ?? 'http://localhost:3000'`.
```typescript
getIndustries(): Promise<IndustryOption[]>          // GET /api/v1/industries -> body.industries
createSession(req: CreateSessionRequest): Promise<CreateSessionResponse>  // POST /api/v1/sessions
endSession(sessionId: string, token: string): Promise<{ sessionId: string; planId: string }>
getPlan(sessionId: string, token: string): Promise<PlanResponse | { status: 'not_found' }>
```
- `IndustryOption = { id: Industry; name: string }` (deriva de shared-types `INDUSTRIES`).
- Respuestas no esperadas (no 2xx en create/end; ni 200/202/404 en plan) -> lanza
  `ApiClientError { code, message }` leyendo el envelope `apiError` cuando exista.
- `getPlan`: 200/202 -> parsea el body con `PlanResponseSchema` (ready/generating/
  failed); 404 -> `{ status: 'not_found' }`.

### context/SessionContext.tsx
```typescript
interface SessionData {
  sessionId: string; token: string; websocketUrl: string;
  industry: Industry; level: Level;
}
useSession(): { session: SessionData | null; setSession(s: SessionData): void; clearSession(): void }
```
- `SessionProvider` hidrata desde sessionStorage (clave `warachikuy:session`) al montar
  y persiste en cada `setSession`. `clearSession` limpia al volver al inicio.

### hooks/useInterviewSocket.ts (reemplaza useCustomWebSocket)
```typescript
type ChatItem = { id: string; role: 'interviewer' | 'candidate'; text: string;
                  intent?: InterviewerMessage['intent']; timestamp: number };

interface InterviewSocket {
  items: ChatItem[];
  phase: SessionPhase;            // 'warmup' | 'interviewing' | 'closing'
  turnNumber: number;
  status: 'connecting' | 'open' | 'closed';
  lastError: { code: string; message: string; recoverable: boolean } | null;
  closing: boolean;              // true cuando llego un interviewer.message intent:'closing'
  sendAnswer(text: string, isFinal?: boolean): void;  // candidate.transcript (default isFinal:true)
  sendMetrics(state: AuraState): void;     // SEAM para Walter; no se usa en esta rebanada
}
useInterviewSocket(websocketUrl: string, sessionId: string): InterviewSocket
```
- `sessionId` se pasa explicito (no se parsea del path del websocketUrl): la
  InterviewPage ya lo tiene del contexto. Se usa para el payload de candidate.transcript.
- Ciclo de vida (React 19 StrictMode). El socket se crea dentro de un `useEffect` y se
  guarda en un `useRef`. El cleanup del efecto llama `socket.close(1000)`. Como StrictMode
  monta/desmonta/monta los efectos en dev, el cleanup cierra el primer socket antes de
  abrir el segundo: para evitar conexiones huerfanas y dobles sesiones (el backend cerraria
  una con SESSION_REPLACED 4000), los handlers (message/close/error) chequean que el evento
  venga del socket vigente en el ref y descartan los de un socket ya marcado para cierre.
  Asi el close del socket viejo (StrictMode) no pinta un falso "conexion perdida".
- Cada mensaje entrante se valida con `ServerToClientMessageSchema.safeParse`; los
  invalidos se descartan con console.warn (no rompen la UI).
- Discrimina por `type`: `interviewer.message` -> append a items (role interviewer,
  intent), setea `closing` si intent==='closing'; `session.state` -> phase/turnNumber;
  `error` -> lastError.
- `sendAnswer(text, isFinal = true)`: envia
  `{ type:'candidate.transcript', payload:{ sessionId, text, isFinal, timestamp } }`. Con
  isFinal=true (input tecleado) hace append optimista del item candidate. El parametro
  isFinal queda para el SEAM de voz: el STT de Walter manda parciales (isFinal:false) para
  mostrar lo que se va diciendo; el render de parciales (actualizar el ultimo globo del
  candidato en vez de append) es parte de la integracion de voz, no de esta rebanada. El
  backend ignora los candidate.transcript con isFinal:false (no avanzan el turno).
- `sendMetrics`: envia `{ type:'metrics.update', payload: auraState }`. Documentado para
  Walter. La rebanada no lo invoca.
- Heartbeat: el backend pinga el socket cada ~30s y el browser responde pong
  automaticamente (transparente). El hook NO manda pings; la sesion vive mientras el WS
  este abierto.
- Cierre del WS (incluido el SESSION_EXPIRED 4001 tras /end): status='closed'.

### pages/SetupPage.tsx
- Al montar: `getIndustries()` (loading / error con reintento).
- Form: select de industria (de las opciones) + select de nivel (junior/mid/senior).
- Submit: `createSession({industry, level})` -> `setSession(...)` -> `navigate('/interview/'+sessionId)`.
- Error de createSession -> mensaje, permite reintentar.

### pages/InterviewPage.tsx (rework de ChatRoom)
- Lee `session` del contexto; si no hay -> `Navigate` a /setup.
- `useInterviewSocket(session.websocketUrl, session.sessionId)`.
- Render: el orbe (OrbeAnimado) como presencia del entrevistador, la lista de items
  (MessageBubble adaptado a ChatItem), indicador de fase/turno, `ChatForm` que llama
  `sendAnswer`.
- Cierre: cuando `closing` se vuelve true se RENDERIZA el mensaje de cierre del
  entrevistador (la despedida), se deshabilita el `ChatForm`, y aparece un boton manual
  "Ver mi plan de mejora". NO se auto-navega: el candidato debe poder leer la despedida.
  (Tambien hay un boton "Finalizar entrevista" disponible antes del closing.) Al apretar el
  boton: `endSession(sessionId, token)` -> `navigate('/plan/'+sessionId)`. El boton se
  deshabilita mientras corre el POST /end; si /end falla (timeout / red) se rehabilita y
  muestra un banner de error para reintentar (no se navega sin un /end ok).
- `lastError` recoverable (ej. llm_unavailable) -> banner inline; permite reintentar el
  ultimo envio. No recoverable / cierre inesperado -> mensaje de conexion perdida.
- Recarga a mitad de entrevista (limitacion consciente de F1): los `items` viven en el
  hook y no se persisten. El backend NO reenvia el historial al reconectar (manda solo
  session.state y, en sesion fresca, el warmup). Por eso una recarga deja el chat en blanco
  aunque el WS reconecte; el arco se reanuda al enviar la siguiente respuesta. Se recomienda
  no recargar durante la entrevista; la recarga es segura en /plan. Persistir los items en
  sessionStorage para soportar recarga es una mejora diferida (fuera de esta rebanada).

### pages/PlanPage.tsx
- Lee `session` del contexto (necesita el token); si no hay -> Navigate a /setup.
- Polling `getPlan(sessionId, token)` cada 1.5 s con flag de cancelacion: el
  intervalo/timeout se limpia al desmontar y el polling se detiene apenas el status sea
  terminal (ready / failed / not_found). Nunca queda corriendo tras navegar fuera ni setea
  estado en un componente desmontado. Estados:
  - generating -> spinner "Generando tu plan de mejora...".
  - ready -> render del plan.
  - failed -> mensaje "No se pudo generar el plan" + opcion de volver al inicio.
  - not_found (404) -> mensaje equivalente.
- Render ready: `summary`, 4 `CompetencyRing` (fluency/eye_contact/speech_rate/content),
  listas de `strengths` / `improvements` / `exercises` (titulo + descripcion), y la nota
  "Las metricas de camara y voz se integran con el modulo de voz" cuando hay competencias
  con score null.
- Boton "Nueva entrevista" -> `clearSession()` -> navigate('/').

### components/CompetencyRing.tsx
```typescript
CompetencyRing({ label, score }: { label: string; score: number | null })
```
- Anillo circular con conic-gradient proporcional al score (0-100). La condicion de "sin
  datos" es `score === null` (NUNCA `!score`): un score 0 es valido y distinto de "sin
  datos". `score===null` -> anillo vacio con la etiqueta "sin datos". Accesible (aria-label
  con el valor).

### App.tsx / ruteo
- Envuelve las rutas en `<SessionProvider>`.
- Rutas: `/` (Home), `/setup` (SetupPage), `/interview/:sessionId` (InterviewPage),
  `/plan/:sessionId` (PlanPage), `*` (NotFound).
- Home: el CTA "Comenzar" pasa de `navigate('/chat')` a `navigate('/setup')`. La ruta
  `/chat` y el stub `useCustomWebSocket` se eliminan.

## Flujo de datos

POST /sessions (SetupPage) -> contexto {sessionId, token, websocketUrl, industry, level}
-> InterviewPage abre el WS con websocketUrl -> intercambio candidate/interviewer
-> POST /end?token -> PlanPage poll GET /plan?token -> ImprovementPlan -> render.

Contratos consumidos de @warachikuy/shared-types: `CreateSessionRequest/Response`,
`INDUSTRIES`/`Industry`/`Level`, `ClientToServerMessageSchema`/`ServerToClientMessageSchema`
(+ sus tipos `InterviewerMessage`, `SessionPhase`, `AuraState`), `PlanResponseSchema`,
`ImprovementPlan`, `PlanCompetency`, `PlanExercise`.

## Manejo de errores

- API: create/end fallidos -> `ApiClientError` -> mensaje en pantalla + reintento.
- WS: mensajes `error` recoverable (llm_unavailable) -> banner, reintentar el turno;
  cierre inesperado -> "conexion perdida"; SESSION_EXPIRED (4001) tras /end es esperado.
- Mensajes WS que no validan el schema -> se descartan (console.warn), no tumban la UI.
- Plan: generating (spinner), failed/not_found (mensaje), nunca queda colgado (el
  backend fuerza failed por timeout).
- Guards de navegacion: InterviewPage/PlanPage sin sesion en contexto -> redirect a /setup.
- Sanitizacion: el texto del LLM (interviewer.message, summary, comentarios, ejercicios) y
  del candidato se renderiza SIEMPRE como children de React (que escapa por defecto).
  Prohibido `dangerouslySetInnerHTML` sobre cualquier output del LLM o del candidato.

## El seam para la voz/aura (Walter)

`useInterviewSocket` expone `sendMetrics(auraState: AuraState)` que emite
`metrics.update`. El input tecleado de esta rebanada no lo usa. Cuando Walter cablee
su pipeline (createSttController, createSpeechMetricsTracker, worker de MediaPipe),
produce un `AuraState` y llama `sendMetrics` (o emite candidate.transcript desde STT
en lugar del tecleo). No requiere cambios en esta rebanada: las 3 competencias dejan
de salir "sin datos".

## Testing

vitest + happy-dom (ya en uso en apps/web). Pragmatico para F1:
- `apiClient`: `global.fetch` mockeado con vi.fn (simple, sin dependencias nuevas; MSW
  queda como posible mejora de F2). Cada metodo mapea respuestas y errores (incl. 404 del plan).
- `useInterviewSocket`: WebSocket global mockeado; verifica discriminacion por type, forma
  correcta de candidate.transcript en sendAnswer, captura de error/phase, y que el cleanup
  cierra el socket (sin conexiones tras desmontar; un remonte de StrictMode no duplica).
- `SetupPage`: renderiza industrias, submit llama createSession y navega.
- `PlanPage`: transicion generating->ready, render de las 4 competencias y del "sin datos".
- `CompetencyRing`: render con score y con null.
- Reemplazar/ajustar el test existente de la ruta /chat (App.test) por el nuevo ruteo.

## Fuera de scope (recordatorio)

Voz/STT/TTS, camara/MediaPipe, metricas reales, pulido 3D, Postgres, GET /sessions/:id
en el happy-path. Todo eso es de Walter/Max o de F2.
