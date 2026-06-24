import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Funcion para distinguir dev (serve) de build via `command`.
export default defineConfig(({ command }) => ({
  plugins: [react()],
  define: {
    // Fuente del WASM de MediaPipe para el worker del aura. En dev (serve) se usa
    // el CDN: MediaPipe hace import() dinamico del loader y Vite DEV no permite
    // importar /public como modulo, pero si deja pasar import() a URLs http. En
    // build se usa el local /mediapipe-wasm (copiado por copy:wasm), sin CDN.
    __MEDIAPIPE_WASM_URL__: JSON.stringify(
      command === 'serve'
        ? 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
        : '/mediapipe-wasm',
    ),
  },
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
