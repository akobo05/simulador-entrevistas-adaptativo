import { describe, it, expect } from 'vitest';
import type { ImprovementPlan } from '@warachikuy/shared-types';
import { makeTestDb } from './test-helpers.js';
import {
  archiveSession,
  updateArchivedPlan,
  getArchivedSession,
  listCandidateSessions,
} from './session-archive.js';
import type { NewInterviewSession } from './schema.js';

function sampleRow(over: Partial<NewInterviewSession> = {}): NewInterviewSession {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    industry: 'backend',
    level: 'mid',
    status: 'ended',
    startedAt: new Date('2026-06-23T10:00:00Z'),
    endedAt: new Date('2026-06-23T10:12:00Z'),
    durationMs: 12 * 60 * 1000,
    transcript: [{ role: 'interviewer', text: 'Hola', timestamp: 1 }],
    metrics: { fluency: 80, eye_contact: null, speech_rate: 60 },
    ...over,
  };
}

function samplePlan(sessionId: string): ImprovementPlan {
  return {
    planId: '22222222-2222-4222-8222-222222222222',
    sessionId,
    summary: 'Buen desempeno',
    competencies: [
      { name: 'fluency', score: 80, comment: 'ok' },
      { name: 'eye_contact', score: null, comment: 'sin datos' },
      { name: 'speech_rate', score: 60, comment: 'ok' },
      { name: 'content', score: 70, comment: 'ok' },
    ],
    strengths: ['claridad'],
    improvements: ['ejemplos'],
    exercises: [{ title: 'STAR', description: 'practica STAR' }],
    generatedAt: 1,
  };
}

describe('session-archive', () => {
  it('archiveSession + getArchivedSession hacen round-trip con los datos intactos', async () => {
    const db = await makeTestDb();
    const row = sampleRow();
    await archiveSession(db, row);
    const got = await getArchivedSession(db, row.id);
    expect(got?.industry).toBe('backend');
    expect(got?.durationMs).toBe(720000);
    expect(got?.transcript).toEqual(row.transcript);
    expect(got?.metrics).toEqual(row.metrics);
    expect(got?.plan).toBeNull();
  });

  it('archiveSession es idempotente: dos inserts del mismo id no lanzan ni duplican', async () => {
    const db = await makeTestDb();
    const row = sampleRow();
    await archiveSession(db, row);
    await archiveSession(db, { ...row, industry: 'frontend' });
    const got = await getArchivedSession(db, row.id);
    // ON CONFLICT DO NOTHING: gana el primero, no se pisa
    expect(got?.industry).toBe('backend');
  });

  it('updateArchivedPlan rellena el plan de una fila existente', async () => {
    const db = await makeTestDb();
    const row = sampleRow();
    await archiveSession(db, row);
    const plan = samplePlan(row.id);
    await updateArchivedPlan(db, row.id, plan);
    const got = await getArchivedSession(db, row.id);
    expect(got?.plan).toEqual(plan);
  });

  it('getArchivedSession devuelve null si el id no existe', async () => {
    const db = await makeTestDb();
    const got = await getArchivedSession(db, '99999999-9999-4999-8999-999999999999');
    expect(got).toBeNull();
  });

  it('updateArchivedPlan sobre un id inexistente no lanza (UPDATE de 0 filas)', async () => {
    // Invariante que sostiene el diseno no-fatal: si /end no alcanzo a archivar
    // (Postgres caido), el update del plan no debe romper.
    const db = await makeTestDb();
    const plan = samplePlan('44444444-4444-4444-8444-444444444444');
    await expect(updateArchivedPlan(db, plan.sessionId, plan)).resolves.toBeUndefined();
  });
});

describe('listCandidateSessions', () => {
  const cand = '550e8400-e29b-41d4-a716-446655440000';
  const other = '660e8400-e29b-41d4-a716-446655440001';

  it('devuelve solo las sesiones con plan del candidato, ordenadas por ended_at', async () => {
    const db = await makeTestDb();
    // Sesion mas nueva primero al insertar, para verificar el orden de la query
    const newer = sampleRow({
      id: '11111111-1111-4111-8111-111111111111',
      candidateId: cand,
      endedAt: new Date('2026-06-23T12:00:00Z'),
    });
    const older = sampleRow({
      id: '22222222-2222-4222-8222-222222222222',
      candidateId: cand,
      endedAt: new Date('2026-06-23T10:00:00Z'),
    });
    await archiveSession(db, newer);
    await archiveSession(db, older);
    await updateArchivedPlan(db, newer.id, samplePlan(newer.id));
    await updateArchivedPlan(db, older.id, samplePlan(older.id));

    const rows = await listCandidateSessions(db, cand);
    expect(rows.map((r) => r.id)).toEqual([older.id, newer.id]); // asc por ended_at
  });

  it('excluye filas sin plan y de otros candidatos', async () => {
    const db = await makeTestDb();
    const withPlan = sampleRow({ id: '33333333-3333-4333-8333-333333333333', candidateId: cand });
    const noPlan = sampleRow({ id: '44444444-4444-4444-8444-444444444444', candidateId: cand });
    const otherCand = sampleRow({ id: '55555555-5555-4555-8555-555555555555', candidateId: other });
    await archiveSession(db, withPlan);
    await archiveSession(db, noPlan); // queda con plan null
    await archiveSession(db, otherCand);
    await updateArchivedPlan(db, withPlan.id, samplePlan(withPlan.id));
    await updateArchivedPlan(db, otherCand.id, samplePlan(otherCand.id));

    const rows = await listCandidateSessions(db, cand);
    expect(rows.map((r) => r.id)).toEqual([withPlan.id]);
  });

  it('devuelve [] cuando el candidato no tiene sesiones', async () => {
    const db = await makeTestDb();
    expect(await listCandidateSessions(db, cand)).toEqual([]);
  });
});
