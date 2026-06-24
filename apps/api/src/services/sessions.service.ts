// Import explícito de node:crypto. El crypto global de Node 22 implementa
// Web Crypto API y NO expone randomBytes — usar node:crypto unifica ambos
// métodos (randomUUID + randomBytes) en una sola API estable.
import crypto from 'node:crypto';
import type Redis from 'ioredis';
import type {
  CreateSessionRequest,
  CreateSessionResponse,
  SessionState,
} from '@warachikuy/shared-types';
import type { Env } from '../config/env.js';

export const SESSION_TTL_SECONDS = 3600;

export async function createSession(
  redis: Redis,
  request: CreateSessionRequest,
  env: Env,
): Promise<CreateSessionResponse> {
  const sessionId = crypto.randomUUID();
  const token = crypto.randomBytes(32).toString('hex');

  const state: SessionState = {
    id: sessionId,
    industry: request.industry,
    level: request.level,
    status: 'active',
    phase: 'warmup',
    turnNumber: 0,
    startedAt: Date.now(),
    candidateId: request.candidateId,
    token,
  };

  await redis.set(`session:${sessionId}`, JSON.stringify(state), 'EX', SESSION_TTL_SECONDS);

  return {
    sessionId,
    websocketUrl: `${env.WS_BASE_URL}/v1/sessions/${sessionId}/ws?token=${token}`,
    token,
  };
}
