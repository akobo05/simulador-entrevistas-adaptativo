import type Redis from 'ioredis';
import type { ImprovementPlan } from '@warachikuy/shared-types';
import { PLAN_TTL_SECONDS } from './constants.js';

export type PlanStatus = 'generating' | 'ready' | 'failed';

export interface PlanRecord {
  status: PlanStatus;
  planId: string;
  generatingSince?: number;
  plan?: ImprovementPlan;
}

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
  const record: PlanRecord = { status: 'generating', planId, generatingSince: now };
  const res = await redis.set(
    planKey(sessionId),
    JSON.stringify(record),
    'EX',
    PLAN_TTL_SECONDS,
    'NX',
  );
  return res === 'OK';
}

export async function readPlan(redis: Redis, sessionId: string): Promise<PlanRecord | null> {
  const raw = await redis.get(planKey(sessionId));
  if (!raw) return null;
  return JSON.parse(raw) as PlanRecord;
}

export async function setPlanReady(
  redis: Redis,
  sessionId: string,
  plan: ImprovementPlan,
): Promise<void> {
  const record: PlanRecord = { status: 'ready', planId: plan.planId, plan };
  // Renueva el TTL propio del plan para dar margen de lectura al candidato.
  await redis.set(planKey(sessionId), JSON.stringify(record), 'EX', PLAN_TTL_SECONDS);
}

export async function setPlanFailed(
  redis: Redis,
  sessionId: string,
  planId: string,
): Promise<void> {
  const record: PlanRecord = { status: 'failed', planId };
  await redis.set(planKey(sessionId), JSON.stringify(record), 'EX', PLAN_TTL_SECONDS);
}
