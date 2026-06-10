import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // El paquete de voz se consume desde su codigo fuente: su worker se crea
      // con new URL('./metrics-worker.ts', import.meta.url), que en el dist
      // compilado apuntaria a un .ts inexistente. Desde src, Vite empaqueta el
      // worker como chunk propio tanto en dev como en build.
      '@warachikuy/voice-pipeline': fileURLToPath(
        new URL('../../packages/voice-pipeline/src/index.ts', import.meta.url),
      ),
    },
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
  },
});
