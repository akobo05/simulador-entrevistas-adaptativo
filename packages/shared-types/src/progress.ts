import { z } from 'zod';
import { CompetencyNameSchema } from './llm';

// Un punto de la serie por competencia: el score de una sesion en el tiempo.
export const ProgressPointSchema = z.object({
  at: z.number().int(), // ended_at en epoch ms
  score: z.number().min(0).max(100).nullable(),
});
export type ProgressPoint = z.infer<typeof ProgressPointSchema>;

// La evolucion de una competencia a lo largo del historial.
export const CompetencyProgressSchema = z.object({
  name: CompetencyNameSchema,
  points: z.array(ProgressPointSchema), // cronologico ascendente = sparkline
  latest: z.number().min(0).max(100).nullable(),
  average: z.number().min(0).max(100).nullable(), // media de los no-null, redondeada
  delta: z.number().nullable(), // latest - anterior no-null; null si <2 no-null
});
export type CompetencyProgress = z.infer<typeof CompetencyProgressSchema>;

// Resumen longitudinal del candidato para /progress. Solo datos derivables del
// historial (#51); XP/nivel/badges/racha son F4 (#50).
export const ProgressSummarySchema = z.object({
  candidateId: z.string().uuid(),
  sessionCount: z.number().int().nonnegative(), // sesiones con plan
  firstSessionAt: z.number().int().nullable(),
  lastSessionAt: z.number().int().nullable(),
  competencies: z.array(CompetencyProgressSchema), // siempre las 4, orden fijo
});
export type ProgressSummary = z.infer<typeof ProgressSummarySchema>;
