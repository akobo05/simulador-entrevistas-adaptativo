import { z } from 'zod';

export const IndustrySchema = z.enum(['backend', 'frontend', 'data', 'fullstack']);
export type Industry = z.infer<typeof IndustrySchema>;

export const LevelSchema = z.enum(['junior', 'mid', 'senior']);
export type Level = z.infer<typeof LevelSchema>;

export const CreateSessionRequestSchema = z.object({
  industry: IndustrySchema,
  level: LevelSchema,
});
export type CreateSessionRequest = z.infer<typeof CreateSessionRequestSchema>;

export const CreateSessionResponseSchema = z.object({
  sessionId: z.string().uuid(),
  websocketUrl: z.string().url(),
  token: z.string().regex(/^[0-9a-f]{64}$/, 'token debe ser 64 chars hex'),
});
export type CreateSessionResponse = z.infer<typeof CreateSessionResponseSchema>;

export const SessionPhaseSchema = z.enum(['warmup', 'interviewing', 'closing']);
export type SessionPhase = z.infer<typeof SessionPhaseSchema>;

export const SessionStatusSchema = z.enum(['active', 'ended', 'expired']);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const SessionStateSchema = z.object({
  id: z.string().uuid(),
  industry: IndustrySchema,
  level: LevelSchema,
  status: SessionStatusSchema,
  phase: SessionPhaseSchema,
  turnNumber: z.number().int().nonnegative(),
  startedAt: z.number().int(),
  token: z.string().regex(/^[0-9a-f]{64}$/, 'token debe ser 64 chars hex'),
});
export type SessionState = z.infer<typeof SessionStateSchema>;
