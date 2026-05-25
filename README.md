# Simulador de Entrevistas Laborales Adaptativo

Reclutador basado en LLM que adapta sus preguntas a la industria y nivel del candidato, analizando en tiempo real la voz (fluidez, muletillas, pausas, tono) y el lenguaje corporal por webcam (contacto visual, postura, gestualidad). Habilita _mock interviews_ colaborativas entre estudiantes con roles intercambiables.

**Repositorio:** https://github.com/akobo05/simulador-entrevistas-adaptativo

## Curso

- **Universidad:** Universidad Nacional de Ingeniería
- **Curso:** CC451 — Interacción Humano Computadora
- **Ciclo:** 2026-I
- **Profesor:** Ciro Núñez Iturri

## Integrantes

| Nombre                | Iniciales |
| --------------------- | --------- |
| Aaron Davila Santos   | AD        |
| Max Serrano Arostegui | MS        |
| Walter Poma Navarro   | WP        |

## Estructura del repositorio

```
.
├── apps/
│   ├── web/                 # Frontend PWA (React 19 + Vite + Three.js)
│   └── api/                 # Backend (Node + Fastify + Gemini)
├── packages/
│   ├── shared-types/        # Contratos JSON con Zod
│   └── voice-pipeline/      # STT, TTS y MediaPipe en Web Worker
├── docs/
│   ├── informe-pc02/        # Informe de la PC02
│   ├── prototype/           # Recorrido del prototipo (video)
│   └── superpowers/
│       ├── specs/           # Especificaciones por fase
│       └── plans/           # Planes de implementación
├── docker-compose.yml       # Stack completo en local
└── .github/workflows/ci.yml # Integración continua
```

## Cómo arrancar el proyecto en local

1. Instalar pre-requisitos: Node.js 22 LTS, pnpm 10, Docker Desktop, gh CLI.
2. Clonar el repositorio.
3. Copiar `.env.example` a `.env` y completar `GEMINI_API_KEY` con una clave personal.
4. Levantar el stack:

   ```bash
   docker compose up --build
   ```

5. Abrir http://localhost:5173 (frontend) y http://localhost:3000/health (backend).

## Cómo correr tests, lint y typecheck

```bash
pnpm install       # solo la primera vez
pnpm lint          # ESLint sobre todo el workspace
pnpm typecheck     # tsc --noEmit
pnpm test          # Vitest
pnpm build         # build de todas las apps
```

## Documentación

- [`docs/propuesta/PropuestaProyecto.pdf`](docs/propuesta/PropuestaProyecto.pdf) — propuesta inicial del proyecto.
- [`docs/informe-pc02/main.pdf`](docs/informe-pc02/main.pdf) — informe de avance PC02 (PDF compilado).
- [`docs/informe-pc02/`](docs/informe-pc02/) — fuentes LaTeX del informe, prompts versionados y figuras.
- [`docs/prototype/recorrido-prototipo.mp4`](docs/prototype/recorrido-prototipo.mp4) — recorrido del prototipo de fidelidad media (video).
- [Prototipo interactivo en Figma](https://www.figma.com/proto/hZttO5TGjofestkKuw73nY/Warachikuy?node-id=2014-3672&p=f&t=AekkWhjgguGksNPE-1&scaling=scale-down&content-scaling=fixed&page-id=0%3A1&starting-point-node-id=2014%3A3604) — flujo navegable del prototipo de fidelidad media.
- [`docs/superpowers/specs/`](docs/superpowers/specs/) — especificaciones técnicas por fase.
- [`docs/superpowers/plans/`](docs/superpowers/plans/) — planes de implementación detallados.

## Tablero del proyecto

Roadmap, issues y avance por fase: [Warachikuy — Roadmap](https://github.com/users/akobo05/projects/4).

Columnas: `Backlog` · `Ready` · `In Progress` · `In Review` · `Done`.

## Estado

F0 (setup del monorepo) completada. En curso: F1 — Entrevista individual básica.

## Licencia

Distribuido bajo licencia [MIT](LICENSE).
