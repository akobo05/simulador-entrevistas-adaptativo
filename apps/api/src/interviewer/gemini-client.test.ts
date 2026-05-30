import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock del SDK de Gemini: controlamos ai.models.generateContent para testear
// buildGeminiClient sin pegarle a la API real. vi.hoisted permite referenciar
// el mock dentro del factory de vi.mock (que se hoistea al tope del archivo).
const { generateContentMock } = vi.hoisted(() => ({ generateContentMock: vi.fn() }));
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: { generateContent: generateContentMock },
  })),
}));

import {
  buildGeminiClient,
  GeminiTransientError,
  GeminiBlockedError,
  type GeminiClient,
} from './gemini-client';
import type { Env } from '../config/env';

const fakeEnv = { GEMINI_API_KEY: 'k' } as Env;

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

describe('buildGeminiClient', () => {
  beforeEach(() => {
    generateContentMock.mockReset();
  });

  it('devuelve el texto cuando el SDK responde', async () => {
    generateContentMock.mockResolvedValue({ text: 'una pregunta' });
    const client = buildGeminiClient(fakeEnv);
    expect(await client.generate('sys', [{ role: 'user', text: 'hola' }])).toBe('una pregunta');
  });

  it('mapea los contents al shape del SDK (role + parts) y pasa el systemInstruction', async () => {
    generateContentMock.mockResolvedValue({ text: 'ok' });
    const client = buildGeminiClient(fakeEnv);
    await client.generate('sys', [
      { role: 'user', text: 'hola' },
      { role: 'model', text: 'q' },
    ]);
    const arg = generateContentMock.mock.calls[0]![0] as {
      contents: unknown;
      config: { systemInstruction: string };
    };
    expect(arg.contents).toEqual([
      { role: 'user', parts: [{ text: 'hola' }] },
      { role: 'model', parts: [{ text: 'q' }] },
    ]);
    expect(arg.config.systemInstruction).toBe('sys');
  });

  it('lanza GeminiBlockedError cuando el texto es vacio', async () => {
    generateContentMock.mockResolvedValue({ text: '' });
    const client = buildGeminiClient(fakeEnv);
    await expect(client.generate('sys', [])).rejects.toBeInstanceOf(GeminiBlockedError);
  });

  it('lanza GeminiBlockedError cuando el texto es undefined', async () => {
    generateContentMock.mockResolvedValue({ text: undefined });
    const client = buildGeminiClient(fakeEnv);
    await expect(client.generate('sys', [])).rejects.toBeInstanceOf(GeminiBlockedError);
  });

  it('envuelve un rechazo del SDK como GeminiTransientError preservando la causa', async () => {
    const original = new Error('network down');
    generateContentMock.mockRejectedValue(original);
    const client = buildGeminiClient(fakeEnv);
    await expect(client.generate('sys', [])).rejects.toMatchObject({
      name: 'GeminiTransientError',
      cause: original,
    });
  });

  it('relanza crudo un error de programacion (TypeError) sin envolverlo', async () => {
    const bug = new TypeError('x is not a function');
    generateContentMock.mockRejectedValue(bug);
    const client = buildGeminiClient(fakeEnv);
    await expect(client.generate('sys', [])).rejects.toBe(bug);
  });
});
