import { describe, it, expect } from 'vitest';
import {
  sharedTypesVersion,
  AuraMetricSchema,
  ClientToServerMessageSchema,
  ServerToClientMessageSchema,
} from './index';

describe('shared-types package', () => {
  it('exporta una versión que coincide con el package.json', () => {
    expect(sharedTypesVersion).toBe('0.1.0');
  });

  it('AuraMetricSchema valida una métrica correcta', () => {
    const result = AuraMetricSchema.safeParse({
      name: 'fluency',
      value: 72,
      confidence: 'high',
      timestamp: Date.now(),
    });
    expect(result.success).toBe(true);
  });

  it('AuraMetricSchema rechaza valor fuera de rango', () => {
    const result = AuraMetricSchema.safeParse({
      name: 'fluency',
      value: 150,
      confidence: 'high',
      timestamp: Date.now(),
    });
    expect(result.success).toBe(false);
  });

  it('ClientToServerMessage acepta metrics.update', () => {
    const result = ClientToServerMessageSchema.safeParse({
      type: 'metrics.update',
      metrics: [{ name: 'eye_contact', value: 55, confidence: 'medium', timestamp: 1000 }],
      timestamp: 1000,
    });
    expect(result.success).toBe(true);
  });

  it('ClientToServerMessage acepta candidate.transcript', () => {
    const result = ClientToServerMessageSchema.safeParse({
      type: 'candidate.transcript',
      text: 'Hola, soy Walter.',
      isFinal: true,
      timestamp: 2000,
    });
    expect(result.success).toBe(true);
  });

  it('ServerToClientMessage acepta interviewer.message', () => {
    const result = ServerToClientMessageSchema.safeParse({
      type: 'interviewer.message',
      text: '¿Cuál es tu mayor fortaleza?',
      timestamp: 3000,
    });
    expect(result.success).toBe(true);
  });
});
