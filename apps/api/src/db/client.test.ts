import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from './test-helpers.js';
import { createDb, runMigrations } from './client.js';
import { interviewSessions } from './schema.js';

describe('createDb + runMigrations (pglite)', () => {
  it('crea la tabla interview_sessions y la deja consultable vacia', async () => {
    const db = await makeTestDb();
    const rows = await db
      .select()
      .from(interviewSessions)
      .where(eq(interviewSessions.id, '00000000-0000-0000-0000-000000000000'));
    expect(rows).toEqual([]);
  });

  it('runMigrations es idempotente: correrla dos veces sobre el mismo db no lanza', async () => {
    const db = createDb('mock://twice');
    await runMigrations(db, 'mock://twice');
    await expect(runMigrations(db, 'mock://twice')).resolves.toBeUndefined();
    // la tabla sigue consultable tras la segunda corrida
    const rows = await db
      .select()
      .from(interviewSessions)
      .where(eq(interviewSessions.id, '00000000-0000-0000-0000-000000000000'));
    expect(rows).toEqual([]);
  });
});
