import { CompetencyNameSchema } from '@warachikuy/shared-types';
import type {
  CompetencyName,
  CompetencyProgress,
  ProgressPoint,
  ProgressSummary,
} from '@warachikuy/shared-types';
import type { InterviewSessionRow } from '../db/schema.js';

// Orden fijo de las 4 competencias (el del enum de shared-types).
const COMPETENCIES = CompetencyNameSchema.options;

// Score de una competencia en la fila (null si no esta o no se midio). Las filas
// vienen de listCandidateSessions (plan no null), pero el tipo lo admite null:
// se degrada a null defensivamente.
function scoreOf(row: InterviewSessionRow, name: CompetencyName): number | null {
  const found = row.plan?.competencies.find((c) => c.name === name);
  return found ? found.score : null;
}

function buildCompetency(name: CompetencyName, rows: InterviewSessionRow[]): CompetencyProgress {
  const points: ProgressPoint[] = rows.map((r) => ({
    at: r.endedAt.getTime(),
    score: scoreOf(r, name),
  }));
  const measured = points.map((p) => p.score).filter((s): s is number => s !== null);
  const latest = measured.length > 0 ? measured[measured.length - 1]! : null;
  const average =
    measured.length > 0
      ? Math.round(measured.reduce((sum, s) => sum + s, 0) / measured.length)
      : null;
  const delta =
    measured.length >= 2 ? measured[measured.length - 1]! - measured[measured.length - 2]! : null;
  return { name, points, latest, average, delta };
}

// Agrega el historial (filas ordenadas por ended_at asc) en el resumen de
// progreso por competencia. Funcion pura: no toca DB ni Fastify.
export function buildProgressSummary(
  candidateId: string,
  rows: InterviewSessionRow[],
): ProgressSummary {
  const ended = rows.map((r) => r.endedAt.getTime());
  return {
    candidateId,
    sessionCount: rows.length,
    firstSessionAt: ended.length > 0 ? ended[0]! : null,
    lastSessionAt: ended.length > 0 ? ended[ended.length - 1]! : null,
    competencies: COMPETENCIES.map((name) => buildCompetency(name, rows)),
  };
}
