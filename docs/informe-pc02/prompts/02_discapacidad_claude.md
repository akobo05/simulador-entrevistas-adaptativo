# Prompt para CLAUDE WEB — Punto 2: Funcionalidad para usuarios con discapacidad

**Por qué este prompt en Claude**: Claude tiende a ser más cuidadoso con
lenguaje centrado en la persona, a citar el estándar correcto (WCAG 2.2)
y a profundizar en consecuencias éticas (no penalizar métricas físicas
cuando el usuario ha declarado una condición). Lo usamos para esta
sección sensible.

---

A partir del contexto base ya enviado, y tomando como entrada esta lista
de cuatro perfiles de usuarios primarios con discapacidad:

- S4: Usuario con discapacidad visual (ciega o baja visión).
- S5: Usuario con discapacidad auditiva (sorda o hipoacúsica).
- S6: Usuario con discapacidad motora.
- S7: Usuario con discapacidad cognitiva o neurodivergente
  (TEA, TDAH, dislexia).

Para **cada uno** devuelve dos bloques:

**A. Necesidades específicas** (3 a 5 viñetas concretas, no genéricas).

**B. Funcionalidad que debe ofrecer el simulador para garantizar
equivalencia funcional con el candidato general** (entre 4 y 6
funcionalidades, cada una redactada como capacidad verificable).

**Reglas estrictas**:

- La funcionalidad debe ser **automatizable**: cada item debe poder
  testearse con `axe-core`, `Lighthouse`, un test E2E o una métrica de
  telemetría. Si no, no lo incluyas.
- No menciones "modo accesible" como cajón de sastre: cada modo debe
  describirse por sus efectos observables (ej. "aura simplificada a 2
  métricas elegidas por el usuario", no "interfaz simplificada").
- Cuando una métrica multimodal pueda penalizar injustamente al usuario
  (ej. contacto visual en S4, postura en S6), proponer una métrica
  sustituta y indicar cómo se activa.
- Cita explícitamente WCAG 2.2 nivel AA y la práctica concreta
  (ej. "operación 100% por teclado, criterio 2.1.1").
- Lenguaje centrado en la persona; nunca uses "los discapacitados",
  "los sordos", "los autistas" como sustantivo.
- Devuelve todo en español neutro, listo para pegar como texto
  académico LaTeX.

Al final de la respuesta, agrega un párrafo titulado **Verificación**
que liste las herramientas y los hitos en los que se valida cada perfil
con un usuario representativo.
