# Integracion Multimodal (Slice B) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar los puntos 2 y 4 del issue #42: el entrevistador habla (TTS), el candidato responde por voz (STT), la camara mide eye_contact y el aura reacciona en vivo con metricas reales.

**Architecture:** Se construye `tts.ts` en voice-pipeline y tres unidades web (`useVoiceTurn`, `useAuraPipeline`, `PermissionGate`); el `InterviewPage` las orquesta REUSANDO el `AvatarAura` y `auraStateToAvatarProps` existentes y los seams `sendAnswer`/`sendMetrics` del socket. Todo degrada a tecleado/"sin datos" si faltan permisos o APIs.

**Tech Stack:** voice-pipeline (Web Speech API, MediaPipe worker via Comlink — ya construidos), React 19 + Vite 6, vitest 3 + happy-dom + @testing-library/react (`fireEvent` y `renderHook`; NO user-event).

**Spec:** `docs/superpowers/specs/2026-06-03-multimodal-integration-design.md` (ajustado 2026-06-10)

**Convenciones obligatorias:**
- Identificadores en ingles; comentarios y commits en espanol natural SIN acentos. El texto visible de UI SI puede llevar acentos.
- Sin marcas de IA. TDD en cada unidad. Hook de prettier en cada commit es normal.
- Comandos: `pnpm --filter @warachikuy/voice-pipeline test` / `pnpm --filter @warachikuy/web test [archivo]`.

---

## Estructura de archivos

| Archivo | Accion | Responsabilidad |
|---------|--------|-----------------|
| `packages/voice-pipeline/src/tts.ts` (+ test) | Crear | TTS del entrevistador (speechSynthesis) |
| `packages/voice-pipeline/src/index.ts` | Modificar | Exportar el TTS |
| `apps/web/vite.config.ts` | Modificar | Alias del paquete de voz a su codigo fuente |
| `apps/web/src/hooks/useVoiceTurn.ts` (+ test) | Crear | STT -> transcript final + barge-in |
| `apps/web/src/hooks/useAuraPipeline.ts` (+ test) | Crear | Combina habla+camara -> AuraState 4 Hz |
| `apps/web/src/components/PermissionGate.tsx` (+ css + test) | Crear | Pedir permisos con degradacion |
| `apps/web/src/pages/InterviewPage.tsx` (+ css) | Modificar | Orquestacion: gate, TTS, mic, aura real |
| `apps/web/src/pages/InterviewPage.test.tsx` | Modificar | Adaptar tests existentes + nuevos |

**REUSO (no tocar):** `AvatarAura.tsx`, `auraVisual.ts`, `useInterviewSocket.ts`, `stt.ts`, `speech-metrics.ts`, `metrics-worker*.ts`, todo `apps/api`.

**Datos de contexto que el implementador necesita:**
- `createSttController(sessionId, onTranscript, options?, recognitionFactory?)`: `onTranscript`
  recibe `CandidateTranscript` completos (parciales con `isFinal:false` y finales con `true`).
  Si el navegador no tiene Web Speech, `start()` LANZA sincronicamente. Errores terminales
  (`not-allowed`, `audio-capture`, `service-not-allowed`, `max-restart-attempts-exceeded`)
  llegan por `options.onError`.
- `createSpeechMetricsTracker()`: `{ onTranscript(t), getMetrics(): AuraMetric[] }`.
- `createMetricsWorker()`: `{ api: { initialize(): Promise<void>, processFrame(buffer, w, h):
  Promise<AuraMetric[]>, dispose() }, terminate() }` (Comlink: todo lo del api es async).
- `useInterviewSocket(url, sessionId)`: con `url === ''` NO conecta (early return del efecto)
  y reconecta cuando la URL cambia (dep `[websocketUrl]`). `ChatItem = { id, role:
  'interviewer'|'candidate', text, intent?, timestamp }`.
- `AvatarAura` props: `{ fluency, speechRate, eyeContact: number|null, speaking: boolean }`.
- `auraStateToAvatarProps(state: AuraState|null)` ya existe y esta testeado.

---

### Task 1: TTS en voice-pipeline

**Files:**
- Create: `packages/voice-pipeline/src/tts.ts`
- Create: `packages/voice-pipeline/src/tts.test.ts`
- Modify: `packages/voice-pipeline/src/index.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `packages/voice-pipeline/src/tts.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTtsController } from './tts';

// Fake minimo de SpeechSynthesisUtterance: captura texto y expone los handlers
class FakeUtterance {
  text: string;
  lang = '';
  voice: unknown = null;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

function makeSynth(voices: Array<{ lang: string }> = []) {
  return {
    speak: vi.fn(),
    cancel: vi.fn(),
    getVoices: vi.fn(() => voices),
    addEventListener: vi.fn(),
  };
}

describe('createTtsController', () => {
  let synth: ReturnType<typeof makeSynth>;

  beforeEach(() => {
    synth = makeSynth([{ lang: 'en-US' }, { lang: 'es-PE' }]);
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('speak cancela lo previo, arma la utterance con voz es-* y la habla', () => {
    const tts = createTtsController();
    tts.speak('Hola candidato');
    expect(synth.cancel).toHaveBeenCalledOnce();
    expect(synth.speak).toHaveBeenCalledOnce();
    const utt = synth.speak.mock.calls[0]![0] as FakeUtterance;
    expect(utt.text).toBe('Hola candidato');
    expect(utt.lang).toBe('es-PE');
    expect((utt.voice as { lang: string }).lang).toBe('es-PE');
  });

  it('si las voces no cargaron, escucha voiceschanged una vez', () => {
    synth.getVoices.mockReturnValue([]);
    createTtsController();
    expect(synth.addEventListener).toHaveBeenCalledWith('voiceschanged', expect.any(Function), {
      once: true,
    });
  });

  it('onstart/onend actualizan speaking y disparan los callbacks', () => {
    const onStart = vi.fn();
    const onEnd = vi.fn();
    const tts = createTtsController({ onStart, onEnd });
    tts.speak('Pregunta');
    const utt = synth.speak.mock.calls[0]![0] as FakeUtterance;
    expect(tts.speaking).toBe(false);
    utt.onstart?.();
    expect(tts.speaking).toBe(true);
    expect(onStart).toHaveBeenCalledOnce();
    utt.onend?.();
    expect(tts.speaking).toBe(false);
    expect(onEnd).toHaveBeenCalledOnce();
  });

  it('cancel corta la sintesis y libera speaking (y onerror tambien libera)', () => {
    const onEnd = vi.fn();
    const tts = createTtsController({ onEnd });
    tts.speak('Pregunta');
    const utt = synth.speak.mock.calls[0]![0] as FakeUtterance;
    utt.onstart?.();
    tts.cancel();
    expect(synth.cancel).toHaveBeenCalledTimes(2); // una por speak, otra por cancel
    expect(tts.speaking).toBe(false);
    // El navegador dispara onerror al cancelar: no debe romper ni duplicar estado
    utt.onerror?.();
    expect(tts.speaking).toBe(false);
  });

  it('sin speechSynthesis: speak es no-op y dispara onUnsupported', () => {
    Object.defineProperty(window, 'speechSynthesis', { value: undefined, configurable: true });
    const onUnsupported = vi.fn();
    const tts = createTtsController({ onUnsupported });
    expect(() => tts.speak('Hola')).not.toThrow();
    expect(onUnsupported).toHaveBeenCalledOnce();
    expect(() => tts.cancel()).not.toThrow();
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `pnpm --filter @warachikuy/voice-pipeline test src/tts.test.ts`
Expected: FAIL — no existe `./tts`.

- [ ] **Step 3: Implementar `tts.ts`**

```ts
export interface TtsOptions {
  /** Locale BCP-47 de la utterance. Default: 'es-PE'. */
  lang?: string;
  onStart?: () => void;
  onEnd?: () => void;
  /** Navegador sin speechSynthesis: la app sigue solo con texto. */
  onUnsupported?: () => void;
}

export interface TtsController {
  /** Cancela lo que este sonando y habla este texto. */
  speak: (text: string) => void;
  cancel: () => void;
  readonly speaking: boolean;
}

export function createTtsController(options: TtsOptions = {}): TtsController {
  const lang = options.lang ?? 'es-PE';
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
  let speaking = false;
  let voice: SpeechSynthesisVoice | null = null;

  // Eleccion de voz: primera cuyo lang empiece por 'es'. Chrome carga las voces
  // de forma asincrona: si aun no estan, se reintenta una sola vez al evento
  // voiceschanged. Si nunca aparece una voz es-*, la utterance usa la default.
  function pickVoice(): void {
    if (!synth) return;
    voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith('es')) ?? null;
  }
  if (synth) {
    pickVoice();
    if (!voice) synth.addEventListener('voiceschanged', pickVoice, { once: true });
  }

  function speak(text: string): void {
    if (!synth) {
      options.onUnsupported?.();
      return;
    }
    // Cancela la pregunta anterior para no solapar audios entre turnos
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    if (voice) utterance.voice = voice;
    utterance.onstart = () => {
      speaking = true;
      options.onStart?.();
    };
    utterance.onend = () => {
      speaking = false;
      options.onEnd?.();
    };
    // Al cancelar (barge-in) el navegador dispara error, no end: tambien libera
    utterance.onerror = () => {
      speaking = false;
      options.onEnd?.();
    };
    synth.speak(utterance);
  }

  function cancel(): void {
    if (!synth) return;
    synth.cancel();
    speaking = false;
  }

  return {
    speak,
    cancel,
    get speaking() {
      return speaking;
    },
  };
}
```

Nota (ajustada tras el review de calidad): la implementacion final agrega una referencia
`current` a la utterance en curso, con guard `utterance !== current` en los handlers. Cubre
dos defectos reales: el bug de GC de Chrome (utterance sin referencia pierde su onend) y la
carrera donde el onerror tardio de una utterance cancelada apagaria el speaking de la nueva.
`cancel()` y un `speak()` nuevo liberan el habla en curso avisando con onEnd.

- [ ] **Step 4: Exportar en `index.ts`**

Agregar al final de `packages/voice-pipeline/src/index.ts`:

```ts
export { createTtsController } from './tts';
export type { TtsController, TtsOptions } from './tts';
```

- [ ] **Step 5: Verificar que pasan + lint/typecheck del paquete**

Run: `pnpm --filter @warachikuy/voice-pipeline test && pnpm --filter @warachikuy/voice-pipeline lint && pnpm --filter @warachikuy/voice-pipeline typecheck`
Expected: PASS (los 20 tests previos + 5 nuevos), lint y typecheck limpios.

- [ ] **Step 6: Commit**

```bash
git add packages/voice-pipeline/src/tts.ts packages/voice-pipeline/src/tts.test.ts packages/voice-pipeline/src/index.ts
git commit -m "Se agrega el controlador de sintesis de voz del entrevistador"
```

---

### Task 2: Alias de Vite al codigo fuente del paquete de voz

El `exports` de voice-pipeline resuelve a `dist/` en build de produccion, pero
`metrics-worker-client.ts` crea el worker con `new URL('./metrics-worker.ts',
import.meta.url)`: en dist ese `.ts` no existe y el build/runtime romperia. Consumir el
paquete desde `src/` deja que Vite empaquete el worker correctamente en dev Y build.

**Files:**
- Modify: `apps/web/vite.config.ts`

- [ ] **Step 1: Agregar el alias**

Reemplazar el contenido de `apps/web/vite.config.ts` por:

```ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // El paquete de voz se consume desde su codigo fuente: su worker se crea
      // con new URL('./metrics-worker.ts', import.meta.url), que en el dist
      // compilado apuntaria a un .ts inexistente. Desde src, Vite empaqueta el
      // worker como chunk propio tanto en dev como en build.
      '@warachikuy/voice-pipeline': fileURLToPath(
        new URL('../../packages/voice-pipeline/src/index.ts', import.meta.url),
      ),
    },
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
  },
});
```

- [ ] **Step 2: Verificar suite y build (el alias aun es inerte: nadie importa el paquete)**

Run: `pnpm --filter @warachikuy/web test && pnpm --filter @warachikuy/web build`
Expected: PASS y build OK, sin cambios en la salida.

- [ ] **Step 3: Commit**

```bash
git add apps/web/vite.config.ts
git commit -m "Se consume el paquete de voz desde su fuente para empaquetar bien el worker"
```

---

### Task 3: Hook useVoiceTurn

**Files:**
- Create: `apps/web/src/hooks/useVoiceTurn.ts`
- Test: `apps/web/src/hooks/useVoiceTurn.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `apps/web/src/hooks/useVoiceTurn.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { CandidateTranscript } from '@warachikuy/shared-types';
import { useVoiceTurn } from './useVoiceTurn';

// Captura el callback y las opciones que el hook le pasa al controlador real
const startMock = vi.fn();
const stopMock = vi.fn();
let capturedOnTranscript: (t: CandidateTranscript) => void = () => undefined;
let capturedOnError: ((code: string) => void) | undefined;

vi.mock('@warachikuy/voice-pipeline', () => ({
  createSttController: vi.fn(
    (
      _sessionId: string,
      onTranscript: (t: CandidateTranscript) => void,
      options?: { onError?: (code: string) => void },
    ) => {
      capturedOnTranscript = onTranscript;
      capturedOnError = options?.onError;
      return { start: startMock, stop: stopMock };
    },
  ),
}));

function transcript(text: string, isFinal: boolean): CandidateTranscript {
  return { sessionId: 's1', text, isFinal, timestamp: Date.now() };
}

describe('useVoiceTurn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('start arranca el STT y pasa a listening', () => {
    const { result } = renderHook(() => useVoiceTurn('s1', vi.fn(), vi.fn()));
    expect(result.current.micStatus).toBe('idle');
    act(() => result.current.start());
    expect(startMock).toHaveBeenCalledOnce();
    expect(result.current.micStatus).toBe('listening');
  });

  it('dispara onSpeechStart una vez por turno y onFinalTranscript con el final', () => {
    const onFinal = vi.fn();
    const onSpeechStart = vi.fn();
    const { result } = renderHook(() => useVoiceTurn('s1', onFinal, onSpeechStart));
    act(() => result.current.start());
    act(() => capturedOnTranscript(transcript('hola', false)));
    act(() => capturedOnTranscript(transcript('hola que', false)));
    expect(onSpeechStart).toHaveBeenCalledOnce(); // solo el primer parcial del turno
    expect(onFinal).not.toHaveBeenCalled();
    act(() => capturedOnTranscript(transcript('hola que tal', true)));
    expect(onFinal).toHaveBeenCalledWith(expect.objectContaining({ text: 'hola que tal' }));
    // Nuevo turno: el proximo parcial vuelve a disparar barge-in
    act(() => capturedOnTranscript(transcript('otra', false)));
    expect(onSpeechStart).toHaveBeenCalledTimes(2);
  });

  it('error terminal del STT -> denied', () => {
    const { result } = renderHook(() => useVoiceTurn('s1', vi.fn(), vi.fn()));
    act(() => result.current.start());
    act(() => capturedOnError?.('not-allowed'));
    expect(result.current.micStatus).toBe('denied');
  });

  it('start que lanza (sin Web Speech API) -> unsupported', () => {
    startMock.mockImplementationOnce(() => {
      throw new Error('Web Speech API no disponible en este navegador');
    });
    const { result } = renderHook(() => useVoiceTurn('s1', vi.fn(), vi.fn()));
    act(() => result.current.start());
    expect(result.current.micStatus).toBe('unsupported');
  });

  it('stop detiene el STT y al desmontar tambien se detiene', () => {
    const { result, unmount } = renderHook(() => useVoiceTurn('s1', vi.fn(), vi.fn()));
    act(() => result.current.start());
    act(() => result.current.stop());
    expect(stopMock).toHaveBeenCalledOnce();
    expect(result.current.micStatus).toBe('idle');
    unmount();
    expect(stopMock).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `pnpm --filter @warachikuy/web test src/hooks/useVoiceTurn.test.ts`
Expected: FAIL — no existe `./useVoiceTurn`.

- [ ] **Step 3: Implementar el hook**

Crear `apps/web/src/hooks/useVoiceTurn.ts`:

```ts
import { useEffect, useRef, useState } from 'react';
import { createSttController, type SttController } from '@warachikuy/voice-pipeline';
import type { CandidateTranscript } from '@warachikuy/shared-types';

export type MicStatus = 'idle' | 'listening' | 'denied' | 'unsupported';

export interface VoiceTurn {
  micStatus: MicStatus;
  start: () => void;
  stop: () => void;
}

// Envuelve el STT del paquete de voz para el loop de la entrevista: expone el
// estado del microfono, entrega solo los transcripts FINALES (los parciales se
// usan unicamente para detectar que el candidato empezo a hablar -> barge-in).
export function useVoiceTurn(
  sessionId: string,
  onFinalTranscript: (t: CandidateTranscript) => void,
  onSpeechStart: () => void,
): VoiceTurn {
  const [micStatus, setMicStatus] = useState<MicStatus>('idle');
  const controllerRef = useRef<SttController | null>(null);
  // Callbacks por ref: el controlador vive entre renders y no debe capturar
  // closures viejos del componente.
  const onFinalRef = useRef(onFinalTranscript);
  const onSpeechStartRef = useRef(onSpeechStart);
  onFinalRef.current = onFinalTranscript;
  onSpeechStartRef.current = onSpeechStart;
  // true mientras hay un turno hablado en curso (ya se aviso onSpeechStart)
  const inTurnRef = useRef(false);

  function ensureController(): SttController {
    if (controllerRef.current === null) {
      controllerRef.current = createSttController(
        sessionId,
        (t) => {
          if (!inTurnRef.current) {
            inTurnRef.current = true;
            onSpeechStartRef.current();
          }
          if (t.isFinal) {
            inTurnRef.current = false;
            onFinalRef.current(t);
          }
        },
        {
          // Errores terminales (not-allowed, audio-capture, service-not-allowed,
          // max-restart-attempts-exceeded): el mic queda fuera, cae el fallback tecleado
          onError: () => setMicStatus('denied'),
        },
      );
    }
    return controllerRef.current;
  }

  function start(): void {
    try {
      ensureController().start();
      setMicStatus('listening');
    } catch {
      // createSttController.start lanza sincronicamente si no hay Web Speech API
      setMicStatus('unsupported');
    }
  }

  function stop(): void {
    controllerRef.current?.stop();
    inTurnRef.current = false;
    setMicStatus('idle');
  }

  // Al desmontar la sala el STT no puede quedar escuchando
  useEffect(() => {
    return () => controllerRef.current?.stop();
  }, []);

  return { micStatus, start, stop };
}
```

- [ ] **Step 4: Verificar que pasan**

Run: `pnpm --filter @warachikuy/web test src/hooks/useVoiceTurn.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Lint/typecheck y commit**

Run: `pnpm --filter @warachikuy/web lint && pnpm --filter @warachikuy/web typecheck`

```bash
git add apps/web/src/hooks/useVoiceTurn.ts apps/web/src/hooks/useVoiceTurn.test.ts
git commit -m "Se agrega el hook del turno de voz con barge-in y degradacion"
```

---

### Task 4: Hook useAuraPipeline

**Files:**
- Create: `apps/web/src/hooks/useAuraPipeline.ts`
- Test: `apps/web/src/hooks/useAuraPipeline.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `apps/web/src/hooks/useAuraPipeline.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { AuraMetric, CandidateTranscript } from '@warachikuy/shared-types';
import { useAuraPipeline } from './useAuraPipeline';

const speechMetric: AuraMetric = {
  name: 'fluency',
  value: 80,
  confidence: 'high',
  timestamp: 1,
};
const eyeMetric: AuraMetric = {
  name: 'eye_contact',
  value: 60,
  confidence: 'medium',
  timestamp: 1,
};

const trackerMock = {
  onTranscript: vi.fn(),
  getMetrics: vi.fn((): AuraMetric[] => []),
};
const workerApi = {
  initialize: vi.fn(async () => undefined),
  processFrame: vi.fn(async (): Promise<AuraMetric[]> => [eyeMetric]),
  dispose: vi.fn(),
};
const terminateMock = vi.fn();

vi.mock('@warachikuy/voice-pipeline', () => ({
  createSpeechMetricsTracker: vi.fn(() => trackerMock),
  createMetricsWorker: vi.fn(() => ({ api: workerApi, terminate: terminateMock })),
}));

const stopTrack = vi.fn();
function mockGetUserMedia(impl: () => Promise<MediaStream>) {
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: vi.fn(impl) },
    configurable: true,
  });
}
function fakeStream(): MediaStream {
  return { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;
}

describe('useAuraPipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    trackerMock.getMetrics.mockReturnValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('con camara deshabilitada no pide la camara y emite snapshots solo de habla', () => {
    mockGetUserMedia(() => Promise.reject(new Error('no debe llamarse')));
    trackerMock.getMetrics.mockReturnValue([speechMetric]);
    const onSnapshot = vi.fn();
    const { result } = renderHook(() => useAuraPipeline('s1', false, onSnapshot));
    expect(result.current.cameraStatus).toBe('off');
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(onSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 's1', metrics: [speechMetric] }),
    );
    expect(result.current.auraState?.metrics).toEqual([speechMetric]);
  });

  it('sin ninguna metrica no emite snapshots (nada de AuraState vacios)', () => {
    mockGetUserMedia(() => Promise.reject(new Error('x')));
    const onSnapshot = vi.fn();
    renderHook(() => useAuraPipeline('s1', false, onSnapshot));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onSnapshot).not.toHaveBeenCalled();
  });

  it('camara denegada -> denied y el pipeline de habla sigue', async () => {
    mockGetUserMedia(() => Promise.reject(new Error('NotAllowed')));
    trackerMock.getMetrics.mockReturnValue([speechMetric]);
    const onSnapshot = vi.fn();
    const { result } = renderHook(() => useAuraPipeline('s1', true, onSnapshot));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.cameraStatus).toBe('denied');
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(onSnapshot).toHaveBeenCalled();
  });

  it('camara ok -> on, inicializa el worker y combina habla + camara', async () => {
    mockGetUserMedia(() => Promise.resolve(fakeStream()));
    trackerMock.getMetrics.mockReturnValue([speechMetric]);
    // El hook crea <video>/<canvas> internos: se stubean via createElement para
    // que el frame loop funcione en happy-dom (que no tiene video real)
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'video') {
        return {
          videoWidth: 2,
          videoHeight: 2,
          muted: false,
          srcObject: null,
          play: vi.fn(async () => undefined),
        } as unknown as HTMLVideoElement;
      }
      if (tag === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => ({
            drawImage: vi.fn(),
            getImageData: () => ({ data: new Uint8ClampedArray(16), width: 2, height: 2 }),
          }),
        } as unknown as HTMLCanvasElement;
      }
      return realCreate(tag);
    });

    const onSnapshot = vi.fn();
    const { result } = renderHook(() => useAuraPipeline('s1', true, onSnapshot));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.cameraStatus).toBe('on');
    expect(workerApi.initialize).toHaveBeenCalledOnce();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    await waitFor(() => {
      const last = onSnapshot.mock.calls.at(-1)?.[0] as { metrics: AuraMetric[] };
      expect(last.metrics).toEqual(expect.arrayContaining([speechMetric, eyeMetric]));
    });
  });

  it('feedTranscript delega al tracker de habla', () => {
    mockGetUserMedia(() => Promise.reject(new Error('x')));
    const { result } = renderHook(() => useAuraPipeline('s1', false, vi.fn()));
    const t: CandidateTranscript = { sessionId: 's1', text: 'hola', isFinal: true, timestamp: 1 };
    act(() => result.current.feedTranscript(t));
    expect(trackerMock.onTranscript).toHaveBeenCalledWith(t);
  });

  it('al desmontar libera worker, stream y timers', async () => {
    mockGetUserMedia(() => Promise.resolve(fakeStream()));
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'video')
        return {
          videoWidth: 0,
          videoHeight: 0,
          muted: false,
          srcObject: null,
          play: vi.fn(async () => undefined),
        } as unknown as HTMLVideoElement;
      if (tag === 'canvas')
        return { getContext: () => null } as unknown as HTMLCanvasElement;
      return realCreate(tag);
    });
    const onSnapshot = vi.fn();
    const { unmount } = renderHook(() => useAuraPipeline('s1', true, onSnapshot));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    unmount();
    expect(terminateMock).toHaveBeenCalledOnce();
    expect(stopTrack).toHaveBeenCalled();
    onSnapshot.mockClear();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onSnapshot).not.toHaveBeenCalled(); // timers limpiados
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `pnpm --filter @warachikuy/web test src/hooks/useAuraPipeline.test.ts`
Expected: FAIL — no existe `./useAuraPipeline`.

- [ ] **Step 3: Implementar el hook**

Crear `apps/web/src/hooks/useAuraPipeline.ts`:

```ts
import { useEffect, useRef, useState } from 'react';
import {
  createMetricsWorker,
  createSpeechMetricsTracker,
  type MetricsWorkerClient,
  type SpeechMetricsTracker,
} from '@warachikuy/voice-pipeline';
import type { AuraMetric, AuraState, CandidateTranscript } from '@warachikuy/shared-types';

export type CameraStatus = 'off' | 'starting' | 'on' | 'denied' | 'failed';

export interface AuraPipeline {
  /** Ultimo snapshot, para alimentar el AvatarAura. */
  auraState: AuraState | null;
  /** Empuja un transcript final del STT al tracker de habla. */
  feedTranscript: (t: CandidateTranscript) => void;
  cameraStatus: CameraStatus;
}

// 250 ms = 4 Hz, el maximo que acepta el backend para metrics.update
const SNAPSHOT_INTERVAL_MS = 250;

// Combina las dos fuentes de metricas (habla y camara) en AuraState periodicos.
// Las metricas sin senal se OMITEN del array (contrato 3.4: "sin datos" honesto);
// si no hay ninguna, no se emite snapshot.
export function useAuraPipeline(
  sessionId: string,
  cameraEnabled: boolean,
  onSnapshot: (s: AuraState) => void,
): AuraPipeline {
  const [auraState, setAuraState] = useState<AuraState | null>(null);
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('off');
  const trackerRef = useRef<SpeechMetricsTracker | null>(null);
  const onSnapshotRef = useRef(onSnapshot);
  onSnapshotRef.current = onSnapshot;
  // Ultima medicion de la camara; la escribe el frame loop y la lee el snapshot
  const eyeMetricsRef = useRef<AuraMetric[]>([]);

  if (trackerRef.current === null) {
    trackerRef.current = createSpeechMetricsTracker();
  }

  useEffect(() => {
    let worker: MetricsWorkerClient | null = null;
    let stream: MediaStream | null = null;
    let frameTimer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    async function startCamera(): Promise<void> {
      setCameraStatus('starting');
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      } catch {
        if (!cancelled) setCameraStatus('denied');
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      try {
        worker = createMetricsWorker();
        await worker.api.initialize();
      } catch {
        if (!cancelled) setCameraStatus('failed');
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      if (cancelled) return;

      const video = document.createElement('video');
      video.muted = true;
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      setCameraStatus('on');

      frameTimer = setInterval(() => {
        if (!ctx || !worker || video.videoWidth === 0) return;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        // Copia simple del buffer (sin Comlink.transfer): a 4 Hz y resolucion de
        // webcam el costo es bajo y evita invalidar el ImageData
        worker.api
          .processFrame(img.data.buffer as ArrayBuffer, img.width, img.height)
          .then((metrics) => {
            if (!cancelled) eyeMetricsRef.current = metrics;
          })
          .catch(() => {
            // Frame perdido: se reintenta en el proximo tick
          });
      }, SNAPSHOT_INTERVAL_MS);
    }

    if (cameraEnabled) void startCamera();

    const snapshotTimer = setInterval(() => {
      const metrics = [...trackerRef.current!.getMetrics(), ...eyeMetricsRef.current];
      if (metrics.length === 0) return;
      const state: AuraState = { sessionId, metrics, collectedAt: Date.now() };
      setAuraState(state);
      onSnapshotRef.current(state);
    }, SNAPSHOT_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (frameTimer) clearInterval(frameTimer);
      clearInterval(snapshotTimer);
      worker?.terminate();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [sessionId, cameraEnabled]);

  function feedTranscript(t: CandidateTranscript): void {
    trackerRef.current!.onTranscript(t);
  }

  return { auraState, feedTranscript, cameraStatus };
}
```

- [ ] **Step 4: Verificar que pasan**

Run: `pnpm --filter @warachikuy/web test src/hooks/useAuraPipeline.test.ts`
Expected: PASS (6 tests). Si `img.data.buffer` da error de tipos (ArrayBufferLike), el cast
`as ArrayBuffer` del codigo ya lo cubre.

- [ ] **Step 5: Lint/typecheck y commit**

Run: `pnpm --filter @warachikuy/web lint && pnpm --filter @warachikuy/web typecheck`

```bash
git add apps/web/src/hooks/useAuraPipeline.ts apps/web/src/hooks/useAuraPipeline.test.ts
git commit -m "Se agrega el pipeline del aura que combina habla y camara"
```

---

### Task 5: PermissionGate

**Files:**
- Create: `apps/web/src/components/PermissionGate.tsx`
- Create: `apps/web/src/components/PermissionGate.css`
- Test: `apps/web/src/components/PermissionGate.test.tsx`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `apps/web/src/components/PermissionGate.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PermissionGate } from './PermissionGate';

const stopTrack = vi.fn();
function fakeStream() {
  return { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;
}

function mockGetUserMedia(results: Array<'ok' | 'fail'>) {
  let call = 0;
  Object.defineProperty(navigator, 'mediaDevices', {
    value: {
      getUserMedia: vi.fn(() => {
        const r = results[call++];
        return r === 'ok' ? Promise.resolve(fakeStream()) : Promise.reject(new Error('denied'));
      }),
    },
    configurable: true,
  });
}

describe('PermissionGate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('activa mic y camara (dos solicitudes separadas) y reporta ambos permisos', async () => {
    mockGetUserMedia(['ok', 'ok']);
    const onReady = vi.fn();
    render(<PermissionGate onReady={onReady} />);
    fireEvent.click(screen.getByRole('button', { name: /activar micrófono y cámara/i }));
    await waitFor(() => expect(onReady).toHaveBeenCalledWith({ mic: true, camera: true }));
    // Los streams solo se pedian para el permiso: se detienen al instante
    expect(stopTrack).toHaveBeenCalledTimes(2);
  });

  it('mic ok pero camara denegada -> degradacion parcial', async () => {
    mockGetUserMedia(['ok', 'fail']);
    const onReady = vi.fn();
    render(<PermissionGate onReady={onReady} />);
    fireEvent.click(screen.getByRole('button', { name: /activar/i }));
    await waitFor(() => expect(onReady).toHaveBeenCalledWith({ mic: true, camera: false }));
  });

  it('continuar sin activar -> ambos en false sin pedir permisos', () => {
    mockGetUserMedia(['fail', 'fail']);
    const onReady = vi.fn();
    render(<PermissionGate onReady={onReady} />);
    fireEvent.click(screen.getByRole('button', { name: /continuar sin activar/i }));
    expect(onReady).toHaveBeenCalledWith({ mic: false, camera: false });
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  });

  it('explica que el video no sale del navegador (RNF05)', () => {
    mockGetUserMedia([]);
    render(<PermissionGate onReady={vi.fn()} />);
    expect(screen.getByText(/nunca sale de tu equipo/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `pnpm --filter @warachikuy/web test src/components/PermissionGate.test.tsx`
Expected: FAIL — no existe `./PermissionGate`.

- [ ] **Step 3: Implementar el componente**

Crear `apps/web/src/components/PermissionGate.tsx`:

```tsx
import { useState } from 'react';
import { Button } from './Button';
import './PermissionGate.css';

export interface PermissionGrants {
  mic: boolean;
  camera: boolean;
}

interface PermissionGateProps {
  onReady: (grants: PermissionGrants) => void;
}

// Pide los permisos ANTES de entrar a la sala, con un boton explicito (los
// navegadores castigan los prompts sin gesto del usuario). Cada permiso se
// solicita por separado para degradar de forma independiente: sin mic queda el
// modo tecleado, sin camara el eye_contact sale "sin datos".
export function PermissionGate({ onReady }: PermissionGateProps) {
  const [requesting, setRequesting] = useState(false);

  async function requestOne(constraints: MediaStreamConstraints): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      // Solo se pedia el permiso: el stream real lo abre cada pipeline despues
      stream.getTracks().forEach((t) => t.stop());
      return true;
    } catch {
      return false;
    }
  }

  async function activate(): Promise<void> {
    setRequesting(true);
    const mic = await requestOne({ audio: true });
    const camera = await requestOne({ video: true });
    onReady({ mic, camera });
  }

  return (
    <section className="pg-root" data-testid="permission-gate">
      <h2 className="pg-title">Antes de empezar</h2>
      <p className="pg-text">
        Para la entrevista por voz activá el micrófono y la cámara. El video se procesa en tu
        navegador y <strong>nunca sale de tu equipo</strong>: solo viajan métricas numéricas.
      </p>
      <div className="pg-actions">
        <Button onClick={() => void activate()} disabled={requesting}>
          {requesting ? 'Solicitando permisos...' : 'Activar micrófono y cámara'}
        </Button>
        <button
          type="button"
          className="pg-skip"
          onClick={() => onReady({ mic: false, camera: false })}
          disabled={requesting}
        >
          Continuar sin activar (responderé por texto)
        </button>
      </div>
    </section>
  );
}
```

Crear `apps/web/src/components/PermissionGate.css`:

```css
/* Gate de permisos previo a la sala — tema oscuro de la sala (#080C14) */
.pg-root {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-4);
  padding: var(--space-6);
  background: #080c14;
  text-align: center;
}

.pg-title {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 700;
  color: #f1f5f9;
  margin: 0;
}

.pg-text {
  max-width: 420px;
  font-size: 14px;
  line-height: 1.6;
  color: #94a3b8;
  margin: 0;
}

.pg-actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  margin-top: var(--space-2);
}

.pg-skip {
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 13px;
  text-decoration: underline;
  cursor: pointer;
  padding: var(--space-2);
}

.pg-skip:hover {
  color: #cbd5e1;
}

.pg-skip:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

- [ ] **Step 4: Verificar que pasan**

Run: `pnpm --filter @warachikuy/web test src/components/PermissionGate.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Lint/typecheck y commit**

Run: `pnpm --filter @warachikuy/web lint && pnpm --filter @warachikuy/web typecheck`

```bash
git add apps/web/src/components/PermissionGate.tsx apps/web/src/components/PermissionGate.css apps/web/src/components/PermissionGate.test.tsx
git commit -m "Se agrega el gate de permisos con degradacion independiente por permiso"
```

---

### Task 6: Orquestacion en InterviewPage

**Files:**
- Modify: `apps/web/src/pages/InterviewPage.tsx`
- Modify: `apps/web/src/pages/InterviewPage.css` (boton del mic)
- Modify: `apps/web/src/pages/InterviewPage.test.tsx`

- [ ] **Step 1: Reescribir el test (los existentes se adaptan, fallan primero)**

Reemplazar el contenido COMPLETO de `apps/web/src/pages/InterviewPage.test.tsx` por:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type * as RouterModule from 'react-router-dom';
import type { CandidateTranscript } from '@warachikuy/shared-types';
import { SessionProvider, type SessionData } from '../context/SessionContext';
import { InterviewPage } from './InterviewPage';
import * as apiClient from '../lib/apiClient';
import * as hookMod from '../hooks/useInterviewSocket';
import type { InterviewSocket, ChatItem } from '../hooks/useInterviewSocket';
import * as voiceMod from '../hooks/useVoiceTurn';
import type { VoiceTurn, MicStatus } from '../hooks/useVoiceTurn';
import * as auraMod from '../hooks/useAuraPipeline';
import type { AuraPipeline } from '../hooks/useAuraPipeline';

// AvatarAura captura sus props para asertar el cableado del aura
let lastAuraProps: Record<string, unknown> = {};
vi.mock('../components/AvatarAura', () => ({
  AvatarAura: (props: Record<string, unknown>) => {
    lastAuraProps = props;
    return null;
  },
}));

// Gate stub: dos botones para resolverlo con o sin permisos
vi.mock('../components/PermissionGate', () => ({
  PermissionGate: ({ onReady }: { onReady: (g: { mic: boolean; camera: boolean }) => void }) => (
    <div data-testid="gate-stub">
      <button onClick={() => onReady({ mic: true, camera: true })}>gate-grant</button>
      <button onClick={() => onReady({ mic: false, camera: false })}>gate-skip</button>
    </div>
  ),
}));

// TTS espiable
const ttsSpeak = vi.fn();
const ttsCancel = vi.fn();
let ttsOptions: { onStart?: () => void; onEnd?: () => void } = {};
vi.mock('@warachikuy/voice-pipeline', () => ({
  createTtsController: vi.fn((opts: { onStart?: () => void; onEnd?: () => void }) => {
    ttsOptions = opts;
    return { speak: ttsSpeak, cancel: ttsCancel, speaking: false };
  }),
}));

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof RouterModule>()),
  useNavigate: () => navigateMock,
}));

const session: SessionData = {
  sessionId: 's1',
  token: 'a'.repeat(64),
  websocketUrl: 'ws://x',
  industry: 'backend',
  level: 'mid',
};

function seedSession() {
  sessionStorage.setItem('warachikuy:session', JSON.stringify(session));
}

function fakeSocket(over: Partial<InterviewSocket> = {}): InterviewSocket {
  return {
    items: [],
    phase: 'warmup',
    turnNumber: 0,
    status: 'open',
    lastError: null,
    closing: false,
    sendAnswer: vi.fn(),
    sendMetrics: vi.fn(),
    ...over,
  };
}

// Voz espiable: captura los callbacks que la pagina le pasa
let voiceCallbacks: { onFinal: (t: CandidateTranscript) => void; onSpeechStart: () => void } = {
  onFinal: () => undefined,
  onSpeechStart: () => undefined,
};
const voiceStart = vi.fn();
const voiceStop = vi.fn();
function fakeVoice(micStatus: MicStatus = 'idle'): VoiceTurn {
  return { micStatus, start: voiceStart, stop: voiceStop };
}

// Pipeline espiable
const feedTranscript = vi.fn();
function fakePipeline(over: Partial<AuraPipeline> = {}): AuraPipeline {
  return { auraState: null, feedTranscript, cameraStatus: 'off', ...over };
}

function interviewerItem(id: string, text: string): ChatItem {
  return { id, role: 'interviewer', text, timestamp: 1 };
}

let voiceReturn: VoiceTurn;
let pipelineReturn: AuraPipeline;

function renderPage(opts: { grant?: boolean } = {}) {
  const utils = render(
    <MemoryRouter>
      <SessionProvider>
        <InterviewPage />
      </SessionProvider>
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByText(opts.grant === false ? 'gate-skip' : 'gate-grant'));
  return utils;
}

describe('InterviewPage', () => {
  let socketSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    seedSession();
    lastAuraProps = {};
    voiceReturn = fakeVoice();
    pipelineReturn = fakePipeline();
    vi.spyOn(voiceMod, 'useVoiceTurn').mockImplementation((_sid, onFinal, onSpeechStart) => {
      voiceCallbacks = { onFinal, onSpeechStart };
      return voiceReturn;
    });
    vi.spyOn(auraMod, 'useAuraPipeline').mockImplementation(() => pipelineReturn);
    socketSpy = vi.spyOn(hookMod, 'useInterviewSocket');
  });

  // ── Gate ───────────────────────────────────────────────

  it('muestra el gate primero y no conecta el WS hasta resolverlo', () => {
    socketSpy.mockReturnValue(fakeSocket());
    render(
      <MemoryRouter>
        <SessionProvider>
          <InterviewPage />
        </SessionProvider>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('gate-stub')).toBeInTheDocument();
    // Mientras el gate esta abierto, el hook recibe URL vacia (no conecta)
    expect(socketSpy).toHaveBeenLastCalledWith('', 's1');
    fireEvent.click(screen.getByText('gate-grant'));
    expect(socketSpy).toHaveBeenLastCalledWith('ws://x', 's1');
  });

  // ── Comportamiento existente (adaptado: ahora pasa por el gate) ──

  it('renderiza los items y envia la respuesta tecleada', () => {
    const sendAnswer = vi.fn();
    socketSpy.mockReturnValue(
      fakeSocket({ items: [interviewerItem('m1', 'Hola, cuentame de ti')], sendAnswer }),
    );
    renderPage();
    expect(screen.getByText('Hola, cuentame de ti')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'soy backend' } });
    fireEvent.submit(screen.getByRole('button', { name: /enviar/i }).closest('form')!);
    expect(sendAnswer).toHaveBeenCalledWith('soy backend');
  });

  it('al closing muestra el boton ver plan y al apretarlo llama end y navega', async () => {
    vi.spyOn(apiClient, 'endSession').mockResolvedValue({ sessionId: 's1', planId: 'p1' });
    socketSpy.mockReturnValue(fakeSocket({ closing: true }));
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /ver mi plan/i }));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/plan/s1'));
  });

  it('si endSession falla muestra banner y no navega', async () => {
    vi.spyOn(apiClient, 'endSession').mockRejectedValue(new Error('x'));
    socketSpy.mockReturnValue(fakeSocket({ closing: true }));
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /ver mi plan/i }));
    await waitFor(() => expect(screen.getByTestId('ip-end-error')).toBeInTheDocument());
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('ante un error no recuperable muestra el mensaje y oculta el form', () => {
    socketSpy.mockReturnValue(
      fakeSocket({ lastError: { code: 'x', message: 'Sesion expirada', recoverable: false } }),
    );
    renderPage();
    expect(screen.getByTestId('ip-terminal')).toHaveTextContent('Sesion expirada');
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('ante una desconexion inesperada muestra aviso y oculta el form', () => {
    socketSpy.mockReturnValue(fakeSocket({ status: 'closed' }));
    renderPage();
    expect(screen.getByTestId('ip-terminal')).toHaveTextContent(/se perdio la conexion/i);
  });

  it('deshabilita el form mientras la conexion no esta abierta', () => {
    socketSpy.mockReturnValue(fakeSocket({ status: 'connecting' }));
    renderPage();
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  // ── TTS ────────────────────────────────────────────────

  it('habla cada interviewer.message nuevo una sola vez', () => {
    const items = [interviewerItem('m1', 'Primera pregunta')];
    const sock = fakeSocket({ items });
    socketSpy.mockReturnValue(sock);
    const { rerender } = renderPage();
    expect(ttsSpeak).toHaveBeenCalledWith('Primera pregunta');
    expect(ttsSpeak).toHaveBeenCalledOnce();
    // Mismo array: re-render sin items nuevos no re-habla
    rerender(
      <MemoryRouter>
        <SessionProvider>
          <InterviewPage />
        </SessionProvider>
      </MemoryRouter>,
    );
    expect(ttsSpeak).toHaveBeenCalledOnce();
  });

  it('con historial de golpe (reconexion) habla solo el ultimo mensaje', () => {
    socketSpy.mockReturnValue(
      fakeSocket({
        items: [
          interviewerItem('m1', 'Vieja uno'),
          { id: 'c1', role: 'candidate', text: 'r', timestamp: 1 },
          interviewerItem('m2', 'Vieja dos'),
          interviewerItem('m3', 'Actual'),
        ],
      }),
    );
    renderPage();
    expect(ttsSpeak).toHaveBeenCalledOnce();
    expect(ttsSpeak).toHaveBeenCalledWith('Actual');
  });

  it('el aura refleja speaking del TTS', async () => {
    socketSpy.mockReturnValue(fakeSocket());
    renderPage();
    expect(lastAuraProps.speaking).toBe(false);
    act(() => ttsOptions.onStart?.());
    await waitFor(() => expect(lastAuraProps.speaking).toBe(true));
    act(() => ttsOptions.onEnd?.());
    await waitFor(() => expect(lastAuraProps.speaking).toBe(false));
  });

  // ── Voz del candidato ──────────────────────────────────

  it('el transcript final del mic va a sendAnswer y al pipeline', () => {
    const sendAnswer = vi.fn();
    socketSpy.mockReturnValue(fakeSocket({ sendAnswer }));
    renderPage();
    const t: CandidateTranscript = {
      sessionId: 's1',
      text: 'mi respuesta hablada',
      isFinal: true,
      timestamp: 1,
    };
    voiceCallbacks.onFinal(t);
    expect(sendAnswer).toHaveBeenCalledWith('mi respuesta hablada', true);
    expect(feedTranscript).toHaveBeenCalledWith(t);
  });

  it('barge-in: cuando el candidato empieza a hablar se cancela el TTS', () => {
    socketSpy.mockReturnValue(fakeSocket());
    renderPage();
    voiceCallbacks.onSpeechStart();
    expect(ttsCancel).toHaveBeenCalled();
  });

  it('toggle del mic: en idle arranca la escucha y en listening la detiene', () => {
    socketSpy.mockReturnValue(fakeSocket());
    voiceReturn = fakeVoice('idle');
    const { unmount } = renderPage();
    fireEvent.click(screen.getByTestId('ip-mic-toggle'));
    expect(voiceStart).toHaveBeenCalledOnce();
    unmount();
    // Con el mic escuchando, el mismo boton detiene
    voiceReturn = fakeVoice('listening');
    renderPage();
    expect(screen.getByTestId('ip-mic-toggle')).toHaveTextContent(/escuchando/i);
    fireEvent.click(screen.getByTestId('ip-mic-toggle'));
    expect(voiceStop).toHaveBeenCalled();
  });

  it('camara denegada -> aviso suave visible', () => {
    socketSpy.mockReturnValue(fakeSocket());
    pipelineReturn = fakePipeline({ cameraStatus: 'denied' });
    renderPage();
    expect(screen.getByTestId('ip-camera-note')).toBeInTheDocument();
  });

  it('sin permiso de mic no hay boton de mic y el form tecleado queda', () => {
    socketSpy.mockReturnValue(fakeSocket());
    renderPage({ grant: false });
    expect(screen.queryByTestId('ip-mic-toggle')).toBeNull();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('mic unsupported -> sin boton de mic, el form sigue', () => {
    socketSpy.mockReturnValue(fakeSocket());
    voiceReturn = fakeVoice('unsupported');
    renderPage();
    expect(screen.queryByTestId('ip-mic-toggle')).toBeNull();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  // ── Aura con datos reales ──────────────────────────────

  it('el aura recibe las metricas del pipeline', () => {
    pipelineReturn = fakePipeline({
      auraState: {
        sessionId: 's1',
        collectedAt: 1,
        metrics: [{ name: 'fluency', value: 80, confidence: 'high', timestamp: 1 }],
      },
    });
    socketSpy.mockReturnValue(fakeSocket());
    renderPage();
    expect(lastAuraProps.fluency).toBe(80);
    expect(lastAuraProps.speechRate).toBeNull();
    expect(lastAuraProps.eyeContact).toBeNull();
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `pnpm --filter @warachikuy/web test src/pages/InterviewPage.test.tsx`
Expected: FAIL — la pagina no tiene gate ni hooks nuevos.

- [ ] **Step 3: Modificar InterviewPage.tsx**

Cambios sobre el archivo actual (preservar TODO lo demas: estados WS, timer, finish/restart,
banners, terminal/closing):

(a) Imports nuevos (debajo de los existentes):

```tsx
import { useRef } from 'react'; // sumar al import de react existente
import { createTtsController, type TtsController } from '@warachikuy/voice-pipeline';
import { useVoiceTurn } from '../hooks/useVoiceTurn';
import { useAuraPipeline } from '../hooks/useAuraPipeline';
import { PermissionGate, type PermissionGrants } from '../components/PermissionGate';
import type { CandidateTranscript } from '@warachikuy/shared-types';
```

(b) Estado del gate y del TTS (dentro del componente, antes del socket):

```tsx
const [grants, setGrants] = useState<PermissionGrants | null>(null);
const [ttsSpeaking, setTtsSpeaking] = useState(false);
const ttsRef = useRef<TtsController | null>(null);
if (ttsRef.current === null) {
  ttsRef.current = createTtsController({
    onStart: () => setTtsSpeaking(true),
    onEnd: () => setTtsSpeaking(false),
    // Sin speechSynthesis la entrevista sigue solo con texto
    onUnsupported: () => undefined,
  });
}
```

(c) El socket NO conecta hasta resolver el gate (cambiar la linea existente):

```tsx
// El WS recien conecta cuando el candidato resolvio el gate de permisos: asi
// el entrevistador no empieza a hablar detras de la pantalla de permisos.
const socket = useInterviewSocket(
  grants && session ? session.websocketUrl : '',
  session?.sessionId ?? '',
);
```

(d) Pipeline y voz (despues del socket; los hooks van SIEMPRE, antes de returns):

```tsx
const pipeline = useAuraPipeline(
  session?.sessionId ?? '',
  grants?.camera ?? false,
  socket.sendMetrics,
);

function handleFinalTranscript(t: CandidateTranscript): void {
  pipeline.feedTranscript(t);
  socket.sendAnswer(t.text, true);
}
function handleSpeechStart(): void {
  // Barge-in: si el candidato habla encima de la pregunta, se corta el TTS
  ttsRef.current?.cancel();
}
const voice = useVoiceTurn(session?.sessionId ?? '', handleFinalTranscript, handleSpeechStart);
```

(e) TTS de los mensajes del entrevistador (debajo del efecto del timer):

```tsx
// Habla cada interviewer.message nuevo. En reconexion el historial llega de
// golpe: se habla solo el ultimo (no se re-lee lo viejo).
const spokenCountRef = useRef(0);
useEffect(() => {
  const msgs = socket.items.filter((i) => i.role === 'interviewer');
  if (msgs.length === 0 || msgs.length === spokenCountRef.current) return;
  ttsRef.current?.speak(msgs[msgs.length - 1]!.text);
  spokenCountRef.current = msgs.length;
}, [socket.items]);

// Al salir de la sala no puede quedar audio sonando ni mic escuchando
useEffect(() => {
  const tts = ttsRef.current;
  return () => tts?.cancel();
}, []);
```

(f) Gate antes de la sala (despues del `if (!session)` existente):

```tsx
if (!grants) {
  return (
    <div className="ip-root">
      <PermissionGate onReady={setGrants} />
    </div>
  );
}
```

(g) El aura con datos reales (reemplazar las 2 lineas existentes):

```tsx
// ANTES: const auraProps = auraStateToAvatarProps(null);
const auraProps = auraStateToAvatarProps(pipeline.auraState);
// ANTES: <AvatarAura {...auraProps} speaking={false} />
<AvatarAura {...auraProps} speaking={ttsSpeaking} />
```

(h) Boton del mic (reemplazar `<div className="ip-mic-placeholder" />` dentro de
`ip-normal-input`):

```tsx
{grants.mic && voice.micStatus !== 'denied' && voice.micStatus !== 'unsupported' ? (
  <button
    type="button"
    className={voice.micStatus === 'listening' ? 'ip-mic ip-mic--on' : 'ip-mic'}
    onClick={() => (voice.micStatus === 'listening' ? voice.stop() : voice.start())}
    aria-pressed={voice.micStatus === 'listening'}
    data-testid="ip-mic-toggle"
  >
    {voice.micStatus === 'listening' ? 'Escuchando…' : 'Hablar'}
  </button>
) : (
  <div className="ip-mic-placeholder" />
)}
```

(i) Aviso suave cuando la camara no esta disponible (dentro de `ip-avatar-wrap`, debajo
del `</Suspense>`):

```tsx
{(pipeline.cameraStatus === 'denied' || pipeline.cameraStatus === 'failed') && (
  <p className="ip-camera-note" data-testid="ip-camera-note">
    Cámara no disponible: el contacto visual queda sin datos.
  </p>
)}
```

y su CSS al final de `InterviewPage.css`:

```css
/* Aviso suave de camara no disponible */
.ip-camera-note {
  margin: 8px 0 0;
  font-size: 12px;
  color: #94a3b8;
  text-align: center;
}
```

(j) Al cerrar (closing o terminal) detener el mic:

```tsx
useEffect(() => {
  if (socket.closing || ended) voice.stop();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [socket.closing, ended]);
```

Nota: `ended` se calcula mas abajo en el archivo actual; mover este efecto despues de ese
calculo NO se puede (hooks antes de returns) — calcular `ended` ANTES de los returns
condicionales (subir las lineas de `terminalError`/`disconnected`/`ended` arriba de los
`if`), que ademas es correcto porque solo dependen del socket.

(k) CSS del boton del mic, agregar al final de `apps/web/src/pages/InterviewPage.css`:

```css
/* Boton de turno de voz */
.ip-mic {
  padding: 10px 16px;
  border-radius: var(--radius-md);
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.05);
  color: #f1f5f9;
  font-family: var(--font-display);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}

.ip-mic:hover {
  background: rgba(255, 255, 255, 0.1);
}

.ip-mic--on {
  border-color: #0ea5e9;
  color: #0ea5e9;
  box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.15);
}
```

- [ ] **Step 4: Verificar que pasan**

Run: `pnpm --filter @warachikuy/web test src/pages/InterviewPage.test.tsx`
Expected: PASS (los 7 adaptados + 8 nuevos). Si el test de `speaking` con waitFor da flaky,
envolver `ttsOptions.onStart?.()` en `act(...)`.

- [ ] **Step 5: Suite web completa + lint/typecheck**

Run: `pnpm --filter @warachikuy/web test && pnpm --filter @warachikuy/web lint && pnpm --filter @warachikuy/web typecheck`
Expected: todo verde (ninguna otra pagina se ve afectada).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/InterviewPage.tsx apps/web/src/pages/InterviewPage.css apps/web/src/pages/InterviewPage.test.tsx
git commit -m "Se orquesta la entrevista multimodal: gate, voz, tts y aura con datos reales"
```

---

### Task 7: Verificacion integral

- [ ] **Step 1: Suite completa del monorepo**

Run: `pnpm -r test`
Expected: PASS total (shared-types, voice-pipeline con los tests nuevos del TTS, api intacta, web).

- [ ] **Step 2: Lint + typecheck + build de todo**

Run: `pnpm -r lint && pnpm -r typecheck && pnpm -r build`
Expected: limpio. El build de la web debe listar un chunk nuevo del worker
(`metrics-worker-*.js`) ademas de los de paginas.

- [ ] **Step 3: Smoke manual en Chrome (si hay entorno con backend)**

Run: `docker compose up -d && pnpm --filter @warachikuy/web dev` (o el flujo Docker completo)
- Entrar a `/setup`, crear sesion: aparece el gate de permisos.
- Conceder permisos: el entrevistador HABLA su pregunta; el aura deja "sin datos" y reacciona.
- Responder con el boton "Hablar": el transcript aparece y el entrevistador responde.
- Hablar encima del TTS: se corta (barge-in).
- Denegar permisos en otra sesion: el flujo tecleado sigue funcionando.

- [ ] **Step 4: Commit final si hubo correcciones**

Solo si los pasos 1-3 obligaron a tocar algo; mensaje en espanol natural describiendo la
correccion puntual.
