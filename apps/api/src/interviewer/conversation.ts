import type Redis from 'ioredis';
import type { ConversationEntry, SessionState } from '@warachikuy/shared-types';
import { SESSION_REFRESH_TTL_SECONDS } from '../ws/constants.js';

function messagesKey(sessionId: string): string {
  return `session:messages:${sessionId}`;
}
function askedKey(sessionId: string): string {
  return `session:asked:${sessionId}`;
}
function sessionKey(sessionId: string): string {
  return `session:${sessionId}`;
}

// ioredis exec() resuelve a un array de tuplas [err, result]: un fallo de un
// comando individual NO rechaza la promesa, viene en su tupla. Lo revisamos y
// lanzamos para que el orquestador trate el turno como fallido en vez de creer
// que persistio. Sigue sin ser transaccional (pipeline, no MULTI/EXEC): es un
// trade-off aceptado para F1 single-instance (ver spec seccion 6).
async function execOrThrow(pipe: ReturnType<Redis['pipeline']>): Promise<void> {
  const results = await pipe.exec();
  const failed = results?.find(([err]) => err != null);
  if (failed && failed[0]) throw failed[0];
}

// Lee el historial completo de la conversacion en orden cronologico.
export async function readHistory(redis: Redis, sessionId: string): Promise<ConversationEntry[]> {
  const raw = await redis.lrange(messagesKey(sessionId), 0, -1);
  return raw.map((s) => JSON.parse(s) as ConversationEntry);
}

// Persiste el turno inicial del entrevistador (warmup, sin respuesta previa
// del candidato) y el SessionState, en un solo pipeline con TTL.
export async function appendWarmupTurn(
  redis: Redis,
  state: SessionState,
  interviewer: ConversationEntry,
): Promise<void> {
  const id = state.id;
  const pipe = redis
    .pipeline()
    .rpush(messagesKey(id), JSON.stringify(interviewer))
    .set(sessionKey(id), JSON.stringify(state))
    .expire(messagesKey(id), SESSION_REFRESH_TTL_SECONDS)
    .expire(sessionKey(id), SESSION_REFRESH_TTL_SECONDS);
  await execOrThrow(pipe);
}

// Persiste el turno del candidato + la respuesta del entrevistador + el
// SessionState actualizado + (opcional) la troncal usada, en un solo pipeline
// (batch, NO transaccional: ver spec seccion 6). Solo se llama tras una
// generacion exitosa, para no dejar dos turnos 'candidate' seguidos si el LLM
// fallo.
export async function appendCandidateTurn(
  redis: Redis,
  state: SessionState,
  candidate: ConversationEntry,
  interviewer: ConversationEntry,
  seedId?: string,
): Promise<void> {
  const id = state.id;
  const pipe = redis
    .pipeline()
    .rpush(messagesKey(id), JSON.stringify(candidate), JSON.stringify(interviewer))
    .set(sessionKey(id), JSON.stringify(state))
    .expire(messagesKey(id), SESSION_REFRESH_TTL_SECONDS)
    .expire(sessionKey(id), SESSION_REFRESH_TTL_SECONDS);
  if (seedId) {
    pipe.sadd(askedKey(id), seedId).expire(askedKey(id), SESSION_REFRESH_TTL_SECONDS);
  }
  await execOrThrow(pipe);
}
