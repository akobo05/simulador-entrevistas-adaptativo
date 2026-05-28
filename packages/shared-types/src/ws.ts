import { z } from 'zod';
import { AuraStateSchema } from './metrics';
import { TurnEventSchema, VoiceCommandSchema } from './turns';
import { InterviewerMessageSchema, CandidateTranscriptSchema } from './llm';

// ── Client → Server ──────────────────────────────────────────────────────────

// metrics.update: máximo 4 Hz (un mensaje cada 250 ms), snapshot completo
export const ClientToServerMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('metrics.update'), payload: AuraStateSchema }),
  z.object({ type: z.literal('turn.event'), payload: TurnEventSchema }),
  z.object({ type: z.literal('voice.command'), payload: VoiceCommandSchema }),
  z.object({ type: z.literal('candidate.transcript'), payload: CandidateTranscriptSchema }),
]);
export type ClientToServerMessage = z.infer<typeof ClientToServerMessageSchema>;

// ── Server → Client ──────────────────────────────────────────────────────────

export const ServerToClientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('interviewer.message'), payload: InterviewerMessageSchema }),
  z.object({
    type: z.literal('session.state'),
    payload: z.object({
      sessionId: z.string().uuid(),
      phase: z.enum(['warmup', 'interviewing', 'closing']),
      turnNumber: z.number().int().nonnegative(),
    }),
  }),
  z.object({
    type: z.literal('error'),
    payload: z.object({
      code: z.enum(['llm_unavailable', 'invalid_message', 'session_expired']),
      message: z.string(),
      recoverable: z.boolean(),
    }),
  }),
]);
export type ServerToClientMessage = z.infer<typeof ServerToClientMessageSchema>;

// Codigos de cierre WebSocket. Backend y frontend importan este objeto
// para no usar magic numbers. Los <4000 son del RFC 6455; los >=4000 son
// del rango de aplicacion (4000-4999) y los definimos nosotros.
export const WS_CLOSE_CODES = {
  NORMAL: 1000,
  POLICY_VIOLATION: 1008,
  KEEPALIVE_FAILURE: 1011,
  SESSION_REPLACED: 4000,
  SESSION_EXPIRED: 4001,
} as const;

export type WsCloseCode = (typeof WS_CLOSE_CODES)[keyof typeof WS_CLOSE_CODES];
