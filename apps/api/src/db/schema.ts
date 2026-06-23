import { pgTable, uuid, text, integer, jsonb, timestamp } from 'drizzle-orm/pg-core';
import type { ConversationEntry, ImprovementPlan } from '@warachikuy/shared-types';
import type { MetricsAggregate } from '../interviewer/metrics-aggregator.js';

// Espejo durable de una sesion terminada. Los metadatos van como columnas
// tipadas; transcript/metrics/plan como JSONB (ver spec seccion 4). candidate_id
// queda nullable reservado para la identidad del candidato (#56).
export const interviewSessions = pgTable('interview_sessions', {
  id: uuid('id').primaryKey(),
  candidateId: uuid('candidate_id'),
  industry: text('industry').notNull(),
  level: text('level').notNull(),
  status: text('status').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }).notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true, mode: 'date' }).notNull(),
  durationMs: integer('duration_ms').notNull(),
  transcript: jsonb('transcript').$type<ConversationEntry[]>().notNull(),
  metrics: jsonb('metrics').$type<MetricsAggregate>().notNull(),
  plan: jsonb('plan').$type<ImprovementPlan>(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
});

export type InterviewSessionRow = typeof interviewSessions.$inferSelect;
export type NewInterviewSession = typeof interviewSessions.$inferInsert;
