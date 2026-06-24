import type { WebSocket } from 'ws';
import type { FastifyBaseLogger } from 'fastify';
import {
  RoomToServerMessageSchema,
  type RoomToClientMessage,
  type RoomRole,
} from '@warachikuy/shared-types';
import crypto from 'node:crypto';
import type { RoomRegistry } from '../services/room-registry.js';

export interface RoomHandlerContext {
  socket: WebSocket;
  log: FastifyBaseLogger;
  rooms: RoomRegistry;
  roomId: string;
}

export function attachRoomHandlers(ctx: RoomHandlerContext): void {
  const { socket, log, rooms, roomId } = ctx;

  const peerId = crypto.randomUUID();
  let role: RoomRole | null = null;

  const send = (msg: RoomToClientMessage): void => {
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify(msg));
    }
  };

  const broadcast = (msg: RoomToClientMessage, exclude?: string): void => {
    const peers = rooms.getPeers(roomId, exclude);
    for (const p of peers) {
      if (p.socket.readyState === p.socket.OPEN) {
        p.socket.send(JSON.stringify(msg));
      }
    }
  };

  socket.on('message', (raw) => {
    let json: unknown;
    try {
      const text = Array.isArray(raw) ? Buffer.concat(raw).toString('utf8') : raw.toString();
      json = JSON.parse(text);
    } catch {
      send({ type: 'room.error', payload: { code: 'parse_error', message: 'JSON invalido' } });
      return;
    }
    const parsed = RoomToServerMessageSchema.safeParse(json);
    if (!parsed.success) {
      send({
        type: 'room.error',
        payload: { code: 'invalid_message', message: 'Mensaje invalido' },
      });
      return;
    }
    const msg = parsed.data;

    switch (msg.type) {
      case 'room.join': {
        role = msg.payload.role;
        const { participants } = rooms.join(roomId, peerId, role, socket);
        log.info(
          { roomId, peerId, role, participantCount: participants.length },
          'peer joined room',
        );
        send({
          type: 'room.joined',
          payload: { peerId, participants },
        });
        broadcast({ type: 'room.peer-joined', payload: { peerId, role } }, peerId);
        break;
      }
      case 'room.leave': {
        rooms.leave(roomId, peerId);
        log.info({ roomId, peerId }, 'peer left room');
        broadcast({ type: 'room.peer-left', payload: { peerId } });
        break;
      }
      case 'signal.offer': {
        if (!role) {
          send({
            type: 'room.error',
            payload: { code: 'not_joined', message: 'Debes unirte a la sala primero' },
          });
          return;
        }
        broadcast(
          { type: 'signal.offer', payload: { from: peerId, description: msg.payload.description } },
          peerId,
        );
        break;
      }
      case 'signal.answer': {
        if (!role) {
          send({
            type: 'room.error',
            payload: { code: 'not_joined', message: 'Debes unirte a la sala primero' },
          });
          return;
        }
        broadcast(
          {
            type: 'signal.answer',
            payload: { from: peerId, description: msg.payload.description },
          },
          peerId,
        );
        break;
      }
      case 'signal.ice-candidate': {
        if (!role) {
          send({
            type: 'room.error',
            payload: { code: 'not_joined', message: 'Debes unirte a la sala primero' },
          });
          return;
        }
        broadcast(
          {
            type: 'signal.ice-candidate',
            payload: { from: peerId, candidate: msg.payload.candidate },
          },
          peerId,
        );
        break;
      }
      case 'metrics.update': {
        if (!role) {
          send({
            type: 'room.error',
            payload: { code: 'not_joined', message: 'Debes unirte a la sala primero' },
          });
          return;
        }
        broadcast(
          {
            type: 'metrics.update',
            payload: { from: peerId, metrics: msg.payload.metrics },
          },
          peerId,
        );
        break;
      }
    }
  });

  socket.on('close', () => {
    if (role) {
      rooms.leave(roomId, peerId);
      broadcast({ type: 'room.peer-left', payload: { peerId } });
      log.info({ roomId, peerId }, 'peer disconnected from room');
    }
  });

  socket.on('error', (err) => {
    log.error({ err, roomId, peerId }, 'room ws error');
  });
}
