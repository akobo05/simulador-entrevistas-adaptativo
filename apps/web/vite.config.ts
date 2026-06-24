import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => ({
  plugins: [react()],
  // Pre-bundlea @mediapipe/tasks-vision al arrancar el dev server. El worker del
  // aura la carga de forma diferida (al prender la camara); sin esto, Vite la
  // optimiza recien en ese momento y RECARGA la pagina ("new dependencies
  // optimized, reloading"), lo que se ve como un refresco al dar permisos.
  optimizeDeps: {
    include: ['@mediapipe/tasks-vision'],
  },
  resolve: {
    alias: {
      // El paquete de voz se consume desde su codigo fuente: MediaPipe corre en
      // el hilo principal (no hay worker), asi que Vite no necesita empaquetar
      // ningun chunk de worker. El alias permite importar los tipos TS directamente.
      '@warachikuy/voice-pipeline': fileURLToPath(
        new URL('../../packages/voice-pipeline/src/index.ts', import.meta.url),
      ),
    },
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/v1': {
        target: 'ws://localhost:3000',
        ws: true,
      },
    },
  },
}));
