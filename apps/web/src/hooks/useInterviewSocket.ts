import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ServerToClientMessageSchema,
  type AuraState,
  type InterviewerMessage,
  type SessionPhase,
} from '@warachikuy/shared-types';

export interface ChatItem {
  id: string;
  role: 'interviewer' | 'candidate';
  text: string;
  intent?: InterviewerMessage['intent'];
  timestamp: number;
}

export interface InterviewSocket {
  items: ChatItem[];
  phase: SessionPhase;
  turnNumber: number;
  status: 'connecting' | 'open' | 'closed';
  lastError: { code: string; message: string; recoverable: boolean } | null;
  closing: boolean;
  sendAnswer: (text: string, isFinal?: boolean) => void;
  sendMetrics: (state: AuraState) => void;
}

export function useInterviewSocket(websocketUrl: string, sessionId: string): InterviewSocket {
  const [items, setItems] = useState<ChatItem[]>([]);
  const [phase, setPhase] = useState<SessionPhase>('warmup');
  const [turnNumber, setTurnNumber] = useState(0);
  const [status, setStatus] = useState<InterviewSocket['status']>('connecting');
  const [lastError, setLastError] = useState<InterviewSocket['lastError']>(null);
  const [closing, setClosing] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Sin URL no conectamos (caso: la pagina se monta sin sesion y redirige; el
    // hook se llama igual por las reglas de hooks). Evita new WebSocket('').
    if (!websocketUrl) return;
    const socket = new WebSocket(websocketUrl);
    socketRef.current = socket;
    // Guarda por-efecto: React 19 StrictMode monta/desmonta/monta en dev. El
    // cleanup pone active=false y cierra; los handlers de un socket ya marcado
    // para cierre se ignoran, asi no se pinta un falso "conexion perdida" ni se
    // procesan mensajes de una conexion que se esta tirando.
    let active = true;

    socket.addEventListener('open', () => {
      if (active) setStatus('open');
    });
    socket.addEventListener('message', (ev: MessageEvent) => {
      if (!active) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data));
      } catch {
        console.warn('ws: mensaje no-JSON descartado');
        return;
      }
      const result = ServerToClientMessageSchema.safeParse(parsed);
      if (!result.success) {
        console.warn('ws: mensaje invalido descartado');
        return;
      }
      const msg = result.data;
      if (msg.type === 'interviewer.message') {
        const p = msg.payload;
        setItems((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'interviewer',
            text: p.text,
            intent: p.intent,
            timestamp: p.timestamp,
          },
        ]);
        if (p.intent === 'closing') setClosing(true);
      } else if (msg.type === 'session.state') {
        setPhase(msg.payload.phase);
        setTurnNumber(msg.payload.turnNumber);
      } else if (msg.type === 'error') {
        setLastError(msg.payload);
      }
    });
    socket.addEventListener('close', () => {
      if (active) setStatus('closed');
    });
    socket.addEventListener('error', () => {
      // el evento 'close' que sigue maneja el estado; evitamos doble seteo
    });

    return () => {
      active = false;
      socket.close(1000);
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [websocketUrl]);

  const sendAnswer = useCallback(
    (text: string, isFinal = true) => {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      if (isFinal) {
        setItems((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: 'candidate', text, timestamp: Date.now() },
        ]);
      }
      socket.send(
        JSON.stringify({
          type: 'candidate.transcript',
          payload: { sessionId, text, isFinal, timestamp: Date.now() },
        }),
      );
    },
    [sessionId],
  );

  const sendMetrics = useCallback((state: AuraState) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: 'metrics.update', payload: state }));
  }, []);

  return { items, phase, turnNumber, status, lastError, closing, sendAnswer, sendMetrics };
}
