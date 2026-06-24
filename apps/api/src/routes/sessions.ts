import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  CreateSessionRequestSchema,
  INDUSTRIES,
  SessionSummarySchema,
  WS_CLOSE_CODES,
} from '@warachikuy/shared-types';
import type { ValidateTokenResult } from '../ws/auth.js';
import { createSession } from '../services/sessions.service.js';
import { apiError } from '../errors.js';
import { tryStartGenerating, readPlan, setPlanFailed } from '../interviewer/plan-store.js';
import { generatePlan } from '../interviewer/coach.service.js';
import { GENERATION_TIMEOUT_SECONDS, PLAN_TTL_SECONDS } from '../interviewer/constants.js';
import { validateSessionToken } from '../ws/auth.js';
import { readHistory } from '../interviewer/conversation.js';
import { readAggregate } from '../interviewer/metrics-aggregator.js';
import { archiveSession } from '../db/session-archive.js';

// Codigo de error que devuelve validateSessionToken cuando falla la auth.
type AuthErrorCode = Extract<ValidateTokenResult, { ok: false }>['code'];

// Mensaje en espanol para cada codigo de auth, compartido por las rutas que
// validan el token de sesion (/end, /plan y GET /sessions/:id).
function authErrorMessage(code: AuthErrorCode): string {
  const messages: Record<AuthErrorCode, string> = {
    invalid_input: 'Token invalido',
    invalid_token: 'Token invalido',
    session_not_found: 'Sesion no encontrada',
    internal_error: 'Estado de sesion corrupto',
  };
  return messages[code];
}

export async function registerSessionsRoutes(server: FastifyInstance): Promise<void> {
  server.post(
    '/sessions',
    {
      config: {
        // Rate limit por IP: 60 sesiones/hora según spec arquitectónica 3.7
        rateLimit: { max: 60, timeWindow: '1 hour' },
      },
    },
    async (req, reply) => {
      const parsed = CreateSessionRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send(apiError('invalid_input', 'Body invalido', parsed.error.format()));
      }

      try {
        const response = await createSession(server.redis, parsed.data, server.env);
        return reply.code(201).send(response);
      } catch (err) {
        req.log.error({ err }, 'Error creando sesion');
        return reply.code(500).send(apiError('internal_error', 'No se pudo crear la sesion'));
      }
    },
  );

  server.post<{ Params: { sessionId: string }; Querystring: { token?: string } }>(
    '/sessions/:sessionId/end',
    {
      config: {
        // Rate limit por IP, mismo shape que POST /sessions: /end dispara la
        // generacion del plan (costosa), basta un tope modesto por hora.
        rateLimit: { max: 60, timeWindow: '1 hour' },
      },
    },
    async (req, reply) => {
      const { sessionId } = req.params;
      // El sessionId es publico; exigimos el token de sesion (timing-safe) igual
      // que el WS. No chequeamos status=active: /end es idempotente y puede
      // llamarse cuando la sesion ya esta 'ended'. validateSessionToken ya
      // resuelve 404/500 (reemplaza el redis.get + safeParse manual).
      const auth = await validateSessionToken(server.redis, sessionId, req.query.token, req.log);
      if (!auth.ok) {
        return reply.code(auth.status).send(apiError(auth.code, authErrorMessage(auth.code)));
      }
      const state = auth.state;

      const planId = crypto.randomUUID();
      const now = Date.now();
      const won = await tryStartGenerating(server.redis, sessionId, planId, now);

      if (!won) {
        // Otro /end ya arranco la generacion: idempotente, devolvemos su planId.
        const existing = await readPlan(server.redis, sessionId, req.log);
        return reply.code(202).send({ sessionId, planId: existing?.planId ?? planId });
      }

      // Ganamos el guard: cerramos la sesion y disparamos la generacion async.
      const ended = { ...state, status: 'ended' as const };
      // Reescribimos la sesion 'ended' con EX = PLAN_TTL_SECONDS (no el TTL de
      // sesion): la sesion debe sobrevivir tanto como su plan para que GET /plan
      // pueda validar el token despues de vencido el TTL original de la sesion.
      await server.redis.set(`session:${sessionId}`, JSON.stringify(ended), 'EX', PLAN_TTL_SECONDS);
      server.connections.get(sessionId)?.close(WS_CLOSE_CODES.SESSION_EXPIRED, 'session_ended');

      // Espejo durable en Postgres (aditivo): la sesion debe sobrevivir el TTL
      // de Redis para el historial (#51), la calibracion (#58) y el plan relativo
      // (#60). Falla NO fatal: la entrevista y el plan viven en Redis.
      try {
        const transcript = await readHistory(server.redis, sessionId, req.log);
        const metrics = await readAggregate(server.redis, sessionId, req.log);
        await archiveSession(server.db, {
          id: sessionId,
          industry: ended.industry,
          level: ended.level,
          status: ended.status,
          startedAt: new Date(ended.startedAt),
          endedAt: new Date(now),
          durationMs: now - ended.startedAt,
          transcript,
          metrics,
        });
      } catch (err) {
        req.log.error({ err, sessionId }, 'no se pudo archivar la sesion en Postgres');
      }

      void generatePlan(
        { redis: server.redis, gemini: server.gemini, log: req.log, db: server.db },
        ended,
        planId,
      ).catch((err: unknown) => {
        req.log.error({ err, sessionId }, 'generatePlan rechazo inesperado');
        return setPlanFailed(server.redis, sessionId, planId);
      });

      return reply.code(202).send({ sessionId, planId });
    },
  );

  server.get<{ Params: { sessionId: string }; Querystring: { token?: string } }>(
    '/sessions/:sessionId/plan',
    async (req, reply) => {
      const { sessionId } = req.params;
      // El token se valida contra la sesion (que ahora vive tanto como el plan);
      // el sessionId solo no basta. No chequeamos status=active: /plan se consulta
      // despues de /end, cuando la sesion ya esta 'ended'.
      const auth = await validateSessionToken(server.redis, sessionId, req.query.token, req.log);
      if (!auth.ok) {
        return reply.code(auth.status).send(apiError(auth.code, authErrorMessage(auth.code)));
      }

      const record = await readPlan(server.redis, sessionId, req.log);
      if (!record) {
        return reply.code(404).send(apiError('plan_not_found', 'Plan no encontrado'));
      }
      if (record.status === 'ready') {
        return reply.code(200).send({ status: 'ready', plan: record.plan });
      }
      if (record.status === 'failed') {
        return reply.code(200).send({ status: 'failed' });
      }
      // generating: si supero el timeout, lo damos por fallido (proceso colgado).
      // La escritura es segura ante polls concurrentes: dos GET simultaneos que
      // escriben 'failed' para el mismo planId convergen al mismo estado.
      // TODO(F2): mover este marcado a un reaper de sesiones huerfanas cuando haya
      // un job runner (BullMQ), en vez de mutar estado dentro de un GET.
      const age = Date.now() - record.generatingSince;
      if (age > GENERATION_TIMEOUT_SECONDS * 1000) {
        await setPlanFailed(server.redis, sessionId, record.planId);
        return reply.code(200).send({ status: 'failed' });
      }
      return reply.code(202).send({ status: 'generating' });
    },
  );

  server.get<{ Params: { sessionId: string }; Querystring: { token?: string } }>(
    '/sessions/:sessionId',
    async (req, reply) => {
      const { sessionId } = req.params;
      // El sessionId es publico; exigimos el token (timing-safe) igual que /end
      // y /plan. Devolvemos un resumen que omite el token (secreto) y la fase
      // (estado interno del arco).
      const auth = await validateSessionToken(server.redis, sessionId, req.query.token, req.log);
      if (!auth.ok) {
        return reply.code(auth.status).send(apiError(auth.code, authErrorMessage(auth.code)));
      }
      // SessionSummarySchema es la fuente unica de la shape: Zod descarta las
      // claves desconocidas (token, phase) y valida en runtime, evitando drift
      // entre el schema y el literal de respuesta.
      return reply.code(200).send({ session: SessionSummarySchema.parse(auth.state) });
    },
  );

  server.get('/industries', async (_req, reply) => {
    // Endpoint publico: alimenta el selector del formulario de inicio (#42).
    return reply.code(200).send({ industries: INDUSTRIES });
  });
}
