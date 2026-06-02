import crypto from 'node:crypto';
import { z } from 'zod';
import type Redis from 'ioredis';
import type { FastifyBaseLogger } from 'fastify';
import { SessionStateSchema, type SessionState } from '@warachikuy/shared-types';

// Schema del query param. z.string() rechaza arrays automaticamente, lo
// que defiende contra ?token=A&token=B aunque el querystring parser de
// Fastify cambie en el futuro.
const TokenQuerySchema = z.string().regex(/^[0-9a-f]{64}$/);

// Resultado de validar solo el token de sesion (sin chequear el status). Cubre
// los casos 400/401/404/500 comunes al WS y a las rutas REST.
export type ValidateTokenResult =
  | { ok: true; state: SessionState }
  | {
      ok: false;
      status: 400 | 401 | 404 | 500;
      code: 'invalid_input' | 'invalid_token' | 'session_not_found' | 'internal_error';
    };

// validateUpgrade agrega al validador de token el chequeo de status=active,
// que solo aplica al handshake del WS (no a las rutas REST /end y /plan).
export type ValidateUpgradeResult =
  | ValidateTokenResult
  | { ok: false; status: 410; code: 'session_expired' };

// Valida el token de sesion contra el estado en Redis en tiempo constante.
// No chequea el status: lo reusan tanto el WS (via validateUpgrade) como las
// rutas REST /end y /plan, que operan sobre sesiones ya 'ended'.
export async function validateSessionToken(
  redis: Redis,
  sessionId: string,
  token: string | undefined,
  log: FastifyBaseLogger,
): Promise<ValidateTokenResult> {
  const tokenCheck = TokenQuerySchema.safeParse(token);
  if (!tokenCheck.success) {
    return { ok: false, status: 400, code: 'invalid_input' };
  }

  const raw = await redis.get(`session:${sessionId}`);
  if (!raw) {
    // Devolvemos 404 antes de validar el token: esto revela si un sessionId existe,
    // pero es aceptable porque el sessionId es un UUIDv4 de alta entropia (adivinarlo
    // es inviable) y el token sigue siendo el secreto que protege los datos.
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
  return { ok: true, state };
}

export async function validateUpgrade(
  redis: Redis,
  sessionId: string,
  token: string | undefined,
  log: FastifyBaseLogger,
): Promise<ValidateUpgradeResult> {
  const tokenResult = await validateSessionToken(redis, sessionId, token, log);
  if (!tokenResult.ok) {
    return tokenResult;
  }
  if (tokenResult.state.status !== 'active') {
    return { ok: false, status: 410, code: 'session_expired' };
  }
  return tokenResult;
}
