import { GoogleGenAI } from '@google/genai';
import type { Env } from '../config/env.js';
import { GEMINI_MODEL, GEMINI_TIMEOUT_MS } from './constants.js';

export interface GeminiTurn {
  role: 'user' | 'model';
  text: string;
}

// Interfaz minima que consume el resto del codigo. Permite inyectar un fake
// determinista en tests sin pegarle a la API real.
export interface GeminiClient {
  generate(systemPrompt: string, contents: GeminiTurn[]): Promise<string>;
}

// Fallo transitorio: red, timeout, rate limit, 5xx. Amerita reintento.
export class GeminiTransientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeminiTransientError';
  }
}

// Fallo de contenido: safety filter o salida vacia. Reintentar no ayuda.
export class GeminiBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeminiBlockedError';
  }
}

// Envuelve la promesa con un timeout que rechaza con GeminiTransientError.
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new GeminiTransientError('gemini timeout')), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export function buildGeminiClient(env: Env): GeminiClient {
  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

  return {
    async generate(systemPrompt, contents) {
      let response;
      try {
        response = await withTimeout(
          ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: contents.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
            config: { systemInstruction: systemPrompt },
          }),
          GEMINI_TIMEOUT_MS,
        );
      } catch (err) {
        if (err instanceof GeminiTransientError) throw err;
        // Errores de red / SDK / 5xx se tratan como transitorios.
        throw new GeminiTransientError(err instanceof Error ? err.message : 'gemini error');
      }
      const text = response.text;
      // Salida vacia: tipicamente safety filter o respuesta bloqueada. No es
      // transitorio: reintentar daria lo mismo.
      if (!text || text.trim().length === 0) {
        throw new GeminiBlockedError('gemini devolvio salida vacia o bloqueada');
      }
      return text;
    },
  };
}
