import { z } from 'zod';

export const TurnEventSchema = z.object({
  sessionId: z.string().uuid(),
  type: z.enum([
    'turn.candidate.start', // el candidato comenzó a hablar
    'turn.candidate.end', // STT detectó silencio
    'turn.interviewer.start', // el LLM va a hablar
    'turn.interviewer.end', // TTS terminó
    'session.pause',
    'session.resume',
    'session.terminate',
  ]),
  timestamp: z.number().int(),
});
export type TurnEvent = z.infer<typeof TurnEventSchema>;

export const VoiceCommandSchema = z.object({
  sessionId: z.string().uuid(),
  command: z.enum(['pause', 'resume', 'repeat', 'terminate']),
  timestamp: z.number().int(),
});
export type VoiceCommand = z.infer<typeof VoiceCommandSchema>;
