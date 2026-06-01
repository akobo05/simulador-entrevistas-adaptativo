// Variables de entorno o configuraciones globales

// URL del WebSocket. En desarrollo apunta al backend local (puerto 3000, el
// mismo que levanta el API en docker-compose). En produccion se exige
// VITE_WS_URL definida y con TLS (wss://): un ws:// en prod filtraria los
// mensajes de la entrevista en texto plano o seria bloqueado por mixed content.
function resolveWsUrl(): string {
  const fromEnv = import.meta.env.VITE_WS_URL;
  if (import.meta.env.PROD) {
    if (!fromEnv) {
      throw new Error('VITE_WS_URL es obligatoria en produccion');
    }
    if (!fromEnv.startsWith('wss://')) {
      throw new Error('VITE_WS_URL debe usar wss:// en produccion');
    }
    return fromEnv;
  }
  return fromEnv || 'ws://localhost:3000';
}

export const WS_URL = resolveWsUrl();
export const APP_NAME = 'Warachikuy';
