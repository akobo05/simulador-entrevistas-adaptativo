# Prompt para CLAUDE WEB — Punto 4: Cumplimiento de módulos UX/UI

**Por qué este prompt en Claude**: para esta sección priorizamos
coherencia argumentativa y justificación del módulo descartado, donde
Claude suele ser más estructurado.

---

A partir del contexto base, redacta el cumplimiento de los módulos
exigidos por el enunciado. Estructura la respuesta así:

## Sección 1 — Módulos obligatorios (los 4)

Para cada uno de los siguientes, devuelve un párrafo de 4 a 8 líneas
explicando **cómo se cumple en el simulador** y enumerando los IDs de
RF/RNF que satisface (referencias a RF-NN/RNF-NN; usa los códigos que
te paso a continuación):

1. Interfaz gráfica no convencional.
2. Interfaz de voz.
3. Integración con uno o varios LLM.
4. Ayuda contextual para el usuario.

## Sección 2 — Módulos opcionales seleccionados (3 de 4)

Para cada uno de estos tres, devuelve una lista de viñetas concretas
que el simulador implementa, con referencias RF-NN:

- Personalización continua (historial, plan adaptativo, perfil de
  industria, calibración de nivel).
- Interactividad con otros usuarios (peer mock vía WebRTC, panel del
  observador, comentarios anclados, intercambio de roles, modo panel,
  feedback cruzado asincrónico).
- Gamificación (rangos por competencia, badges específicos, ligas
  temáticas, retos grupales).

## Sección 3 — Módulo descartado, con justificación

Justifica en 5 a 10 líneas por qué **no se incluyen interfaces
hápticas** en el MVP. La justificación debe basarse en:

- Ausencia de hardware especial requerido por el dominio.
- Limitación práctica a vibración del móvil.
- Riesgo de romper la inmersión durante la entrevista.
- Preferencia por profundizar en los tres módulos elegidos.

**Reglas estrictas**:

- Lista de RF/RNF cubiertos al final de cada bloque (ej. "Cubre RF-05,
  RF-15, RNF-03").
- Sin frases huecas ("brindar la mejor experiencia"). Cada afirmación
  debe ser observable o medible.
- Español neutro académico, listo para LaTeX.
