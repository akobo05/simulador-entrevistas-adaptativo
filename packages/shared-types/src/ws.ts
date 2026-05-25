import { z } from 'zod';
import { AuraMetricSchema } from './metrics';

// ── Client → Server ──────────────────────────────────────────────────────────

export const TurnEventSchema = z.object({
  type: z.literal('turn.event'),
  event: z.enum(['start', 'end']),
  sessionId: z.string(),
});

export const VoiceCommandSchema = z.object({
  type: z.literal('voice.command'),
  command: z.enum(['pause', 'resume', 'end_session']),
});

export const CandidateTranscriptSchema = z.object({
  type: z.literal('candidate.transcript'),
  text: z.string(),
  isFinal: z.boolean(),
  timestamp: z.number().int(),
});
export type CandidateTranscript = z.infer<typeof CandidateTranscriptSchema>;

// metrics.update throttled at 4 Hz max on the sender side
export const MetricsUpdateSchema = z.object({
  type: z.literal('metrics.update'),
  metrics: z.array(AuraMetricSchema),
  timestamp: z.number().int(),
});

export const ClientToServerMessageSchema = z.discriminatedUnion('type', [
  MetricsUpdateSchema,
  TurnEventSchema,
  VoiceCommandSchema,
  CandidateTranscriptSchema,
]);
export type ClientToServerMessage = z.infer<typeof ClientToServerMessageSchema>;

// ── Server → Client ──────────────────────────────────────────────────────────

export const InterviewerMessageSchema = z.object({
  type: z.literal('interviewer.message'),
  text: z.string(),
  audioUrl: z.string().optional(),
  timestamp: z.number().int(),
});

export const SessionStateSchema = z.object({
  type: z.literal('session.state'),
  state: z.enum(['waiting', 'active', 'paused', 'ended']),
  sessionId: z.string(),
});

export const WsErrorSchema = z.object({
  type: z.literal('error'),
  code: z.string(),
  message: z.string(),
});

export const ServerToClientMessageSchema = z.discriminatedUnion('type', [
  InterviewerMessageSchema,
  SessionStateSchema,
  WsErrorSchema,
]);
export type ServerToClientMessage = z.infer<typeof ServerToClientMessageSchema>;
