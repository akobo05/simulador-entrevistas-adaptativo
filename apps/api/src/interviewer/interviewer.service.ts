import type { ConversationEntry, InterviewerMessage, SessionState } from '@warachikuy/shared-types';
import type { GeminiClient, GeminiTurn } from './gemini-client.js';
import type { SeedQuestion } from './question-bank.js';
import { buildSystemPrompt } from './prompts.js';
import { MAX_INTERVIEWER_TEXT_LENGTH } from './constants.js';

export interface GenerateTurnInput {
  state: SessionState;
  history: ConversationEntry[]; // turnos previos persistidos
  candidateText?: string; // respuesta actual, aun no persistida
  seed?: SeedQuestion;
}

// Mapea el historial a turnos nativos de Gemini: candidate -> user,
// interviewer -> model. El candidateText actual se agrega como ultimo turno
// user. Asi los datos del candidato no tocan el system prompt.
function toContents(history: ConversationEntry[], candidateText?: string): GeminiTurn[] {
  const contents: GeminiTurn[] = history.map((e) => ({
    role: e.role === 'interviewer' ? 'model' : 'user',
    text: e.text,
  }));
  if (candidateText) contents.push({ role: 'user', text: candidateText });
  return contents;
}

// El intent lo fija el backend por fase, no el LLM (contrato predecible).
function intentFor(state: SessionState, hasCandidateAnswer: boolean): InterviewerMessage['intent'] {
  if (state.phase === 'closing') return 'closing';
  if (state.phase === 'warmup') return 'question';
  return hasCandidateAnswer ? 'followup' : 'question';
}

export async function generateInterviewerMessage(
  client: GeminiClient,
  input: GenerateTurnInput,
): Promise<InterviewerMessage> {
  const { state, history, candidateText, seed } = input;
  const systemPrompt = buildSystemPrompt({
    industry: state.industry,
    level: state.level,
    phase: state.phase,
    ...(seed ? { seed } : {}),
  });
  const contents = toContents(history, candidateText);
  const raw = await client.generate(systemPrompt, contents);
  const text = raw.trim().slice(0, MAX_INTERVIEWER_TEXT_LENGTH);
  return {
    sessionId: state.id,
    text,
    intent: intentFor(state, Boolean(candidateText)),
    timestamp: Date.now(),
  };
}
