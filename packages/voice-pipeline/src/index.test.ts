import { describe, it, expect } from 'vitest';
import { voicePipelineVersion } from './index';

describe('voice-pipeline package', () => {
  it('exporta una versión que coincide con el package.json', () => {
    expect(voicePipelineVersion).toBe('0.1.0');
  });
});
