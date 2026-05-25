# F0 Setup — Monorepo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establecer la base técnica del monorepo del proyecto. Al terminar este plan existe un workspace pnpm con apps (`web`, `api`) y packages (`shared-types`, `voice-pipeline`) compilables y testeables, un `docker-compose.yml` que levanta el stack completo en local, una CI verde en GitHub Actions, hooks de Git que enforzan estilo, y un tablero de GitHub Projects listo para que los tres desarrolladores comiencen F1 en paralelo.

**Architecture:** Monorepo con pnpm workspaces que comparten tipos y configuración base de TypeScript. Cada app tiene su propio `package.json` y declara como dependencia los packages internos con `"workspace:*"`. Docker Compose orquesta los servicios para desarrollo local. GitHub Actions ejecuta `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm build` en cada pull request. Husky + lint-staged aplican Prettier y ESLint en cada commit local.

**Tech Stack:**
- Lenguaje: TypeScript 5.7.x
- Runtime: Node.js 22 LTS
- Package manager: pnpm 10.x
- Frontend: React 19 + Vite 6
- Backend: Fastify 5
- Validación: Zod 3
- Tests: Vitest 3
- Linter/formatter: ESLint 9 + Prettier 3
- Hooks: Husky + lint-staged
- Infra local: Docker Compose
- CI: GitHub Actions
- Project board: GitHub Projects v2 vía gh CLI

**Pre-requisitos del desarrollador antes de empezar:**
- Node.js 22 LTS instalado (verificar con `node --version` → v22.x)
- pnpm 10 instalado (`npm install -g pnpm@10`)
- Docker Desktop instalado y corriendo (`docker info` no debe dar error)
- gh CLI autenticado (`gh auth status` debe mostrar usuario logueado)
- Clave de API de Gemini en mano (no se commitea; va en `.env` local)

**Ramas y PR:**
- Trabajar todo este plan en la rama `chore/f0-setup` creada desde `main`
- Hacer commits frecuentes (uno por tarea como mínimo)
- Al terminar, abrir PR `chore/f0-setup → main` con título "Se incorpora el setup base del monorepo"
- Mergear con squash o merge commit (el equipo eligió merge commits)

---

## Task 1: Crear la rama y configurar el workspace raíz

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Modify: `package.json` (raíz, reemplaza el actual)
- Modify: `.gitignore` (agregar entradas)

- [ ] **Step 1: Crear rama de trabajo**

Desde la raíz del repositorio clonado:

```bash
git switch main
git pull
git switch -c chore/f0-setup
```

Expected: cambia a una rama nueva limpia desde `main`.

- [ ] **Step 2: Crear `pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 3: Crear `tsconfig.base.json` en la raíz**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  }
}
```

- [ ] **Step 4: Reemplazar el `package.json` de la raíz**

```json
{
  "name": "simulador-entrevistas-adaptativo",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Simulador de Entrevistas Laborales Adaptativo — CC451 UNI 2026-I",
  "scripts": {
    "lint": "pnpm -r lint",
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test",
    "build": "pnpm -r build",
    "dev": "pnpm -r --parallel dev",
    "format": "prettier --write \"**/*.{ts,tsx,js,jsx,json,md,yml,yaml}\"",
    "format:check": "prettier --check \"**/*.{ts,tsx,js,jsx,json,md,yml,yaml}\"",
    "prepare": "husky"
  },
  "devDependencies": {
    "@types/node": "^22.10.5",
    "typescript": "^5.7.2",
    "prettier": "^3.4.2",
    "husky": "^9.1.7",
    "lint-staged": "^15.3.0"
  },
  "engines": {
    "node": ">=22.0.0",
    "pnpm": ">=10.0.0"
  },
  "packageManager": "pnpm@10.0.0"
}
```

- [ ] **Step 5: Actualizar `.gitignore`** (agregar al final si no están ya)

```gitignore
# pnpm
.pnpm-store/

# build outputs por app
apps/*/dist/
apps/*/build/
packages/*/dist/
packages/*/build/

# coverage
coverage/

# env files
.env
.env.local
.env.*.local
!.env.example

# OS
.DS_Store
Thumbs.db

# IDE
.idea/
.vscode/

# logs
*.log

# tests
*.tsbuildinfo
```

- [ ] **Step 6: Instalar dependencias raíz**

```bash
pnpm install
```

Expected: crea `node_modules/` y `pnpm-lock.yaml`. No debe dar errores.

- [ ] **Step 7: Verificar que el workspace está reconocido**

```bash
pnpm list -r --depth -1
```

Expected: muestra solo el paquete raíz (los packages internos aún no existen).

- [ ] **Step 8: Commit**

```bash
git add pnpm-workspace.yaml tsconfig.base.json package.json .gitignore pnpm-lock.yaml
git commit -m "Se configura la base del workspace pnpm"
```

---

## Task 2: Crear paquete `packages/shared-types`

**Files:**
- Create: `packages/shared-types/package.json`
- Create: `packages/shared-types/tsconfig.json`
- Create: `packages/shared-types/vitest.config.ts`
- Create: `packages/shared-types/src/index.ts`
- Create: `packages/shared-types/src/index.test.ts`

- [ ] **Step 1: Crear `packages/shared-types/package.json`**

```json
{
  "name": "@warachikuy/shared-types",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "lint": "eslint src",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "build": "tsc"
  },
  "dependencies": {
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "typescript": "^5.7.2",
    "vitest": "^3.0.5"
  }
}
```

- [ ] **Step 2: Crear `packages/shared-types/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "lib": ["ES2022"]
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Crear `packages/shared-types/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 4: Escribir el test que debe fallar primero**

Crear `packages/shared-types/src/index.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { sharedTypesVersion } from './index';

describe('shared-types package', () => {
  it('exporta una versión que coincide con el package.json', () => {
    expect(sharedTypesVersion).toBe('0.1.0');
  });
});
```

- [ ] **Step 5: Crear `packages/shared-types/src/index.ts` mínimo**

```typescript
/**
 * Punto de entrada del paquete de tipos compartidos.
 *
 * Los contratos de F1 (AuraMetric, TurnEvent, etc.) se agregarán en
 * tareas del Plan 2. Por ahora este paquete solo expone su versión
 * para servir como smoke test del workspace.
 */
export const sharedTypesVersion = '0.1.0';
```

- [ ] **Step 6: Instalar dependencias**

Desde la raíz del repo:

```bash
pnpm install
```

- [ ] **Step 7: Correr el test**

```bash
pnpm --filter @warachikuy/shared-types test
```

Expected: 1 test pasa.

- [ ] **Step 8: Verificar typecheck**

```bash
pnpm --filter @warachikuy/shared-types typecheck
```

Expected: salida vacía (sin errores).

- [ ] **Step 9: Commit**

```bash
git add packages/shared-types/ pnpm-lock.yaml
git commit -m "Se crea el paquete shared-types con smoke test"
```

---

## Task 3: Crear paquete `packages/voice-pipeline`

**Files:**
- Create: `packages/voice-pipeline/package.json`
- Create: `packages/voice-pipeline/tsconfig.json`
- Create: `packages/voice-pipeline/vitest.config.ts`
- Create: `packages/voice-pipeline/src/index.ts`
- Create: `packages/voice-pipeline/src/index.test.ts`

- [ ] **Step 1: Crear `packages/voice-pipeline/package.json`**

```json
{
  "name": "@warachikuy/voice-pipeline",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "lint": "eslint src",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "build": "tsc"
  },
  "dependencies": {
    "@warachikuy/shared-types": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.7.2",
    "vitest": "^3.0.5"
  }
}
```

- [ ] **Step 2: Crear `packages/voice-pipeline/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "lib": ["ES2022", "DOM"]
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Crear `packages/voice-pipeline/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'happy-dom',
  },
});
```

Y agregar la dependencia al `package.json` del paquete:

```bash
pnpm --filter @warachikuy/voice-pipeline add -D happy-dom@^16.5.0
```

- [ ] **Step 4: Escribir el test smoke que debe fallar primero**

Crear `packages/voice-pipeline/src/index.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { voicePipelineVersion } from './index';

describe('voice-pipeline package', () => {
  it('exporta una versión que coincide con el package.json', () => {
    expect(voicePipelineVersion).toBe('0.1.0');
  });
});
```

- [ ] **Step 5: Crear `packages/voice-pipeline/src/index.ts` mínimo**

```typescript
/**
 * Punto de entrada del paquete de pipeline multimodal (voz + visión).
 *
 * Las funciones de STT, TTS, captura de MediaPipe y derivación de
 * métricas se agregarán en el Plan 5 de F1. Por ahora este paquete
 * solo expone su versión.
 */
export const voicePipelineVersion = '0.1.0';
```

- [ ] **Step 6: Correr el test**

```bash
pnpm --filter @warachikuy/voice-pipeline test
```

Expected: 1 test pasa.

- [ ] **Step 7: Verificar typecheck**

```bash
pnpm --filter @warachikuy/voice-pipeline typecheck
```

- [ ] **Step 8: Commit**

```bash
git add packages/voice-pipeline/ pnpm-lock.yaml
git commit -m "Se crea el paquete voice-pipeline con smoke test"
```

---

## Task 4: Crear `apps/api` (backend Fastify)

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/vitest.config.ts`
- Create: `apps/api/.env.example`
- Create: `apps/api/src/config/env.ts`
- Create: `apps/api/src/server.ts`
- Create: `apps/api/src/server.test.ts`
- Create: `apps/api/src/index.ts`

- [ ] **Step 1: Crear `apps/api/package.json`**

```json
{
  "name": "@warachikuy/api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "lint": "eslint src",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@warachikuy/shared-types": "workspace:*",
    "fastify": "^5.2.1",
    "drizzle-orm": "^0.38.3",
    "postgres": "^3.4.5",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@types/node": "^22.10.5",
    "drizzle-kit": "^0.30.1",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vitest": "^3.0.5"
  }
}
```

- [ ] **Step 2: Crear `apps/api/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "lib": ["ES2022"],
    "types": ["node"]
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Crear `apps/api/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 4: Crear `apps/api/.env.example`**

```
# Puerto donde escucha el backend
PORT=3000

# Cadena de conexión a PostgreSQL
DATABASE_URL=postgresql://warachikuy:warachikuy@localhost:5432/warachikuy

# URL de Redis
REDIS_URL=redis://localhost:6379

# Clave de API de Gemini (cada desarrollador con la suya en dev)
GEMINI_API_KEY=
```

- [ ] **Step 5: Crear `apps/api/src/config/env.ts` con validación Zod**

```typescript
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY es obligatoria'),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    console.error('Variables de entorno inválidas:');
    console.error(parsed.error.format());
    process.exit(1);
  }
  return parsed.data;
}
```

- [ ] **Step 6: Escribir el test del servidor (debe fallar)**

Crear `apps/api/src/server.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from './server';

describe('buildServer', () => {
  let server: FastifyInstance;

  afterEach(async () => {
    await server?.close();
  });

  it('responde 200 en GET /health con el cuerpo esperado', async () => {
    server = await buildServer();
    const response = await server.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });
});
```

- [ ] **Step 7: Correr el test para verificar que falla**

```bash
pnpm --filter @warachikuy/api test
```

Expected: FAIL con `Cannot find module './server'` o similar.

- [ ] **Step 8: Crear `apps/api/src/server.ts`**

```typescript
import Fastify, { type FastifyInstance } from 'fastify';

export async function buildServer(): Promise<FastifyInstance> {
  const server = Fastify({
    logger: {
      level: process.env['LOG_LEVEL'] ?? 'info',
    },
  });

  server.get('/health', async () => ({ status: 'ok' }));

  return server;
}
```

- [ ] **Step 9: Correr el test para verificar que pasa**

```bash
pnpm --filter @warachikuy/api test
```

Expected: 1 test pasa.

- [ ] **Step 10: Crear `apps/api/src/index.ts` (entrypoint que arranca el servidor)**

```typescript
import { loadEnv } from './config/env.js';
import { buildServer } from './server.js';

async function main(): Promise<void> {
  const env = loadEnv();
  const server = await buildServer();

  try {
    await server.listen({ port: env.PORT, host: '0.0.0.0' });
    server.log.info(`API levantada en http://0.0.0.0:${env.PORT}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

void main();
```

- [ ] **Step 11: Verificar typecheck y build**

```bash
pnpm --filter @warachikuy/api typecheck
pnpm --filter @warachikuy/api build
```

Expected: ambas pasan sin errores.

- [ ] **Step 12: Commit**

```bash
git add apps/api/ pnpm-lock.yaml
git commit -m "Se crea apps/api con endpoint /health y validacion de env"
```

---

## Task 5: Crear `apps/web` (frontend React + Vite)

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/.env.example`
- Create: `apps/web/index.html`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/src/App.test.tsx`

- [ ] **Step 1: Crear `apps/web/package.json`**

```json
{
  "name": "@warachikuy/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "lint": "eslint src",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@warachikuy/shared-types": "workspace:*",
    "@warachikuy/voice-pipeline": "workspace:*",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@axe-core/react": "^4.10.1",
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@types/react": "^19.0.7",
    "@types/react-dom": "^19.0.3",
    "@vitejs/plugin-react": "^4.3.4",
    "happy-dom": "^16.5.0",
    "typescript": "^5.7.2",
    "vite": "^6.0.7",
    "vitest": "^3.0.5"
  }
}
```

Nota: `@axe-core/react` se incluye como dependencia de desarrollo. Su activación efectiva ocurre en el `main.tsx` con un guard de entorno (se hace en el plan de F1 cuando haya componentes reales que auditar).

Plantilla del `main.tsx` definitivo (será aplicada en F1, no en este F0):

```typescript
if (import.meta.env.DEV) {
  const axe = await import('@axe-core/react');
  const React = await import('react');
  const ReactDOM = await import('react-dom');
  axe.default(React.default, ReactDOM.default, 1000);
}
```

Por ahora, el `main.tsx` de F0 queda simple (sin axe). El plan de F1 frontend agrega el guard.

- [ ] **Step 2: Crear `apps/web/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client"],
    "noEmit": true,
    "allowImportingTsExtensions": false
  },
  "include": ["src/**/*", "vite.config.ts", "vitest.config.ts"]
}
```

- [ ] **Step 3: Crear `apps/web/vite.config.ts`**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '0.0.0.0',
  },
});
```

- [ ] **Step 4: Crear `apps/web/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'happy-dom',
    setupFiles: ['./src/test-setup.ts'],
  },
});
```

- [ ] **Step 5: Crear `apps/web/src/test-setup.ts`**

```typescript
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 6: Crear `apps/web/.env.example`**

```
# URL base de la API
VITE_API_URL=http://localhost:3000
```

- [ ] **Step 7: Crear `apps/web/index.html`**

```html
<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Warachikuy — Simulador de Entrevistas</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 8: Escribir el test del componente App (debe fallar)**

Crear `apps/web/src/App.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from './App';

describe('App', () => {
  it('renderiza el título del proyecto', () => {
    render(<App />);
    expect(screen.getByText(/Warachikuy/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 9: Correr el test para verificar que falla**

```bash
pnpm --filter @warachikuy/web test
```

Expected: FAIL por que `./App` no existe.

- [ ] **Step 10: Crear `apps/web/src/App.tsx`**

```typescript
export function App() {
  return (
    <main>
      <h1>Warachikuy</h1>
      <p>Simulador de Entrevistas Laborales Adaptativo</p>
    </main>
  );
}
```

Nota: React 19 ya no expone `JSX.Element` como tipo global. Se omite la anotación explícita de retorno y se deja que TypeScript la infiera.

- [ ] **Step 11: Crear `apps/web/src/main.tsx`**

```typescript
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Elemento root no encontrado');
}

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 12: Correr el test para verificar que pasa**

```bash
pnpm --filter @warachikuy/web test
```

Expected: 1 test pasa.

- [ ] **Step 13: Verificar typecheck y build**

```bash
pnpm --filter @warachikuy/web typecheck
pnpm --filter @warachikuy/web build
```

Expected: ambos pasan, build genera `apps/web/dist/`.

- [ ] **Step 14: Commit**

```bash
git add apps/web/ pnpm-lock.yaml
git commit -m "Se crea apps/web con componente App y smoke test"
```

---

## Task 6: Configurar Prettier en la raíz

**Files:**
- Create: `.prettierrc.json`
- Create: `.prettierignore`

- [ ] **Step 1: Crear `.prettierrc.json` en la raíz**

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

- [ ] **Step 2: Crear `.prettierignore` en la raíz**

```gitignore
node_modules/
dist/
build/
coverage/
.pnpm-store/
pnpm-lock.yaml
docs/informe-pc02/
docs/superpowers/
```

- [ ] **Step 3: Correr Prettier sobre todo el repo**

```bash
pnpm format
```

Expected: formatea archivos automáticamente. Verificar diff con `git diff --stat`.

- [ ] **Step 4: Verificar que `format:check` pasa después de formatear**

```bash
pnpm format:check
```

Expected: "All matched files use Prettier code style!"

- [ ] **Step 5: Commit**

```bash
git add .prettierrc.json .prettierignore
git add -u  # archivos reformateados
git commit -m "Se configura Prettier en la raiz del workspace"
```

---

## Task 7: Configurar ESLint con TypeScript y React

**Files:**
- Create: `eslint.config.js` (raíz, flat config para ESLint 9)
- Modify: `package.json` raíz (agregar deps)

- [ ] **Step 1: Instalar dependencias de ESLint**

```bash
pnpm add -Dw eslint@^9.17.0 typescript-eslint@^8.20.0 eslint-plugin-react@^7.37.4 eslint-plugin-react-hooks@^5.1.0 globals@^15.14.0
```

- [ ] **Step 2: Crear `eslint.config.js` en la raíz**

```javascript
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.pnpm-store/**',
      'docs/**',
      '**/*.config.{js,ts}',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    settings: {
      react: { version: '19' },
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
    },
  },
);
```

- [ ] **Step 3: Correr ESLint**

```bash
pnpm lint
```

Expected: pasa sin errores. Si hay warnings menores, arreglarlos antes de commitear.

- [ ] **Step 4: Verificar que el script `lint` de cada paquete funciona**

```bash
pnpm --filter @warachikuy/api lint
pnpm --filter @warachikuy/web lint
pnpm --filter @warachikuy/shared-types lint
pnpm --filter @warachikuy/voice-pipeline lint
```

Expected: todos pasan.

- [ ] **Step 5: Commit**

```bash
git add eslint.config.js package.json pnpm-lock.yaml
git commit -m "Se configura ESLint con TypeScript y React"
```

---

## Task 8: Configurar Husky + lint-staged

**Files:**
- Create: `.husky/pre-commit`
- Create: `lint-staged.config.js`

- [ ] **Step 1: Inicializar Husky**

```bash
pnpm exec husky init
```

Expected: crea el directorio `.husky/` con un `pre-commit` de ejemplo.

- [ ] **Step 2: Reemplazar contenido de `.husky/pre-commit`**

```bash
pnpm exec lint-staged
```

- [ ] **Step 3: Crear `lint-staged.config.js` en la raíz**

```javascript
export default {
  '*.{ts,tsx}': [
    'eslint --fix',
    'prettier --write',
    // Verificación de tipos sobre los archivos staged.
    // Si el monorepo crece y este paso se vuelve lento, se reemplaza
    // por `pnpm typecheck` sobre los paquetes afectados.
    () => 'pnpm -r typecheck',
  ],
  '*.{js,jsx,json,md,yml,yaml}': ['prettier --write'],
};
```

Nota: el `tsc --noEmit` se ejecuta sobre el workspace completo (no por archivo) porque TypeScript necesita el contexto de los tipos importados para validar correctamente. En máquinas modernas esto toma ~3 segundos para el monorepo de F0.

- [ ] **Step 4: Hacer un cambio trivial y verificar que el hook corre**

```bash
echo "// test hook" >> apps/api/src/index.ts
git add apps/api/src/index.ts
git commit -m "Se prueba el hook de pre-commit"
```

Expected: lint-staged se ejecuta, formatea, y el commit pasa.

- [ ] **Step 5: Revertir el cambio de prueba**

```bash
# Quitar la línea agregada manualmente
git revert HEAD --no-edit
```

O editar el archivo para sacar la línea de prueba y commitear "Se revierte la prueba del hook".

- [ ] **Step 6: Commit de la configuración de hooks**

```bash
git add .husky/pre-commit lint-staged.config.js
git commit -m "Se agregan hooks de pre-commit con Husky y lint-staged"
```

---

## Task 9: Crear `docker-compose.yml` y `.env.example` raíz

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.example` (raíz, agregador)
- Create: `apps/api/Dockerfile.dev`
- Create: `apps/web/Dockerfile.dev`

- [ ] **Step 1: Crear `apps/api/Dockerfile.dev`**

```dockerfile
FROM node:22-alpine

RUN corepack enable && corepack prepare pnpm@10.0.0 --activate

WORKDIR /workspace

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY apps/api ./apps/api
COPY packages/shared-types ./packages/shared-types

RUN pnpm install --frozen-lockfile

WORKDIR /workspace/apps/api

EXPOSE 3000

CMD ["pnpm", "dev"]
```

- [ ] **Step 2: Crear `apps/web/Dockerfile.dev`**

```dockerfile
FROM node:22-alpine

RUN corepack enable && corepack prepare pnpm@10.0.0 --activate

WORKDIR /workspace

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY apps/web ./apps/web
COPY packages/shared-types ./packages/shared-types
COPY packages/voice-pipeline ./packages/voice-pipeline

RUN pnpm install --frozen-lockfile

WORKDIR /workspace/apps/web

EXPOSE 5173

CMD ["pnpm", "dev", "--host", "0.0.0.0"]
```

- [ ] **Step 3: Crear `docker-compose.yml` en la raíz**

```yaml
services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: warachikuy
      POSTGRES_PASSWORD: warachikuy
      POSTGRES_DB: warachikuy
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U warachikuy"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile.dev
    ports:
      - "3000:3000"
    environment:
      PORT: 3000
      DATABASE_URL: postgresql://warachikuy:warachikuy@postgres:5432/warachikuy
      REDIS_URL: redis://redis:6379
      GEMINI_API_KEY: ${GEMINI_API_KEY}
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    volumes:
      - ./apps/api/src:/workspace/apps/api/src
      - ./packages/shared-types/src:/workspace/packages/shared-types/src

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile.dev
    ports:
      - "5173:5173"
    environment:
      VITE_API_URL: http://localhost:3000
    depends_on:
      - api
    volumes:
      - ./apps/web/src:/workspace/apps/web/src
      - ./packages/shared-types/src:/workspace/packages/shared-types/src
      - ./packages/voice-pipeline/src:/workspace/packages/voice-pipeline/src

volumes:
  postgres-data:
```

- [ ] **Step 4: Crear `.env.example` en la raíz**

```
# Variable consumida por docker-compose.yml.
# Cada desarrollador completa el valor con su propia clave de Gemini.
GEMINI_API_KEY=
```

- [ ] **Step 5: Levantar el stack para verificar**

```bash
cp .env.example .env
# Editar .env y poner una clave de Gemini válida (o un valor cualquiera si solo se verifica que arranque)
docker compose up --build -d
```

Expected: los 4 servicios arrancan. Verificar con `docker compose ps`.

- [ ] **Step 6: Verificar el endpoint /health de la API**

```bash
curl http://localhost:3000/health
```

Expected: `{"status":"ok"}`

- [ ] **Step 7: Verificar que el frontend responde**

```bash
curl -I http://localhost:5173
```

Expected: HTTP 200 con `text/html`.

- [ ] **Step 8: Bajar el stack**

```bash
docker compose down
```

- [ ] **Step 9: Commit**

```bash
git add docker-compose.yml .env.example apps/api/Dockerfile.dev apps/web/Dockerfile.dev
git commit -m "Se agrega docker-compose con web, api, postgres y redis"
```

---

## Task 10: Configurar GitHub Actions CI (con Lighthouse)

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.lighthouserc.json` (raíz, configura el umbral de Accessibility ≥ 95)

- [ ] **Step 1: Crear `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  verify:
    name: Lint, typecheck, test, build
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 10.0.0

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Lint
        run: pnpm lint

      - name: Typecheck
        run: pnpm typecheck

      - name: Test
        run: pnpm test

      - name: Build
        run: pnpm build

  lighthouse:
    name: Lighthouse CI (accesibilidad)
    runs-on: ubuntu-latest
    needs: verify
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 10.0.0

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build web
        run: pnpm --filter @warachikuy/web build

      - name: Run Lighthouse CI
        uses: treosh/lighthouse-ci-action@v12
        with:
          configPath: .lighthouserc.json
          uploadArtifacts: true
          temporaryPublicStorage: true
```

Y crear el archivo de configuración de Lighthouse CI en la raíz como `.lighthouserc.json`:

```json
{
  "ci": {
    "collect": {
      "staticDistDir": "./apps/web/dist",
      "numberOfRuns": 1
    },
    "assert": {
      "preset": "lighthouse:no-pwa",
      "assertions": {
        "categories:accessibility": ["error", { "minScore": 0.95 }],
        "categories:performance": ["warn", { "minScore": 0.7 }]
      }
    },
    "upload": {
      "target": "temporary-public-storage"
    }
  }
}
```

Esto enforza el umbral RNF-08 (Accessibility ≥ 95) y reporta performance como warning (más laxo en F0 porque no hay todavía la app real).

- [ ] **Step 2: Commit y push para disparar la CI**

```bash
git add .github/workflows/ci.yml .lighthouserc.json
git commit -m "Se agrega CI de GitHub Actions con verificacion y Lighthouse"
git push -u origin chore/f0-setup
```

- [ ] **Step 3: Verificar que el workflow corre en GitHub**

Abrir https://github.com/akobo05/simulador-entrevistas-adaptativo/actions y confirmar que aparecen dos jobs: `verify` (lint/typecheck/test/build) y `lighthouse` (auditoría de accesibilidad sobre el build del frontend).

Expected: ✅ `verify` en ~3-5 min, ✅ `lighthouse` en ~2-3 min adicionales.

Si `verify` falla, leer los logs, corregir localmente, hacer commit y push. Si `lighthouse` falla por accesibilidad, leer el reporte (link en el output del job) y corregir el componente afectado.

---

## Task 11: Crear el tablero de GitHub Projects v2

**Files:**
- No se crean archivos; se configuran *issues*, *labels*, *milestones* y el Project board vía `gh` CLI.

- [ ] **Step 1: Crear labels de módulo y fase**

```bash
gh label create "module:frontend" --color "0E8A16" --description "Trabajo del paquete apps/web"
gh label create "module:backend" --color "1D76DB" --description "Trabajo del paquete apps/api"
gh label create "module:voice" --color "5319E7" --description "Trabajo del paquete voice-pipeline"
gh label create "module:shared" --color "FBCA04" --description "Trabajo de shared-types"
gh label create "module:infra" --color "B60205" --description "Trabajo de infraestructura, CI, Docker"
gh label create "phase:F0" --color "C5DEF5" --description "Setup foundational"
gh label create "phase:F1" --color "BFD4F2" --description "Entrevista individual basica"
gh label create "phase:F2" --color "D4C5F9" --description "Personalizacion y adaptacion"
gh label create "phase:F3" --color "F9D0C4" --description "Peer mock"
gh label create "phase:F4" --color "FEF2C0" --description "Gamificacion"
gh label create "phase:F5" --color "BFE5BF" --description "Accesibilidad y pulido"
gh label create "phase:F6" --color "D1BCFE" --description "Documentacion y demo"
gh label create "needs-review" --color "E99695" --description "PR requiere revision antes de mergear"
gh label create "spike" --color "C2E0C6" --description "Investigacion timeboxed"
```

Si alguna ya existe, el comando dará error y se puede ignorar.

- [ ] **Step 2: Crear milestones (uno por fase)**

```bash
gh api repos/:owner/:repo/milestones -f title='F0 Setup' -f description='Esqueleto del monorepo, CI y Project board'
gh api repos/:owner/:repo/milestones -f title='F1 Entrevista individual' -f description='Sala virtual con avatar LLM, voz, aura minima'
gh api repos/:owner/:repo/milestones -f title='F2 Personalizacion' -f description='Historial, plan de mejora, IRT'
gh api repos/:owner/:repo/milestones -f title='F3 Peer mock' -f description='WebRTC, observador instrumentado, comentarios anclados'
gh api repos/:owner/:repo/milestones -f title='F4 Gamificacion' -f description='Rangos, badges, ligas'
gh api repos/:owner/:repo/milestones -f title='F5 Accesibilidad y pulido' -f description='WCAG 2.2 AA, auth, asistente'
gh api repos/:owner/:repo/milestones -f title='F6 Documentacion y demo' -f description='Manual, video, presentacion'
```

- [ ] **Step 3: Crear el Project board**

```bash
gh project create --owner @me --title "Warachikuy — Roadmap"
```

Anotar el número del project que devuelve (por ejemplo `1`).

- [ ] **Step 4: Verificar el board**

```bash
gh project list --owner @me
```

Confirmar que aparece "Warachikuy — Roadmap" y anotar su URL.

- [ ] **Step 5: Crear issues seed para F1**

Crear los issues iniciales que corresponden a la próxima fase (cada uno de los desarrolladores recibirá los suyos):

```bash
gh issue create --title "[F1] Implementar contratos completos en shared-types" \
  --label "module:shared,phase:F1" \
  --milestone "F1 Entrevista individual" \
  --assignee @me \
  --body "Implementar todos los schemas Zod definidos en docs/superpowers/specs/2026-05-05-arquitectura-base-y-f1-design.md seccion 3."

gh issue create --title "[F1] Endpoint POST /sessions" \
  --label "module:backend,phase:F1" \
  --milestone "F1 Entrevista individual" \
  --assignee @me \
  --body "Crear sesion de entrevista con industria, rol y nivel. Devolver sessionId, websocketUrl y token."

gh issue create --title "[F1] WebSocket /sessions/:id/ws" \
  --label "module:backend,phase:F1" \
  --milestone "F1 Entrevista individual" \
  --body "Conexion WebSocket con validacion Zod de mensajes entrantes y salientes."

gh issue create --title "[F1] Sala virtual con avatar 3D" \
  --label "module:frontend,phase:F1" \
  --milestone "F1 Entrevista individual" \
  --body "Implementar la pantalla principal con Three.js: avatar estilizado en el centro, aura procedural alrededor."

gh issue create --title "[F1] Pipeline STT con Web Speech API" \
  --label "module:voice,phase:F1" \
  --milestone "F1 Entrevista individual" \
  --body "Captura de audio del candidato, transcripcion continua con deteccion de fin de turno."

gh issue create --title "[F1] Calculo de metricas del aura en cliente" \
  --label "module:voice,phase:F1" \
  --milestone "F1 Entrevista individual" \
  --body "MediaPipe Web para fluency, eye_contact y speech_rate. Throttle a 4 Hz."
```

Asignar los issues a los responsables corresponde al equipo (cada uno se autoasigna o el líder los reparte).

- [ ] **Step 6: Documentar el link del board en el README** (se hace en Task 12)

---

## Task 12: Actualizar el README raíz y verificación final

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Reemplazar el contenido del `README.md` raíz**

```markdown
# Simulador de Entrevistas Laborales Adaptativo

Reclutador basado en LLM que adapta sus preguntas a la industria y nivel del candidato, analizando en tiempo real la voz (fluidez, muletillas, pausas, tono) y el lenguaje corporal por webcam (contacto visual, postura, gestualidad). Habilita *mock interviews* colaborativas entre estudiantes con roles intercambiables.

**Repositorio:** https://github.com/akobo05/simulador-entrevistas-adaptativo

## Curso

- **Universidad:** Universidad Nacional de Ingeniería
- **Curso:** CC451 — Interacción Humano Computadora
- **Ciclo:** 2026-I
- **Profesor:** Ciro Núñez Iturri

## Integrantes

| Nombre | Iniciales |
|---|---|
| Aaron Davila Santos | AD |
| Max Serrano Arostegui | MS |
| Walter Poma Navarro | WP |

## Estructura del repositorio

```
.
├── apps/
│   ├── web/                 # Frontend PWA (React + Vite + Three.js)
│   └── api/                 # Backend (Node + Fastify + Gemini)
├── packages/
│   ├── shared-types/        # Contratos JSON con Zod
│   └── voice-pipeline/      # STT, TTS y MediaPipe
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

- [`docs/informe-pc02/main.pdf`](docs/informe-pc02/main.pdf) — informe de avance PC02 (PDF compilado).
- [`docs/informe-pc02/`](docs/informe-pc02/) — fuentes LaTeX del informe, prompts versionados y figuras.
- [`docs/prototype/recorrido-prototipo.mp4`](docs/prototype/recorrido-prototipo.mp4) — recorrido del prototipo de fidelidad media (video).
- [Prototipo interactivo en Figma](https://www.figma.com/proto/hZttO5TGjofestkKuw73nY/Warachikuy?node-id=2014-3672&p=f&t=AekkWhjgguGksNPE-1&scaling=scale-down&content-scaling=fixed&page-id=0%3A1&starting-point-node-id=2014%3A3604) — flujo navegable del prototipo de fidelidad media.
- [`docs/superpowers/specs/`](docs/superpowers/specs/) — especificaciones técnicas por fase.
- [`docs/superpowers/plans/`](docs/superpowers/plans/) — planes de implementación detallados.

## Tablero del proyecto

Roadmap, issues y avance por fase: [Warachikuy — Roadmap](https://github.com/users/akobo05/projects/<NUMERO>).

> Reemplazar `<NUMERO>` con el número devuelto por `gh project list` tras crear el board.

## Estado

Fase F0 completada (setup del monorepo). En curso: F1 — Entrevista individual básica.

## Licencia

Distribuido bajo licencia [MIT](LICENSE).
```

- [ ] **Step 2: Verificación end-to-end**

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected: los 5 comandos pasan sin errores.

- [ ] **Step 3: Verificar que Docker Compose levanta todo**

```bash
docker compose up --build -d
sleep 10
curl http://localhost:3000/health
curl -I http://localhost:5173
docker compose down
```

Expected: `/health` devuelve `{"status":"ok"}`, frontend HTTP 200.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "Se actualiza el README con la estructura del monorepo y como arrancar"
```

- [ ] **Step 5: Push final**

```bash
git push
```

Expected: la CI se dispara en GitHub Actions y termina en verde.

- [ ] **Step 6: Abrir Pull Request**

```bash
gh pr create --base main --head chore/f0-setup \
  --title "Se incorpora el setup base del monorepo (F0)" \
  --body "$(cat <<'EOF'
## Resumen

Se incorpora la base tecnica del monorepo: workspace pnpm con apps (web y api) y packages (shared-types y voice-pipeline), Docker Compose para desarrollo local, CI de GitHub Actions, hooks de pre-commit con Husky y lint-staged, y tablero de GitHub Projects configurado para el roadmap.

## Que se agrego

- Workspace pnpm con cuatro paquetes inicializados y compilables.
- apps/api: servidor Fastify con endpoint /health y validacion de variables de entorno.
- apps/web: aplicacion React + Vite con componente App de smoke test.
- packages/shared-types: paquete vacio listo para los contratos de F1.
- packages/voice-pipeline: paquete vacio listo para el pipeline de F1.
- Prettier y ESLint configurados a nivel raiz.
- Husky + lint-staged corren Prettier y ESLint en cada commit.
- Docker Compose levanta web, api, postgres y redis.
- GitHub Actions CI: lint, typecheck, test y build en cada PR.
- Labels, milestones y Project board creados via gh CLI.

## Resultado

Los tres desarrolladores pueden clonar el repo, correr docker compose up y empezar F1 sin bloqueos. La estructura cumple lo definido en docs/superpowers/specs/2026-05-05-arquitectura-base-y-f1-design.md.
EOF
)"
```

- [ ] **Step 7: Esperar CI verde y mergear**

Verificar que la CI pasa, luego:

```bash
gh pr merge --merge --delete-branch
```

Después actualizar `main` localmente:

```bash
git switch main
git pull
```

---

## Task 13: Configurar despliegue continuo (Vercel + Render + Neon)

Esta tarea es **mayormente manual** y se ejecuta a través de las dashboards web de cada proveedor. Se incluye para completar el setup definido en la sección 5 del spec. Puede diferirse hasta que F1 tenga al menos un endpoint y una pantalla con contenido real, pero se documenta aquí para tenerlo a la mano.

**Pre-requisitos:** cuentas creadas en Vercel, Render y Neon (todas free tier). Las tres permiten signup con la cuenta de GitHub.

- [ ] **Step 1: Crear base de datos en Neon**

1. Entrar a https://console.neon.tech.
2. Crear un nuevo proyecto: nombre `warachikuy`, region cercana (us-east).
3. Copiar la *connection string* completa (formato `postgresql://user:pass@host/db?sslmode=require`).
4. Guardar como `NEON_DATABASE_URL` en un lugar seguro (no commitearla).

- [ ] **Step 2: Desplegar backend en Render**

1. Entrar a https://dashboard.render.com.
2. New → Web Service → conectar el repositorio `akobo05/simulador-entrevistas-adaptativo`.
3. Configurar:
   - Name: `warachikuy-api`
   - Region: cercana al equipo
   - Branch: `main`
   - Root Directory: dejar vacío
   - Runtime: Docker
   - Dockerfile path: `apps/api/Dockerfile.dev` (temporal; se reemplazará por un Dockerfile de producción en F5 o F6)
   - Plan: Free
4. En Environment, agregar:
   - `PORT` = `3000`
   - `DATABASE_URL` = la cadena de Neon del Step 1
   - `REDIS_URL` = un Redis externo (Upstash free tier — crear cuenta en https://upstash.com y copiar la URL)
   - `GEMINI_API_KEY` = la clave compartida del equipo para producción
5. Click "Create Web Service". Render hace `git pull` y `docker build`. El primer deploy puede tardar ~5 minutos.

- [ ] **Step 3: Desplegar frontend en Vercel**

1. Entrar a https://vercel.com/new.
2. Importar el repositorio `akobo05/simulador-entrevistas-adaptativo`.
3. Configurar:
   - Framework Preset: Vite
   - Root Directory: `apps/web`
   - Build Command: `cd ../.. && pnpm install && pnpm --filter @warachikuy/web build`
   - Output Directory: `apps/web/dist`
   - Install Command: dejar vacío (lo cubre el build command)
4. En Environment Variables, agregar:
   - `VITE_API_URL` = la URL pública del backend de Render (por ejemplo `https://warachikuy-api.onrender.com`)
5. Click "Deploy". Vercel construye y despliega.

- [ ] **Step 4: Verificar end-to-end**

1. Abrir la URL pública del frontend (por ejemplo `https://warachikuy.vercel.app`).
2. La página debe mostrar el título "Warachikuy".
3. Abrir la URL pública del backend `/health` (por ejemplo `https://warachikuy-api.onrender.com/health`).
4. Debe responder `{"status":"ok"}`. El primer request puede tardar 1-2 segundos si Render despertó el servicio.

- [ ] **Step 5: Configurar deploy automático en merge a `main`**

Vercel y Render lo activan por defecto al conectar el repo. Verificar:

1. En Vercel → Project → Settings → Git: confirmar que "Production Branch" es `main`.
2. En Render → Service → Settings: confirmar que "Auto-Deploy" está en `Yes` y la rama es `main`.

A partir de aquí, cada merge a `main` dispara despliegue automático en ambos proveedores.

- [ ] **Step 6: Documentar URLs en el README**

Editar la sección "Estado" del `README.md` agregando:

```markdown
- Frontend desplegado: https://warachikuy.vercel.app
- Backend desplegado: https://warachikuy-api.onrender.com
```

Hacer commit:

```bash
git add README.md
git commit -m "Se documentan los URLs publicos de despliegue"
git push
```

---

## Definition of Done

**Mínimo para considerar F0 cerrado (Tasks 1-12):**

- [ ] `pnpm install` desde un clon limpio funciona sin errores.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` pasan los cuatro en verde.
- [ ] `docker compose up --build` levanta los 4 servicios y `/health` responde `{"status":"ok"}`.
- [ ] La CI de GitHub Actions termina en verde en cada PR.
- [ ] El hook `pre-commit` corre Prettier + ESLint antes de cada commit.
- [ ] El tablero de GitHub Projects existe y tiene los 6 issues seed de F1 creados.
- [ ] El README de la raíz describe la estructura del monorepo y cómo arrancar el proyecto.
- [ ] La rama `chore/f0-setup` está mergeada a `main` y borrada.

**Diferible al primer feature deployable (Task 13):**

- [ ] Backend desplegado en Render con URL pública respondiendo `/health`.
- [ ] Frontend desplegado en Vercel con URL pública sirviendo la app.
- [ ] Base de datos PostgreSQL aprovisionada en Neon y conectada al backend.
- [ ] Auto-deploy activado en cada merge a `main`.
- [ ] URLs públicas documentadas en el README.

Una vez todo lo anterior está verde, el equipo puede empezar a trabajar los planes de F1 en paralelo:

- **Plan 2 — F1 shared-types** (AD)
- **Plan 3 — F1 Backend + LLM** (AD)
- **Plan 4 — F1 Frontend / sala virtual** (MS)
- **Plan 5 — F1 Voice pipeline** (WP)
- **Plan 6 — F1 Integración** (los 3)
