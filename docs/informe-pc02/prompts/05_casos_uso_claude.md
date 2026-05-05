# Prompt para CLAUDE WEB — Punto 5: Casos de uso detallados

**Por qué este prompt en Claude**: Claude tiende a respetar formatos
estructurados largos (Cockburn extendido) sin fugarse del esquema. Lo
usamos para los casos de uso, donde la consistencia entre 8 casos
importa más que la cobertura.

---

A partir del contexto base y de las listas RF/RNF (que te paso a
continuación), redacta los **casos de uso detallados** del simulador
en formato **Cockburn extendido**. Para cada caso de uso usa
exactamente esta plantilla:

```
CU-NN: <Título>
- Actor primario: ...
- Actores secundarios: ...
- Objetivo: ...
- Precondiciones: ...
- Postcondiciones (éxito): ...

Flujo principal:
1. ...
2. ...

Flujos alternativos:
- Na. <condición>: <comportamiento>

Cubre: RF-XX, RF-YY, RNF-ZZ.
```

**Casos de uso obligatorios** (en este orden, con esta numeración):

- CU-01: Realizar entrevista individual.
- CU-02: Configurar perfil y preferencias de accesibilidad.
- CU-03: Realizar mock interview entre pares.
- CU-04: Consultar historial y plan de mejora.
- CU-05: Gestionar gamificación (rangos, badges, ligas).
- CU-06: Gestionar consentimiento, datos y privacidad.
- CU-07: Administrar la plataforma.
- CU-08: Generar reportes institucionales.

**Reglas estrictas**:

- Cada flujo principal tiene entre 5 y 10 pasos numerados.
- Cada caso de uso tiene **al menos 1 flujo alternativo** documentado.
- No introduzcas RF nuevos: solo referencia los IDs de la lista que te
  paso. Si crees que falta uno, dilo al final en una nota separada
  ("Faltaría RF-XX para cubrir..."), no lo inventes en medio del CU.
- Cierra con una **matriz de trazabilidad CU → RF/RNF** en formato lista
  plana (sin tabla Markdown).
- Español neutro académico, listo para LaTeX.

(Aquí se pegan las listas de RF y RNF antes de pedir la respuesta).
