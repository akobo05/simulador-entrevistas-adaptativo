# Reconciliacion de la UI de Max (#48) con el flujo real — Diseno

> El PR #48 (rama `feat/frontend-ui`, Max) trae un design system y una UI completa, pero
> esta construido sobre una base vieja (antes de #46/#47): es 100% mock, re-agrega el
> ChatRoom borrado, y su App.tsx reescribe el routing sin SessionProvider, lo que dejaria
> huerfano el flujo real cableado al backend. Esta rebanada NO mergea #48: adopta su diseno
> y componentes SOBRE las paginas reales ya cableadas, descartando los duplicados mock.

## Contexto y objetivo

Estado de `main`: el flujo real funciona end-to-end (verificado en Docker) — `SetupPage`,
`InterviewPage`, `PlanPage`, `apiClient`, `SessionContext`, `useInterviewSocket`,
`CompetencyRing`. La UI de Max vive en paralelo con paginas mock equivalentes
(`ProfileSetup`, `ChatRoom`, `ImprovementPlan`) mas paginas de features futuras
(`Ranking`, `MyProgress`, `ObserverRoom`) y un design system limpio.

Objetivo: una sola UI coherente que use el **diseno de Max** sobre la **logica real**, sin
regresar a mock ni romper el flujo. Mecanica: rama nueva desde `main` (no rebasear la rama
vieja de Max, que tiene +8000 lineas en conflicto); se portan las partes buenas encima. Se
acredita el #48 en la PR.

## Decisiones cerradas

- Se adopta el design system de Max completo (tokens + componentes reutilizables).
- El aura: se adapta el `AvatarAura` de Max al contrato real `AuraState`
  (fluency/eye_contact/speech_rate). Esto reemplaza la `AuraScene` del spec multimodal.
- Las 3 paginas cableadas se re-estilizan con el look de Max pero conservan su logica real.
- Las paginas de features futuras (`Ranking`, `MyProgress`, `ObserverRoom`) se DIFIEREN a F2 (no
  se portan ahora): reducen superficie de regresion y peso de bundle sin valor real para la demo
  F1. Sus entradas en el sidebar quedan como stubs "proximamente". El trabajo de Max se preserva
  en su rama / el issue de F2.
- Se descartan: los duplicados mock (`ChatRoom`/`ProfileSetup`/`ImprovementPlan` de Max), el
  `App.tsx` de Max, su `useMetrics` simulado y la `useSimulatedMetrics` interna del AvatarAura.
- Sin cambios de contrato. Solo `apps/web` (+ posibles tipos de dominio para F2).

## Unidades

### 1. Design system (adopcion casi directa)

- `apps/web/src/assets/global.css`: portar los tokens de Max (paleta `--bg/--bg2/--bg3`,
  `--accent` #2563EB / `--accent2` #0EA5E9, `--text/--text-muted`, semanticos, fuentes Syne +
  DM Sans + JetBrains Mono, escala de espaciado 4px, radios, sombras, transiciones, z-index).
  Conservar lo que el flujo real ya use; el merge de CSS es aditivo.
- Auditoria de contraste ANTES de consolidar `global.css`: verificar cada token usado para texto
  e iconos contra WCAG 2.2 AA (4.5:1 texto, 3:1 componentes). En particular el cian `--accent2`
  (#0EA5E9) sobre fondos claros (`--bg` #F4F6FB) tiende a reprobar como color de texto; usarlo
  solo para acentos/bordes/fondos, no para texto chico, y ajustar luminosidad si hace falta. Es
  un gate de CI (Lighthouse accesibilidad >=95, RNF08).
- Componentes reutilizables (portar tal cual, con su CSS): `Button` (variant/size/loading/icon/
  fullWidth), `Card` (hoverable), `Badge` (color), `ProgressRing` (value/size/color/label),
  `SparklineChart` (data/color), `Sidebar`. Barrel `components/index.ts`.
- `OrbeAnimado`: adoptar la version azul/cian de Max (Home).
- Nota: `Button` ya existe en main (#46 lo usa con `disabled`); reconciliar la version de Max
  (variants) preservando el prop `disabled` que usa `ChatForm`.

### 2. AvatarAura adaptado al contrato real

`apps/web/src/components/AvatarAura.tsx` (portado y adaptado). Cambios obligatorios:

- Quitar `useSimulatedMetrics` (la fluctuacion mock). El componente pasa a recibir el estado
  por props desde el `AuraState` real.
- Nueva API de props alineada al contrato:
  ```ts
  interface AvatarAuraProps {
    fluency: number | null;       // 0-100 o null = sin datos
    speechRate: number | null;    // 0-100 (era "rhythm")
    eyeContact: number | null;    // 0-100 (reemplaza "pause")
    speaking: boolean;
  }
  ```
- Mapeo visual (reusa la maquinaria 3D existente de Max):
  - Color/distort del nucleo: por `fluency` (null -> neutro).
  - Emissive/velocidad: por `speechRate` (null -> neutro).
  - Anillos: fluency, speechRate, eyeContact. Se elimina el 4to anillo de "pause" y el de
    "level" (no son metricas F1). Un `null` se renderiza en estado neutro/atenuado ("sin datos").
  - `speaking`: mantiene la animacion de escala/intensidad.
- Chips de las esquinas: "Fluidez", "Ritmo", "Contacto visual". Cuando una metrica es `null`,
  el chip muestra "sin datos" en vez de un numero (honesto, conforme a la decision F1).
- En F1 el InterviewPage le pasa el `AuraState` (las metricas que haya); en esta rebanada,
  hasta cablear voz/camara (paso multimodal siguiente), recibe el ultimo `AuraState` del hook
  o todo `null` -> "sin datos".

#### 2b. Selector AuraState -> props (capa de traduccion)

El contrato manda `AuraState.metrics: AuraMetric[]` donde las metricas SIN senal se OMITEN del
array (no llegan con value null). El `AvatarAura` espera props fijas con `null`. Se interpone una
funcion pura, p.ej. `apps/web/src/lib/auraVisual.ts`:

```ts
function auraStateToAvatarProps(state: AuraState | null): {
  fluency: number | null; speechRate: number | null; eyeContact: number | null;
};
```

- Busca cada `name` en `state.metrics`; si no esta -> `null`. `state` null -> las tres en `null`.
- Mapea `name: 'speech_rate'` -> prop `speechRate`, `'eye_contact'` -> `eyeContact`, `'fluency'`
  -> `fluency`. El `InterviewPage` usa este selector para alimentar al `AvatarAura`.
- Es pura y testeable: cubre "metrica presente", "metrica omitida -> null" y "state null".

### 3. Re-estilo de las 3 paginas cableadas (diseno de Max + logica real)

Cada una conserva su wiring real de #46; solo cambia el JSX/CSS al look de Max.

- `SetupPage.tsx` (base visual: `ProfileSetup`): stepper + tarjeta. Campos REALES: industria
  (de `getIndustries`) y nivel (junior/mid/senior). Los extras de Max (intereses, CV,
  accesibilidad) NO entran en F1: se omiten (YAGNI). Mantiene `createSession` -> `setSession` -> navega a `/interview/:id`.
- `InterviewPage.tsx` (base visual: `ChatRoom`): layout full-screen, `AvatarAura` a la izquierda,
  panel derecho con la transcripcion (de `socket.items` via `MessageBubble`) y el input. Header
  con timer (`useSessionTimer`) + boton "Finalizar". El `ChatForm` tecleado es el input (donde
  Max tenia el waveform mock queda un placeholder para el mic del paso multimodal). El re-estilo
  CONSERVA la API actual de `ChatForm` (prop `disabled` + el submit que dispara `sendAnswer`);
  solo cambia su CSS/ubicacion, para no romper la emision de respuestas al WS. Conserva TODO el
  wiring real: `useInterviewSocket`, estados `closing`/terminal/desconexion, `sendAnswer`,
  navegacion al plan. El `AvatarAura` recibe sus props via el selector `auraStateToAvatarProps`
  (Sec. 2b); se carga con `React.lazy` + `Suspense` para que la init de Three.js no bloquee el
  hilo principal durante el handshake del WebSocket.
- `PlanPage.tsx` (base visual: `ImprovementPlan`): competencias como tarjetas con `ProgressRing`
  manejadas por el plan real (3 metricas medidas "sin datos" + `content` con score), mas
  `strengths`/`improvements`/`exercises` reales. Las secciones de Max sin dato real (quick
  metrics tipo palabras/min, timeline) se omiten o se muestran solo si hay dato. Conserva el
  polling real (`getPlan`, estados generating/ready/failed/not_found).

### 4. Paginas de features futuras (DIFERIDAS a F2)

`Ranking`, `MyProgress`, `ObserverRoom` NO se portan en esta rebanada. Son features F2
(gamificacion, peer-mock) sin backend; portarlas ahora suma ~3500 lineas de mock, peso de bundle
y superficie de regresion sin valor para la demo F1. Sus entradas en el `Sidebar` quedan como
stubs "proximamente" (link deshabilitado o que lleva a un placeholder simple). El trabajo de Max
para estas paginas se preserva en su rama `feat/frontend-ui` y se retoma en el issue de F2.

### 5. Routing, layout y navegacion

- `App.tsx`: mantener `SessionProvider` envolviendo el `BrowserRouter` (del flujo real). Rutas:
  - Reales cableadas: `/` (Home), `/setup` (SetupPage), `/interview/:sessionId` (InterviewPage,
    full-screen), `/plan/:sessionId` (PlanPage). Lazy + Suspense con `LoadingScreen`, y `ScrollToTop`.
  - `*` -> NotFound.
  - Se descartan las rutas de Max `/onboarding`, `/room`, `/improvement`, `/progress`, `/ranking`,
    `/observer` (apuntaban a los mock / paginas F2 diferidas).
- `MainLayout` + `Sidebar`: el sidebar envuelve las paginas no full-screen. Items: "Inicio"->`/`,
  "Nueva sesion"->`/setup` activos; "Mi progreso" y "Ranking" como stubs "proximamente"
  (deshabilitados, F2). Excluir del layout las full-screen (`/interview/:id`).

### 6. Hooks, utils y tipos

- Adoptar `useSessionTimer` (lo usa el InterviewPage para el timer).
- NO adoptar `useMetrics` (es simulado); el aura se maneja con el `AuraState` real.
- `utils/constants.ts`: portar SOLO lo que usan las pantallas F1 (p.ej. EXPERIENCE_LEVELS para el
  SetupPage, COMPETENCIES/labels para el PlanPage) sin pisar lo que el flujo real ya usa. Las
  constantes de features F2 (ranking, challenges) se difieren con esas paginas (no traer codigo
  muerto). NO se adopta el `WS_URL` global de Max: el real viene del `websocketUrl` que da el
  backend por sesion.
- `utils/formatTime.ts`: adoptar `formatMMSS` y `formatDuration` (aditivos), conservar el
  `formatTime` existente.
- `types/index.ts`: adoptar solo los tipos de dominio que usen las pantallas F1. Los tipos de F2
  (RankingEntry, GroupChallenge, etc.) se difieren con sus paginas. No deben colisionar con
  `@warachikuy/shared-types` (serian tipos de UI, no contratos de red).
- Limpieza: no dejar codigo muerto del trasplante (el `useMetrics` simulado, imports sin uso); el
  build debe tree-shakear limpio.

## Flujo de datos (sin cambios respecto a #46)

- Setup: `getIndustries` -> form -> `createSession` -> `SessionContext` -> `/interview/:id`.
- Interview: `useInterviewSocket` (WS real) -> `items`/estados -> UI estilo ChatRoom; `sendAnswer`
  (tecleado en F1). El `AvatarAura` consume el `AuraState` (en F1, "sin datos").
- Plan: polling `getPlan` -> render estilo ImprovementPlan con el plan real.
- Aura: `InterviewPage` toma el `AuraState` -> `auraStateToAvatarProps` (Sec. 2b) -> `AvatarAura`.

## Manejo de errores / estados

- Se conservan TODOS los estados reales de #46: closing (intent), terminal/no recuperable,
  desconexion inesperada (form deshabilitado + "volver al inicio"), fallos de createSession/
  getPlan, "sin datos" en metricas null. El re-estilo no puede perder ninguno.

## Testing

- Mantener verdes los tests existentes de #46 (apiClient, SessionContext, useInterviewSocket,
  CompetencyRing, las 3 paginas, App). Si el re-estilo cambia el DOM que un test consulta, se
  actualiza el test sin debilitar la asercion de comportamiento. Para resistir el re-estilo, los
  componentes nuevos exponen roles ARIA / `data-testid` estables, y los tests de las paginas se
  enganchan a esos (rol/test-id) en vez de a clases o texto fragil.
- `auraStateToAvatarProps` (Sec. 2b): unit puro — metrica presente, metrica omitida -> `null`,
  `state` null -> las tres `null`.
- `AvatarAura`: unit del mapeo props->visual (incluye `null` -> "sin datos" en chips/anillos);
  smoke de render con canvas mock.
- Componentes nuevos (Button variants, ProgressRing, Badge, Card, Sidebar, SparklineChart):
  unit/smoke basicos.
- `useSessionTimer`: unit (tick, format, cleanup).
- CI verde (lint, typecheck, test, build, Lighthouse >=95 accesibilidad — verificar el contraste
  de la paleta nueva, Sec. 1, y los labels ARIA).

## Fuera de scope

- Cablear voz/camara y el aura reactiva en vivo: es el paso multimodal siguiente (otra rebanada),
  que ya construira sobre este AvatarAura adaptado.
- Las paginas F2 (Ranking, MyProgress, ObserverRoom): diferidas con su mock y sus tipos/constantes;
  se retoman en el issue de F2 reusando el trabajo de Max.
- Backend real para las features F2 (ranking, progreso, observer).
- Accesibilidad/CV/intereses del ProfileSetup de Max (F2).

## Riesgos

- Volumen de CSS/JSX a portar; se acota re-estilando una pagina a la vez y corriendo los tests
  de esa pagina antes de pasar a la siguiente.
- Contraste de la paleta clara nueva vs Lighthouse accesibilidad >=95: verificar.
- Atribucion: el trabajo es de Max. Donde se pueda, cherry-pick de sus commits (design system,
  componentes) para preservar autoria; el re-estilo de las 3 paginas reales son commits nuevos.
  La PR acredita el #48 explicitamente.
