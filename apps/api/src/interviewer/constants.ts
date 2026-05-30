import type { SessionPhase } from '@warachikuy/shared-types';

// Modelo de Gemini. Flash por latencia (~1s) en una entrevista por voz.
export const GEMINI_MODEL = 'gemini-2.5-flash';

// Timeout explicito a la llamada al LLM para no colgar el turno.
export const GEMINI_TIMEOUT_MS = 15_000;

// Arco de la entrevista (deterministico por turno). El backend controla el
// arco, el LLM el contenido.
export const WARMUP_TURN = 0;
export const INTERVIEWING_TURNS = 5; // turnos 1..5 usan el banco
export const MAX_INTERVIEWER_TURNS = 6; // turno de cierre

// Recorte de seguridad del texto del LLM antes de enviarlo (UX de voz).
export const MAX_INTERVIEWER_TEXT_LENGTH = 600;

// Tope del texto del candidato (transcript del STT). CandidateTranscriptSchema
// no acota el largo, asi que truncamos antes de mandarlo al LLM y persistirlo
// para evitar inflar costo/latencia del LLM y el crecimiento del historial. El
// limite es generoso: una respuesta hablada de ~2 min ronda los 2500 chars.
export const MAX_CANDIDATE_TEXT_LENGTH = 4000;

// Deriva la fase del numero de turno del entrevistador.
export function derivePhase(turn: number): SessionPhase {
  if (turn <= WARMUP_TURN) return 'warmup';
  if (turn < MAX_INTERVIEWER_TURNS) return 'interviewing';
  return 'closing';
}
