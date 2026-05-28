import type { FastifyInstance } from 'fastify';
import type { SessionState } from '@warachikuy/shared-types';
import { validateUpgrade } from '../ws/auth.js';
import { attachHandlers } from '../ws/handler.js';
import { apiError } from '../errors.js';

export async function registerSessionsWsRoute(server: FastifyInstance): Promise<void> {
  server.get<{
    Params: { sessionId: string };
    Querystring: { token?: string };
  }>(
    '/v1/sessions/:sessionId/ws',
    {
      websocket: true,
      // El preValidation corre en HTTP normal antes del upgrade. Si
      // rechazamos aca, el cliente recibe un 4xx HTTP estandar (curl-able)
      // y no se inicia el handshake WebSocket.
      preValidation: async (req, reply) => {
        const { sessionId } = req.params as { sessionId: string };
        const { token } = req.query as { token?: string };
        const result = await validateUpgrade(server.redis, sessionId, token);
        if (!result.ok) {
          return reply.code(result.status).send(apiError(result.code, messageFor(result.code)));
        }
        // Guardamos el state validado en el request para que el handler lo
        // recupere sin tener que volver a leer Redis.
        (req as unknown as { wsState: SessionState }).wsState = result.state;
      },
    },
    (socket, req) => {
      const state = (req as unknown as { wsState: SessionState }).wsState;
      const log = req.log.child({ sessionId: state.id, ws: true });
      attachHandlers({
        socket,
        log,
        redis: server.redis,
        connections: server.connections,
        state,
      });
    },
  );
}

function messageFor(code: string): string {
  switch (code) {
    case 'invalid_input':
      return 'Token invalido o ausente';
    case 'session_not_found':
      return 'Sesion no encontrada';
    case 'invalid_token':
      return 'Token no coincide con la sesion';
    case 'session_expired':
      return 'Sesion ya no esta activa';
    default:
      return 'Error interno';
  }
}
