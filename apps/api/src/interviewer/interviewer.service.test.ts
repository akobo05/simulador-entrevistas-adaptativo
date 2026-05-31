import { describe, it, expect } from 'vitest';
import type { SessionState, ConversationEntry } from '@warachikuy/shared-types';
import type { GeminiClient, GeminiTurn } from './gemini-client';
import { generateInterviewerMessage } from './interviewer.service';

function makeState(overrides: Partial<SessionState> = {}): SessionState {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    industry: 'backend',
    level: 'mid',
    status: 'active',
    phase: 'interviewing',
    turnNumber: 1,
    startedAt: 1,
    token: 'a'.repeat(64),
    ...overrides,
  };
}

const seed = { id: 'be-apis', topic: 'apis', prompt: 'Como disenarias una API REST?' };

describe('generateInterviewerMessage', () => {
  it('mapea historial + candidateText a contents con roles user/model', async () => {
    let capturedContents: GeminiTurn[] = [];
    let capturedSystem = '';
    const client: GeminiClient = {
      generate: async (system, contents) => {
        capturedSystem = system;
        capturedContents = contents;
        return 'Buena respuesta. Ahora, como manejarias la concurrencia?';
      },
    };
    const history: ConversationEntry[] = [
      { role: 'interviewer', text: 'Presentate', timestamp: 1 },
      { role: 'candidate', text: 'Soy backend', timestamp: 2 },
    ];
    await generateInterviewerMessage(client, {
      state: makeState(),
      history,
      candidateText: 'Uso REST con versionado',
      seed,
    });
    expect(capturedContents).toEqual([
      { role: 'model', text: 'Presentate' },
      { role: 'user', text: 'Soy backend' },
      { role: 'user', text: 'Uso REST con versionado' },
    ]);
    expect(capturedSystem).not.toContain('Uso REST con versionado');
  });

  it('devuelve una InterviewerMessage valida con intent question en interviewing sin respuesta previa', async () => {
    const client: GeminiClient = { generate: async () => 'Cual es tu experiencia con APIs?' };
    const msg = await generateInterviewerMessage(client, {
      state: makeState(),
      history: [],
      seed,
    });
    expect(msg.sessionId).toBe(makeState().id);
    expect(msg.text).toBe('Cual es tu experiencia con APIs?');
    expect(msg.intent).toBe('question');
    expect(typeof msg.timestamp).toBe('number');
  });

  it('usa intent closing en fase closing', async () => {
    const client: GeminiClient = { generate: async () => 'Gracias por tu tiempo.' };
    const msg = await generateInterviewerMessage(client, {
      state: makeState({ phase: 'closing', turnNumber: 6 }),
      history: [],
      candidateText: 'ok',
    });
    expect(msg.intent).toBe('closing');
  });

  it('recorta el texto al maximo configurado', async () => {
    const long = 'a'.repeat(2000);
    const client: GeminiClient = { generate: async () => long };
    const msg = await generateInterviewerMessage(client, {
      state: makeState({ phase: 'warmup', turnNumber: 0 }),
      history: [],
    });
    expect(msg.text.length).toBeLessThanOrEqual(600);
  });

  it('inyecta un turno de arranque cuando no hay historial ni candidateText (warmup)', async () => {
    // Gemini rechaza un contents vacio (error "contents are required"). El
    // warmup no tiene historial ni respuesta del candidato, asi que el service
    // debe inyectar un turno user de arranque para que el modelo responda.
    let captured: GeminiTurn[] = [];
    const client: GeminiClient = {
      generate: async (_system, contents) => {
        captured = contents;
        return 'Hola, contame de ti.';
      },
    };
    await generateInterviewerMessage(client, {
      state: makeState({ phase: 'warmup', turnNumber: 0 }),
      history: [],
    });
    expect(captured.length).toBeGreaterThan(0);
    expect(captured[0]!.role).toBe('user');
  });
});
