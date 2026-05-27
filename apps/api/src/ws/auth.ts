import { z } from 'zod';
import type Redis from 'ioredis';
import { SessionStateSchema, type SessionState } from '@warachikuy/shared-types';

// Schema del query param. z.string() rechaza arrays automaticamente, lo
// que defiende contra ?token=A&token=B aunque el querystring parser de
// Fastify cambie en el futuro.
const TokenQuerySchema = z.string().regex(/^[0-9a-f]{64}$/);

export type ValidateUpgradeResult =
  | { ok: true; state: SessionState }
  | {
      ok: false;
      status: 400 | 401 | 404 | 410 | 500;
      code:
        | 'invalid_input'
        | 'invalid_token'
        | 'session_not_found'
        | 'session_expired'
        | 'internal_error';
    };

export async function validateUpgrade(
  redis: Redis,
  sessionId: string,
  token: string | undefined,
): Promise<ValidateUpgradeResult> {
  const tokenCheck = TokenQuerySchema.safeParse(token);
  if (!tokenCheck.success) {
    return { ok: false, status: 400, code: 'invalid_input' };
  }

  const raw = await redis.get(`session:${sessionId}`);
  if (!raw) {
    return { ok: false, status: 404, code: 'session_not_found' };
  }

  // Si el payload en Redis no parsea contra el schema es un bug nuestro
  // (lo escribimos en createSession). Devolvemos 500, no 401, porque no
  // es culpa del cliente.
  let state: SessionState;
  try {
    const parsed = SessionStateSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      return { ok: false, status: 500, code: 'internal_error' };
    }
    state = parsed.data;
  } catch {
    return { ok: false, status: 500, code: 'internal_error' };
  }

  if (state.token !== tokenCheck.data) {
    return { ok: false, status: 401, code: 'invalid_token' };
  }
  if (state.status !== 'active') {
    return { ok: false, status: 410, code: 'session_expired' };
  }
  return { ok: true, state };
}
