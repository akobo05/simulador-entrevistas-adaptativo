import type { FastifyInstance } from 'fastify';
import { attachRoomHandlers } from '../ws/room-handler.js';

export async function registerRoomsWsRoute(server: FastifyInstance): Promise<void> {
  server.get<{
    Params: { roomId: string };
  }>('/v1/rooms/:roomId/ws', { websocket: true }, (socket, req) => {
    const { roomId } = req.params as { roomId: string };
    const log = req.log.child({ roomId, ws: true });
    attachRoomHandlers({
      socket,
      log,
      rooms: server.rooms,
      roomId,
    });
  });
}
