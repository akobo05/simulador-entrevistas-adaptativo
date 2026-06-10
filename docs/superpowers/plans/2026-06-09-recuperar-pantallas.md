# Recuperar Pantallas (Ranking / MyProgress / ObserverRoom) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrar a `main` las 3 pantallas mock de Max (PR #48) como rutas reales con datos simulados, con sidebar real, regla `prefers-reduced-motion` y contraste AA.

**Architecture:** Port mecanico de 6 archivos desde `origin/feat/frontend-ui` con 4 adaptaciones minimas (comentario de cabecera con issue, landmark `<main>`, rename `ObserverAura`, contraste). Integracion en el shell existente (App.tsx lazy routes, `FULLSCREEN_ROUTES`, Sidebar). Sin backend nuevo: los backends reales quedan como issues de fases F2/F3/F4 creados al inicio.

**Tech Stack:** React 19, Vite 6, react-router-dom 7, vitest 3 + happy-dom + @testing-library/react (usar `fireEvent`, NO user-event), lucide-react, CSS plano con tokens de `global.css`.

**Spec:** `docs/superpowers/specs/2026-06-09-recuperar-pantallas-design.md`

**Convenciones obligatorias:**
- Identificadores en ingles; comentarios y commits en espanol natural SIN acentos ("Se agrega X"). El texto visible de UI SI puede llevar acentos.
- Sin marcas de IA (nada de Co-Authored-By ni menciones a herramientas).
- Comandos de test desde la raiz del repo: `pnpm --filter @warachikuy/web test` (suite web completa) o `pnpm --filter @warachikuy/web test src/pages/Ranking.test.tsx` (un archivo).

---

## Estructura de archivos

| Archivo | Accion | Responsabilidad |
|---------|--------|-----------------|
| `apps/web/src/pages/Ranking.tsx` + `.css` | Crear (port) | Pantalla mock de gamificacion |
| `apps/web/src/pages/MyProgress.tsx` + `.css` | Crear (port) | Pantalla mock de progreso/personalizacion |
| `apps/web/src/pages/ObserverRoom.tsx` + `.css` | Crear (port) | Pantalla mock de sala del observador |
| `apps/web/src/pages/Ranking.test.tsx` (+2) | Crear | Render test por pagina |
| `apps/web/src/App.tsx` | Modificar | 3 rutas lazy nuevas |
| `apps/web/src/layouts/MainLayout.tsx` | Modificar | `/observer` full-screen |
| `apps/web/src/components/Sidebar.tsx` + `.css` + test | Modificar | Items reales, fin de "proximamente" |
| `apps/web/src/assets/global.css` | Modificar | Regla `prefers-reduced-motion` |
| `docs/superpowers/specs/2026-06-09-recuperar-pantallas-design.md` | Modificar | Registrar adaptacion 4 (landmark main) |

**NO tocar:** `pages/index.ts` (barrel solo exporta Home/NotFound), `InterviewPage`, `PlanPage`, `SetupPage`, nada de `apps/api`.

---

### Task 1: Issues de fases futuras + enmienda del spec

Los issues se crean PRIMERO para poder enlazarlos en los comentarios de cabecera
(spec seccion 3.5). Las labels correctas del roadmap del repo son: gamificacion=`phase:F4`,
personalizacion=`phase:F2`, peer-mock=`phase:F3`.

**Files:**
- Modify: `docs/superpowers/specs/2026-06-09-recuperar-pantallas-design.md`

- [ ] **Step 1: Crear los 3 issues en GitHub**

```bash
gh issue create \
  --title "[F4] Backend de gamificacion: ranking, ligas y badges reales" \
  --label "phase:F4" --label "module:backend" \
  --body "La pantalla /ranking (mock, recuperada del PR #48) muestra ranking semanal, medallas, delta de posiciones y retos con datos simulados. Este issue cubre el backend real: persistencia de puntajes por usuario, calculo del ranking semanal por liga/industria, y endpoints para alimentar la pantalla. Criterio de cierre: /ranking deja de usar datos inline y consume la API real."

gh issue create \
  --title "[F2] Backend de progreso longitudinal por competencia" \
  --label "phase:F2" --label "module:backend" \
  --body "La pantalla /progress (mock, recuperada del PR #48) muestra XP/nivel, racha, evolucion por competencia (sparklines) y logros con datos simulados. Este issue cubre el backend real: persistencia multi-sesion del historial por competencia (hoy las sesiones viven en Redis con TTL y se pierden), agregacion longitudinal y endpoints. Criterio de cierre: /progress consume datos reales del historial del usuario."

gh issue create \
  --title "[F3] Sala peer-mock real con WebRTC" \
  --label "phase:F3" --label "module:frontend" --label "module:backend" \
  --body "La pantalla /observer (mock, recuperada del PR #48) muestra la sala del observador con timer EN VIVO, transcript y metricas simuladas. Este issue cubre la sala real: senalizacion WebRTC, roles candidato/entrevistador/observador, comentarios anclados a timestamp y metricas en vivo del candidato observado. Criterio de cierre: dos navegadores pueden conectarse a la misma sala con roles distintos."
```

Anotar los 3 numeros devueltos (en adelante `#N1` ranking, `#N2` progreso, `#N3` observador).
Los Tasks 2-4 los usan en los comentarios de cabecera.

- [ ] **Step 2: Registrar la adaptacion 4 en el spec**

En `docs/superpowers/specs/2026-06-09-recuperar-pantallas-design.md`, seccion 3.2, despues
del item 3 de "Adaptaciones permitidas", agregar:

```markdown
4. **Landmark `<main>`**: la convencion de main es que cada pagina aporta su propio
   `<main>` (MainLayout renderiza un `div`). `MyProgress` ya lo trae; en `Ranking` el
   `<div className="ranking-page">` raiz pasa a `<main>`, y en `ObserverRoom` el
   `<div className="obs-body">` pasa a `<main>` (el CSS usa clases, no cambia nada).
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-06-09-recuperar-pantallas-design.md
git commit -m "Se registran los issues de fases futuras y la adaptacion de landmark en el spec"
```

---

### Task 2: Portar Ranking

**Files:**
- Create: `apps/web/src/pages/Ranking.tsx` (port desde `origin/feat/frontend-ui`)
- Create: `apps/web/src/pages/Ranking.css` (port)
- Test: `apps/web/src/pages/Ranking.test.tsx`

- [ ] **Step 1: Escribir el test que falla**

Crear `apps/web/src/pages/Ranking.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { test, expect } from 'vitest';
import { Ranking } from './Ranking';

// La pagina es mock (datos inline); el test cubre que el chunk monta,
// que aporta su landmark main y que el encabezado es accesible.
test('Ranking renderiza el encabezado y su landmark', () => {
  render(<Ranking />);
  expect(screen.getByRole('main')).toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 1, name: /ranking/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Verificar que falla**

Run: `pnpm --filter @warachikuy/web test src/pages/Ranking.test.tsx`
Expected: FAIL — `Cannot find module './Ranking'` (o equivalente: el archivo no existe).

- [ ] **Step 3: Portar los archivos desde la rama de Max**

```bash
git show origin/feat/frontend-ui:apps/web/src/pages/Ranking.tsx > apps/web/src/pages/Ranking.tsx
git show origin/feat/frontend-ui:apps/web/src/pages/Ranking.css > apps/web/src/pages/Ranking.css
```

- [ ] **Step 4: Aplicar las 2 adaptaciones**

(a) Insertar ANTES de la primera linea de `Ranking.tsx` el comentario de cabecera
(reemplazar `#N1` por el numero real del Task 1):

```tsx
// Pantalla MOCK a proposito: demuestra el modulo de gamificacion (ranking
// semanal, medallas, retos) con datos simulados inline, como permite el
// enunciado del curso. El backend real (puntajes, ligas) es de la fase F4,
// ver issue #N1. Pantalla original de Max (PR #48).
```

(b) Landmark: en el `return` del componente `Ranking`, cambiar el elemento raiz
`<div className="ranking-page">` por `<main className="ranking-page">` (y su cierre
`</div>` final por `</main>`). El CSS usa la clase, no el tag: nada mas cambia.

- [ ] **Step 5: Verificar que pasa**

Run: `pnpm --filter @warachikuy/web test src/pages/Ranking.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 6: Lint y typecheck del paquete**

Run: `pnpm --filter @warachikuy/web lint && pnpm --filter @warachikuy/web typecheck`
Expected: sin errores. Si eslint marca algo del codigo portado (p. ej. imports sin usar),
corregirlo de la forma minima.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/pages/Ranking.tsx apps/web/src/pages/Ranking.css apps/web/src/pages/Ranking.test.tsx
git commit -m "Se recupera la pantalla de ranking del PR 48 como mock de gamificacion"
```

---

### Task 3: Portar MyProgress

**Files:**
- Create: `apps/web/src/pages/MyProgress.tsx` (port)
- Create: `apps/web/src/pages/MyProgress.css` (port)
- Test: `apps/web/src/pages/MyProgress.test.tsx`

- [ ] **Step 1: Escribir el test que falla**

Crear `apps/web/src/pages/MyProgress.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { test, expect } from 'vitest';
import { MyProgress } from './MyProgress';

// La pagina es mock (datos inline); ya trae su <main className="mp-main">.
test('MyProgress renderiza sus secciones y su landmark', () => {
  render(<MyProgress />);
  expect(screen.getByRole('main')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /ruta de aprendizaje/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Verificar que falla**

Run: `pnpm --filter @warachikuy/web test src/pages/MyProgress.test.tsx`
Expected: FAIL — `Cannot find module './MyProgress'`.

- [ ] **Step 3: Portar los archivos**

```bash
git show origin/feat/frontend-ui:apps/web/src/pages/MyProgress.tsx > apps/web/src/pages/MyProgress.tsx
git show origin/feat/frontend-ui:apps/web/src/pages/MyProgress.css > apps/web/src/pages/MyProgress.css
```

- [ ] **Step 4: Aplicar la adaptacion (solo comentario; el landmark ya existe)**

Insertar ANTES de la primera linea de `MyProgress.tsx` (reemplazar `#N2`):

```tsx
// Pantalla MOCK a proposito: demuestra el modulo de personalizacion continua
// (XP, nivel, racha, evolucion por competencia) con datos simulados inline,
// como permite el enunciado del curso. El backend real (historial
// longitudinal multi-sesion) es de la fase F2, ver issue #N2. Pantalla
// original de Max (PR #48).
```

NO cambiar el markup: esta pagina ya trae `<main className="mp-main">`.

- [ ] **Step 5: Verificar que pasa**

Run: `pnpm --filter @warachikuy/web test src/pages/MyProgress.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 6: Lint y typecheck**

Run: `pnpm --filter @warachikuy/web lint && pnpm --filter @warachikuy/web typecheck`
Expected: sin errores (corregir de forma minima si el port trae algo).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/pages/MyProgress.tsx apps/web/src/pages/MyProgress.css apps/web/src/pages/MyProgress.test.tsx
git commit -m "Se recupera la pantalla de progreso del PR 48 como mock de personalizacion"
```

---

### Task 4: Portar ObserverRoom

**Files:**
- Create: `apps/web/src/pages/ObserverRoom.tsx` (port)
- Create: `apps/web/src/pages/ObserverRoom.css` (port)
- Test: `apps/web/src/pages/ObserverRoom.test.tsx`

- [ ] **Step 1: Escribir el test que falla**

Crear `apps/web/src/pages/ObserverRoom.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { test, expect } from 'vitest';
import { ObserverRoom } from './ObserverRoom';

// La pagina es mock con timer EN VIVO (setInterval con cleanup; el
// afterEach(cleanup) de test-setup desmonta y corta los timers). El timer
// arranca en 823s = "13:43"; la asercion corre antes del primer tick (1s).
test('ObserverRoom renderiza la sala en vivo y su landmark', () => {
  render(<ObserverRoom />);
  expect(screen.getByRole('main')).toBeInTheDocument();
  expect(screen.getByText('EN VIVO')).toBeInTheDocument();
  expect(screen.getByText('13:43')).toBeInTheDocument();
});
```

- [ ] **Step 2: Verificar que falla**

Run: `pnpm --filter @warachikuy/web test src/pages/ObserverRoom.test.tsx`
Expected: FAIL — `Cannot find module './ObserverRoom'`.

- [ ] **Step 3: Portar los archivos**

```bash
git show origin/feat/frontend-ui:apps/web/src/pages/ObserverRoom.tsx > apps/web/src/pages/ObserverRoom.tsx
git show origin/feat/frontend-ui:apps/web/src/pages/ObserverRoom.css > apps/web/src/pages/ObserverRoom.css
```

- [ ] **Step 4: Aplicar las 3 adaptaciones**

(a) Comentario de cabecera ANTES de la primera linea (reemplazar `#N3`):

```tsx
// Pantalla MOCK a proposito: demuestra el modulo de interactividad (sala del
// observador del peer-mock, con timer EN VIVO simulado) con datos inline,
// como permite el enunciado del curso. La sala real con WebRTC y roles es de
// la fase F3, ver issue #N3. Pantalla original de Max (PR #48).
```

(b) Rename del aura local: el archivo define una funcion file-local `AvatarAura`
(distinta del componente real `components/AvatarAura.tsx`). Renombrar la declaracion
`function AvatarAura(...)` a `function ObserverAura(...)` y TODOS sus usos JSX
(`<AvatarAura speaking={...} />` -> `<ObserverAura speaking={...} />`). Las clases CSS
`.aura-*` NO se tocan (no colisionan con nada de main).

(c) Landmark: cambiar `<div className="obs-body">` por `<main className="obs-body">`
(y su `</div>` de cierre correspondiente por `</main>`).

- [ ] **Step 5: Verificar que pasa**

Run: `pnpm --filter @warachikuy/web test src/pages/ObserverRoom.test.tsx`
Expected: PASS (1 test), sin warnings de act() y el proceso termina limpio
(ambos setInterval tienen cleanup en su useEffect; si aun asi apareciera un warning
de act(), envolver el test con `vi.useFakeTimers()` / `vi.useRealTimers()`).

- [ ] **Step 6: Lint y typecheck**

Run: `pnpm --filter @warachikuy/web lint && pnpm --filter @warachikuy/web typecheck`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/pages/ObserverRoom.tsx apps/web/src/pages/ObserverRoom.css apps/web/src/pages/ObserverRoom.test.tsx
git commit -m "Se recupera la sala del observador del PR 48 como mock de interactividad"
```

---

### Task 5: Rutas en el shell (App.tsx + MainLayout)

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/layouts/MainLayout.tsx:6`

- [ ] **Step 1: Agregar los lazy imports en App.tsx**

Debajo del bloque de lazy existente (despues de la linea de `NotFound`), agregar:

```tsx
const Ranking = lazy(() => import('./pages/Ranking').then((m) => ({ default: m.Ranking })));
const MyProgress = lazy(() =>
  import('./pages/MyProgress').then((m) => ({ default: m.MyProgress })),
);
const ObserverRoom = lazy(() =>
  import('./pages/ObserverRoom').then((m) => ({ default: m.ObserverRoom })),
);
```

- [ ] **Step 2: Agregar las 3 rutas**

Dentro de `<Routes>`, entre la ruta `/plan/:sessionId` y la `*`, agregar:

```tsx
<Route path="/ranking" element={<Ranking />} />
<Route path="/progress" element={<MyProgress />} />
<Route path="/observer" element={<ObserverRoom />} />
```

- [ ] **Step 3: Hacer /observer full-screen en MainLayout**

En `apps/web/src/layouts/MainLayout.tsx` cambiar:

```tsx
// Rutas donde el sidebar NO aparece (pantalla completa)
const FULLSCREEN_ROUTES = ['/interview'];
```

por:

```tsx
// Rutas donde el sidebar NO aparece (pantalla completa). La deteccion por
// startsWith deja lista la subruta dinamica de F3 (/observer/:id).
const FULLSCREEN_ROUTES = ['/interview', '/observer'];
```

- [ ] **Step 4: Correr la suite web completa**

Run: `pnpm --filter @warachikuy/web test`
Expected: PASS — los tests existentes (App.test incluido) no se ven afectados: los tests
de pagina importan el componente directo y App.test consulta heading nivel 1 y el boton
"comenzar", que no chocan con las rutas nuevas.

- [ ] **Step 5: Verificar el build (los chunks lazy compilan)**

Run: `pnpm --filter @warachikuy/web build`
Expected: build OK, con chunks nuevos para Ranking/MyProgress/ObserverRoom en la salida.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/App.tsx apps/web/src/layouts/MainLayout.tsx
git commit -m "Se enrutan las pantallas recuperadas y se hace full-screen la sala del observador"
```

---

### Task 6: Sidebar con navegacion real

**Files:**
- Modify: `apps/web/src/components/Sidebar.tsx`
- Modify: `apps/web/src/components/Sidebar.css`
- Test: `apps/web/src/components/Sidebar.test.tsx`

- [ ] **Step 1: Reescribir el test (falla primero)**

Reemplazar el contenido COMPLETO de `apps/web/src/components/Sidebar.test.tsx` por:

```tsx
import { render, screen } from '@testing-library/react';
import { test, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from './Sidebar';

test('Sidebar enlaza a todas las rutas reales sin items diferidos', () => {
  render(
    <MemoryRouter>
      <Sidebar />
    </MemoryRouter>,
  );
  expect(screen.getByRole('link', { name: /inicio/i })).toHaveAttribute('href', '/');
  expect(screen.getByRole('link', { name: /nueva sesion/i })).toHaveAttribute('href', '/setup');
  expect(screen.getByRole('link', { name: /mi progreso/i })).toHaveAttribute('href', '/progress');
  expect(screen.getByRole('link', { name: /ranking/i })).toHaveAttribute('href', '/ranking');
  expect(screen.getByRole('link', { name: /sala de observador/i })).toHaveAttribute(
    'href',
    '/observer',
  );
  // El patron "proximamente" desaparecio por completo
  expect(screen.queryByText(/proximamente/i)).toBeNull();
});
```

- [ ] **Step 2: Verificar que falla**

Run: `pnpm --filter @warachikuy/web test src/components/Sidebar.test.tsx`
Expected: FAIL — no existe el link "Mi progreso" (sigue siendo span deshabilitado).

- [ ] **Step 3: Actualizar Sidebar.tsx**

Tres cambios:

(a) En el import de lucide-react, agregar `Eye`:

```tsx
import { House, Plus, TrendingUp, Trophy, Eye, ChevronsLeft, ChevronsRight } from 'lucide-react';
```

(b) Reemplazar las constantes `REAL_NAV_ITEMS` y `DEFERRED_ITEMS` (y sus comentarios) por:

```tsx
// Rutas reales activas en esta version
const REAL_NAV_ITEMS = [
  { to: '/', icon: House, label: 'Inicio' },
  { to: '/setup', icon: Plus, label: 'Nueva sesion' },
  { to: '/progress', icon: TrendingUp, label: 'Mi progreso' },
  { to: '/ranking', icon: Trophy, label: 'Ranking' },
  { to: '/observer', icon: Eye, label: 'Sala de observador' },
];
```

(c) Eliminar por completo el bloque JSX de los items diferidos (el comentario
`{/* Items diferidos F2 ... */}` y el `{DEFERRED_ITEMS.map(...)}` entero).

- [ ] **Step 4: Limpiar Sidebar.css**

Eliminar los 3 bloques que quedan huerfanos (verificado: "proximamente" solo se usa aca):

```css
/* Item deshabilitado — F2 / proximamente */
.sidebar__item--disabled {
  cursor: not-allowed;
  opacity: 0.5;
  user-select: none;
}

.sidebar__item--disabled:hover {
  background: transparent;
  color: var(--text-muted);
}
```

y

```css
/* Badge proximamente */
.sidebar__item-soon {
  font-size: 10px;
  font-weight: 600;
  color: #556377;
  background: #F1F5F9;
  border-radius: 4px;
  padding: 1px 5px;
  white-space: nowrap;
  flex-shrink: 0;
}
```

- [ ] **Step 5: Verificar que pasa + suite completa**

Run: `pnpm --filter @warachikuy/web test`
Expected: PASS completo (el test del Sidebar nuevo y los demas).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/Sidebar.tsx apps/web/src/components/Sidebar.css apps/web/src/components/Sidebar.test.tsx
git commit -m "Se activa la navegacion real del sidebar y se retira el estado proximamente"
```

---

### Task 7: Regla global prefers-reduced-motion

**Files:**
- Modify: `apps/web/src/assets/global.css` (agregar al FINAL del archivo)

- [ ] **Step 1: Agregar la regla al final de global.css**

```css
/* ── Accesibilidad: usuarios que piden menos movimiento ────
   Anula animaciones y transiciones de TODA la app (incluidas
   las pantallas mock) cuando el sistema operativo lo solicita.
   Verificado: ningun componente depende de onAnimationEnd ni
   onTransitionEnd para limpiar estado en React. */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 2: Suite y build**

Run: `pnpm --filter @warachikuy/web test && pnpm --filter @warachikuy/web build`
Expected: PASS y build OK (happy-dom no evalua media queries: los tests no cambian).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/assets/global.css
git commit -m "Se respeta prefers-reduced-motion en toda la aplicacion"
```

---

### Task 8: Pasada de contraste WCAG AA en las 3 pantallas

Criterio AA: texto normal >= 4.5:1; texto grande (>= 24px, o >= 18.66px bold) >= 3:1.
Elementos decorativos (barras, fondos, iconos sin significado) NO necesitan cambio.
Para cada sospechoso de abajo: mirar el contexto real (que elemento es, sobre que fondo
renderiza, que tamano tiene) y SOLO corregir los que de verdad fallen. Verificar ratios
con https://webaim.org/resources/contrastchecker/ o calculo equivalente.

**Files:**
- Modify: `apps/web/src/pages/Ranking.css`
- Modify: `apps/web/src/pages/MyProgress.css`
- Modify: `apps/web/src/pages/ObserverRoom.css`

- [ ] **Step 1: Revisar y corregir los sospechosos en paginas CLARAS**

Ranking.css (fondo claro):
- `#16A34A` (~linea 301, delta positivo): 3.3:1 sobre blanco -> si es texto, cambiar a
  `#15803D` (token success de la app, 4.5:1+).
- `#DC2626` (~306, delta negativo): 4.5:1 sobre blanco -> pasa AA, dejar.

MyProgress.css (fondo claro; OJO: el header usa un gradiente azul oscuro, ahi el texto
claro SI pasa — revisar contexto):
- `#94A3B8` (~391, 395, 491): 2.4:1 sobre blanco -> si es texto informativo, cambiar a
  `#5E6E82` (token --text-muted de la app).
- `#CBD5E1` (~399): 1.6:1 sobre blanco -> si es texto, `#5E6E82`; si es decorativo
  (separador, track de barra), dejar.
- `#3B82F6` (~358): 3.7:1 sobre blanco -> si es texto normal, `#2563EB`.
- `#60A5FA` (~339): si renderiza sobre el gradiente azul oscuro del header, pasa; si es
  sobre claro, `#1D4ED8`.
- `#F59E0B` (~512): 2.2:1 sobre blanco -> si es texto, `#B45309` (token warning).

- [ ] **Step 2: Revisar y corregir los sospechosos en la pagina OSCURA**

ObserverRoom.css (fondo `#080C14`):
- `#64748B` (~112, 235, 293): 3.6:1 -> si es texto normal, aclarar a `#94A3B8`.
- `#475569` (~321): 2.4:1 -> si es texto, `#94A3B8`.
- `#334155` (~283, 356): 1.7:1 -> si es texto, `#94A3B8`; si es decorativo, dejar.
- `#DC2626` (~135, probable indicador REC/EN VIVO): 3.1:1 -> si es texto pequeno,
  `#F87171`; si es solo el punto decorativo, dejar.
- `#94A3B8` y `#F1F5F9` sobre oscuro: pasan, dejar.

- [ ] **Step 3: Suite + lint**

Run: `pnpm --filter @warachikuy/web test && pnpm --filter @warachikuy/web lint`
Expected: PASS (los cambios son solo de color en CSS).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/Ranking.css apps/web/src/pages/MyProgress.css apps/web/src/pages/ObserverRoom.css
git commit -m "Se ajustan los contrastes de las pantallas recuperadas al criterio AA"
```

---

### Task 9: Verificacion final del workspace

- [ ] **Step 1: Suite completa del monorepo**

Run: `pnpm -r test`
Expected: PASS total (api + web + voice-pipeline + shared-types; la api no se toco).

- [ ] **Step 2: Lint + typecheck + build de todo**

Run: `pnpm -r lint && pnpm -r typecheck && pnpm -r build`
Expected: sin errores.

- [ ] **Step 3: Smoke manual minimo (opcional si hay navegador)**

Run: `pnpm --filter @warachikuy/web dev`
Visitar `/ranking`, `/progress` (con sidebar) y `/observer` (full-screen, timer corriendo).
Verificar que el sidebar marca activo el item correcto y que no hay errores en consola.

- [ ] **Step 4: Commit final si hubo correcciones**

Solo si los pasos 1-3 obligaron a tocar algo; mensaje en espanol natural describiendo
la correccion puntual.
