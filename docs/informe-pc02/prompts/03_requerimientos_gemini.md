# Prompt para GEMINI WEB — Punto 3: Requerimientos funcionales y no funcionales

**Por qué este prompt en Gemini**: aprovechamos la velocidad y el
volumen de Gemini para producir un primer barrido amplio de RF/RNF que
luego se valida y poda.

---

A partir del contexto base, y tomando como entrada la lista de
stakeholders S1..S17 ya consensuada (incluye candidato general, candidato
con experiencia, peer entrevistador, S4-S7 con discapacidad, reclutador,
coach, universidad, equipo, administrador, proveedor LLM, empresas,
familiares, regulador, comunidad académica), genera:

## Parte A — Requerimientos funcionales (RF)

Entre 20 y 30 RF, cada uno con esta estructura **exacta**:

- **ID**: RF-NN (correlativo desde 01).
- **Descripción**: una sola oración, en presente, voz activa
  ("El sistema permite...", "El sistema captura...").
- **Stakeholders**: lista de IDs entre los que se beneficia.
- **Verificación automática**: tipo concreto de prueba
  (test E2E, test unitario, test de integración con mock, test de
  prompt + snapshot, test de NLU sobre frases, test de persistencia,
  test visual regression).

**Reglas estrictas**:

- **Todo RF debe ser automatizable**. Si no se te ocurre cómo testearlo,
  no lo propongas.
- Cubre obligatoriamente: sesión solo, sesión peer (WebRTC),
  generación del plan de mejora, calibración de nivel, gamificación
  (rangos, badges, ligas), ayuda contextual y asistente lateral,
  modos de accesibilidad para S4-S7, consentimiento granular y derecho
  ARCO, panel de administración, reportes institucionales agregados.
- Numera correlativamente sin saltos.
- Una idea por RF. No agrupes funcionalidades distintas en un mismo RF.

## Parte B — Requerimientos no funcionales (RNF)

Entre 12 y 18 RNF, cada uno con:

- **ID**: RNF-NN.
- **Categoría**: Rendimiento / Disponibilidad / Privacidad / Seguridad
  / Accesibilidad / Internacionalización / Usabilidad / Mantenibilidad
  / Observabilidad / Costo / Ética IA / Compatibilidad.
- **Descripción**: una oración.
- **Métrica o criterio**: cuantitativo cuando aplique
  (ej. "p95 ≤ 500 ms", "cobertura ≥ 70%", "Lighthouse ≥ 95"). Si no es
  numérico, indica el umbral binario verificable.

**Reglas estrictas**:

- Cubre al menos: latencia del aura, latencia del LLM, ejecución en
  laptop estándar y móvil de gama media, disponibilidad mensual,
  cifrado en reposo y borrado a 30 días, no enviar video crudo al LLM,
  WCAG 2.2 AA, idioma es-PE con arquitectura preparada para inglés,
  cobertura de tests, observabilidad con trazas correlacionadas, costo
  medio de IA por sesión, advertencia de sesgo en métricas derivadas
  de IA, compatibilidad con Chrome/Firefox/Safari versiones -2.

Devuelve todo en español, sin tablas Markdown, en lista plana lista
para pegar.
