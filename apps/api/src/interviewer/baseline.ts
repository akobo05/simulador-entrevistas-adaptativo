import type { CompetencyName } from '@warachikuy/shared-types';
import type { InterviewSessionRow } from '../db/schema.js';
import { buildProgressSummary } from './progress-aggregator.js';

export interface CompetencyBaseline {
  name: CompetencyName;
  // Promedio previo redondeado de la competencia; null si nunca se midio.
  priorAverage: number | null;
}

export interface CoachBaseline {
  // Sesiones previas con plan (las que componen la linea base).
  priorSessionCount: number;
  // Siempre las 4 competencias, en el orden fijo del enum.
  competencies: CompetencyBaseline[];
}

// Deriva la linea base del candidato reusando la agregacion longitudinal (#51).
// Las filas que llegan son las previas (plan no null); la sesion actual no esta
// entre ellas porque al generarse el plan su columna plan todavia es null.
// Funcion pura: no toca DB ni Fastify.
export function buildBaseline(
  candidateId: string,
  priorRows: InterviewSessionRow[],
): CoachBaseline {
  const summary = buildProgressSummary(candidateId, priorRows);
  return {
    priorSessionCount: summary.sessionCount,
    competencies: summary.competencies.map((c) => ({ name: c.name, priorAverage: c.average })),
  };
}
