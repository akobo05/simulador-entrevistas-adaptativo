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
  generateJson(
    systemPrompt: string,
    contents: GeminiTurn[],
    responseSchema: unknown,
  ): Promise<unknown>;
}

// Fallo transitorio: red, timeout, rate limit, 5xx. Amerita reintento.
// Acepta `options` para preservar la causa original (no perder el stack).
export class GeminiTransientError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
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

  // Cuerpo compartido por generate y generateJson: mismo timeout, mismo mapeo
  // de contents y mismas reglas de error. extraConfig se mergea al config junto
  // al systemInstruction (p. ej. responseMimeType/responseSchema para JSON).
  async function callGemini(
    systemPrompt: string,
    contents: GeminiTurn[],
    extraConfig: Record<string, unknown>,
  ): Promise<string> {
    let response;
    try {
      response = await withTimeout(
        ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: contents.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
          config: { systemInstruction: systemPrompt, ...extraConfig },
        }),
        GEMINI_TIMEOUT_MS,
      );
    } catch (err) {
      if (err instanceof GeminiTransientError) throw err;
      // Errores de programacion (bug nuestro o del SDK) NO son fallos del LLM:
      // los relanzamos crudos para no enmascararlos como "transitorio" y
      // reintentarlos en vano, perdiendo el stack original.
      if (
        err instanceof TypeError ||
        err instanceof ReferenceError ||
        err instanceof RangeError ||
        err instanceof SyntaxError
      ) {
        throw err;
      }
      // Errores de red / SDK / 5xx / auth se tratan como transitorios.
      // Preservamos la causa para no perder el stack al debuggear (un API key
      // vencido, por ejemplo, se reintenta una vez y termina en llm_unavailable).
      throw new GeminiTransientError(err instanceof Error ? err.message : 'gemini error', {
        cause: err,
      });
    }
    const text = response.text;
    // Detectamos bloqueo por texto vacio: tanto los bloqueos del input como
    // de la salida por safety filters de Gemini producen texto vacio. Es un
    // proxy intencional (no exhaustivo): no inspeccionamos finishReason ni
    // promptFeedback, suficiente para F1. No es transitorio, reintentar daria
    // lo mismo, por eso es GeminiBlockedError y no GeminiTransientError.
    if (!text || text.trim().length === 0) {
      throw new GeminiBlockedError('gemini devolvio salida vacia o bloqueada');
    }
    return text;
  }

  return {
    async generate(systemPrompt, contents) {
      return callGemini(systemPrompt, contents, {});
    },
    async generateJson(systemPrompt, contents, responseSchema) {
      const text = await callGemini(systemPrompt, contents, {
        responseMimeType: 'application/json',
        responseSchema,
      });
      // JSON malformado lanza SyntaxError; el caller (coach.service) lo captura y marca el plan como failed.
      return JSON.parse(text);
    },
  };
}
