# Respuesta cruda de Claude Web — Prompt 04 (Cumplimiento de módulos)

Fecha de ejecución: 2026-04-29.
Modelo: Claude (familia 4.X, web).

---

## Sección 1 — Módulos obligatorios

### 1. Interfaz gráfica no convencional
Sala virtual 3D con WebGL/Three.js; avatar entrevistador rodeado por aura
luminosa procedural. Mapeo: color = valencia global (ámbar a verde),
intensidad = fluidez verbal, ritmo de pulsación = cadencia detectada,
asimetría espacial = equilibrio verbal/no verbal. Sin ventanas modales
sobreimpuestas. ≥ 30 fps en hardware de referencia, degrada a 2D si la
GPU es insuficiente.

### 2. Interfaz de voz
Canal bidireccional cuasi-real: TTS Gemini con voz seleccionable; STT
continuo con detección de fin de habla y segmentación por turnos.
Métricas prosódicas en cliente (fluidez, ritmo, pausas, tono, muletillas).
Capa de comandos de voz con intenciones reservadas ("pausar",
"repetir pregunta", "siguiente", "terminar entrevista") procesadas por
gramática restringida independiente del canal sustantivo.

### 3. Integración con LLM
Tres roles diferenciados sobre Gemini API multimodal con prompt sistémico,
contexto y memoria acotada propios: Entrevistador (preguntas adaptadas a
industria, rol, nivel; reformula según historial), Coach (asincrónico
post-sesión: consume transcripción anonimizada y métricas agregadas para
plan estructurado por competencias), Moderador (solo en peer mock;
observa transcripción cruzada y emite intervenciones breves ante
desviaciones o silencios). Ningún rol recibe video crudo, solo
descriptores numéricos derivados de MediaPipe en cliente.

### 4. Ayuda contextual
Cuatro capas observables:
- Tour guiado al primer ingreso, navegable por teclado, destacando cada
  zona funcional.
- Etiquetas emergentes accesibles por foco y por puntero sobre todos los
  controles, con descripción breve y atajo de teclado.
- Asistente coach-on-demand invocable por comando "ayuda" o tecla
  dedicada, que responde dudas sobre el funcionamiento (no sobre el
  contenido evaluativo) consultando una base documental indexada.
- Inferencia de necesidad de ayuda por inactividad o errores repetidos:
  si el usuario permanece sin acción durante un umbral configurable o
  reintenta el mismo comando con falla, el sistema sugiere la sección
  de ayuda relevante.

## Sección 2 — Módulos opcionales

### Personalización continua
- Historial conversacional persistente, consultable como línea de
  tiempo de sesiones con métricas, transcripción y reporte.
- Plan adaptativo recalculado al cierre de cada sesión; el coach
  prioriza competencias con menor desempeño en las últimas N sesiones.
- Perfil de industria y rol declarado por el usuario, refinado a partir
  del CV cargado y de respuestas previas; condiciona el banco de
  preguntas y el vocabulario técnico esperado.
- Calibración progresiva del nivel mediante modelo tipo IRT por
  competencia: sube o baja la dificultad de la siguiente pregunta
  según la respuesta previa; nivel inicial fijado por sesión
  diagnóstica.
- Persistencia de preferencias de interfaz, accesibilidad y aura entre
  sesiones y dispositivos, sincronizadas por cuenta.

### Interactividad con otros usuarios
- Peer mock vía WebRTC con señalización por servidor propio y media
  P2P; sala con dos roles activos (candidato, observador) y moderador
  LLM compartido.
- Panel del observador con métricas multimodales del candidato en vivo
  (con consentimiento explícito previo registrado en sesión) y
  formulario estructurado de feedback por competencia.
- Comentarios anclados al timestamp de la grabación local, navegables
  por marcador y editables hasta el cierre.
- Intercambio de roles con un único control que invierte candidato y
  observador y reinicia el contador, preservando el historial previo
  como adjunto consultable.
- Modo panel con hasta tres observadores simultáneos sobre un único
  candidato; feedback agregado al cierre con resolución de conflictos
  por promedio ponderado por antigüedad.
- Feedback cruzado asincrónico: solicitar revisión de una entrevista
  grabada por par seleccionado del directorio, con plazo configurable
  y notificación cuando el feedback queda disponible.

### Gamificación
- Rangos por competencia (comunicación verbal, lenguaje corporal,
  contenido técnico, manejo del estrés) calculados como agregaciones
  móviles sobre las últimas N sesiones, con umbrales fijos.
- Badges por logros verificables y deterministas (10 sesiones
  consecutivas, puntaje umbral en una competencia, peer mock como
  observador), reversibles ante anulación de sesión.
- Ligas temáticas por industria y rol; clasificación semanal basada en
  mejora relativa del usuario respecto a su propia línea base, no
  comparación absoluta entre usuarios.
- Retos grupales con objetivo común (acumulación colectiva de horas o
  peer mocks completados) y progreso visible para todos los miembros.

## Sección 3 — Módulo descartado: interfaces hápticas

Cuatro razones convergentes:

1. **Dominio**: la entrevista laboral simulada no requiere intercambio
   táctil; la totalidad del valor evaluativo y formativo se transmite
   por canales auditivo, visual y textual. No hay evidencia en la
   literatura de mejora documentable por háptica en este dominio.
2. **Hardware**: la única superficie háptica realmente accesible en el
   contexto de uso esperado es la vibración del móvil, canal de muy
   baja resolución expresiva, no disponible en escritorio (uso
   primario previsto).
3. **Inmersión**: una vibración durante la entrevista interrumpiría la
   simulación de un contexto formal y se percibiría como notificación
   intrusiva en lugar de información integrada.
4. **Recursos**: el equipo prefiere profundizar los tres módulos
   opcionales seleccionados, donde existen requerimientos automatizables
   y verificables, antes que dispersar esfuerzo en una capa háptica
   cuya verificación automática sería difícil.

Decisión sujeta a revisión si se incorpora un caso de uso específico
(p.ej. alertas hápticas para usuarios con discapacidad auditiva en peer
mock) que justifique el costo de implementación.
