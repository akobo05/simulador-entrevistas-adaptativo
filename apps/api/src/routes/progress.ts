import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { apiError } from '../errors.js';
import { listCandidateSessions } from '../db/session-archive.js';
import { buildProgressSummary } from '../interviewer/progress-aggregator.js';

export async function registerProgressRoutes(server: FastifyInstance): Promise<void> {
  server.get<{ Params: { candidateId: string } }>(
    '/candidates/:candidateId/progress',
    async (req, reply) => {
      // El candidateId es un uuid anonimo (capability de lectura, sin auth: el
      // modelo de confianza del MVP de #56; auth real es F5).
      const parsed = z.string().uuid().safeParse(req.params.candidateId);
      if (!parsed.success) {
        return reply.code(400).send(apiError('invalid_input', 'candidateId invalido'));
      }
      try {
        const rows = await listCandidateSessions(server.db, parsed.data);
        return reply.code(200).send(buildProgressSummary(parsed.data, rows));
      } catch (err) {
        req.log.error({ err, candidateId: parsed.data }, 'no se pudo leer el progreso');
        return reply.code(500).send(apiError('internal_error', 'No se pudo leer el progreso'));
      }
    },
  );
}
