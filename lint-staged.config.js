export default {
  '*.{ts,tsx}': [
    'eslint --fix',
    'prettier --write',
    // Verificación de tipos sobre el workspace completo. Es la forma
    // mas segura porque TypeScript necesita el contexto cruzado entre
    // paquetes para validar imports tipados.
    //
    // TODO (revisar al inicio de F2): cuando el codebase crezca con
    // MediaPipe, Three.js y los esquemas Drizzle, este paso puede
    // tardar mas de 10s y romper el "flow" del desarrollador. Opciones
    // de mejora a evaluar entonces:
    //   1. Mover `pnpm -r typecheck` solo a CI (mas rapido en local,
    //      mas tarde para atrapar errores).
    //   2. Scoping por paquete afectado (parsear las rutas staged y
    //      correr typecheck solo en el workspace correspondiente).
    //   3. tsc-files: tiene limitaciones con monorepos pero conviene
    //      reevaluarlo si su soporte mejora.
    // Decision intencional para F0: la seguridad de tipos en cada
    // commit vale el costo actual (~3 s).
    () => 'pnpm -r typecheck',
  ],
  '*.{js,jsx,json,md,yml,yaml}': ['prettier --write'],
};
