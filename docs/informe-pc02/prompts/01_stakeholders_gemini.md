# Prompt para GEMINI WEB — Punto 1: Stakeholders completos

**Por qué este prompt en Gemini**: Gemini tiende a producir listas
amplias y a cubrir actores institucionales y regulatorios que otras IAs
suelen omitir. Lo aprovechamos para maximizar cobertura.

---

A partir del contexto base ya enviado, dame la **lista completa de
stakeholders** del simulador, clasificados como Primario (P) /
Secundario (S) / Terciario (T) según el modelo clásico de IHC
(P = interactúa directamente con la app; S = interactúa indirectamente;
T = afectado pero no interactúa).

Para cada stakeholder devuelve **exactamente** estos cuatro campos:

1. ID corto (S1, S2, ...).
2. Tipo (P / S / T).
3. Nombre del stakeholder en una línea (sin descripciones).
4. Interés o rol respecto al sistema, en máximo dos oraciones.

**Reglas estrictas**:

- Mínimo 12 stakeholders, máximo 20.
- Incluye al menos 4 perfiles de usuarios primarios con discapacidad
  (visual, auditiva, motora, cognitiva/neurodivergente). Cada uno como
  stakeholder propio, no agrupados.
- Incluye actores institucionales (universidad, oficina de
  empleabilidad), regulatorios (autoridad de protección de datos
  personales), y proveedores externos (LLM, TTS).
- No incluyas roles internos del equipo (PO, dev, QA) más allá de un
  único stakeholder genérico "equipo de desarrollo".
- No agregues descripciones largas: máximo 2 oraciones por
  stakeholder.

Devuelve la respuesta como **lista plana en español**, ordenada:
primero todos los Primarios, luego Secundarios, luego Terciarios.
