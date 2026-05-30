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
// Disparador minimo para el warmup. Gemini exige al menos un turno 'user' en
// contents; en el warmup no hay historial ni respuesta del candidato, asi que
// inyectamos este mensaje fijo de la app (NO dato del candidato) para que el
// modelo arranque. Las instrucciones reales viven en el system prompt.
const KICKOFF_TURN: GeminiTurn = { role: 'user', text: 'Comencemos la entrevista.' };

function toContents(history: ConversationEntry[], candidateText?: string): GeminiTurn[] {
  const contents: GeminiTurn[] = history.map((e) => ({
    role: e.role === 'interviewer' ? 'model' : 'user',
    text: e.text,
  }));
  if (candidateText) contents.push({ role: 'user', text: candidateText });
  // contents vacio solo ocurre en el warmup (sin historial ni candidateText).
  // Gemini rechaza un contents vacio, asi que inyectamos el disparador.
  if (contents.length === 0) contents.push(KICKOFF_TURN);
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
