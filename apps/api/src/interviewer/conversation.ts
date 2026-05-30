import type Redis from 'ioredis';
import type { FastifyBaseLogger } from 'fastify';
import {
  ConversationEntrySchema,
  type ConversationEntry,
  type SessionState,
} from '@warachikuy/shared-types';
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
  // exec() devuelve null si la conexion se cae antes de procesar el pipeline.
  // Lo tratamos como fallo: el turno NO se persistio, hay que avisarle al caller
  // (no tragarlo, o el estado en memoria avanzaria sin reflejo en Redis).
  if (results === null) {
    throw new Error('el pipeline de Redis devolvio null (conexion perdida)');
  }
  const failed = results.find(([err]) => err != null);
  if (failed && failed[0]) throw failed[0];
}

// Lee el historial completo de la conversacion en orden cronologico. Valida
// cada entrada con ConversationEntrySchema: una entrada corrupta se omite y se
// loguea en vez de tumbar toda la lectura (que en el connect colgaria al
// cliente). En F1 controlamos todas las escrituras, asi que una corrupta
// implica un bug; preferimos degradar y avisar antes que romper.
export async function readHistory(
  redis: Redis,
  sessionId: string,
  log?: FastifyBaseLogger,
): Promise<ConversationEntry[]> {
  const raw = await redis.lrange(messagesKey(sessionId), 0, -1);
  const entries: ConversationEntry[] = [];
  for (const s of raw) {
    let json: unknown;
    try {
      json = JSON.parse(s);
    } catch {
      log?.error({ sessionId }, 'entrada del historial no es JSON valido, se omite');
      continue;
    }
    const parsed = ConversationEntrySchema.safeParse(json);
    if (parsed.success) {
      entries.push(parsed.data);
    } else {
      log?.error({ sessionId }, 'entrada del historial no matchea el schema, se omite');
    }
  }
  return entries;
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
