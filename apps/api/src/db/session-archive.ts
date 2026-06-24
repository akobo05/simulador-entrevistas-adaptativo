import { eq } from 'drizzle-orm';
import type { ImprovementPlan } from '@warachikuy/shared-types';
import type { Db } from './client.js';
import { interviewSessions, type InterviewSessionRow, type NewInterviewSession } from './schema.js';

// Inserta el espejo durable. ON CONFLICT DO NOTHING lo hace idempotente igual
// que el guard de /end: un /end repetido no duplica ni pisa la fila.
export async function archiveSession(db: Db, row: NewInterviewSession): Promise<void> {
  await db.insert(interviewSessions).values(row).onConflictDoNothing();
}

// Rellena el plan generado en la fila ya existente (segundo paso de la escritura).
export async function updateArchivedPlan(
  db: Db,
  sessionId: string,
  plan: ImprovementPlan,
): Promise<void> {
  await db.update(interviewSessions).set({ plan }).where(eq(interviewSessions.id, sessionId));
}

// Lectura por id: esto es lo "consultable desde el backend" de la issue.
export async function getArchivedSession(
  db: Db,
  sessionId: string,
): Promise<InterviewSessionRow | null> {
  const rows = await db
    .select()
    .from(interviewSessions)
    .where(eq(interviewSessions.id, sessionId))
    .limit(1);
  return rows[0] ?? null;
}
