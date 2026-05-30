import { describe, it, expect } from 'vitest';
import { GeminiTransientError, GeminiBlockedError, type GeminiClient } from './gemini-client';

describe('gemini-client tipos y errores', () => {
  it('GeminiTransientError es una Error con su nombre', () => {
    const e = new GeminiTransientError('timeout');
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('GeminiTransientError');
    expect(e.message).toBe('timeout');
  });

  it('GeminiBlockedError es una Error con su nombre', () => {
    const e = new GeminiBlockedError('safety');
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('GeminiBlockedError');
  });

  it('un fake que implementa GeminiClient cumple la interfaz', async () => {
    const fake: GeminiClient = {
      generate: async (system, contents) => `${system}|${contents.length}`,
    };
    expect(await fake.generate('sys', [{ role: 'user', text: 'hola' }])).toBe('sys|1');
  });
});
