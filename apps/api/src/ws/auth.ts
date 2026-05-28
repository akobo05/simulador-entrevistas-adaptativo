import crypto from 'node:crypto';
import { z } from 'zod';
import type Redis from 'ioredis';
import type { FastifyBaseLogger } from 'fastify';
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
  log: FastifyBaseLogger,
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
      // Loguear el detalle de que campo del schema fallo. Esto pasa si Redis
      // tiene un payload antiguo (cambio de schema), una migracion mal hecha,
      // o si alguien manipulo la key manualmente con redis-cli.
      log.error(
        { sessionId, schemaErrors: parsed.error.format() },
        'session payload no matchea SessionStateSchema',
      );
      return { ok: false, status: 500, code: 'internal_error' };
    }
    state = parsed.data;
  } catch (err) {
    // Loguear el SyntaxError de JSON.parse. Esto pasa si lo que esta en
    // Redis no es JSON valido (corrupcion, escritura mal formada).
    log.error({ err, sessionId }, 'session payload no es JSON valido');
    return { ok: false, status: 500, code: 'internal_error' };
  }

  // Comparacion timing-safe. La comparacion con !== hace short-circuit en
  // el primer byte distinto, lo que en teoria expone un side-channel de
  // tiempo. crypto.timingSafeEqual recorre los bytes en tiempo constante.
  // Ambos buffers son de 32 bytes (los regex garantizan 64 hex chars).
  const expected = Buffer.from(state.token, 'hex');
  const provided = Buffer.from(tokenCheck.data, 'hex');
  if (!crypto.timingSafeEqual(expected, provided)) {
    return { ok: false, status: 401, code: 'invalid_token' };
  }
  if (state.status !== 'active') {
    return { ok: false, status: 410, code: 'session_expired' };
  }
  return { ok: true, state };
}
