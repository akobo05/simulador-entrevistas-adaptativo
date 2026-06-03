# Reconciliacion de la UI con el flujo real — Plan de implementacion

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adoptar el design system y el diseno visual del PR #48 (Max) SOBRE el flujo real ya cableado al backend (#46), sin regresar a mock ni romper estados.

**Architecture:** Rama `feat/ui-reconciliation` (desde `main`). Se portan los assets de Max desde `origin/feat/frontend-ui` con `git show`, se reconcilian con lo existente, y las 3 paginas cableadas (`SetupPage`/`InterviewPage`/`PlanPage`) se re-estilan conservando su logica de #46. El aura se maneja con un selector puro `AuraState -> props`. Las paginas F2 se difieren.

**Tech Stack:** React 19 + Vite 6 + react-router-dom 7 + three/@react-three/fiber 9 + @react-three/drei + lucide-react + vitest 3 + happy-dom 16 + @testing-library/react 16 (sin @testing-library/user-event; usar `fireEvent`).

**Convenciones:** identificadores en ingles; comentarios y commits en espanol natural sin acentos ("Se agrega X", "Se ajusta Y"); sin marcas de IA/Claude/Anthropic. TDD. Commits frecuentes.

**Mecanica de porting:** leer el archivo de Max con `git show origin/feat/frontend-ui:<ruta>`; para archivos nuevos sin conflicto, `git show ... > destino` y adaptar. Donde preserve autoria de Max y no haya conflicto, se puede `git cherry-pick` el commit suyo, pero el camino por defecto es portar el contenido. Referencia del contrato: `packages/shared-types/src/metrics.ts` (`AuraState`, `AuraMetric` con `name: fluency|eye_contact|speech_rate`, `value` 0-100).

**Spec:** `docs/superpowers/specs/2026-06-03-ui-reconciliation-design.md`.

---

## File Structure

Nuevos:
- `apps/web/src/lib/auraVisual.ts` — selector puro `auraStateToAvatarProps` (AuraState -> props del aura).
- `apps/web/src/components/AvatarAura.tsx` (+ `.css`) — aura 3D portada de Max, adaptada al contrato.
- `apps/web/src/components/{Card,Badge,ProgressRing,SparklineChart,Sidebar}.tsx` (+ sus `.css`) — design system.
- `apps/web/src/components/index.ts` — barrel.
- `apps/web/src/hooks/useSessionTimer.ts` — timer de sesion.

Modificados:
- `apps/web/src/assets/global.css` — tokens de Max (aditivo) + auditoria de contraste.
- `apps/web/src/components/Button.tsx` (+ `.css`) — variants de Max conservando `disabled` de #46.
- `apps/web/src/components/OrbeAnimado.tsx` — paleta azul/cian.
- `apps/web/src/utils/formatTime.ts` — agrega `formatMMSS`, `formatDuration`.
- `apps/web/src/layouts/MainLayout.tsx` — integra Sidebar; excluye full-screen.
- `apps/web/src/pages/{SetupPage,InterviewPage,PlanPage}.tsx` (+ `.css`) — re-estilo conservando logica de #46.
- `apps/web/src/pages/Home.tsx` — ajuste menor de estilo.
- `apps/web/src/App.tsx` — rutas reales + `SessionProvider` + lazy/Suspense + ScrollToTop + stubs F2.

Diferidos (NO se tocan): `Ranking`, `MyProgress`, `ObserverRoom`, `useMetrics` (simulado).

---

## Task 1: Design tokens en global.css (con auditoria de contraste)

**Files:**
- Modify: `apps/web/src/assets/global.css`
- Reference: `git show origin/feat/frontend-ui:apps/web/src/assets/global.css`

- [ ] **Step 1: Leer ambas versiones**

Run: `git show origin/feat/frontend-ui:apps/web/src/assets/global.css` y abrir `apps/web/src/assets/global.css` actual.

- [ ] **Step 2: Portar los tokens de Max de forma aditiva**

Agregar a `:root` los tokens de Max (no borrar los que el flujo real ya use): `--bg` (#F4F6FB), `--bg2` (#FFFFFF), `--bg3` (#E8EDF6), `--accent` (#2563EB), `--accent2` (#0EA5E9), `--accent-glow`, `--text` (#0F172A), `--text-muted` (#64748B), `--color-danger/success/warning`, fuentes `--font-display` (Syne), `--font-body` (DM Sans), `--font-mono` (JetBrains Mono), espaciado `--space-1..8`, radios `--radius-sm/md/lg/full`, sombras `--shadow-sm/md/glow`, transiciones `--transition-fast/normal`, z-index `--z-overlay/tooltip/modal`. Incluir los `@import`/`@font-face` de las fuentes si Max los define.

- [ ] **Step 3: Auditoria de contraste WCAG 2.2 AA**

Verificar manualmente cada token usado como color de TEXTO sobre su fondo: `--text` (#0F172A) sobre `--bg` (#F4F6FB) cumple (>=4.5:1). El cian `--accent2` (#0EA5E9) sobre `--bg` NO se usa para texto chico (ratio ~2.3:1, reprueba): reservarlo para acentos, bordes, fondos o iconos grandes. `--text-muted` (#64748B) sobre `--bg`: confirmar >=4.5:1; si no, oscurecerlo. Dejar un comentario en el CSS indicando que `--accent2` no es para texto.

- [ ] **Step 4: Verificar build**

Run: `pnpm --filter @warachikuy/web build`
Expected: build OK, sin errores de CSS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/assets/global.css
git commit -m "Se adoptan los design tokens de la UI con auditoria de contraste"
```

---

## Task 2: Componentes base (Card, Badge, ProgressRing, SparklineChart) + Button reconciliado

**Files:**
- Create: `apps/web/src/components/{Card,Badge,ProgressRing,SparklineChart}.tsx` (+ `.css` de cada uno)
- Modify: `apps/web/src/components/Button.tsx` (+ `Button.css`)
- Create: `apps/web/src/components/index.ts`
- Test: `apps/web/src/components/ProgressRing.test.tsx`

- [ ] **Step 1: Portar los componentes nuevos**

Para cada uno: `git show origin/feat/frontend-ui:apps/web/src/components/Card.tsx > apps/web/src/components/Card.tsx` (idem `Card.css`, `Badge.tsx/.css`, `ProgressRing.tsx/.css`, `SparklineChart.tsx`). No requieren cambios de logica. Agregar en cada componente interactivo/significativo un `data-testid` estable y roles ARIA donde aplique (ej. `ProgressRing` con `role="img"` y `aria-label` del valor).

- [ ] **Step 2: Reconciliar Button**

Leer `git show origin/feat/frontend-ui:apps/web/src/components/Button.tsx` (variants `primary|secondary|ghost|danger`, `size`, `loading`, `icon`, `fullWidth`) y el `apps/web/src/components/Button.tsx` actual (#46 usa la prop `disabled`). Fusionar: adoptar la version de Max PERO mantener `disabled` funcionando (el `<button>` recibe `disabled` y el handler lo respeta). Portar `Button.css`.

- [ ] **Step 3: Escribir test de ProgressRing**

```tsx
import { render, screen } from '@testing-library/react';
import { ProgressRing } from './ProgressRing';

test('ProgressRing muestra el valor y expone aria-label', () => {
  render(<ProgressRing value={73} label="Fluidez" />);
  expect(screen.getByText('73%')).toBeInTheDocument();
  expect(screen.getByRole('img', { name: /73/ })).toBeInTheDocument();
});
```

- [ ] **Step 4: Crear el barrel index.ts**

```ts
export { Button } from './Button';
export { Card } from './Card';
export { Badge } from './Badge';
export { ProgressRing } from './ProgressRing';
export { SparklineChart } from './SparklineChart';
export { Sidebar } from './Sidebar';
export { OrbeAnimado } from './OrbeAnimado';
export { AvatarAura } from './AvatarAura';
export { MessageBubble } from './MessageBubble';
export { ChatForm } from './ChatForm';
export { CompetencyRing } from './CompetencyRing';
```

(Las referencias a `Sidebar`/`AvatarAura` se crean en tasks posteriores; el barrel queda completo desde ya. Si el typecheck falla por imports inexistentes, dejar esas dos lineas comentadas y descomentarlas en sus tasks.)

- [ ] **Step 5: Verificar tests, typecheck y commit**

Run: `pnpm --filter @warachikuy/web test -- ProgressRing && pnpm --filter @warachikuy/web typecheck`
Expected: PASS.

```bash
git add apps/web/src/components/
git commit -m "Se agregan los componentes base del design system y se reconcilia Button"
```

---

## Task 3: formatTime ampliado + useSessionTimer

**Files:**
- Modify: `apps/web/src/utils/formatTime.ts`
- Test: `apps/web/src/utils/formatTime.test.ts`
- Create: `apps/web/src/hooks/useSessionTimer.ts`
- Test: `apps/web/src/hooks/useSessionTimer.test.ts`

- [ ] **Step 1: Escribir tests de las nuevas funciones de formatTime**

Agregar a `apps/web/src/utils/formatTime.test.ts`:

```ts
import { formatMMSS, formatDuration } from './formatTime';

test('formatMMSS convierte segundos a MM:SS con padding', () => {
  expect(formatMMSS(0)).toBe('00:00');
  expect(formatMMSS(65)).toBe('01:05');
  expect(formatMMSS(600)).toBe('10:00');
});

test('formatDuration da texto legible', () => {
  expect(formatDuration(45)).toBe('45 seg');
  expect(formatDuration(120)).toBe('2 min');
});
```

- [ ] **Step 2: Implementar formatMMSS y formatDuration**

```ts
export function formatMMSS(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  if (s < 60) return `${s} seg`;
  return `${Math.round(s / 60)} min`;
}
```

- [ ] **Step 3: Portar useSessionTimer y su test**

`git show origin/feat/frontend-ui:apps/web/src/hooks/useSessionTimer.ts > apps/web/src/hooks/useSessionTimer.ts`. Verificar que use `formatMMSS` (o equivalente) y que limpie su intervalo al desmontar. Escribir `useSessionTimer.test.ts`:

```ts
import { renderHook, act } from '@testing-library/react';
import { vi } from 'vitest';
import { useSessionTimer } from './useSessionTimer';

test('useSessionTimer cuenta y formatea', () => {
  vi.useFakeTimers();
  const { result } = renderHook(() => useSessionTimer({ autoStart: true }));
  act(() => { vi.advanceTimersByTime(65_000); });
  expect(result.current.formattedTime).toBe('01:05');
  vi.useRealTimers();
});
```

(Ajustar la firma del hook a la real de Max tras leerlo; si `autoStart` no es el nombre exacto, usar el que exponga.)

- [ ] **Step 4: Verificar y commit**

Run: `pnpm --filter @warachikuy/web test -- formatTime useSessionTimer`
Expected: PASS.

```bash
git add apps/web/src/utils/formatTime.ts apps/web/src/utils/formatTime.test.ts apps/web/src/hooks/useSessionTimer.ts apps/web/src/hooks/useSessionTimer.test.ts
git commit -m "Se amplia formatTime y se agrega el hook useSessionTimer"
```

---

## Task 4: Selector auraStateToAvatarProps (logica nueva, TDD)

**Files:**
- Create: `apps/web/src/lib/auraVisual.ts`
- Test: `apps/web/src/lib/auraVisual.test.ts`

- [ ] **Step 1: Escribir el test**

```ts
import { auraStateToAvatarProps } from './auraVisual';
import type { AuraState } from '@warachikuy/shared-types';

const make = (metrics: AuraState['metrics']): AuraState => ({
  sessionId: '550e8400-e29b-41d4-a716-446655440000',
  metrics,
  collectedAt: 1_700_000_000_000,
});

test('mapea metricas presentes a sus props', () => {
  const props = auraStateToAvatarProps(
    make([
      { name: 'fluency', value: 80, confidence: 'high', timestamp: 1 },
      { name: 'speech_rate', value: 60, confidence: 'medium', timestamp: 1 },
      { name: 'eye_contact', value: 40, confidence: 'high', timestamp: 1 },
    ]),
  );
  expect(props).toEqual({ fluency: 80, speechRate: 60, eyeContact: 40 });
});

test('una metrica omitida queda en null', () => {
  const props = auraStateToAvatarProps(
    make([{ name: 'fluency', value: 80, confidence: 'high', timestamp: 1 }]),
  );
  expect(props).toEqual({ fluency: 80, speechRate: null, eyeContact: null });
});

test('state null deja las tres en null', () => {
  expect(auraStateToAvatarProps(null)).toEqual({
    fluency: null,
    speechRate: null,
    eyeContact: null,
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `pnpm --filter @warachikuy/web test -- auraVisual`
Expected: FAIL ("auraStateToAvatarProps is not a function").

- [ ] **Step 3: Implementar el selector**

```ts
import type { AuraState } from '@warachikuy/shared-types';

export interface AvatarAuraMetrics {
  fluency: number | null;
  speechRate: number | null;
  eyeContact: number | null;
}

// El backend OMITE del array las metricas sin senal (no las manda con null).
// Este selector traduce esa ausencia a null para el AvatarAura.
export function auraStateToAvatarProps(state: AuraState | null): AvatarAuraMetrics {
  const find = (name: string): number | null =>
    state?.metrics.find((m) => m.name === name)?.value ?? null;
  return {
    fluency: find('fluency'),
    speechRate: find('speech_rate'),
    eyeContact: find('eye_contact'),
  };
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `pnpm --filter @warachikuy/web test -- auraVisual`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/auraVisual.ts apps/web/src/lib/auraVisual.test.ts
git commit -m "Se agrega el selector que traduce AuraState a props del aura"
```

---

## Task 5: AvatarAura adaptado al contrato real

**Files:**
- Create: `apps/web/src/components/AvatarAura.tsx` (+ `AvatarAura.css`)
- Test: `apps/web/src/components/AvatarAura.test.tsx`
- Reference: `git show origin/feat/frontend-ui:apps/web/src/components/AvatarAura.tsx`

- [ ] **Step 1: Portar el archivo de Max**

`git show origin/feat/frontend-ui:apps/web/src/components/AvatarAura.tsx > apps/web/src/components/AvatarAura.tsx` y `AvatarAura.css` igual.

- [ ] **Step 2: Reemplazar la API de props y quitar la simulacion**

Cambiar la interfaz de props a:

```ts
export interface AvatarAuraProps {
  fluency: number | null; // 0-100 o null = sin datos
  speechRate: number | null; // 0-100 (era "rhythm")
  eyeContact: number | null; // 0-100 (reemplaza "pause")
  speaking: boolean;
}
```

Eliminar `useSimulatedMetrics` y todo su uso (el componente ya NO fluctua solo; recibe el estado por props). Mapear internamente: nucleo color/distort por `fluency`; emissive/velocidad por `speechRate`; anillos para `fluency`, `speechRate`, `eyeContact` (eliminar el 4to anillo de "pause" y el de "level"); `speaking` mantiene la animacion de escala. Para cada metrica, si es `null` usar un valor neutro (ej. 50) para el render 3D pero marcar el chip como "sin datos".

- [ ] **Step 3: Chips honestos**

Los chips de esquina pasan a "Fluidez" (`fluency`), "Ritmo" (`speechRate`), "Contacto visual" (`eyeContact`). Si la metrica es `null`, el chip muestra el texto "sin datos" en vez de un numero/barra/delta. Quitar el chip de "Nivel" y "Pausa". Cada chip con `data-testid` (ej. `aura-chip-fluency`).

- [ ] **Step 4: Escribir el test del mapeo**

```tsx
import { render, screen } from '@testing-library/react';
import { AvatarAura } from './AvatarAura';

// El Canvas 3D no renderiza en happy-dom; el test se enfoca en los chips (DOM).
test('muestra "sin datos" cuando una metrica es null', () => {
  render(<AvatarAura fluency={75} speechRate={null} eyeContact={null} speaking={false} />);
  expect(screen.getByTestId('aura-chip-fluency')).toHaveTextContent('75');
  expect(screen.getByTestId('aura-chip-speechRate')).toHaveTextContent(/sin datos/i);
  expect(screen.getByTestId('aura-chip-eyeContact')).toHaveTextContent(/sin datos/i);
});
```

(Si el `<Canvas>` de r3f rompe en happy-dom, envolver su render en un guard o mockear `@react-three/fiber` con `vi.mock` para que `Canvas` renderice `children` en un div; los chips viven fuera del Canvas.)

- [ ] **Step 5: Verificar, typecheck y commit**

Run: `pnpm --filter @warachikuy/web test -- AvatarAura && pnpm --filter @warachikuy/web typecheck`
Expected: PASS.

```bash
git add apps/web/src/components/AvatarAura.tsx apps/web/src/components/AvatarAura.css apps/web/src/components/AvatarAura.test.tsx
git commit -m "Se adapta el AvatarAura al contrato real de metricas"
```

---

## Task 6: OrbeAnimado azul/cian + Sidebar + MainLayout

**Files:**
- Modify: `apps/web/src/components/OrbeAnimado.tsx`
- Create: `apps/web/src/components/Sidebar.tsx` (+ `Sidebar.css`)
- Modify: `apps/web/src/layouts/MainLayout.tsx`
- Test: `apps/web/src/components/Sidebar.test.tsx`

- [ ] **Step 1: Adoptar OrbeAnimado azul/cian**

Leer `git show origin/feat/frontend-ui:apps/web/src/components/OrbeAnimado.tsx` y adoptar su paleta (#2563EB/#0EA5E9/#6366F1, luces mas altas para tema claro) sobre el actual.

- [ ] **Step 2: Portar Sidebar y reapuntar rutas**

`git show origin/feat/frontend-ui:apps/web/src/components/Sidebar.tsx > apps/web/src/components/Sidebar.tsx` (+ `.css`). Reapuntar los items a las rutas reales: "Inicio" -> `/`, "Nueva sesion" -> `/setup`. Los items "Mi progreso" y "Ranking" quedan como stubs deshabilitados con un sufijo "proximamente" (no navegan; `aria-disabled="true"`). Quitar el item de "Configuracion" si no tiene destino real (o dejarlo como stub). Quitar cualquier `TEST_USER` mock visible o reemplazarlo por algo neutro.

- [ ] **Step 3: Integrar Sidebar en MainLayout**

Leer `git show origin/feat/frontend-ui:apps/web/src/layouts/MainLayout.tsx` y el actual. `MainLayout` envuelve las paginas no full-screen con el `Sidebar`. Las full-screen (`/interview/:sessionId`) NO usan `MainLayout` (se rutean fuera de el en Task 8).

- [ ] **Step 4: Test del Sidebar**

```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from './Sidebar';

test('Sidebar enlaza a rutas reales y marca F2 como proximamente', () => {
  render(<MemoryRouter><Sidebar /></MemoryRouter>);
  expect(screen.getByRole('link', { name: /inicio/i })).toHaveAttribute('href', '/');
  expect(screen.getByRole('link', { name: /nueva sesion/i })).toHaveAttribute('href', '/setup');
  expect(screen.getByText(/ranking/i).closest('[aria-disabled="true"]')).toBeTruthy();
});
```

- [ ] **Step 5: Verificar y commit**

Run: `pnpm --filter @warachikuy/web test -- Sidebar && pnpm --filter @warachikuy/web typecheck`
Expected: PASS.

```bash
git add apps/web/src/components/OrbeAnimado.tsx apps/web/src/components/Sidebar.tsx apps/web/src/components/Sidebar.css apps/web/src/layouts/MainLayout.tsx
git commit -m "Se adopta el orbe azul/cian y el sidebar apuntando a las rutas reales"
```

---

## Task 7: Re-estilo de SetupPage (conserva logica de #46)

**Files:**
- Modify: `apps/web/src/pages/SetupPage.tsx` (+ crear `SetupPage.css`)
- Reference visual: `git show origin/feat/frontend-ui:apps/web/src/pages/ProfileSetup.tsx` (+ `.css`)
- Test: `apps/web/src/pages/SetupPage.test.tsx`

- [ ] **Step 1: Leer ambas fuentes**

Abrir el `SetupPage.tsx` actual (logica real: `getIndustries`, form industria+nivel, `createSession`, `setSession`, navega a `/interview/:sessionId`) y `ProfileSetup.tsx` de Max (estilo: stepper + tarjeta).

- [ ] **Step 2: Re-estilar conservando la logica**

Reescribir el JSX/markup de `SetupPage` con el look de Max (stepper, tarjeta, tipografia, Button del design system) PERO sin tocar la logica: los campos reales son industria (de `getIndustries`) y nivel (`junior|mid|senior`). NO agregar intereses/CV/accesibilidad (diferido). Crear `SetupPage.css` (adaptar de `ProfileSetup.css`). Mantener labels y roles accesibles; agregar `data-testid` a los controles clave.

- [ ] **Step 3: Actualizar el test existente sin debilitarlo**

El `SetupPage.test.tsx` de #46 valida: carga industrias, submit llama `createSession` y navega. Ajustar selectores al nuevo DOM (usar `getByRole`/`data-testid`, no clases), conservando las MISMAS aserciones de comportamiento (que se llame `createSession` con `{industry, level}` y se navegue a `/interview/:id`).

- [ ] **Step 4: Verificar**

Run: `pnpm --filter @warachikuy/web test -- SetupPage && pnpm --filter @warachikuy/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/SetupPage.tsx apps/web/src/pages/SetupPage.css apps/web/src/pages/SetupPage.test.tsx
git commit -m "Se reestila SetupPage con el look nuevo conservando la creacion de sesion"
```

---

## Task 8: Re-estilo de InterviewPage (conserva WS real + estados + aura)

**Files:**
- Modify: `apps/web/src/pages/InterviewPage.tsx` (+ crear `InterviewPage.css`)
- Reference visual: `git show origin/feat/frontend-ui:apps/web/src/pages/ChatRoom.tsx` (+ `.css`)
- Test: `apps/web/src/pages/InterviewPage.test.tsx`

- [ ] **Step 1: Leer ambas fuentes**

Abrir el `InterviewPage.tsx` actual (logica real: `useInterviewSocket`, `items` via `MessageBubble`, `ChatForm` con `disabled`, estados `closing`/terminal/desconexion, `sendAnswer`, navegacion al plan, guard de sesion) y `ChatRoom.tsx` de Max (layout: avatar a la izquierda, panel derecho con transcripcion, header con timer + Finalizar).

- [ ] **Step 2: Re-estilar conservando TODO el wiring**

Reescribir el markup con el layout de ChatRoom: `AvatarAura` a la izquierda (alimentado por `auraStateToAvatarProps(socket.auraState ?? null)` — en F1 sin voz da las tres `null` -> "sin datos"), panel derecho con la transcripcion (`socket.items` via `MessageBubble`) y el `ChatForm` (conserva su prop `disabled={socket.status !== 'open'}` y su submit -> `sendAnswer`). Header con timer (`useSessionTimer`) + boton "Finalizar". Donde Max tenia el waveform mock, dejar un placeholder estatico (comentario "// placeholder del mic — paso multimodal"). CONSERVAR los bloques de estado de #46: `closing` -> "Ver mi plan de mejora"; terminal/desconexion -> mensaje + "Volver al inicio" + form deshabilitado. Mantener `useInterviewSocket` llamado incondicional antes del guard `if (!session) Navigate`.

- [ ] **Step 3: Lazy-load del AvatarAura**

Cargar `AvatarAura` con `React.lazy(() => import('../components/AvatarAura').then(m => ({ default: m.AvatarAura })))` envuelto en `<Suspense fallback={null}>`, para que la init de Three.js no bloquee el handshake del WS.

```tsx
const AvatarAura = lazy(() =>
  import('../components/AvatarAura').then((m) => ({ default: m.AvatarAura })),
);
// ...
<Suspense fallback={<div className="aura-fallback" />}>
  <AvatarAura {...auraStateToAvatarProps(socket.auraState ?? null)} speaking={false} />
</Suspense>
```

(Si `useInterviewSocket` aun no expone `auraState`, pasar `auraStateToAvatarProps(null)`; el hook lo expondra en el paso multimodal. Verificar la forma real del hook antes de asumir el campo.)

- [ ] **Step 4: Actualizar el test sin debilitarlo**

El `InterviewPage.test.tsx` de #46 mockea `useInterviewSocket` y valida: render de items, `ChatForm` deshabilitado segun status, estados terminal/closing, navegacion. Ajustar selectores al nuevo DOM (roles/`data-testid`), conservando las MISMAS aserciones. Asegurar que el mock del hook incluya los campos que el nuevo markup lee (`auraState` si se usa). Mockear `AvatarAura` (lazy) para que no cargue Three.js en el test.

- [ ] **Step 5: Verificar y commit**

Run: `pnpm --filter @warachikuy/web test -- InterviewPage && pnpm --filter @warachikuy/web typecheck`
Expected: PASS.

```bash
git add apps/web/src/pages/InterviewPage.tsx apps/web/src/pages/InterviewPage.css apps/web/src/pages/InterviewPage.test.tsx
git commit -m "Se reestila InterviewPage con la sala nueva conservando el WS y el aura"
```

---

## Task 9: Re-estilo de PlanPage (conserva polling + plan real)

**Files:**
- Modify: `apps/web/src/pages/PlanPage.tsx` (+ crear `PlanPage.css`)
- Reference visual: `git show origin/feat/frontend-ui:apps/web/src/pages/ImprovementPlan.tsx` (+ `.css`)
- Test: `apps/web/src/pages/PlanPage.test.tsx`

- [ ] **Step 1: Leer ambas fuentes**

Abrir el `PlanPage.tsx` actual (logica real: polling `getPlan` con `POLL_MS=1500`, estados generating/ready/failed/not_found, 4 `CompetencyRing`, strengths/improvements/exercises, "sin datos" cuando score es null) y `ImprovementPlan.tsx` de Max (estilo: cards de competencia con `ProgressRing`, ejercicios, header con botones).

- [ ] **Step 2: Re-estilar conservando la logica**

Reescribir el markup con el look de Max: header + cards de competencia (usar `ProgressRing` o el `CompetencyRing` existente, el que de mejor "sin datos"), seccion de ejercicios, strengths/improvements. Las secciones de Max SIN dato real (quick metrics tipo palabras/min, timeline) se OMITEN (no inventar datos). CONSERVAR: el polling real, los 4 estados, el render del plan real (3 metricas medidas "sin datos" + `content` con score, strengths/improvements/exercises). Crear `PlanPage.css`.

- [ ] **Step 3: Actualizar el test sin debilitarlo**

El `PlanPage.test.tsx` de #46 mockea `getPlan` y valida: estados de polling, render del plan, "sin datos". Ajustar selectores al nuevo DOM conservando las aserciones de comportamiento.

- [ ] **Step 4: Verificar y commit**

Run: `pnpm --filter @warachikuy/web test -- PlanPage && pnpm --filter @warachikuy/web typecheck`
Expected: PASS.

```bash
git add apps/web/src/pages/PlanPage.tsx apps/web/src/pages/PlanPage.css apps/web/src/pages/PlanPage.test.tsx
git commit -m "Se reestila PlanPage con el look nuevo conservando el polling del plan"
```

---

## Task 10: Routing en App.tsx + Home + limpieza

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/pages/Home.tsx`
- Test: `apps/web/src/App.test.tsx`
- Reference: `git show origin/feat/frontend-ui:apps/web/src/App.tsx`

- [ ] **Step 1: Reconciliar App.tsx**

Mantener el `SessionProvider` envolviendo el `BrowserRouter` (del flujo real). Tomar de Max: `lazy`+`Suspense` con `LoadingScreen`, `ScrollToTop`. Rutas finales:
- `/` -> Home; `/setup` -> SetupPage; `/interview/:sessionId` -> InterviewPage (full-screen, fuera de MainLayout); `/plan/:sessionId` -> PlanPage; `*` -> NotFound.
- Las paginas no full-screen van envueltas con `MainLayout` (sidebar).
- NO agregar rutas a paginas F2 (diferidas). El `LoadingScreen` puede ser un componente simple inline o portado de Max.

```tsx
// Estructura objetivo (resumen):
<SessionProvider>
  <BrowserRouter>
    <ScrollToTop />
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path="/interview/:sessionId" element={<InterviewPage />} />
        <Route element={<MainLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/setup" element={<SetupPage />} />
          <Route path="/plan/:sessionId" element={<PlanPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  </BrowserRouter>
</SessionProvider>
```

(Adaptar a como `MainLayout` consume `<Outlet/>`; si #46 no usaba `Outlet`, mantener su patron de layout.)

- [ ] **Step 2: Home con estilo nuevo**

Ajustar `Home.tsx` al look nuevo (usa `OrbeAnimado` azul/cian, Button del design system, navega a `/setup`).

- [ ] **Step 3: Limpieza de codigo muerto**

Confirmar que NO quedan: `useMetrics` (simulado) sin uso, imports sin uso, ni referencias a paginas F2. Run: `pnpm --filter @warachikuy/web lint` para detectar imports/vars sin uso.

- [ ] **Step 4: Actualizar App.test.tsx**

Ajustar el smoke test de rutas (que `/` renderiza Home, `/setup` SetupPage, etc.) al nuevo arbol, conservando las aserciones.

- [ ] **Step 5: Verificar y commit**

Run: `pnpm --filter @warachikuy/web test -- App && pnpm --filter @warachikuy/web typecheck && pnpm --filter @warachikuy/web lint`
Expected: PASS.

```bash
git add apps/web/src/App.tsx apps/web/src/pages/Home.tsx apps/web/src/App.test.tsx
git commit -m "Se reconcilia el routing conservando el provider y las rutas reales"
```

---

## Task 11: Verificacion final (CI completo)

**Files:** ninguno nuevo (gate de calidad).

- [ ] **Step 1: Suite completa de web**

Run: `pnpm --filter @warachikuy/web test`
Expected: todos los tests verdes (los de #46 ajustados + los nuevos).

- [ ] **Step 2: Typecheck, lint y build de todo el workspace**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: PASS, sin warnings nuevos de imports/vars sin uso.

- [ ] **Step 3: Lighthouse local (accesibilidad)**

Run: `pnpm --filter "@warachikuy/web..." build` y revisar que el build sirva para Lighthouse. Verificar manualmente el contraste de la paleta (Task 1, Step 3) en las pantallas principales; el job de CI corre Lighthouse con umbral >=95 accesibilidad.

- [ ] **Step 4: Revisar que no se rompio ningun estado real**

Checklist manual contra el spec (seccion Manejo de errores): InterviewPage conserva closing/terminal/desconexion/form-disabled; PlanPage conserva los 4 estados de polling; SetupPage conserva createSession; metricas null -> "sin datos". Si algo se perdio en el re-estilo, corregir en la pagina correspondiente.

- [ ] **Step 5: Commit final (si hubo ajustes)**

```bash
git add -A
git commit -m "Se verifica la reconciliacion completa de la UI"
```

---

## Notas de cierre

- La PR de reconciliacion debe **acreditar el #48** de Max en su descripcion (el design system y los componentes son su trabajo) y dejar claro que las paginas F2 (Ranking/MyProgress/ObserverRoom) se difieren a F2 reusando su rama.
- Coordinar el cierre del #48 a favor de esta PR (no mergear #48).
- El paso multimodal siguiente (otra rebanada) cableara voz/camara y hara que `useInterviewSocket` exponga el `auraState` real que el `AvatarAura` ya esta listo para consumir.
