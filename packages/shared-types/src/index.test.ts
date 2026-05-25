import { describe, it, expect } from 'vitest';
import { sharedTypesVersion } from './index';

describe('shared-types package', () => {
  it('exporta una versión que coincide con el package.json', () => {
    expect(sharedTypesVersion).toBe('0.1.0');
  });
});
