import { useEffect, useRef, useState, useCallback } from 'react';
import {
  RoomToClientMessageSchema,
  type RoomToServerMessage,
  type RoomRole,
} from '@warachikuy/shared-types';

export interface RoomPeer {
  peerId: string;
  role: RoomRole;
}

interface UseRoomSocketOptions {
  roomId: string;
  role: RoomRole;
  wsBaseUrl?: string;
  onSignalOffer?: (from: string, description: { type: string; sdp: string }) => void;
  onSignalAnswer?: (from: string, description: { type: string; sdp: string }) => void;
  onIceCandidate?: (from: string, candidate: RTCIceCandidateInit) => void;
  onPeerJoined?: (peer: RoomPeer) => void;
  onPeerLeft?: (peerId: string) => void;
}

interface UseRoomSocketReturn {
  status: 'connecting' | 'connected' | 'disconnected';
  peerId: string | null;
  participants: RoomPeer[];
  send: (msg: RoomToServerMessage) => void;
}

export function useRoomSocket({
  roomId,
  role,
  wsBaseUrl,
  onSignalOffer,
  onSignalAnswer,
  onIceCandidate,
  onPeerJoined,
  onPeerLeft,
}: UseRoomSocketOptions): UseRoomSocketReturn {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [peerId, setPeerId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<RoomPeer[]>([]);
  const socketRef = useRef<WebSocket | null>(null);
  const activeRef = useRef(true);
  const callbacksRef = useRef({
    onSignalOffer,
    onSignalAnswer,
    onIceCandidate,
    onPeerJoined,
    onPeerLeft,
  });
  callbacksRef.current = {
    onSignalOffer,
    onSignalAnswer,
    onIceCandidate,
    onPeerJoined,
    onPeerLeft,
  };

  const baseUrl =
    wsBaseUrl ??
    (import.meta.env.VITE_WS_BASE_URL as string | undefined) ??
    `ws://${location.host}`;
  const wsUrl = `${baseUrl}/v1/rooms/${roomId}/ws`;

  const send = useCallback((msg: RoomToServerMessage) => {
    const sock = socketRef.current;
    if (sock?.readyState === WebSocket.OPEN) {
      sock.send(JSON.stringify(msg));
    }
  }, []);

  useEffect(() => {
    activeRef.current = true;
    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

    socket.onopen = () => {
      if (!activeRef.current) {
        socket.close();
        return;
      }
      setStatus('connected');
      socket.send(JSON.stringify({ type: 'room.join', payload: { role } }));
    };

    socket.onmessage = (event) => {
      if (!activeRef.current) return;
      try {
        const json = JSON.parse(event.data);
        const parsed = RoomToClientMessageSchema.safeParse(json);
        if (!parsed.success) return;
        const msg = parsed.data;
        const cb = callbacksRef.current;

        switch (msg.type) {
          case 'room.joined':
            setPeerId(msg.payload.peerId);
            setParticipants(msg.payload.participants);
            break;
          case 'room.participants':
            setParticipants(msg.payload.participants);
            break;
          case 'room.peer-joined':
            setParticipants((prev) => {
              if (prev.some((p) => p.peerId === msg.payload.peerId)) return prev;
              return [...prev, msg.payload];
            });
            cb.onPeerJoined?.(msg.payload);
            break;
          case 'room.peer-left':
            setParticipants((prev) => prev.filter((p) => p.peerId !== msg.payload.peerId));
            cb.onPeerLeft?.(msg.payload.peerId);
            break;
          case 'signal.offer':
            cb.onSignalOffer?.(msg.payload.from, msg.payload.description);
            break;
          case 'signal.answer':
            cb.onSignalAnswer?.(msg.payload.from, msg.payload.description);
            break;
          case 'signal.ice-candidate':
            cb.onIceCandidate?.(msg.payload.from, msg.payload.candidate);
            break;
          case 'room.error':
            console.error('room error:', msg.payload);
            break;
        }
      } catch {
        // ignore malformed messages
      }
    };

    socket.onclose = () => {
      if (!activeRef.current) return;
      setStatus('disconnected');
      setPeerId(null);
      setParticipants([]);
    };

    socket.onerror = () => {
      if (!activeRef.current) return;
      setStatus('disconnected');
    };

    return () => {
      activeRef.current = false;
      socket.close();
    };
  }, [wsUrl, role]);

  return { status, peerId, participants, send };
}
