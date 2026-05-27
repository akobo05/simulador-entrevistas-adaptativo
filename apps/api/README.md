# @warachikuy/api

Backend Fastify del simulador de entrevistas.

## Decisiones de scope en F1

- **Persistencia de sesiones: solo en Redis.** El estado de una sesión (`SessionState`) vive bajo la key `session:<sessionId>` con TTL de 3600 segundos. PostgreSQL y `drizzle-kit` se incorporan en F2 cuando aparezca `ImprovementPlan`, que sí es persistente por diseño.

  Consecuencia conocida: si el container del backend se reinicia, las sesiones en curso se pierden. El usuario simplemente vuelve a crear una sesión. Trade-off aceptado para el MVP académico.

- **Sin autenticación de usuario final.** Las sesiones se identifican por `sessionId` + `token` opaco (32 bytes hex). Rate-limiting de 60 sesiones por hora por IP mitiga abuso. Autenticación completa llega en F5.

## Scripts

- `pnpm dev` — levanta el servidor con `tsx watch` (recarga al guardar).
- `pnpm typecheck` — `tsc --noEmit`.
- `pnpm test` — vitest run.
- `pnpm build` — emite `dist/`.
- `pnpm start` — corre el build producido.
