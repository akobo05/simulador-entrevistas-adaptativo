import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  CreateSessionRequestSchema,
  SessionStateSchema,
  WS_CLOSE_CODES,
} from '@warachikuy/shared-types';
import { createSession, SESSION_TTL_SECONDS } from '../services/sessions.service.js';
import { apiError } from '../errors.js';
import { tryStartGenerating, readPlan, setPlanFailed } from '../interviewer/plan-store.js';
import { generatePlan } from '../interviewer/coach.service.js';
import { GENERATION_TIMEOUT_SECONDS } from '../interviewer/constants.js';

// SESSION_TTL_SECONDS se importa del service: fuente unica para el TTL al
// reescribir la sesion en /end y no acortar ni alargar su vida.

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

  server.post<{ Params: { sessionId: string } }>('/sessions/:sessionId/end', async (req, reply) => {
    const { sessionId } = req.params;
    const raw = await server.redis.get(`session:${sessionId}`);
    if (!raw) {
      return reply.code(404).send(apiError('session_not_found', 'Sesion no encontrada'));
    }
    const parsedState = SessionStateSchema.safeParse(JSON.parse(raw));
    if (!parsedState.success) {
      return reply.code(500).send(apiError('internal_error', 'Estado de sesion corrupto'));
    }
    const state = parsedState.data;

    const planId = crypto.randomUUID();
    const now = Date.now();
    const won = await tryStartGenerating(server.redis, sessionId, planId, now);

    if (!won) {
      // Otro /end ya arranco la generacion: idempotente, devolvemos su planId.
      const existing = await readPlan(server.redis, sessionId);
      return reply.code(202).send({ sessionId, planId: existing?.planId ?? planId });
    }

    // Ganamos el guard: cerramos la sesion y disparamos la generacion async.
    const ended = { ...state, status: 'ended' as const };
    await server.redis.set(
      `session:${sessionId}`,
      JSON.stringify(ended),
      'EX',
      SESSION_TTL_SECONDS,
    );
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
  });

  server.get<{ Params: { sessionId: string } }>('/sessions/:sessionId/plan', async (req, reply) => {
    const { sessionId } = req.params;
    const record = await readPlan(server.redis, sessionId);
    if (!record) {
      return reply.code(404).send(apiError('plan_not_found', 'Plan no encontrado'));
    }
    if (record.status === 'ready') {
      return reply.code(200).send({ plan: record.plan });
    }
    if (record.status === 'failed') {
      return reply.code(200).send({ status: 'failed' });
    }
    // generating: si supero el timeout, lo damos por fallido (proceso colgado).
    // La escritura es segura ante polls concurrentes: dos GET simultaneos que
    // escriben 'failed' para el mismo planId convergen al mismo estado.
    const age = Date.now() - (record.generatingSince ?? 0);
    if (age > GENERATION_TIMEOUT_SECONDS * 1000) {
      await setPlanFailed(server.redis, sessionId, record.planId);
      return reply.code(200).send({ status: 'failed' });
    }
    return reply.code(202).send({ status: 'generating' });
  });
}
