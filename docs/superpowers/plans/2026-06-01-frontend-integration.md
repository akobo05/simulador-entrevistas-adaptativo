# Rebanada frontend de la integracion F1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cablear el frontend React (apps/web) al backend real para cerrar el loop con input tecleado: configurar sesion -> entrevistar escribiendo -> ver el plan de mejora.

**Architecture:** Cliente HTTP tipado + Context de sesion (persistido en sessionStorage) + hook de WebSocket real que reemplaza el stub, todo consumiendo los contratos de `@warachikuy/shared-types`. Cuatro pantallas (Home -> Setup -> Interview -> Plan) por react-router. La voz/aura (Walter) se difiere; el hook deja el seam (`sendMetrics` / `sendAnswer(text,isFinal)`).

**Tech Stack:** React 19 + Vite 6 + react-router-dom 7 + @react-three/fiber (orbe existente) + lucide-react + Zod (via shared-types) + vitest + happy-dom + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-06-01-frontend-integration-design.md`

---

## Convenciones (todas las tareas)

- Identificadores en ingles; comentarios y mensajes de commit en espanol natural sin acentos ("Se agrega X"), sin Conventional Commits, sin marcas de IA.
- TS estricto. Imports de paquetes del workspace por nombre (`@warachikuy/shared-types`); imports locales con extension en runtime no aplica (Vite/bundler resuelve TS sin `.js` en apps/web — seguir el estilo existente del repo web, que importa `'../components/X'` sin extension).
- TDD: test que falla -> correr para ver el fallo -> implementar -> correr para ver el pase -> commit.
- Correr tests del paquete web con: `pnpm --filter @warachikuy/web test` (vitest run). Para un archivo: `pnpm --filter @warachikuy/web test src/lib/apiClient.test.ts`.
- Un hook pre-commit (lint-staged: eslint + prettier + typecheck) corre solo en cada commit; dejarlo.

## Tipos/firmas fijadas (consistencia entre tareas)

```typescript
// lib/apiClient.ts
class ApiClientError extends Error { code: string }
interface IndustryOption { id: Industry; name: string }
type PlanFetchResult = PlanResponse | { status: 'not_found' }   // PlanResponse = z.infer<PlanResponseSchema>
getIndustries(): Promise<IndustryOption[]>
createSession(req: CreateSessionRequest): Promise<CreateSessionResponse>
endSession(sessionId: string, token: string): Promise<{ sessionId: string; planId: string }>
getPlan(sessionId: string, token: string): Promise<PlanFetchResult>

// context/SessionContext.tsx
interface SessionData { sessionId: string; token: string; websocketUrl: string; industry: Industry; level: Level }
useSession(): { session: SessionData | null; setSession(s: SessionData): void; clearSession(): void }

// hooks/useInterviewSocket.ts
interface ChatItem { id: string; role: 'interviewer' | 'candidate'; text: string;
                     intent?: InterviewerMessage['intent']; timestamp: number }
interface InterviewSocket {
  items: ChatItem[]; phase: SessionPhase; turnNumber: number;
  status: 'connecting' | 'open' | 'closed';
  lastError: { code: string; message: string; recoverable: boolean } | null;
  closing: boolean;
  sendAnswer(text: string, isFinal?: boolean): void;
  sendMetrics(state: AuraState): void;
}
useInterviewSocket(websocketUrl: string, sessionId: string): InterviewSocket
```

---

## Task 1: Cliente HTTP tipado (apiClient)

**Files:**
- Create: `apps/web/src/vite-env.d.ts`
- Create: `apps/web/src/lib/apiClient.ts`
- Test: `apps/web/src/lib/apiClient.test.ts`

- [ ] **Step 1: Tipar import.meta.env**

Create `apps/web/src/vite-env.d.ts`:
```typescript
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

- [ ] **Step 2: Escribir el test**

Create `apps/web/src/lib/apiClient.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getIndustries, createSession, endSession, getPlan, ApiClientError } from './apiClient';

function mockFetch(status: number, body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      statusText: 'x',
    })) as unknown as typeof fetch,
  );
}

describe('apiClient', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it('getIndustries devuelve la lista', async () => {
    mockFetch(200, { industries: [{ id: 'backend', name: 'Backend' }] });
    expect(await getIndustries()).toEqual([{ id: 'backend', name: 'Backend' }]);
  });

  it('createSession parsea la respuesta', async () => {
    const resp = {
      sessionId: '550e8400-e29b-41d4-a716-446655440000',
      websocketUrl: 'ws://localhost:3000/v1/sessions/x/ws?token=abc',
      token: 'a'.repeat(64),
    };
    mockFetch(201, resp);
    expect(await createSession({ industry: 'backend', level: 'mid' })).toEqual(resp);
  });

  it('createSession lanza ApiClientError con el code del envelope', async () => {
    mockFetch(400, { error: { code: 'invalid_input', message: 'Body invalido' } });
    await expect(createSession({ industry: 'backend', level: 'mid' })).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'invalid_input',
    });
  });

  it('endSession devuelve sessionId y planId', async () => {
    mockFetch(202, { sessionId: 's1', planId: 'p1' });
    expect(await endSession('s1', 'tok')).toEqual({ sessionId: 's1', planId: 'p1' });
  });

  it('getPlan ready devuelve el plan', async () => {
    const plan = {
      planId: '550e8400-e29b-41d4-a716-446655440000',
      sessionId: '550e8400-e29b-41d4-a716-446655440001',
      summary: 'ok', competencies: [], strengths: [], improvements: [], exercises: [], generatedAt: 1,
    };
    mockFetch(200, { status: 'ready', plan });
    expect(await getPlan('s1', 'tok')).toEqual({ status: 'ready', plan });
  });

  it('getPlan generating (202) devuelve el status', async () => {
    mockFetch(202, { status: 'generating' });
    expect(await getPlan('s1', 'tok')).toEqual({ status: 'generating' });
  });

  it('getPlan 404 devuelve not_found', async () => {
    mockFetch(404, { error: { code: 'plan_not_found', message: 'x' } });
    expect(await getPlan('s1', 'tok')).toEqual({ status: 'not_found' });
  });
});
```

- [ ] **Step 3: Correr para ver el fallo**

Run: `pnpm --filter @warachikuy/web test src/lib/apiClient.test.ts`
Expected: FAIL ("Cannot find module './apiClient'").

- [ ] **Step 4: Implementar apiClient**

Create `apps/web/src/lib/apiClient.ts`:
```typescript
import {
  ApiErrorSchema,
  CreateSessionResponseSchema,
  PlanResponseSchema,
  type CreateSessionRequest,
  type CreateSessionResponse,
  type Industry,
  type PlanResponse,
} from '@warachikuy/shared-types';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export class ApiClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export interface IndustryOption {
  id: Industry;
  name: string;
}

export type PlanFetchResult = PlanResponse | { status: 'not_found' };

// Lee el envelope de error del backend (ApiErrorSchema) si esta presente; si no,
// arma un error http generico.
async function readError(res: Response): Promise<ApiClientError> {
  try {
    const parsed = ApiErrorSchema.safeParse(await res.json());
    if (parsed.success) return new ApiClientError(parsed.data.error.code, parsed.data.error.message);
  } catch {
    // cuerpo no-JSON; cae al generico
  }
  return new ApiClientError('http_error', `HTTP ${res.status}`);
}

export async function getIndustries(): Promise<IndustryOption[]> {
  const res = await fetch(`${BASE}/api/v1/industries`);
  if (!res.ok) throw await readError(res);
  const body = (await res.json()) as { industries: IndustryOption[] };
  return body.industries;
}

export async function createSession(req: CreateSessionRequest): Promise<CreateSessionResponse> {
  const res = await fetch(`${BASE}/api/v1/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw await readError(res);
  return CreateSessionResponseSchema.parse(await res.json());
}

export async function endSession(
  sessionId: string,
  token: string,
): Promise<{ sessionId: string; planId: string }> {
  const res = await fetch(`${BASE}/api/v1/sessions/${sessionId}/end?token=${token}`, {
    method: 'POST',
  });
  if (!res.ok) throw await readError(res);
  return (await res.json()) as { sessionId: string; planId: string };
}

export async function getPlan(sessionId: string, token: string): Promise<PlanFetchResult> {
  const res = await fetch(`${BASE}/api/v1/sessions/${sessionId}/plan?token=${token}`);
  if (res.status === 404) return { status: 'not_found' };
  // ready/failed -> 200, generating -> 202; cualquier otro no esperado -> error
  if (!res.ok && res.status !== 202) throw await readError(res);
  return PlanResponseSchema.parse(await res.json());
}
```

- [ ] **Step 5: Correr para ver el pase**

Run: `pnpm --filter @warachikuy/web test src/lib/apiClient.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/vite-env.d.ts apps/web/src/lib/apiClient.ts apps/web/src/lib/apiClient.test.ts
git commit -m "Se agrega el cliente HTTP tipado del frontend contra el backend"
```

---

## Task 2: SessionContext (estado de sesion + sessionStorage)

**Files:**
- Create: `apps/web/src/context/SessionContext.tsx`
- Test: `apps/web/src/context/SessionContext.test.tsx`

- [ ] **Step 1: Escribir el test**

Create `apps/web/src/context/SessionContext.test.tsx`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { SessionProvider, useSession, type SessionData } from './SessionContext';

const sample: SessionData = {
  sessionId: 's1',
  token: 'a'.repeat(64),
  websocketUrl: 'ws://x/v1/sessions/s1/ws?token=a',
  industry: 'backend',
  level: 'mid',
};

function Probe() {
  const { session, setSession, clearSession } = useSession();
  return (
    <div>
      <span data-testid="sid">{session?.sessionId ?? 'none'}</span>
      <button onClick={() => setSession(sample)}>set</button>
      <button onClick={() => clearSession()}>clear</button>
    </div>
  );
}

describe('SessionContext', () => {
  beforeEach(() => sessionStorage.clear());

  it('arranca sin sesion y permite setear y limpiar', () => {
    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
    expect(screen.getByTestId('sid').textContent).toBe('none');
    act(() => screen.getByText('set').click());
    expect(screen.getByTestId('sid').textContent).toBe('s1');
    act(() => screen.getByText('clear').click());
    expect(screen.getByTestId('sid').textContent).toBe('none');
  });

  it('persiste en sessionStorage y rehidrata', () => {
    sessionStorage.setItem('warachikuy:session', JSON.stringify(sample));
    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
    expect(screen.getByTestId('sid').textContent).toBe('s1');
  });
});
```

- [ ] **Step 2: Correr para ver el fallo**

Run: `pnpm --filter @warachikuy/web test src/context/SessionContext.test.tsx`
Expected: FAIL ("Cannot find module './SessionContext'").

- [ ] **Step 3: Implementar**

Create `apps/web/src/context/SessionContext.tsx`:
```typescript
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Industry, Level } from '@warachikuy/shared-types';

export interface SessionData {
  sessionId: string;
  token: string;
  websocketUrl: string;
  industry: Industry;
  level: Level;
}

const STORAGE_KEY = 'warachikuy:session';

interface SessionContextValue {
  session: SessionData | null;
  setSession: (s: SessionData) => void;
  clearSession: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

function hydrate(): SessionData | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionData;
  } catch {
    return null;
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<SessionData | null>(hydrate);

  const setSession = useCallback((s: SessionData) => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    setSessionState(s);
  }, []);

  const clearSession = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setSessionState(null);
  }, []);

  const value = useMemo(
    () => ({ session, setSession, clearSession }),
    [session, setSession, clearSession],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession debe usarse dentro de SessionProvider');
  return ctx;
}
```

NOTE: el import es `useCallback` (no `useCallBack`). Verifica la mayuscula.

- [ ] **Step 4: Correr para ver el pase**

Run: `pnpm --filter @warachikuy/web test src/context/SessionContext.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/context/SessionContext.tsx apps/web/src/context/SessionContext.test.tsx
git commit -m "Se agrega el SessionContext con persistencia en sessionStorage"
```

---

## Task 3: CompetencyRing (anillo de competencia)

**Files:**
- Create: `apps/web/src/components/CompetencyRing.tsx`
- Test: `apps/web/src/components/CompetencyRing.test.tsx`
- Modify: `apps/web/src/assets/global.css` (estilos del anillo, no testeado)

- [ ] **Step 1: Escribir el test**

Create `apps/web/src/components/CompetencyRing.test.tsx`:
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CompetencyRing } from './CompetencyRing';

describe('CompetencyRing', () => {
  it('muestra el score cuando hay valor', () => {
    render(<CompetencyRing label="Fluidez" score={81} />);
    expect(screen.getByText('81')).toBeInTheDocument();
    expect(screen.getByText('Fluidez')).toBeInTheDocument();
  });

  it('muestra 0 como valor valido (no como sin datos)', () => {
    render(<CompetencyRing label="Contenido" score={0} />);
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.queryByText('sin datos')).not.toBeInTheDocument();
  });

  it('muestra "sin datos" cuando el score es null', () => {
    render(<CompetencyRing label="Ritmo" score={null} />);
    expect(screen.getByText('sin datos')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr para ver el fallo**

Run: `pnpm --filter @warachikuy/web test src/components/CompetencyRing.test.tsx`
Expected: FAIL ("Cannot find module './CompetencyRing'").

- [ ] **Step 3: Implementar el componente**

Create `apps/web/src/components/CompetencyRing.tsx`:
```typescript
interface Props {
  label: string;
  score: number | null;
}

// Anillo de progreso con conic-gradient. La condicion de "sin datos" es
// score === null (NUNCA !score): un score 0 es valido y distinto de sin datos.
export function CompetencyRing({ label, score }: Props) {
  const hasData = score !== null;
  const pct = hasData ? Math.max(0, Math.min(100, score)) : 0;
  const ringStyle = {
    background: `conic-gradient(var(--ring-color, #ff6b35) ${pct * 3.6}deg, var(--ring-track, #2a2a35) 0deg)`,
  };
  return (
    <div className="competency-ring">
      <div
        className="ring-circle"
        style={ringStyle}
        role="img"
        aria-label={hasData ? `${label}: ${score} de 100` : `${label}: sin datos`}
      >
        <div className="ring-inner">{hasData ? <span>{score}</span> : <span className="ring-nodata">sin datos</span>}</div>
      </div>
      <span className="ring-label">{label}</span>
    </div>
  );
}
```

- [ ] **Step 4: Correr para ver el pase**

Run: `pnpm --filter @warachikuy/web test src/components/CompetencyRing.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 5: Agregar estilos (append a `apps/web/src/assets/global.css`)**

```css
/* Anillos de competencia del plan de mejora */
.competency-ring { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; }
.ring-circle {
  width: 96px; height: 96px; border-radius: 50%;
  display: grid; place-items: center;
}
.ring-inner {
  width: 74px; height: 74px; border-radius: 50%;
  background: #1a1a22; display: grid; place-items: center;
  font-size: 1.4rem; font-weight: 700; color: #fff;
}
.ring-nodata { font-size: 0.7rem; font-weight: 500; color: #9a9aa5; }
.ring-label { font-size: 0.85rem; color: #c8c8d0; }
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/CompetencyRing.tsx apps/web/src/components/CompetencyRing.test.tsx apps/web/src/assets/global.css
git commit -m "Se agrega el componente CompetencyRing con anillo conic-gradient"
```

---

## Task 4: useInterviewSocket (hook de WebSocket real)

**Files:**
- Create: `apps/web/src/hooks/useInterviewSocket.ts`
- Test: `apps/web/src/hooks/useInterviewSocket.test.ts`

- [ ] **Step 1: Escribir el test (con un WebSocket mock)**

Create `apps/web/src/hooks/useInterviewSocket.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useInterviewSocket } from './useInterviewSocket';

class MockWebSocket {
  static OPEN = 1;
  static instances: MockWebSocket[] = [];
  url: string;
  readyState = 0;
  sent: string[] = [];
  private listeners: Record<string, ((e: unknown) => void)[]> = {};
  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }
  addEventListener(type: string, cb: (e: unknown) => void): void {
    (this.listeners[type] ??= []).push(cb);
  }
  removeEventListener(): void {}
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.readyState = 3;
    this.emit('close', { code: 1000, reason: '' });
  }
  emit(type: string, e: unknown): void {
    (this.listeners[type] ?? []).forEach((cb) => cb(e));
  }
  open(): void {
    this.readyState = 1;
    this.emit('open', {});
  }
  message(obj: unknown): void {
    this.emit('message', { data: JSON.stringify(obj) });
  }
}

describe('useInterviewSocket', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket);
  });
  afterEach(() => vi.unstubAllGlobals());

  function last(): MockWebSocket {
    return MockWebSocket.instances[MockWebSocket.instances.length - 1]!;
  }

  it('discrimina interviewer.message, session.state y error', () => {
    const { result } = renderHook(() => useInterviewSocket('ws://x', 's1'));
    act(() => last().open());
    expect(result.current.status).toBe('open');

    act(() =>
      last().message({
        type: 'interviewer.message',
        payload: { sessionId: 's1', text: 'Hola', intent: 'question', timestamp: 1 },
      }),
    );
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]).toMatchObject({ role: 'interviewer', text: 'Hola' });

    act(() =>
      last().message({ type: 'session.state', payload: { sessionId: 's1', phase: 'interviewing', turnNumber: 2 } }),
    );
    expect(result.current.phase).toBe('interviewing');
    expect(result.current.turnNumber).toBe(2);

    act(() =>
      last().message({ type: 'error', payload: { code: 'llm_unavailable', message: 'x', recoverable: true } }),
    );
    expect(result.current.lastError?.code).toBe('llm_unavailable');
  });

  it('setea closing al recibir intent closing', () => {
    const { result } = renderHook(() => useInterviewSocket('ws://x', 's1'));
    act(() => last().open());
    act(() =>
      last().message({
        type: 'interviewer.message',
        payload: { sessionId: 's1', text: 'Gracias, terminamos.', intent: 'closing', timestamp: 9 },
      }),
    );
    expect(result.current.closing).toBe(true);
  });

  it('sendAnswer envia candidate.transcript y hace append optimista', () => {
    const { result } = renderHook(() => useInterviewSocket('ws://x', 's1'));
    act(() => last().open());
    act(() => result.current.sendAnswer('mi respuesta'));
    expect(result.current.items.at(-1)).toMatchObject({ role: 'candidate', text: 'mi respuesta' });
    const sent = JSON.parse(last().sent.at(-1)!);
    expect(sent).toMatchObject({
      type: 'candidate.transcript',
      payload: { sessionId: 's1', text: 'mi respuesta', isFinal: true },
    });
  });

  it('cierra el socket al desmontar y no deja conexiones abiertas', () => {
    const { unmount } = renderHook(() => useInterviewSocket('ws://x', 's1'));
    act(() => last().open());
    const socket = last();
    unmount();
    expect(socket.readyState).toBe(3); // CLOSED
  });

  it('ignora mensajes que no validan el schema', () => {
    const { result } = renderHook(() => useInterviewSocket('ws://x', 's1'));
    act(() => last().open());
    act(() => last().message({ type: 'basura', payload: {} }));
    expect(result.current.items).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Correr para ver el fallo**

Run: `pnpm --filter @warachikuy/web test src/hooks/useInterviewSocket.test.ts`
Expected: FAIL ("Cannot find module './useInterviewSocket'").

- [ ] **Step 3: Implementar el hook**

Create `apps/web/src/hooks/useInterviewSocket.ts`:
```typescript
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ServerToClientMessageSchema,
  type AuraState,
  type InterviewerMessage,
  type SessionPhase,
} from '@warachikuy/shared-types';

export interface ChatItem {
  id: string;
  role: 'interviewer' | 'candidate';
  text: string;
  intent?: InterviewerMessage['intent'];
  timestamp: number;
}

export interface InterviewSocket {
  items: ChatItem[];
  phase: SessionPhase;
  turnNumber: number;
  status: 'connecting' | 'open' | 'closed';
  lastError: { code: string; message: string; recoverable: boolean } | null;
  closing: boolean;
  sendAnswer: (text: string, isFinal?: boolean) => void;
  sendMetrics: (state: AuraState) => void;
}

export function useInterviewSocket(websocketUrl: string, sessionId: string): InterviewSocket {
  const [items, setItems] = useState<ChatItem[]>([]);
  const [phase, setPhase] = useState<SessionPhase>('warmup');
  const [turnNumber, setTurnNumber] = useState(0);
  const [status, setStatus] = useState<InterviewSocket['status']>('connecting');
  const [lastError, setLastError] = useState<InterviewSocket['lastError']>(null);
  const [closing, setClosing] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Sin URL no conectamos (caso: la pagina se monta sin sesion y redirige; el
    // hook se llama igual por las reglas de hooks). Evita new WebSocket('').
    if (!websocketUrl) return;
    const socket = new WebSocket(websocketUrl);
    socketRef.current = socket;
    // Guarda por-efecto: React 19 StrictMode monta/desmonta/monta en dev. El
    // cleanup pone active=false y cierra; los handlers de un socket ya marcado
    // para cierre se ignoran, asi no se pinta un falso "conexion perdida" ni se
    // procesan mensajes de una conexion que se esta tirando.
    let active = true;

    socket.addEventListener('open', () => {
      if (active) setStatus('open');
    });
    socket.addEventListener('message', (ev: MessageEvent) => {
      if (!active) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data));
      } catch {
        console.warn('ws: mensaje no-JSON descartado');
        return;
      }
      const result = ServerToClientMessageSchema.safeParse(parsed);
      if (!result.success) {
        console.warn('ws: mensaje invalido descartado');
        return;
      }
      const msg = result.data;
      if (msg.type === 'interviewer.message') {
        const p = msg.payload;
        setItems((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: 'interviewer', text: p.text, intent: p.intent, timestamp: p.timestamp },
        ]);
        if (p.intent === 'closing') setClosing(true);
      } else if (msg.type === 'session.state') {
        setPhase(msg.payload.phase);
        setTurnNumber(msg.payload.turnNumber);
      } else if (msg.type === 'error') {
        setLastError(msg.payload);
      }
    });
    socket.addEventListener('close', () => {
      if (active) setStatus('closed');
    });
    socket.addEventListener('error', () => {
      // el evento 'close' que sigue maneja el estado; evitamos doble seteo
    });

    return () => {
      active = false;
      socket.close(1000);
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [websocketUrl]);

  const sendAnswer = useCallback(
    (text: string, isFinal = true) => {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      if (isFinal) {
        setItems((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: 'candidate', text, timestamp: Date.now() },
        ]);
      }
      socket.send(
        JSON.stringify({
          type: 'candidate.transcript',
          payload: { sessionId, text, isFinal, timestamp: Date.now() },
        }),
      );
    },
    [sessionId],
  );

  const sendMetrics = useCallback((state: AuraState) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: 'metrics.update', payload: state }));
  }, []);

  return { items, phase, turnNumber, status, lastError, closing, sendAnswer, sendMetrics };
}
```

- [ ] **Step 4: Correr para ver el pase**

Run: `pnpm --filter @warachikuy/web test src/hooks/useInterviewSocket.test.ts`
Expected: PASS, 5 tests. (Si `crypto.randomUUID` no existe en happy-dom, agregar al tope del hook un fallback: pero Node 22 lo provee global; si el test falla por eso, definir `const uuid = () => crypto.randomUUID()` y reportar.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/hooks/useInterviewSocket.ts apps/web/src/hooks/useInterviewSocket.test.ts
git commit -m "Se agrega el hook useInterviewSocket con WebSocket real y ciclo de vida StrictMode"
```

---

## Task 5: Adaptar MessageBubble a ChatItem

**Files:**
- Modify: `apps/web/src/components/MessageBubble.tsx`
- Test: `apps/web/src/components/MessageBubble.test.tsx`

- [ ] **Step 1: Escribir el test**

Create `apps/web/src/components/MessageBubble.test.tsx`:
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessageBubble } from './MessageBubble';
import type { ChatItem } from '../hooks/useInterviewSocket';

const item = (role: ChatItem['role'], text: string): ChatItem => ({
  id: '1', role, text, timestamp: 1,
});

describe('MessageBubble', () => {
  it('rotula al entrevistador', () => {
    render(<MessageBubble item={item('interviewer', 'Hola')} />);
    expect(screen.getByText(/Entrevistador/)).toBeInTheDocument();
    expect(screen.getByText('Hola')).toBeInTheDocument();
  });
  it('rotula al candidato', () => {
    render(<MessageBubble item={item('candidate', 'Mi respuesta')} />);
    expect(screen.getByText(/Tú/)).toBeInTheDocument();
    expect(screen.getByText('Mi respuesta')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr para ver el fallo**

Run: `pnpm --filter @warachikuy/web test src/components/MessageBubble.test.tsx`
Expected: FAIL (MessageBubble aun usa la prop `mensaje` con `Mensaje`).

- [ ] **Step 3: Reescribir MessageBubble**

Replace the entire contents of `apps/web/src/components/MessageBubble.tsx`:
```typescript
import type { ChatItem } from '../hooks/useInterviewSocket';

interface Props {
  item: ChatItem;
}

// El texto se renderiza como children de React (escapado por defecto). Prohibido
// dangerouslySetInnerHTML sobre el output del LLM o del candidato.
export function MessageBubble({ item }: Props) {
  return (
    <div className={`message-bubble ${item.role}`}>
      <strong>{item.role === 'interviewer' ? 'Entrevistador' : 'Tú'}: </strong>
      <span>{item.text}</span>
    </div>
  );
}
```

- [ ] **Step 4: Correr para ver el pase**

Run: `pnpm --filter @warachikuy/web test src/components/MessageBubble.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/MessageBubble.tsx apps/web/src/components/MessageBubble.test.tsx
git commit -m "Se adapta MessageBubble para renderizar ChatItem (entrevistador/candidato)"
```

---

## Task 6: SetupPage (configuracion de sesion)

**Files:**
- Create: `apps/web/src/pages/SetupPage.tsx`
- Test: `apps/web/src/pages/SetupPage.test.tsx`
- Modify: `apps/web/src/assets/global.css` (estilos del form, no testeado)

- [ ] **Step 1: Escribir el test (mock de apiClient y del navigate)**

Create `apps/web/src/pages/SetupPage.test.tsx`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SessionProvider } from '../context/SessionContext';
import { SetupPage } from './SetupPage';
import * as apiClient from '../lib/apiClient';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useNavigate: () => navigateMock,
}));

describe('SetupPage', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    sessionStorage.clear();
    vi.spyOn(apiClient, 'getIndustries').mockResolvedValue([
      { id: 'backend', name: 'Backend' },
      { id: 'frontend', name: 'Frontend' },
    ]);
  });

  function renderPage() {
    return render(
      <MemoryRouter>
        <SessionProvider>
          <SetupPage />
        </SessionProvider>
      </MemoryRouter>,
    );
  }

  it('carga las industrias y crea la sesion al enviar', async () => {
    vi.spyOn(apiClient, 'createSession').mockResolvedValue({
      sessionId: '550e8400-e29b-41d4-a716-446655440000',
      websocketUrl: 'ws://x',
      token: 'a'.repeat(64),
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('Backend')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /comenzar entrevista/i }));
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith('/interview/550e8400-e29b-41d4-a716-446655440000'),
    );
  });

  it('muestra error si createSession falla', async () => {
    vi.spyOn(apiClient, 'createSession').mockRejectedValue(new apiClient.ApiClientError('x', 'fallo'));
    renderPage();
    await waitFor(() => expect(screen.getByText('Backend')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /comenzar entrevista/i }));
    await waitFor(() => expect(screen.getByText(/no se pudo crear/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Correr para ver el fallo**

Run: `pnpm --filter @warachikuy/web test src/pages/SetupPage.test.tsx`
Expected: FAIL ("Cannot find module './SetupPage'").

- [ ] **Step 3: Implementar SetupPage**

Create `apps/web/src/pages/SetupPage.tsx`:
```typescript
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Industry, Level } from '@warachikuy/shared-types';
import { createSession, getIndustries, type IndustryOption } from '../lib/apiClient';
import { useSession } from '../context/SessionContext';
import { Button } from '../components/Button';

const LEVELS: { id: Level; name: string }[] = [
  { id: 'junior', name: 'Junior' },
  { id: 'mid', name: 'Mid' },
  { id: 'senior', name: 'Senior' },
];

export function SetupPage() {
  const navigate = useNavigate();
  const { setSession } = useSession();
  const [industries, setIndustries] = useState<IndustryOption[]>([]);
  const [industry, setIndustry] = useState<Industry>('backend');
  const [level, setLevel] = useState<Level>('mid');
  const [loadError, setLoadError] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    getIndustries()
      .then((list) => {
        if (!active) return;
        setIndustries(list);
        if (list[0]) setIndustry(list[0].id);
      })
      .catch(() => active && setLoadError(true));
    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await createSession({ industry, level });
      setSession({ ...res, industry, level });
      navigate(`/interview/${res.sessionId}`);
    } catch {
      setSubmitError('No se pudo crear la sesion. Intenta de nuevo.');
      setSubmitting(false);
    }
  }

  return (
    <main className="setup-root">
      <h1>Configura tu entrevista</h1>
      {loadError ? (
        <p className="setup-error">No se pudieron cargar las industrias. Recarga la pagina.</p>
      ) : (
        <form className="setup-form" onSubmit={handleSubmit}>
          <label>
            Industria
            <select value={industry} onChange={(e) => setIndustry(e.target.value as Industry)}>
              {industries.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Nivel
            <select value={level} onChange={(e) => setLevel(e.target.value as Level)}>
              {LEVELS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.name}
                </option>
              ))}
            </select>
          </label>
          {submitError && <p className="setup-error">{submitError}</p>}
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Creando...' : 'Comenzar entrevista'}
          </Button>
        </form>
      )}
    </main>
  );
}
```

- [ ] **Step 4: Correr para ver el pase**

Run: `pnpm --filter @warachikuy/web test src/pages/SetupPage.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 5: Estilos (append a global.css)**

```css
/* Pantalla de configuracion de sesion */
.setup-root { max-width: 480px; margin: 0 auto; padding: 3rem 1.5rem; }
.setup-form { display: flex; flex-direction: column; gap: 1.25rem; margin-top: 1.5rem; }
.setup-form label { display: flex; flex-direction: column; gap: 0.4rem; color: #c8c8d0; }
.setup-form select { padding: 0.6rem; border-radius: 8px; background: #1a1a22; color: #fff; border: 1px solid #2a2a35; }
.setup-error { color: #ff6b6b; }
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/SetupPage.tsx apps/web/src/pages/SetupPage.test.tsx apps/web/src/assets/global.css
git commit -m "Se agrega la SetupPage que crea la sesion contra el backend"
```

---

## Task 7: InterviewPage (sala de entrevista real)

**Files:**
- Create: `apps/web/src/pages/InterviewPage.tsx`
- Test: `apps/web/src/pages/InterviewPage.test.tsx`
- Delete: `apps/web/src/pages/ChatRoom.tsx` (en Task 9, junto al ruteo)

- [ ] **Step 1: Escribir el test (mock del hook, del apiClient y del navigate)**

Create `apps/web/src/pages/InterviewPage.test.tsx`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SessionProvider, type SessionData } from '../context/SessionContext';
import { InterviewPage } from './InterviewPage';
import * as apiClient from '../lib/apiClient';
import * as hookMod from '../hooks/useInterviewSocket';
import type { InterviewSocket } from '../hooks/useInterviewSocket';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useNavigate: () => navigateMock,
}));

const session: SessionData = {
  sessionId: 's1', token: 'a'.repeat(64), websocketUrl: 'ws://x', industry: 'backend', level: 'mid',
};

function seedSession() {
  sessionStorage.setItem('warachikuy:session', JSON.stringify(session));
}

function fakeSocket(over: Partial<InterviewSocket> = {}): InterviewSocket {
  return {
    items: [], phase: 'warmup', turnNumber: 0, status: 'open', lastError: null, closing: false,
    sendAnswer: vi.fn(), sendMetrics: vi.fn(), ...over,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <SessionProvider>
        <InterviewPage />
      </SessionProvider>
    </MemoryRouter>,
  );
}

describe('InterviewPage', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    sessionStorage.clear();
  });

  it('renderiza los items y envia la respuesta', () => {
    seedSession();
    const sendAnswer = vi.fn();
    vi.spyOn(hookMod, 'useInterviewSocket').mockReturnValue(
      fakeSocket({
        items: [{ id: '1', role: 'interviewer', text: 'Cuentame de ti', timestamp: 1 }],
        sendAnswer,
      }),
    );
    renderPage();
    expect(screen.getByText('Cuentame de ti')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/escribe tu respuesta/i), { target: { value: 'Soy dev' } });
    fireEvent.submit(screen.getByRole('button', { name: /enviar/i }).closest('form')!);
    expect(sendAnswer).toHaveBeenCalledWith('Soy dev');
  });

  it('al closing muestra el boton ver plan y al apretarlo llama end y navega', async () => {
    seedSession();
    vi.spyOn(hookMod, 'useInterviewSocket').mockReturnValue(
      fakeSocket({ closing: true, items: [{ id: '2', role: 'interviewer', text: 'Gracias, terminamos.', intent: 'closing', timestamp: 9 }] }),
    );
    vi.spyOn(apiClient, 'endSession').mockResolvedValue({ sessionId: 's1', planId: 'p1' });
    renderPage();
    expect(screen.getByText('Gracias, terminamos.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /ver mi plan/i }));
    await waitFor(() => expect(apiClient.endSession).toHaveBeenCalledWith('s1', 'a'.repeat(64)));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/plan/s1'));
  });

  it('si endSession falla muestra banner y no navega', async () => {
    seedSession();
    vi.spyOn(hookMod, 'useInterviewSocket').mockReturnValue(fakeSocket({ closing: true }));
    vi.spyOn(apiClient, 'endSession').mockRejectedValue(new apiClient.ApiClientError('x', 'fallo'));
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /ver mi plan/i }));
    await waitFor(() => expect(screen.getByText(/no se pudo finalizar/i)).toBeInTheDocument());
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Correr para ver el fallo**

Run: `pnpm --filter @warachikuy/web test src/pages/InterviewPage.test.tsx`
Expected: FAIL ("Cannot find module './InterviewPage'").

- [ ] **Step 3: Implementar InterviewPage**

Create `apps/web/src/pages/InterviewPage.tsx`:
```typescript
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { OrbeAnimado } from '../components/OrbeAnimado';
import { MessageBubble } from '../components/MessageBubble';
import { ChatForm } from '../components/ChatForm';
import { Button } from '../components/Button';
import { useSession } from '../context/SessionContext';
import { useInterviewSocket } from '../hooks/useInterviewSocket';
import { endSession } from '../lib/apiClient';

export function InterviewPage() {
  const { session } = useSession();
  const navigate = useNavigate();
  const [ending, setEnding] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);

  // Hooks antes de cualquier return condicional. Si no hay sesion, redirige.
  const socket = useInterviewSocket(session?.websocketUrl ?? '', session?.sessionId ?? '');

  if (!session) return <Navigate to="/setup" replace />;

  async function finish(): Promise<void> {
    setEnding(true);
    setEndError(null);
    try {
      await endSession(session.sessionId, session.token);
      navigate(`/plan/${session.sessionId}`);
    } catch {
      setEndError('No se pudo finalizar la entrevista. Intenta de nuevo.');
      setEnding(false);
    }
  }

  return (
    <div className="interview-root">
      <div className="interview-orb">
        <OrbeAnimado />
      </div>
      <p className="interview-status">
        Fase: {socket.phase} · Turno: {socket.turnNumber} ·{' '}
        {socket.status === 'open' ? 'Conectado' : socket.status === 'connecting' ? 'Conectando...' : 'Desconectado'}
      </p>

      <div className="message-list">
        {socket.items.map((item) => (
          <MessageBubble key={item.id} item={item} />
        ))}
      </div>

      {socket.lastError?.recoverable && (
        <p className="interview-banner">{socket.lastError.message}</p>
      )}
      {endError && <p className="setup-error">{endError}</p>}

      {socket.closing ? (
        <Button onClick={finish} disabled={ending}>
          {ending ? 'Generando...' : 'Ver mi plan de mejora'}
        </Button>
      ) : (
        <>
          <ChatForm onSendMessage={(text) => socket.sendAnswer(text)} />
          <Button className="interview-finish" onClick={finish} disabled={ending}>
            Finalizar entrevista
          </Button>
        </>
      )}
    </div>
  );
}
```

NOTE: el hook `useInterviewSocket` se llama SIEMPRE (antes del return condicional) para no romper las reglas de hooks; cuando no hay sesion pasa strings vacios y el componente redirige igual. (El WS a `''` falla silencioso, pero el render ya redirigio.)

- [ ] **Step 4: Correr para ver el pase**

Run: `pnpm --filter @warachikuy/web test src/pages/InterviewPage.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 5: Estilos (append a global.css)**

```css
/* Sala de entrevista */
.interview-root { max-width: 640px; margin: 0 auto; padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; }
.interview-orb { height: 220px; }
.interview-status { font-size: 0.85rem; color: #9a9aa5; text-align: center; }
.interview-banner { color: #ffb86b; background: #2a2118; padding: 0.5rem 0.75rem; border-radius: 8px; }
.message-bubble.candidate { text-align: right; }
.interview-finish { align-self: center; }
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/InterviewPage.tsx apps/web/src/pages/InterviewPage.test.tsx apps/web/src/assets/global.css
git commit -m "Se agrega la InterviewPage con el WS real y el cierre manual hacia el plan"
```

---

## Task 8: PlanPage (pantalla del plan con polling)

**Files:**
- Create: `apps/web/src/pages/PlanPage.tsx`
- Test: `apps/web/src/pages/PlanPage.test.tsx`
- Modify: `apps/web/src/assets/global.css` (estilos del plan, no testeado)

- [ ] **Step 1: Escribir el test**

Create `apps/web/src/pages/PlanPage.test.tsx`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SessionProvider, type SessionData } from '../context/SessionContext';
import { PlanPage } from './PlanPage';
import * as apiClient from '../lib/apiClient';
import type { ImprovementPlan } from '@warachikuy/shared-types';

const session: SessionData = {
  sessionId: 's1', token: 'a'.repeat(64), websocketUrl: 'ws://x', industry: 'backend', level: 'mid',
};
function seedSession() {
  sessionStorage.setItem('warachikuy:session', JSON.stringify(session));
}

const plan: ImprovementPlan = {
  planId: '550e8400-e29b-41d4-a716-446655440000',
  sessionId: '550e8400-e29b-41d4-a716-446655440001',
  summary: 'Buen desempeno general.',
  competencies: [
    { name: 'fluency', score: 81, comment: 'fluida' },
    { name: 'eye_contact', score: null, comment: 'sin datos' },
    { name: 'speech_rate', score: 67, comment: 'ok' },
    { name: 'content', score: 75, comment: 'solido' },
  ],
  strengths: ['claridad'], improvements: ['profundizar'],
  exercises: [{ title: 'STAR', description: 'Estructura tus respuestas.' }],
  generatedAt: 1,
};

function renderPage() {
  return render(
    <MemoryRouter>
      <SessionProvider>
        <PlanPage />
      </SessionProvider>
    </MemoryRouter>,
  );
}

describe('PlanPage', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('muestra el spinner mientras genera y luego el plan', async () => {
    seedSession();
    vi.spyOn(apiClient, 'getPlan')
      .mockResolvedValueOnce({ status: 'generating' })
      .mockResolvedValue({ status: 'ready', plan });
    renderPage();
    expect(screen.getByText(/generando tu plan/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Buen desempeno general.')).toBeInTheDocument());
    expect(screen.getByText('81')).toBeInTheDocument();
    expect(screen.getByText('STAR')).toBeInTheDocument();
  });

  it('muestra el mensaje de fallo', async () => {
    seedSession();
    vi.spyOn(apiClient, 'getPlan').mockResolvedValue({ status: 'failed' });
    renderPage();
    await waitFor(() => expect(screen.getByText(/no se pudo generar/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Correr para ver el fallo**

Run: `pnpm --filter @warachikuy/web test src/pages/PlanPage.test.tsx`
Expected: FAIL ("Cannot find module './PlanPage'").

- [ ] **Step 3: Implementar PlanPage**

Create `apps/web/src/pages/PlanPage.tsx`:
```typescript
import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import type { ImprovementPlan, PlanCompetency } from '@warachikuy/shared-types';
import { getPlan, type PlanFetchResult } from '../lib/apiClient';
import { useSession } from '../context/SessionContext';
import { CompetencyRing } from '../components/CompetencyRing';
import { Button } from '../components/Button';

const POLL_MS = 1500;
const LABELS: Record<PlanCompetency['name'], string> = {
  fluency: 'Fluidez',
  eye_contact: 'Contacto visual',
  speech_rate: 'Ritmo del habla',
  content: 'Contenido',
};

type View = 'generating' | 'ready' | 'failed' | 'not_found';

export function PlanPage() {
  const { session, clearSession } = useSession();
  const navigate = useNavigate();
  const [view, setView] = useState<View>('generating');
  const [plan, setPlan] = useState<ImprovementPlan | null>(null);

  useEffect(() => {
    if (!session) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;

    async function poll(): Promise<void> {
      let res: PlanFetchResult;
      try {
        res = await getPlan(session.sessionId, session.token);
      } catch {
        // error transitorio de red: reintenta en el proximo tick
        if (active) timer = setTimeout(poll, POLL_MS);
        return;
      }
      if (!active) return;
      if (res.status === 'ready') {
        setPlan(res.plan);
        setView('ready');
        return; // estado terminal: corta el polling
      }
      if (res.status === 'failed') {
        setView('failed');
        return;
      }
      if (res.status === 'not_found') {
        setView('not_found');
        return;
      }
      // generating: sigue
      timer = setTimeout(poll, POLL_MS);
    }

    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [session]);

  if (!session) return <Navigate to="/setup" replace />;

  function restart(): void {
    clearSession();
    navigate('/');
  }

  if (view === 'generating') {
    return (
      <main className="plan-root">
        <p className="plan-loading">Generando tu plan de mejora...</p>
      </main>
    );
  }
  if (view === 'failed' || view === 'not_found' || !plan) {
    return (
      <main className="plan-root">
        <p className="setup-error">No se pudo generar el plan de mejora.</p>
        <Button onClick={restart}>Nueva entrevista</Button>
      </main>
    );
  }

  const hasNullMetric = plan.competencies.some((c) => c.score === null);

  return (
    <main className="plan-root">
      <h1>Tu plan de mejora</h1>
      <p className="plan-summary">{plan.summary}</p>

      <div className="plan-rings">
        {plan.competencies.map((c) => (
          <CompetencyRing key={c.name} label={LABELS[c.name]} score={c.score} />
        ))}
      </div>
      {hasNullMetric && (
        <p className="plan-note">
          Las metricas de camara y voz se integran con el modulo de voz (pendiente).
        </p>
      )}

      <section className="plan-section">
        <h2>Fortalezas</h2>
        <ul>{plan.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
      </section>
      <section className="plan-section">
        <h2>A mejorar</h2>
        <ul>{plan.improvements.map((s, i) => <li key={i}>{s}</li>)}</ul>
      </section>
      <section className="plan-section">
        <h2>Ejercicios</h2>
        <ul>
          {plan.exercises.map((e, i) => (
            <li key={i}>
              <strong>{e.title}</strong>: {e.description}
            </li>
          ))}
        </ul>
      </section>

      <Button onClick={restart}>Nueva entrevista</Button>
    </main>
  );
}
```

- [ ] **Step 4: Correr para ver el pase**

Run: `pnpm --filter @warachikuy/web test src/pages/PlanPage.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 5: Estilos (append a global.css)**

```css
/* Pantalla del plan de mejora */
.plan-root { max-width: 720px; margin: 0 auto; padding: 2rem 1.5rem; display: flex; flex-direction: column; gap: 1.25rem; }
.plan-loading { text-align: center; color: #c8c8d0; padding: 3rem 0; }
.plan-summary { color: #d8d8e0; line-height: 1.5; }
.plan-rings { display: flex; flex-wrap: wrap; gap: 1.5rem; justify-content: center; }
.plan-note { font-size: 0.8rem; color: #9a9aa5; font-style: italic; }
.plan-section h2 { font-size: 1.05rem; color: #ff6b35; margin-bottom: 0.4rem; }
.plan-section ul { padding-left: 1.2rem; color: #d8d8e0; line-height: 1.6; }
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/PlanPage.tsx apps/web/src/pages/PlanPage.test.tsx apps/web/src/assets/global.css
git commit -m "Se agrega la PlanPage con polling y render del plan de mejora"
```

---

## Task 9: Ruteo + limpieza del stub

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/App.test.tsx`
- Modify: `apps/web/src/pages/Home.tsx` (CTA)
- Modify: `apps/web/src/pages/index.ts`
- Delete: `apps/web/src/pages/ChatRoom.tsx`
- Delete: `apps/web/src/hooks/useCustomWebSocket.ts`

- [ ] **Step 1: Actualizar el test de App**

Replace `apps/web/src/App.test.tsx`:
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from './App';

describe('App', () => {
  it('renderiza el Home en la ruta raiz', () => {
    render(<App />);
    expect(screen.getByText(/Warachikuy/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr para ver el fallo**

Run: `pnpm --filter @warachikuy/web test src/App.test.tsx`
Expected: PASS o FAIL segun el estado; si el viejo App aun importa ChatRoom y todo compila, podria pasar. El objetivo real es el typecheck tras borrar ChatRoom/stub (Step 6). Continua.

- [ ] **Step 3: Reescribir App.tsx con el ruteo nuevo + provider**

Replace `apps/web/src/App.tsx`:
```typescript
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { SessionProvider } from './context/SessionContext';
import { Home, NotFound } from './pages';
import { SetupPage } from './pages/SetupPage';
import { InterviewPage } from './pages/InterviewPage';
import { PlanPage } from './pages/PlanPage';
import './assets/global.css';

export function App() {
  return (
    <SessionProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/setup" element={<SetupPage />} />
          <Route path="/interview/:sessionId" element={<InterviewPage />} />
          <Route path="/plan/:sessionId" element={<PlanPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </SessionProvider>
  );
}
```

- [ ] **Step 4: Apuntar el CTA del Home a /setup**

In `apps/web/src/pages/Home.tsx`, change the CTA onClick:
```typescript
        <button className="cta-button" onClick={() => navigate('/setup')}>
```
(era `navigate('/chat')`.)

- [ ] **Step 5: Sacar ChatRoom de los exports de paginas**

In `apps/web/src/pages/index.ts`, remove the `ChatRoom` export line (mantener `Home` y `NotFound`). Confirma que `SetupPage`/`InterviewPage`/`PlanPage` se importan directo en App.tsx (no es obligatorio agregarlos al index).

- [ ] **Step 6: Borrar los archivos del stub**

```bash
git rm apps/web/src/pages/ChatRoom.tsx apps/web/src/hooks/useCustomWebSocket.ts
```

- [ ] **Step 7: Verificar typecheck + tests**

Run: `pnpm --filter @warachikuy/web typecheck && pnpm --filter @warachikuy/web test`
Expected: typecheck limpio (sin referencias colgadas a ChatRoom/useCustomWebSocket) y todos los tests del paquete web en verde. Si algun archivo aun importa `useCustomWebSocket` o `Mensaje`, corregirlo (MessageBubble ya se migro en Task 5).

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/App.tsx apps/web/src/App.test.tsx apps/web/src/pages/Home.tsx apps/web/src/pages/index.ts
git commit -m "Se conecta el ruteo de las pantallas y se elimina el stub del WebSocket"
```

---

## Task 10: Verificacion integral

- [ ] **Step 1: Suite completa del web**

Run: `pnpm --filter @warachikuy/web test`
Expected: PASS, todos los tests nuevos (apiClient, SessionContext, CompetencyRing, useInterviewSocket, MessageBubble, SetupPage, InterviewPage, PlanPage, App).

- [ ] **Step 2: Typecheck + lint del monorepo**

Run: `pnpm -r typecheck && pnpm --filter @warachikuy/web lint`
Expected: limpio.

- [ ] **Step 3: Build del web (sanity de Vite)**

Run: `pnpm --filter @warachikuy/web build`
Expected: build sin errores (verifica que no quedaron imports rotos ni del stub).

- [ ] **Step 4: Commit si quedo algo**

```bash
git status
```

---

## Notas finales

- **Branch:** `feat/frontend-integration` (ya creada, contiene el spec).
- **PR target:** `main`. Crear PR al terminar.
- **Prueba manual (post-merge o local, no CI):** con el backend levantado (`docker compose up` o el fallback tsx + redis) y `GEMINI_API_KEY` en `.env`, abrir `http://localhost:5173`, recorrer Home -> Setup -> entrevistar tecleando -> "Ver mi plan" -> ver el plan con los anillos (3 "sin datos", content con score real). Es lo unico que valida el loop visual de punta a punta.
- **El seam para Walter:** `sendMetrics(auraState)` y `sendAnswer(text, isFinal)` quedan listos; su pipeline (STT + MediaPipe) los llama sin reescribir esta rebanada.
- **Gap consciente:** las 3 metricas medidas salen "sin datos" hasta que Walter cablee la voz/aura; recarga a mitad de entrevista reinicia el chat (documentado en el spec).
- **Dependencia para la demo (#42 completa):** voz de Walter + pulido de la sala de Max.
