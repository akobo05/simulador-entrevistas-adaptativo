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

// Lista de industrias soportadas con su nombre legible. Fuente unica para el
// endpoint GET /industries y el selector del formulario (#42).
export const INDUSTRIES = [
  { id: 'backend', name: 'Backend' },
  { id: 'frontend', name: 'Frontend' },
  { id: 'data', name: 'Data Science' },
  { id: 'fullstack', name: 'Full Stack' },
] as const satisfies ReadonlyArray<{ id: Industry; name: string }>;

// Resumen publico de una sesion para GET /sessions/:id. NO incluye el token
// (secreto) ni la fase (estado interno del arco).
export const SessionSummarySchema = z.object({
  id: z.string().uuid(),
  industry: IndustrySchema,
  level: LevelSchema,
  status: SessionStatusSchema,
  turnNumber: z.number().int().nonnegative(),
  startedAt: z.number().int(),
});
export type SessionSummary = z.infer<typeof SessionSummarySchema>;
