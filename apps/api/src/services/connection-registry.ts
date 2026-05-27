import type { WebSocket } from 'ws';
import { WS_CLOSE_CODES } from '@warachikuy/shared-types';

// Singleton por proceso. Garantiza el invariante "una conexion por
// sessionId". Vive solo en memoria: F1 corre en una sola instancia
// (docker-compose, MVP academico). Si en F5 escalamos a multiples
// replicas habra que migrar a Redis con pub/sub para kick remoto.
export class ConnectionRegistry {
  private conns = new Map<string, WebSocket>();

  register(sessionId: string, socket: WebSocket): void {
    const prev = this.conns.get(sessionId);
    if (prev) {
      // Cerramos la conexion previa con code 4000 antes de aceptar la
      // nueva. El frontend tiene mapeado este code y NO debe reconectar.
      prev.close(WS_CLOSE_CODES.SESSION_REPLACED, 'session_replaced');
    }
    this.conns.set(sessionId, socket);
  }

  unregister(sessionId: string, socket: WebSocket): void {
    // Solo borra si el socket actual coincide. Esto protege la race en la
    // que un register() reemplaza la entrada y el unregister() tardio del
    // socket viejo borraria la entrada del nuevo.
    if (this.conns.get(sessionId) === socket) {
      this.conns.delete(sessionId);
    }
  }

  get(sessionId: string): WebSocket | undefined {
    return this.conns.get(sessionId);
  }

  size(): number {
    return this.conns.size;
  }
}
