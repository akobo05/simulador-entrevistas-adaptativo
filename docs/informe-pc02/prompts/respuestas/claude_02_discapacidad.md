# Respuesta cruda de Claude Web — Prompt 02 (Funcionalidad para discapacidad)

Fecha de ejecución: 2026-04-29.
Modelo: Claude (familia 4.X, web).

---

(Se conserva el texto íntegro tal como lo devolvió el modelo. Se integra
en `secciones/02-stakeholders-discapacidad.tex` con ajustes mínimos de
formato LaTeX.)

## S4. Usuario con discapacidad visual (ceguera o baja visión)

### A. Necesidades específicas
- Acceso completo al contenido textual y gráfico de la sala virtual
  mediante lector de pantalla (NVDA, JAWS, VoiceOver), incluyendo el
  estado del aura del entrevistador y los indicadores de progreso.
- Sustitución del canal visual del aura por canal sonoro o textual
  equivalente.
- Control de tipografía, contraste y zoom sin romper los flujos.
- Eliminación de la métrica de contacto visual del cómputo del puntaje
  global, sustituida por orientación auditiva equivalente.
- Posibilidad de mantener la cámara apagada sin perder funcionalidades
  evaluables.

### B. Funcionalidades verificables
- Operación 100% por teclado en todos los flujos (WCAG 2.2 2.1.1
  Keyboard); E2E con Playwright.
- ARIA completo (WCAG 2.2 4.1.2 Name, Role, Value); axe-core en CI con
  cero violaciones serious/critical.
- Aura traducida a canal sonoro paralelo (earcons no verbales con
  mapeo frecuencia-fluidez y panorámica-ritmo) con toggle persistido;
  E2E que valida la emisión ante eventos sintéticos.
- Métrica de contacto visual sustituida por orientación de voz hacia
  el micrófono cuando se declara discapacidad visual o se desactiva la
  cámara; telemetría + test unitario del módulo de scoring.
- WCAG 2.2 1.4.3 Contrast (Minimum) 4.5:1 en texto y 3:1 en
  componentes; 1.4.4 Resize Text hasta 200%; Lighthouse ≥ 95 + pruebas
  visuales con zoom forzado.
- Reporte final también en HTML semántico y texto plano descargable;
  axe-core sobre el reporte y E2E que valida jerarquía h1-h2-h3 sin
  saltos.

## S5. Usuario con discapacidad auditiva (sordera o hipoacusia)

### A. Necesidades específicas
- Equivalente textual en tiempo real para toda emisión de voz del
  entrevistador.
- Posibilidad de responder en lengua de señas o por escrito.
- Sustitución de las métricas dependientes de prosodia.
- Indicadores visuales redundantes para alertas sonoras.
- Compatibilidad con auriculares con bobina inductiva (T-coil); control
  independiente del volumen.

### B. Funcionalidades verificables
- Subtítulos sincronizados con captions WebVTT; latencia mediana < 500
  ms (referencial); WCAG 2.2 1.2.4 Captions (Live); telemetría + E2E
  que valida sincronía.
- Modo respuesta escrita: turno cerrado por envío de texto; E2E que
  completa una entrevista íntegra en este modo.
- Métricas de fluidez verbal y muletillas sustituidas por coherencia y
  densidad léxica del texto; test unitario del módulo de scoring.
- Eventos de audio con contraparte visual persistente ≥ 3 s
  (referencial); WCAG 2.2 1.4.13; E2E que dispara eventos sintéticos.
- Subtítulos cumplen WCAG 2.2 1.4.12 Text Spacing y permiten ajuste
  sin recargar; axe-core + E2E persistencia.
- Sala de peer mock con canal de chat textual paralelo; E2E
  multiusuario con entrega bidireccional < 1 s (referencial).

## S6. Usuario con discapacidad motora

### A. Necesidades específicas
- Operación sin gestos finos de mouse: teclado, conmutadores, voz.
- Tolerancia a tiempos variables; ningún flujo crítico expira sin
  posibilidad de extensión.
- Eliminación o sustitución de métricas de postura y gesticulación.
- Encuadre flexible de la cámara; planos no convencionales válidos.
- Áreas de activación amplias; sin combinaciones simultáneas.

### B. Funcionalidades verificables
- Toda acción ejecutable por un único punto de entrada; WCAG 2.2 2.1.4
  + 2.5.7; E2E teclado-only y E2E voice-only.
- Objetivos táctiles ≥ 24×24 px CSS (WCAG 2.2 2.5.8); auditoría
  automatizada del bounding box.
- Temporizadores configurables (sin límite, estándar, x2, x3) con
  prórroga; WCAG 2.2 2.2.1; E2E + telemetría.
- Métricas de postura/gesticulación reemplazadas por estabilidad del
  encuadre facial; test unitario del pipeline MediaPipe + regresión
  sobre planos no convencionales.
- Capa de comandos de voz para todos los controles (independiente del
  canal sustantivo); WCAG 2.2 2.5.4; E2E con API sintética.
- Recalibración de encuadre declarando posición (frontal, lateral,
  sentado bajo, recostado); test de integración con frames inyectados.

## S7. Usuario con discapacidad cognitiva o neurodivergente
(TEA, TDAH, dislexia)

### A. Necesidades específicas
- Reducción configurable de estímulos visuales y sonoros.
- Lenguaje claro en preguntas y feedback; reformulación simplificada
  sin alterar el contenido evaluativo.
- Soporte tipográfico para dislexia (fuentes específicas, espaciado
  aumentado, alineación a la izquierda).
- Previsibilidad y control sobre duración y estructura.
- Pausa sin penalización ni pérdida de progreso.

### B. Funcionalidades verificables
- Modo de estimulación reducida que desactiva aura, animaciones,
  earcons no esenciales y transiciones; WCAG 2.2 2.3.3
  Animation from Interactions; E2E que valida prefers-reduced-motion;
  Lighthouse.
- Aura limitada a 2 métricas elegidas; E2E que valida que solo se
  renderizan los canales seleccionados.
- Versión en lenguaje claro para toda pregunta (oraciones cortas, voz
  activa); test unitario sobre el módulo de generación + métrica de
  legibilidad (INFLESZ o similar) (referencial).
- Control de tipografía con opciones validadas para dislexia (fuente
  con tracking aumentado, line-height ≥ 1.5); WCAG 2.2 1.4.12; E2E
  que valida valores computados.
- Pausa y reanudación en cualquier punto sin pérdida de estado, ≥ 24 h
  (referencial); WCAG 2.2 2.2.1 + 2.2.6; E2E que pausa, cierra
  navegador, reabre y valida continuidad.
- Anuncio previo a cada fase con duración, estructura y criterios
  evaluativos; WCAG 2.2 3.2.5; E2E confirma presencia del bloque.

## Verificación

La validación combina cuatro herramientas y cuatro hitos por perfil:

**Herramientas**: axe-core (CI, cero serious/critical), Lighthouse
(Accessibility ≥ 95), Playwright (E2E keyboard-only, modo escrito,
voz, tipografía), panel de telemetría propio (modo activo, métricas
sustitutas, latencia de subtítulos, temporizadores efectivos).

**Hitos**: (i) revisión heurística experta antes de la primera prueba
con usuarios; (ii) prueba moderada con un usuario representativo por
perfil (S4-S7) sobre entrevista completa; (iii) peer mock con par mixto
que incluya un usuario del perfil correspondiente; (iv) auditoría final
externa con conformidad WCAG 2.2 nivel AA documentada en informe firmado,
previa a la entrega del PC02.
