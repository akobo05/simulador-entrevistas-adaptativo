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
