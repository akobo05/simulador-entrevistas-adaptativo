import { test, expect } from 'vitest';
import { auraStateToAvatarProps } from './auraVisual';
import type { AuraState } from '@warachikuy/shared-types';

const make = (metrics: AuraState['metrics']): AuraState => ({
  sessionId: '550e8400-e29b-41d4-a716-446655440000',
  metrics,
  collectedAt: 1_700_000_000_000,
});

test('mapea metricas presentes a sus props', () => {
  const props = auraStateToAvatarProps(
    make([
      { name: 'fluency', value: 80, confidence: 'high', timestamp: 1 },
      { name: 'speech_rate', value: 60, confidence: 'medium', timestamp: 1 },
      { name: 'eye_contact', value: 40, confidence: 'high', timestamp: 1 },
    ]),
  );
  expect(props).toEqual({ fluency: 80, speechRate: 60, eyeContact: 40 });
});

test('una metrica omitida queda en null', () => {
  const props = auraStateToAvatarProps(
    make([{ name: 'fluency', value: 80, confidence: 'high', timestamp: 1 }]),
  );
  expect(props).toEqual({ fluency: 80, speechRate: null, eyeContact: null });
});

test('state null deja las tres en null', () => {
  expect(auraStateToAvatarProps(null)).toEqual({
    fluency: null,
    speechRate: null,
    eyeContact: null,
  });
});
