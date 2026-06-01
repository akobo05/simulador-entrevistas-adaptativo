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

// Una intervencion en el historial de la conversacion. El backend lo persiste
// en Redis y lo reusa el plan de mejora (#40). 'candidate' = respuesta del
// usuario, 'interviewer' = pregunta del LLM.
export const ConversationEntrySchema = z.object({
  role: z.enum(['interviewer', 'candidate']),
  text: z.string(),
  timestamp: z.number().int(),
});
export type ConversationEntry = z.infer<typeof ConversationEntrySchema>;

export const CompetencyNameSchema = z.enum(['fluency', 'eye_contact', 'speech_rate', 'content']);
export type CompetencyName = z.infer<typeof CompetencyNameSchema>;

export const PlanCompetencySchema = z.object({
  name: CompetencyNameSchema,
  score: z.number().min(0).max(100).nullable(), // null si no se midio
  comment: z.string(),
});
export type PlanCompetency = z.infer<typeof PlanCompetencySchema>;

export const PlanExerciseSchema = z.object({
  title: z.string(),
  description: z.string(),
});
export type PlanExercise = z.infer<typeof PlanExerciseSchema>;

export const ImprovementPlanSchema = z.object({
  planId: z.string().uuid(),
  sessionId: z.string().uuid(),
  summary: z.string(),
  competencies: z.array(PlanCompetencySchema),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  exercises: z.array(PlanExerciseSchema),
  generatedAt: z.number().int(),
});
export type ImprovementPlan = z.infer<typeof ImprovementPlanSchema>;
