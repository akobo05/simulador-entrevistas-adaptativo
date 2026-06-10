# Recuperar las pantallas de gamificacion/progreso/observador (Slice A)

- **Fecha:** 2026-06-09
- **Rama:** `feat/recuperar-pantallas`
- **Origen:** PR #48 (`origin/feat/frontend-ui`, rama de Max, preservada al cerrar el PR)
- **Relacion:** Slice A de dos. El Slice B (cableado multimodal: STT/camara/aura/TTS)
  tiene su propio spec (`2026-06-03-multimodal-integration-design.md`) y se ejecuta despues.

## 1. Problema

Al cerrar el PR #48 y reconciliar la UI via el PR #49, se adoptaron 5 de las 8 pantallas
que Max habia construido. Las 3 restantes — `Ranking`, `MyProgress` y `ObserverRoom` —
quedaron fuera de `main` (solo como stubs "proximamente" en el sidebar), a pesar de que:

- Son ~1500 lineas de UI funcional con datos simulados.
- Demuestran exactamente los 3 modulos opcionales que exige el curso (gamificacion,
  personalizacion/progreso, interactividad entre usuarios).
- El enunciado de la PC permite explicitamente "informacion simulada o real".

## 2. Decision de alcance (aprobada)

- Las 3 pantallas entran a `main` como **rutas reales con datos simulados** (mock inline,
  estilo actual de Max). **No se construye backend nuevo** en este slice.
- Todo lo que requiera backend nuevo queda registrado como **issues de fases futuras** (F4 gamificacion, F2 personalizacion, F3 peer-mock) en GitHub.
- Orden global: este slice (A) primero; el cableado multimodal (B) despues.

## 3. Diseño

### 3.1 Pantallas y rutas

| Pantalla | Ruta | Layout | Modulo que demuestra |
|----------|------|--------|----------------------|
| `Ranking` | `/ranking` | Dentro de `MainLayout` (sidebar visible) | Gamificacion: ligas, medallas, delta semanal |
| `MyProgress` | `/progress` | Dentro de `MainLayout` | Personalizacion continua: XP, nivel, racha, sparklines |
| `ObserverRoom` | `/observer` | **Full-screen** (sin layout) | Interactividad: sala de observador peer-mock "EN VIVO" |

Las rutas y la colocacion replican el `App.tsx` de la propia rama de Max (`/progress` y
`/ranking` con layout; `/observer` full-screen). Las 3 se cargan **lazy** como el resto de
paginas secundarias, y **no** se agregan al barrel `pages/index.ts` (convencion de main:
el barrel solo exporta las paginas eager `Home` y `NotFound`).

### 3.2 Origen del codigo y adaptaciones

Se portan los 6 archivos desde `origin/feat/frontend-ui`:

- `apps/web/src/pages/Ranking.tsx` + `Ranking.css`
- `apps/web/src/pages/MyProgress.tsx` + `MyProgress.css`
- `apps/web/src/pages/ObserverRoom.tsx` + `ObserverRoom.css`

Adaptaciones permitidas (minimas, verificadas necesarias):

1. **Renombrar la funcion local `AvatarAura` de `ObserverRoom.tsx` a `ObserverAura`**,
   para no compartir nombre con el componente real `components/AvatarAura.tsx` (es
   file-local, no hay conflicto de import, pero el nombre duplicado confunde).
2. **Contraste**: revisar los colores fijos de las 3 paginas contra WCAG AA y oscurecer
   los que fallen (mismo criterio aplicado en el PR #49). Solo tocar lo que falle.
3. **Comentario de cabecera** en cada `.tsx`: datos simulados a proposito; el backend
   real es de una fase futura (referenciar el issue correspondiente).
4. **Landmark `<main>`**: la convencion de main es que cada pagina aporta su propio
   `<main>` (MainLayout renderiza un `div`). `MyProgress` ya lo trae; en `Ranking` el
   `<div className="ranking-page">` raiz pasa a `<main>`, y en `ObserverRoom` el
   `<div className="obs-body">` pasa a `<main>` (el CSS usa clases, no cambia nada).

Verificado que NO hace falta adaptar:

- Props de `Card`, `Badge` (`primary`/`accent`/`success` existen), `ProgressRing` y
  `SparklineChart`: compatibles con las versiones de main.
- Tokens CSS: todos los `var(--*)` usados existen en `global.css` de main
  (`--fill-color` y `--metric-bg` se setean inline en el TSX).
- Colisiones CSS: prefijos `.ranking*`, `.mp-*`, `.obs-*` y `.aura-*` (local de
  ObserverRoom) no chocan con nada de main.
- Navegacion: ninguna de las 3 paginas navega a otras rutas.
- Tema: Ranking/MyProgress claras (como main); ObserverRoom oscura `#080C14`, identico
  fondo que `InterviewPage` (convencion existente: las salas en vivo son oscuras).
- Iconos `lucide-react` usados (Trophy, TrendingUp, TrendingDown, Minus, Users, Target,
  Zap): disponibles en la version de main.

### 3.3 Integracion en el shell

- **`App.tsx`**: 3 rutas lazy nuevas. `/observer` va junto a `/interview/:sessionId` en el
  grupo full-screen.
- **`MainLayout.tsx`**: `FULLSCREEN_ROUTES = ['/interview', '/observer']`. La deteccion
  por `startsWith` es intencional: deja lista la subruta dinamica de F3 (`/observer/:id`)
  sin tocar el mecanismo.
- **`Sidebar.tsx`**: "Mi progreso" (`/progress`, icono TrendingUp) y "Ranking"
  (`/ranking`, icono Trophy) pasan de `DEFERRED_ITEMS` a `REAL_NAV_ITEMS`; se agrega
  "Sala de observador" (`/observer`, icono `Eye`). `DEFERRED_ITEMS` queda vacio y se
  elimina junto con su bloque de render y el CSS `.sidebar__item-soon` (verificado: el
  patron "proximamente" solo se usa en Sidebar; eliminarlo es seguro y completo).

### 3.4 Mejora transversal de accesibilidad

`global.css` no tiene regla `prefers-reduced-motion` y las 3 paginas traen muchas
animaciones. Se agrega la regla global estandar:

```css
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

Beneficia a toda la app (RNF08, perfil SK7) y es el momento natural de incluirla.

### 3.5 Issues de fases futuras (se crean al INICIO del slice, para poder enlazarlos)

1. **[F4] Backend de gamificacion** (issue #50): ranking/ligas/badges reales detras de `/ranking`.
2. **[F2] Backend de progreso longitudinal** (issue #51): historial por competencia real
   detras de `/progress` (persistencia multi-sesion).
3. **[F3] Sala peer-mock real** (issue #52): WebRTC + roles + comentarios anclados detras
   de `/observer`.

Cada pantalla mock enlaza su issue en el comentario de cabecera.

## 4. Pruebas

- **1 test de render por pagina** (convencion de main: paginas con logica llevan test;
  para mocks basta el render): la pagina monta y muestra su heading principal. Los tests
  importan el componente DIRECTO (como `PlanPage.test.tsx`), sin pasar por el lazy de
  `App.tsx`, asi que no necesitan `Suspense` ni queries asincronas.
- `ObserverRoom` corre dos `setInterval` (timer 1s, toggle speaking 4s); ambos tienen
  cleanup en su `useEffect` y el `afterEach(cleanup())` de `test-setup.ts` desmonta entre
  tests, asi que el render test no filtra timers. El timer dinamico se CONSERVA (decision:
  es parte del efecto "EN VIVO" de la demo). Si apareciera un warning de `act()`, usar
  `vi.useFakeTimers()` en ese test.
- **Actualizar `Sidebar.test.tsx`** (hoy asierta que "Ranking" tiene ancestro
  `aria-disabled="true"`, lo que dejara de ser cierto): asertar que "Mi progreso",
  "Ranking" y "Sala de observador" son links con `href` a `/progress`, `/ranking` y
  `/observer`, y eliminar la asercion de item deshabilitado.
- Suite completa, lint, typecheck y build verdes.
- Lighthouse CI no audita rutas nuevas (audita el `staticDistDir` del SPA), pero la
  revision de contraste del punto 3.2.2 se hace igual.

## 5. Fuera de alcance (explicito)

- Ningun endpoint ni persistencia nueva (eso son los issues #50/#51/#52).
- Nada de WebRTC real.
- El cableado multimodal (STT/camara/aura/TTS) es el Slice B.
- No se tocan `InterviewPage`, `PlanPage`, `SetupPage` ni el backend.

## 6. Entrega

Rama `feat/recuperar-pantallas` → PR contra `main` → revision del equipo → merge.
El PR acredita el trabajo original de Max (las pantallas vienen de su rama #48).
