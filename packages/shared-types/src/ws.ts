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
