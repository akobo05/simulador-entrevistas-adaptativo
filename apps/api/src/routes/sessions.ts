import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { CreateSessionRequestSchema, WS_CLOSE_CODES } from '@warachikuy/shared-types';
import { createSession } from '../services/sessions.service.js';
import { apiError } from '../errors.js';
import { tryStartGenerating, readPlan, setPlanFailed } from '../interviewer/plan-store.js';
import { generatePlan } from '../interviewer/coach.service.js';
import { GENERATION_TIMEOUT_SECONDS, PLAN_TTL_SECONDS } from '../interviewer/constants.js';
import { validateSessionToken } from '../ws/auth.js';

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
        const messages: Record<typeof auth.code, string> = {
          invalid_input: 'Token invalido',
          invalid_token: 'Token invalido',
          session_not_found: 'Sesion no encontrada',
          internal_error: 'Estado de sesion corrupto',
        };
        return reply.code(auth.status).send(apiError(auth.code, messages[auth.code]));
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

      void generatePlan(
        { redis: server.redis, gemini: server.gemini, log: req.log },
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
        const messages: Record<typeof auth.code, string> = {
          invalid_input: 'Token invalido',
          invalid_token: 'Token invalido',
          session_not_found: 'Sesion no encontrada',
          internal_error: 'Estado de sesion corrupto',
        };
        return reply.code(auth.status).send(apiError(auth.code, messages[auth.code]));
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
}
