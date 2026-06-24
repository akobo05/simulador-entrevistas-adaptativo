import { describe, it, expect } from 'vitest';
import { CreateSessionRequestSchema, SessionStateSchema } from './sessions';

describe('candidateId en los contratos', () => {
  const uuid = '550e8400-e29b-41d4-a716-446655440000';

  it('CreateSessionRequest acepta un candidateId uuid valido', () => {
    const parsed = CreateSessionRequestSchema.parse({
      industry: 'backend',
      level: 'mid',
      candidateId: uuid,
    });
    expect(parsed.candidateId).toBe(uuid);
  });

  it('CreateSessionRequest es valido sin candidateId', () => {
    const parsed = CreateSessionRequestSchema.parse({ industry: 'backend', level: 'mid' });
    expect(parsed.candidateId).toBeUndefined();
  });

  it('CreateSessionRequest rechaza un candidateId que no es uuid', () => {
    const r = CreateSessionRequestSchema.safeParse({
      industry: 'backend',
      level: 'mid',
      candidateId: 'no-soy-uuid',
    });
    expect(r.success).toBe(false);
  });

  it('SessionState acepta candidateId opcional', () => {
    const base = {
      id: uuid,
      industry: 'backend' as const,
      level: 'mid' as const,
      status: 'active' as const,
      phase: 'warmup' as const,
      turnNumber: 0,
      startedAt: 1,
      token: 'a'.repeat(64),
    };
    expect(SessionStateSchema.parse(base).candidateId).toBeUndefined();
    expect(SessionStateSchema.parse({ ...base, candidateId: uuid }).candidateId).toBe(uuid);
  });
});
