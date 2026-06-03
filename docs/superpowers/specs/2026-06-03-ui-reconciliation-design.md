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
- Las paginas de features futuras (`Ranking`, `MyProgress`, `ObserverRoom`) entran como
  scaffolding mock, claramente marcadas como no funcionales (F2), accesibles desde el sidebar.
- Se descartan: los duplicados mock (`ChatRoom`/`ProfileSetup`/`ImprovementPlan` de Max), el
  `App.tsx` de Max, su `useMetrics` simulado y la `useSimulatedMetrics` interna del AvatarAura.
- Sin cambios de contrato. Solo `apps/web` (+ posibles tipos de dominio para F2).

## Unidades

### 1. Design system (adopcion casi directa)

- `apps/web/src/assets/global.css`: portar los tokens de Max (paleta `--bg/--bg2/--bg3`,
  `--accent` #2563EB / `--accent2` #0EA5E9, `--text/--text-muted`, semanticos, fuentes Syne +
  DM Sans + JetBrains Mono, escala de espaciado 4px, radios, sombras, transiciones, z-index).
  Conservar lo que el flujo real ya use; el merge de CSS es aditivo.
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

### 3. Re-estilo de las 3 paginas cableadas (diseno de Max + logica real)

Cada una conserva su wiring real de #46; solo cambia el JSX/CSS al look de Max.

- `SetupPage.tsx` (base visual: `ProfileSetup`): stepper + tarjeta. Campos REALES: industria
  (de `getIndustries`) y nivel (junior/mid/senior). Los extras de Max (intereses, CV,
  accesibilidad) NO entran en F1: se omiten (YAGNI). Mantiene `createSession` -> `setSession` -> navega a `/interview/:id`.
- `InterviewPage.tsx` (base visual: `ChatRoom`): layout full-screen, `AvatarAura` a la izquierda,
  panel derecho con la transcripcion (de `socket.items` via `MessageBubble`) y el input. Header
  con timer (`useSessionTimer`) + boton "Finalizar". El `ChatForm` tecleado es el input (donde
  Max tenia el waveform mock queda un placeholder para el mic del paso multimodal). Conserva
  TODO el wiring real: `useInterviewSocket`, estados `closing`/terminal/desconexion, `sendAnswer`,
  navegacion al plan. El `AvatarAura` recibe el `AuraState` (en F1 sin voz: "sin datos").
- `PlanPage.tsx` (base visual: `ImprovementPlan`): competencias como tarjetas con `ProgressRing`
  manejadas por el plan real (3 metricas medidas "sin datos" + `content` con score), mas
  `strengths`/`improvements`/`exercises` reales. Las secciones de Max sin dato real (quick
  metrics tipo palabras/min, timeline) se omiten o se muestran solo si hay dato. Conserva el
  polling real (`getPlan`, estados generating/ready/failed/not_found).

### 4. Paginas de features futuras (scaffolding mock)

Portar `Ranking`, `MyProgress`, `ObserverRoom` (con su CSS) tal cual (mock). Son features F2
(gamificacion, peer-mock) que aun no tienen backend. Requisito: un aviso visible "Datos de
ejemplo (proximamente)" para no confundir en la demo. Se rutean detras del sidebar.

### 5. Routing, layout y navegacion

- `App.tsx`: mantener `SessionProvider` envolviendo el `BrowserRouter` (del flujo real). Rutas:
  - Reales cableadas: `/` (Home), `/setup` (SetupPage), `/interview/:sessionId` (InterviewPage,
    full-screen), `/plan/:sessionId` (PlanPage).
  - Scaffolding F2: `/progress` (MyProgress), `/ranking` (Ranking), `/observer` (ObserverRoom,
    full-screen). Lazy + Suspense con `LoadingScreen`, y `ScrollToTop`.
  - `*` -> NotFound.
  - Se descartan las rutas de Max `/onboarding`, `/room`, `/improvement` (apuntaban a los mock).
- `MainLayout` + `Sidebar`: el sidebar envuelve las paginas no full-screen. Reapuntar los items
  del sidebar a las rutas reales: "Inicio"->`/`, "Nueva sesion"->`/setup`, "Mi progreso"->
  `/progress`, "Ranking"->`/ranking`. Excluir del layout las full-screen (`/interview/:id`,
  `/observer`).

### 6. Hooks, utils y tipos

- Adoptar `useSessionTimer` (lo usa el InterviewPage para el timer).
- NO adoptar `useMetrics` (es simulado); el aura se maneja con el `AuraState` real.
- `utils/constants.ts`: portar lo util de Max (COMPETENCIES, EXPERIENCE_LEVELS, etc.) sin pisar
  lo que el flujo real ya usa. Reconciliar `WS_URL`: el real viene del `websocketUrl` que da el
  backend por sesion; el `WS_URL` global de Max queda solo como fallback de dev si hace falta.
- `utils/formatTime.ts`: adoptar `formatMMSS` y `formatDuration` (aditivos), conservar el
  `formatTime` existente.
- `types/index.ts`: adoptar los tipos de dominio de Max para F2 (RankingEntry, SessionResult,
  GroupChallenge, etc.). No deben colisionar con `@warachikuy/shared-types` (son tipos de UI/F2,
  no contratos de red).

## Flujo de datos (sin cambios respecto a #46)

- Setup: `getIndustries` -> form -> `createSession` -> `SessionContext` -> `/interview/:id`.
- Interview: `useInterviewSocket` (WS real) -> `items`/estados -> UI estilo ChatRoom; `sendAnswer`
  (tecleado en F1). El `AvatarAura` consume el `AuraState` (en F1, "sin datos").
- Plan: polling `getPlan` -> render estilo ImprovementPlan con el plan real.
- Las paginas F2 (Ranking/MyProgress/ObserverRoom) son mock aisladas; no tocan el backend.

## Manejo de errores / estados

- Se conservan TODOS los estados reales de #46: closing (intent), terminal/no recuperable,
  desconexion inesperada (form deshabilitado + "volver al inicio"), fallos de createSession/
  getPlan, "sin datos" en metricas null. El re-estilo no puede perder ninguno.

## Testing

- Mantener verdes los tests existentes de #46 (apiClient, SessionContext, useInterviewSocket,
  CompetencyRing, las 3 paginas, App). Si el re-estilo cambia el DOM que un test consulta, se
  actualiza el test sin debilitar la asercion de comportamiento.
- `AvatarAura`: unit del mapeo metrica->visual (incluye `null` -> "sin datos"); smoke de render
  con canvas mock.
- Componentes nuevos (Button variants, ProgressRing, Badge, Card, Sidebar, SparklineChart):
  unit/smoke basicos.
- `useSessionTimer`: unit (tick, format, cleanup).
- Las paginas F2 mock: smoke de render (no crashea, muestra el aviso "datos de ejemplo").
- CI verde (lint, typecheck, test, build, Lighthouse >=95 accesibilidad — cuidar contraste de
  la paleta nueva y labels ARIA).

## Fuera de scope

- Cablear voz/camara y el aura reactiva en vivo: es el paso multimodal siguiente (otra rebanada),
  que ya construira sobre este AvatarAura adaptado.
- Backend real para las paginas F2 (ranking, progreso, observer).
- Accesibilidad/CV/intereses del ProfileSetup de Max (F2).

## Riesgos

- Volumen de CSS/JSX a portar; se acota re-estilando una pagina a la vez y corriendo los tests
  de esa pagina antes de pasar a la siguiente.
- Contraste de la paleta clara nueva vs Lighthouse accesibilidad >=95: verificar.
- Atribucion: el trabajo es de Max. Donde se pueda, cherry-pick de sus commits (design system,
  componentes, paginas F2) para preservar autoria; el re-estilo de las 3 paginas reales son
  commits nuevos. La PR acredita el #48 explicitamente.
