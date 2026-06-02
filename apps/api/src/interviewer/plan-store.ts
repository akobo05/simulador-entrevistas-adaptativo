import { z } from 'zod';
import type Redis from 'ioredis';
import type { FastifyBaseLogger } from 'fastify';
import type { ImprovementPlan } from '@warachikuy/shared-types';
import { ImprovementPlanSchema } from '@warachikuy/shared-types';
import { PLAN_TTL_SECONDS } from './constants.js';

export const PlanRecordSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('generating'), planId: z.string(), generatingSince: z.number() }),
  z.object({ status: z.literal('ready'), planId: z.string(), plan: ImprovementPlanSchema }),
  z.object({ status: z.literal('failed'), planId: z.string() }),
]);
export type PlanRecord = z.infer<typeof PlanRecordSchema>;
export type PlanStatus = PlanRecord['status'];

function planKey(sessionId: string): string {
  return `session:plan:${sessionId}`;
}

// Guard atomico de idempotencia/concurrencia: crea el placeholder 'generating'
// SOLO si no existe. Devuelve true si gano (este es el primer /end). El SET NX
// es atomico: dos /end simultaneos, solo uno gana.
export async function tryStartGenerating(
  redis: Redis,
  sessionId: string,
  planId: string,
  now: number,
): Promise<boolean> {
  const record = { status: 'generating', planId, generatingSince: now };
  const res = await redis.set(
    planKey(sessionId),
    JSON.stringify(record),
    'EX',
    PLAN_TTL_SECONDS,
    'NX',
  );
  return res === 'OK';
}

export async function readPlan(
  redis: Redis,
  sessionId: string,
  log?: FastifyBaseLogger,
): Promise<PlanRecord | null> {
  const raw = await redis.get(planKey(sessionId));
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    log?.error({ err, sessionId }, 'plan record no es JSON valido');
    return null;
  }
  const result = PlanRecordSchema.safeParse(parsed);
  if (!result.success) {
    log?.error(
      { sessionId, schemaErrors: result.error.format() },
      'plan record no matchea PlanRecordSchema',
    );
    return null;
  }
  return result.data;
}

export async function setPlanReady(
  redis: Redis,
  sessionId: string,
  plan: ImprovementPlan,
): Promise<void> {
  const record = { status: 'ready', planId: plan.planId, plan };
  // Renueva el TTL propio del plan para dar margen de lectura al candidato.
  await redis.set(planKey(sessionId), JSON.stringify(record), 'EX', PLAN_TTL_SECONDS);
}

export async function setPlanFailed(
  redis: Redis,
  sessionId: string,
  planId: string,
): Promise<void> {
  const record = { status: 'failed', planId };
  await redis.set(planKey(sessionId), JSON.stringify(record), 'EX', PLAN_TTL_SECONDS);
}
