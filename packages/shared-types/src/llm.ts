import { z } from 'zod';

export const InterviewerMessageSchema = z.object({
  sessionId: z.string().uuid(),
  text: z.string().min(1),
  intent: z.enum(['question', 'followup', 'clarification', 'closing']),
  audioUrl: z.string().url().optional(), // poblado solo si se usa TTS de IA
  timestamp: z.number().int(),
});
export type InterviewerMessage = z.infer<typeof InterviewerMessageSchema>;

export const CandidateTranscriptSchema = z.object({
  sessionId: z.string().uuid(),
  text: z.string(),
  isFinal: z.boolean(), // true cuando el STT confirma el fin del turno
  timestamp: z.number().int(),
});
export type CandidateTranscript = z.infer<typeof CandidateTranscriptSchema>;
