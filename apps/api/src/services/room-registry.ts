import type { WebSocket } from 'ws';
import type { RoomRole } from '@warachikuy/shared-types';

interface RoomPeer {
  peerId: string;
  role: RoomRole;
  socket: WebSocket;
}

interface Room {
  id: string;
  peers: Map<string, RoomPeer>;
}

export class RoomRegistry {
  private rooms = new Map<string, Room>();

  join(
    roomId: string,
    peerId: string,
    role: RoomRole,
    socket: WebSocket,
  ): { participants: Array<{ peerId: string; role: RoomRole }> } {
    let room = this.rooms.get(roomId);
    if (!room) {
      room = { id: roomId, peers: new Map() };
      this.rooms.set(roomId, room);
    }
    room.peers.set(peerId, { peerId, role, socket });
    const participants = Array.from(room.peers.values()).map((p) => ({
      peerId: p.peerId,
      role: p.role,
    }));
    return { participants };
  }

  leave(roomId: string, peerId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.peers.delete(peerId);
    if (room.peers.size === 0) {
      this.rooms.delete(roomId);
    }
  }

  getPeers(roomId: string, excludePeerId?: string): RoomPeer[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    return Array.from(room.peers.values()).filter((p) => p.peerId !== excludePeerId);
  }

  getPeer(roomId: string, peerId: string): RoomPeer | undefined {
    const room = this.rooms.get(roomId);
    return room?.peers.get(peerId);
  }
}
