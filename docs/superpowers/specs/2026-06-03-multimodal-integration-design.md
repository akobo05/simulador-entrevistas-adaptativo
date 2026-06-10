# Integracion multimodal F1: voz, camara y aura reactiva — Diseno

> Parte restante del issue #42 ([F1] Integracion de los tres modulos y demo de F1).
> La rebanada frontend tecleada (PR #46) cerro el loop con texto y la reconciliacion de UI
> (PR #49) + la recuperacion de pantallas (PR #54) dejaron el AvatarAura integrado en la
> sala. Este diseno cablea la voz (STT/TTS) y la camara (eye_contact) al InterviewPage y
> alimenta el aura con metricas reales, cerrando los puntos 2 y 4 del #42.
>
> **Ajuste 2026-06-10:** la version original proponia construir una `AuraScene` nueva con
> shaders GLSL. Se descarta: la reconciliacion (#49) ya integro el `AvatarAura` de Max
> adaptado al contrato real (anillos por metrica + chips "sin datos", neutral 50 para
> null). Este spec REUSA ese componente y elimina la unidad de shaders y su riesgo.

## Contexto (estado real de main)

El backend (#39 entrevistador, #40 plan, #41 endpoints) responde el loop real, verificado
end-to-end en Docker. El paquete `@warachikuy/voice-pipeline` ya provee como libreria
(construida y testeada, pero SIN consumidores en la web):

- `createSttController` (`stt.ts`): STT por Web Speech API, auto-restart, manejo de errores.
- `createSpeechMetricsTracker` (`speech-metrics.ts`): fluency y speech_rate sobre ventana
  de 30 s (corregido en PR #47: timestamps monotonicos, confianza acotada).
- `metrics-worker` + `createMetricsWorker` (`metrics-worker.ts`): eye_contact con MediaPipe
  FaceLandmarker en un Web Worker (Comlink), throttle 4 Hz, fallback GPU->CPU.

En la web ya existe y SE REUSA (no se construye):

- `useInterviewSocket` con los seams `sendAnswer(text, isFinal)` y `sendMetrics(state)`.
- `AvatarAura` (`components/AvatarAura.tsx`): props `{ fluency, speechRate, eyeContact,
  speaking }`, render 3D con neutral 50 para null y chips "sin datos". Ya esta montado
  lazy en el InterviewPage.
- `auraStateToAvatarProps` (`lib/auraVisual.ts`): selector puro `AuraState|null -> props`
  del aura, ya testeado. Hoy el InterviewPage lo llama con `null` (linea 72) y pasa
  `speaking={false}` (linea 122): ahi se enchufa lo real.
- `@warachikuy/voice-pipeline` ya esta declarado como dependencia en el package.json de
  la web (quedo del andamiaje), aunque ningun fuente lo importa todavia.
- Detalle de empaquetado: el `exports` del paquete resuelve a `dist/` en build, pero el
  worker se crea con `new URL('./metrics-worker.ts', import.meta.url)`, que en dist
  apunta a un `.ts` inexistente. La web lo consume via alias de Vite al codigo fuente
  (`resolve.alias` en `vite.config.ts`) para que Vite empaquete el worker en dev y build.

Lo que falta y cubre este diseno:

1. TTS del entrevistador (no existe; se crea `tts.ts` en voice-pipeline).
2. Cablear STT al loop: el candidato habla -> `sendAnswer`.
3. Cablear las metricas (habla + camara) -> `AuraState` -> `sendMetrics`.
4. Alimentar el `AvatarAura` existente con el `AuraState` real y el estado `speaking`.
5. Gate de permisos (mic + camara) y degradacion.

## Decisiones cerradas (brainstorming + ajuste)

- Camara incluida: eye_contact por MediaPipe se cablea (el worker ya existe).
- TTS por Web Speech API del navegador (`speechSynthesis`), no Gemini TTS. Cero llamadas
  externas extra, cero exposicion a 503, voz `es-*`.
- **El aura es el `AvatarAura` ya integrado** (ajuste): no se construye `AuraScene` ni
  shaders nuevos. El mapeo `AuraState -> props` ya existe (`auraStateToAvatarProps`).
- Input tecleado se mantiene como fallback (accesibilidad + robustez de demo).
- Metricas sin senal salen "sin datos" honesto (se omiten del array de `AuraState`,
  conforme a la spec 3.4); nunca se simulan numeros.
- Solo Chrome (Web Speech API + MediaPipe) para la demo. Se asume explicitamente.

## Contratos (sin cambios)

No se agregan tipos. Se reutilizan los de `@warachikuy/shared-types`:

- `AuraState { sessionId, metrics: AuraMetric[], collectedAt }`.
- `AuraMetric { name: 'fluency'|'eye_contact'|'speech_rate', value: 0-100, confidence, timestamp }`.
- `CandidateTranscript { sessionId, text, isFinal, timestamp }`.
- Mensaje WS `metrics.update` (payload `AuraState`) y `candidate.transcript`.

"Postura/gestos" no esta en `MetricName`, queda fuera de F1 por contrato.

## Arquitectura: unidades

Cada unidad tiene responsabilidad unica y se prueba aislada.

### 1. TTS — `packages/voice-pipeline/src/tts.ts` (NUEVA)

```ts
export interface TtsController {
  speak: (text: string) => void;   // cancela lo previo y habla
  cancel: () => void;
  readonly speaking: boolean;
}
export interface TtsOptions {
  lang?: string;                    // default 'es-PE'
  onStart?: () => void;
  onEnd?: () => void;
  onUnsupported?: () => void;       // navegador sin speechSynthesis
}
export function createTtsController(options?: TtsOptions): TtsController;
```

- Usa `window.speechSynthesis` + `SpeechSynthesisUtterance`.
- Seleccion de voz: primera voz cuyo `lang` empiece por `es`; si las voces no cargaron aun,
  escucha `voiceschanged` una vez. Si no hay voz `es`, usa la default del navegador.
- `speak` cancela la utterance anterior (evita solaparse entre preguntas).
- `onStart`/`onEnd` permiten al InterviewPage manejar `speaking` del aura y el barge-in.
- Si `speechSynthesis` no existe, `speak` es no-op y dispara `onUnsupported`.
- Se exporta desde `index.ts`.

### 2. Pipeline de aura — `apps/web/src/hooks/useAuraPipeline.ts` (NUEVA)

```ts
interface AuraPipeline {
  auraState: AuraState | null;            // ultimo snapshot, para el render
  feedTranscript: (t: CandidateTranscript) => void;  // empuja STT al tracker de habla
  cameraStatus: 'off' | 'starting' | 'on' | 'denied' | 'failed';
}
function useAuraPipeline(
  sessionId: string,
  cameraEnabled: boolean, // viene del PermissionGate: sin permiso no se pide la camara
  onSnapshot: (s: AuraState) => void,
): AuraPipeline;
```

Responsabilidades:
- Crea el `metrics-worker` (`createMetricsWorker`) y un `createSpeechMetricsTracker` al
  montar; los libera al desmontar (`terminate`, limpiar timers, parar el stream).
- Camara: `getUserMedia({ video })` -> `<video>` oculto -> cada 250 ms captura el frame a un
  `<canvas>` -> `ImageData` -> `worker.processFrame(...)` -> metrica eye_contact (o nada si
  no hay medicion).
- Habla: `feedTranscript` reenvia cada transcript al tracker; el tracker expone
  `getMetrics()` (fluency, speech_rate).
- Combinacion: cada 250 ms arma un `AuraState` con las metricas disponibles de ambas
  fuentes (omite las que no hay), setea `auraState` y llama `onSnapshot(state)` (que el
  InterviewPage conecta a `sendMetrics`). Throttle efectivo <=4 Hz.
- Si la camara es 'denied'/'failed', sigue solo con metricas de habla.

### 3. Turno de voz — `apps/web/src/hooks/useVoiceTurn.ts` (NUEVA)

```ts
interface VoiceTurn {
  micStatus: 'idle' | 'listening' | 'denied' | 'unsupported';
  start: () => void;     // arranca STT
  stop: () => void;
}
function useVoiceTurn(
  sessionId: string,
  onFinalTranscript: (t: CandidateTranscript) => void,  // -> sendAnswer + feedTranscript
  onSpeechStart: () => void,                             // -> barge-in (cancela TTS)
): VoiceTurn;
```

- Envuelve `createSttController`. Al recibir un transcript `isFinal: true`, construye el
  `CandidateTranscript` y llama `onFinalTranscript` (el InterviewPage hace
  `sendAnswer(text, true)` y `feedTranscript`).
- Al primer resultado (parcial o final) de un turno dispara `onSpeechStart` para barge-in.
- Mapea errores del STT: `not-allowed`/`service-not-allowed` -> 'denied'; sin Web Speech ->
  'unsupported' (el InterviewPage muestra el ChatForm tecleado).

### 4. Mapeo visual — REUSO de `apps/web/src/lib/auraVisual.ts` (SIN CAMBIOS)

`auraStateToAvatarProps(state)` ya traduce el `AuraState` (con metricas ausentes) a las
props `{ fluency, speechRate, eyeContact }` con `null` = "sin datos". Ya esta testeado.
Esta unidad NO se toca; se lista para dejar explicito que el mapeo no se reconstruye.

### 5. Aura visual — REUSO de `apps/web/src/components/AvatarAura.tsx` (SIN CAMBIOS)

El componente ya renderiza los 3 anillos por metrica, el orbe central con `speaking`,
neutral 50 cuando una metrica es null y chips "sin datos". No se construye AuraScene ni
shader alguno. Si algun ajuste visual hiciera falta, es follow-up, no parte de este slice.

### 6. Gate de permisos — `apps/web/src/components/PermissionGate.tsx` (NUEVA)

- Antes de entrar a la sala, solicita mic + camara con un boton explicito ("Activar
  microfono y camara"). Explica que el video no sale del navegador (RNF05).
- Permite entrar igual si se deniega: degrada a tecleado (sin mic) y/o eye_contact
  "sin datos" (sin camara). No bloquea la demo.

### 7. Orquestacion — `apps/web/src/pages/InterviewPage.tsx` (MODIFICAR)

- Arma: `useInterviewSocket` (existe) + `useAuraPipeline` + `useVoiceTurn` + TTS controller.
- El aura: reemplazar `auraStateToAvatarProps(null)` por
  `auraStateToAvatarProps(pipeline.auraState)` y `speaking={false}` por el estado real del
  TTS (`onStart`/`onEnd` del controller). El `<AvatarAura>` ya esta montado; solo cambian
  sus datos.
- TTS: por cada `interviewer.message` nuevo en `items` (rol interviewer no hablado aun),
  llama `tts.speak`. Trackea el ultimo indice hablado para no repetir (tambien en
  reconexiones, donde el historial llega de golpe: lo ya visto no se re-habla).
- Barge-in: `onSpeechStart` del mic -> `tts.cancel()`.
- `ChatForm` tecleado sigue presente como fallback (siempre disponible; unico camino si
  mic 'denied'/'unsupported').
- Se preservan TODOS los estados WS existentes (#46/#49): closing, terminal, banner de
  desconexion recuperable, endError, ending. Este slice no los toca.

## Flujo de datos

- Voz entra: mic -> STT -> `onFinalTranscript` -> `sendAnswer(text, true)` + `feedTranscript`.
- Camara: `<video>` -> frame 250 ms -> worker -> eye_contact.
- Aura: `useAuraPipeline` combina (fluency, speech_rate, eye_contact) -> `AuraState` ->
  (a) `onSnapshot` -> `sendMetrics` (<=4 Hz), (b) `auraState` -> `auraStateToAvatarProps`
  -> `AvatarAura`.
- Voz sale: `interviewer.message` nuevo -> `tts.speak` (cancelado por barge-in); `speaking`
  del aura sigue el TTS.
- Privacidad (RNF05): el video crudo nunca sale del browser; solo viajan numeros por WS.

## Manejo de errores y degradacion

| Situacion | Comportamiento |
|-----------|----------------|
| Camara denegada/falla | eye_contact "sin datos"; fluency/speech_rate siguen; el resto funciona |
| Mic denegado / Web Speech no soportado | Cae a input tecleado (ChatForm); sin barge-in |
| MediaPipe `model_load_failed` | eye_contact "sin datos" + aviso suave; no bloquea |
| TTS no disponible | Solo texto, sin voz; no rompe |
| `interviewer.message` mientras el candidato habla | barge-in: se cancela el TTS |
| WS se cae durante un turno de voz | Los estados WS existentes ya lo manejan; el STT se detiene al desmontar |

## Testing

- `tts.ts`: unit con `window.speechSynthesis` mockeado (speak cancela previa, voz es-*,
  voiceschanged, unsupported -> onUnsupported, onStart/onEnd).
- `useAuraPipeline`: con worker y tracker mockeados (combina ambas fuentes, omite las que
  no hay, throttle, libera recursos al desmontar, camara denegada).
- `useVoiceTurn`: con STT mockeado (final -> onFinalTranscript, primer resultado ->
  onSpeechStart, not-allowed -> denied).
- `InterviewPage`: con hooks mockeados (TTS habla solo mensajes nuevos, barge-in cancela,
  fallback tecleado cuando mic no disponible, el aura recibe el auraState del pipeline).
- `auraVisual` y `AvatarAura`: ya tienen tests en main; no se duplican.
- Mantener verde el CI (lint, typecheck, test, build, Lighthouse).

## Fuera de scope

- Postura/gestos (no esta en `MetricName` de F1).
- Comandos de voz ("pausa", "repite") — modulo aparte, no es parte de este loop.
- Soporte multi-navegador mas alla de Chrome.
- Cambios visuales al `AvatarAura` (reuso tal cual).
- La demo ya esta grabada; no es parte de este slice.

## Riesgos

- Web Speech API es solo Chrome y manda audio a Google (aceptado para F1; el video si se
  queda local). Mitiga el fallback tecleado.
- El bucle camara->canvas->worker a 4 Hz puede pesar en laptops modestas: el throttle de
  250 ms y el worker (fuera del main thread) lo acotan; si hiciera falta, bajar a 2 Hz es
  un cambio de una constante.
- Gemini puede dar 503 transitorio (visto en pruebas): es del backend y ya degrada solo;
  no lo toca esta rebanada.
- El riesgo del shader GLSL de la version original DESAPARECE con el reuso del AvatarAura.
