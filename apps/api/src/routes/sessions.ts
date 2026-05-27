import type { FastifyInstance } from 'fastify';
import { CreateSessionRequestSchema } from '@warachikuy/shared-types';
import { createSession } from '../services/sessions.service.js';
import { apiError } from '../errors.js';

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
}
