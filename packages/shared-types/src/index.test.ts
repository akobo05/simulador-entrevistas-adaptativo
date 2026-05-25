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
