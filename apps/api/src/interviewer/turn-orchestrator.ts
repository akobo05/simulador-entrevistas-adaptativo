import type { WebSocket } from 'ws';
import type { FastifyBaseLogger } from 'fastify';
import type Redis from 'ioredis';
import type {
  ConversationEntry,
  InterviewerMessage,
  ServerToClientMessage,
  SessionState,
} from '@warachikuy/shared-types';
import { GeminiBlockedError, GeminiTransientError, type GeminiClient } from './gemini-client.js';
import { generateInterviewerMessage, type GenerateTurnInput } from './interviewer.service.js';
import { readHistory, appendWarmupTurn, appendCandidateTurn } from './conversation.js';
import { selectSeed } from './question-bank.js';
import { derivePhase, MAX_INTERVIEWER_TURNS } from './constants.js';

export interface TurnDeps {
  socket: WebSocket;
  log: FastifyBaseLogger;
  redis: Redis;
  gemini: GeminiClient;
  state: SessionState; // mutado in-place al avanzar el turno. PRECONDICION: el
  // caller (handler) debe serializar las llamadas (lock 'generating'): el
  // orquestador no es reentrante porque muta este estado compartido.
}

const FALLBACK_TEXT = 'No pude procesar bien tu ultima respuesta, podrias reformularla?';

function send(socket: WebSocket, msg: ServerToClientMessage): void {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
}

function sendState(deps: TurnDeps): void {
  send(deps.socket, {
    type: 'session.state',
    payload: {
      sessionId: deps.state.id,
      phase: deps.state.phase,
      turnNumber: deps.state.turnNumber,
    },
  });
}

// Reintenta UNA vez ante fallo transitorio. Los bloqueos no se reintentan.
async function generateWithRetry(
  deps: TurnDeps,
  input: GenerateTurnInput,
): Promise<InterviewerMessage> {
  try {
    return await generateInterviewerMessage(deps.gemini, input);
  } catch (err) {
    if (err instanceof GeminiTransientError) {
      deps.log.warn({ err }, 'gemini transient, reintentando una vez');
      return generateInterviewerMessage(deps.gemini, input);
    }
    throw err;
  }
}

// Bloqueo/vacio -> fallback de reformulacion (no avanza turno, no persiste).
// Transitorio (ya reintentado) o fallo de persistencia -> error llm_unavailable.
function handleTurnFailure(deps: TurnDeps, err: unknown): void {
  if (err instanceof GeminiBlockedError) {
    deps.log.warn({ err }, 'gemini bloqueo el contenido, enviando fallback');
    const fallback: InterviewerMessage = {
      sessionId: deps.state.id,
      text: FALLBACK_TEXT,
      intent: 'clarification',
      timestamp: Date.now(),
    };
    send(deps.socket, { type: 'interviewer.message', payload: fallback });
    return;
  }
  deps.log.error({ err }, 'turno fallido, emitiendo llm_unavailable');
  send(deps.socket, {
    type: 'error',
    payload: {
      code: 'llm_unavailable',
      message: 'El entrevistador no esta disponible, intenta de nuevo.',
      recoverable: true,
    },
  });
}

// Turno inicial (warmup): genera la primera pregunta, persiste solo el turno
// del entrevistador y envia la interviewer.message. No avanza turnNumber (la
// warmup ES el turno 0) ni reenvia session.state: el handler ya lo envio de
// forma sincrona al conectar.
export async function runWarmupTurn(deps: TurnDeps): Promise<void> {
  try {
    const msg = await generateWithRetry(deps, { state: deps.state, history: [] });
    if (deps.socket.readyState !== deps.socket.OPEN) return;
    const entry: ConversationEntry = {
      role: 'interviewer',
      text: msg.text,
      timestamp: msg.timestamp,
    };
    await appendWarmupTurn(deps.redis, deps.state, entry);
    send(deps.socket, { type: 'interviewer.message', payload: msg });
  } catch (err) {
    handleTurnFailure(deps, err);
  }
}

// Turno tras una respuesta del candidato. Genera con un estado PROYECTADO a la
// fase siguiente; persiste candidato + entrevistador atomicamente; y SOLO si la
// persistencia tuvo exito commitea el avance en deps.state y envia. Esto
// mantiene el turnNumber en memoria y en Redis consistentes ante un fallo.
export async function runCandidateTurn(deps: TurnDeps, candidateText: string): Promise<void> {
  if (deps.state.turnNumber >= MAX_INTERVIEWER_TURNS) return; // entrevista cerrada
  const nextTurn = deps.state.turnNumber + 1;
  const nextPhase = derivePhase(nextTurn);
  const seed = selectSeed(deps.state.industry, nextTurn);
  const projected: SessionState = { ...deps.state, turnNumber: nextTurn, phase: nextPhase };

  let msg: InterviewerMessage;
  try {
    const history = await readHistory(deps.redis, deps.state.id);
    msg = await generateWithRetry(deps, {
      state: projected,
      history,
      candidateText,
      ...(seed ? { seed } : {}),
    });
  } catch (err) {
    handleTurnFailure(deps, err); // bloqueo -> fallback; transitorio -> llm_unavailable
    return; // el turno no avanza; el candidato puede reintentar
  }

  if (deps.socket.readyState !== deps.socket.OPEN) return; // se desconecto durante la generacion

  const candidate: ConversationEntry = {
    role: 'candidate',
    text: candidateText,
    timestamp: Date.now(),
  };
  const interviewer: ConversationEntry = {
    role: 'interviewer',
    text: msg.text,
    timestamp: msg.timestamp,
  };
  try {
    await appendCandidateTurn(deps.redis, projected, candidate, interviewer, seed?.id);
  } catch (err) {
    // Persistencia fallida: no commiteamos el avance en memoria (quedaria
    // desincronizado con Redis). Tratamos el turno como no disponible.
    handleTurnFailure(deps, err);
    return;
  }

  // Exito: commit del avance en memoria + envio.
  deps.state.turnNumber = nextTurn;
  deps.state.phase = nextPhase;
  send(deps.socket, { type: 'interviewer.message', payload: msg });
  sendState(deps);
}
