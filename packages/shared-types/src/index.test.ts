import { describe, it, expect } from 'vitest';
import {
  sharedTypesVersion,
  AuraMetricSchema,
  AuraStateSchema,
  TurnEventSchema,
  VoiceCommandSchema,
  CandidateTranscriptSchema,
  ClientToServerMessageSchema,
  ServerToClientMessageSchema,
  ApiErrorSchema,
  IndustrySchema,
  LevelSchema,
  CreateSessionRequestSchema,
  CreateSessionResponseSchema,
  SessionPhaseSchema,
  SessionStatusSchema,
  SessionStateSchema,
} from './index';

const SESSION_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('shared-types package', () => {
  it('exporta una versión que coincide con el package.json', () => {
    expect(sharedTypesVersion).toBe('0.1.0');
  });
});

describe('AuraMetricSchema', () => {
  it('valida una métrica correcta', () => {
    const result = AuraMetricSchema.safeParse({
      name: 'fluency',
      value: 72,
      confidence: 'high',
      timestamp: Date.now(),
    });
    expect(result.success).toBe(true);
  });

  it('rechaza value fuera de rango', () => {
    const result = AuraMetricSchema.safeParse({
      name: 'fluency',
      value: 150,
      confidence: 'high',
      timestamp: Date.now(),
    });
    expect(result.success).toBe(false);
  });
});

describe('AuraStateSchema', () => {
  it('valida un estado de aura correcto', () => {
    const result = AuraStateSchema.safeParse({
      sessionId: SESSION_ID,
      metrics: [{ name: 'eye_contact', value: 55, confidence: 'medium', timestamp: 1000 }],
      collectedAt: 1000,
    });
    expect(result.success).toBe(true);
  });

  it('rechaza más de 10 métricas', () => {
    const metrics = Array.from({ length: 11 }, () => ({
      name: 'fluency',
      value: 50,
      confidence: 'low',
      timestamp: 1000,
    }));
    expect(
      AuraStateSchema.safeParse({ sessionId: SESSION_ID, metrics, collectedAt: 1000 }).success,
    ).toBe(false);
  });
});

describe('TurnEventSchema', () => {
  it('valida un evento de turno del candidato', () => {
    const result = TurnEventSchema.safeParse({
      sessionId: SESSION_ID,
      type: 'turn.candidate.start',
      timestamp: 2000,
    });
    expect(result.success).toBe(true);
  });
});

describe('VoiceCommandSchema', () => {
  it('valida el comando repeat', () => {
    const result = VoiceCommandSchema.safeParse({
      sessionId: SESSION_ID,
      command: 'repeat',
      timestamp: 3000,
    });
    expect(result.success).toBe(true);
  });
});

describe('CandidateTranscriptSchema', () => {
  it('valida una transcripción final', () => {
    const result = CandidateTranscriptSchema.safeParse({
      sessionId: SESSION_ID,
      text: 'Hola.',
      isFinal: true,
      timestamp: 4000,
    });
    expect(result.success).toBe(true);
  });
});

describe('ClientToServerMessageSchema', () => {
  it('acepta metrics.update con payload correcto', () => {
    const result = ClientToServerMessageSchema.safeParse({
      type: 'metrics.update',
      payload: {
        sessionId: SESSION_ID,
        metrics: [{ name: 'eye_contact', value: 55, confidence: 'medium', timestamp: 1000 }],
        collectedAt: 1000,
      },
    });
    expect(result.success).toBe(true);
  });

  it('acepta candidate.transcript con payload correcto', () => {
    const result = ClientToServerMessageSchema.safeParse({
      type: 'candidate.transcript',
      payload: { sessionId: SESSION_ID, text: 'texto', isFinal: false, timestamp: 5000 },
    });
    expect(result.success).toBe(true);
  });
});

describe('ServerToClientMessageSchema', () => {
  it('acepta interviewer.message con payload correcto', () => {
    const result = ServerToClientMessageSchema.safeParse({
      type: 'interviewer.message',
      payload: {
        sessionId: SESSION_ID,
        text: '¿Cuál es tu mayor fortaleza?',
        intent: 'question',
        timestamp: 6000,
      },
    });
    expect(result.success).toBe(true);
  });

  it('acepta error con código válido', () => {
    const result = ServerToClientMessageSchema.safeParse({
      type: 'error',
      payload: { code: 'invalid_message', message: 'JSON malformado', recoverable: true },
    });
    expect(result.success).toBe(true);
  });
});

describe('ApiErrorSchema', () => {
  it('valida un error HTTP estándar', () => {
    const result = ApiErrorSchema.safeParse({
      error: { code: 'not_found', message: 'Sesión no encontrada' },
    });
    expect(result.success).toBe(true);
  });
});

describe('IndustrySchema', () => {
  it('acepta los 4 valores de F1', () => {
    expect(IndustrySchema.safeParse('backend').success).toBe(true);
    expect(IndustrySchema.safeParse('frontend').success).toBe(true);
    expect(IndustrySchema.safeParse('data').success).toBe(true);
    expect(IndustrySchema.safeParse('fullstack').success).toBe(true);
  });

  it('rechaza un valor desconocido', () => {
    expect(IndustrySchema.safeParse('mobile').success).toBe(false);
  });
});

describe('LevelSchema', () => {
  it('acepta junior, mid y senior', () => {
    expect(LevelSchema.safeParse('junior').success).toBe(true);
    expect(LevelSchema.safeParse('mid').success).toBe(true);
    expect(LevelSchema.safeParse('senior').success).toBe(true);
  });

  it('rechaza otro nivel', () => {
    expect(LevelSchema.safeParse('principal').success).toBe(false);
  });
});

describe('CreateSessionRequestSchema', () => {
  it('valida un request bien formado', () => {
    const result = CreateSessionRequestSchema.safeParse({
      industry: 'backend',
      level: 'mid',
    });
    expect(result.success).toBe(true);
  });

  it('rechaza request sin industry', () => {
    expect(CreateSessionRequestSchema.safeParse({ level: 'mid' }).success).toBe(false);
  });
});

describe('CreateSessionResponseSchema', () => {
  it('valida response con shape esperada', () => {
    const result = CreateSessionResponseSchema.safeParse({
      sessionId: '550e8400-e29b-41d4-a716-446655440000',
      websocketUrl: 'ws://localhost:3000/v1/sessions/abc/ws?token=xyz',
      token: 'a'.repeat(64),
    });
    expect(result.success).toBe(true);
  });

  it('rechaza token con longitud distinta de 64', () => {
    expect(
      CreateSessionResponseSchema.safeParse({
        sessionId: '550e8400-e29b-41d4-a716-446655440000',
        websocketUrl: 'ws://localhost:3000',
        token: 'short',
      }).success,
    ).toBe(false);
  });
});

describe('SessionStateSchema', () => {
  it('valida un estado inicial coherente', () => {
    const result = SessionStateSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      industry: 'backend',
      level: 'mid',
      status: 'active',
      phase: 'warmup',
      turnNumber: 0,
      startedAt: 1700000000000,
      token: 'a'.repeat(64),
    });
    expect(result.success).toBe(true);
  });

  it('rechaza turnNumber negativo', () => {
    const result = SessionStateSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      industry: 'backend',
      level: 'mid',
      status: 'active',
      phase: 'warmup',
      turnNumber: -1,
      startedAt: 1700000000000,
      token: 'a'.repeat(64),
    });
    expect(result.success).toBe(false);
  });

  it('acepta los 3 valores válidos de phase', () => {
    for (const phase of ['warmup', 'interviewing', 'closing'] as const) {
      const result = SessionPhaseSchema.safeParse(phase);
      expect(result.success).toBe(true);
    }
  });

  it('acepta los 3 valores válidos de status', () => {
    for (const status of ['active', 'ended', 'expired'] as const) {
      const result = SessionStatusSchema.safeParse(status);
      expect(result.success).toBe(true);
    }
  });
});
