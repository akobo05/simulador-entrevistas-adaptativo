import { z } from 'zod';
import type Redis from 'ioredis';
import type { FastifyBaseLogger } from 'fastify';
import type { AuraState } from '@warachikuy/shared-types';
import { SESSION_REFRESH_TTL_SECONDS } from '../ws/constants.js';

const TRACKED = ['fluency', 'eye_contact', 'speech_rate'] as const;
type TrackedMetric = (typeof TRACKED)[number];

export type MetricsAggregate = Record<TrackedMetric, number | null>;

export const MetricsAggregateSchema = z.object({
  fluency: z.number().nullable(),
  eye_contact: z.number().nullable(),
  speech_rate: z.number().nullable(),
});

// Promedio corriente en memoria por metrica del aura. Vive por conexion en el
// handler del WS; una conexion por sesion (ConnectionRegistry).
export class MetricsAggregator {
  private acc: Record<TrackedMetric, { sum: number; count: number }> = {
    fluency: { sum: 0, count: 0 },
    eye_contact: { sum: 0, count: 0 },
    speech_rate: { sum: 0, count: 0 },
  };

  add(state: AuraState): void {
    for (const m of state.metrics) {
      const acc = this.acc[m.name as TrackedMetric];
      // Solo las 3 rastreadas. Descartamos las muestras de baja confianza: si una
      // metrica solo tiene muestras 'low' termina sin datos (null) y el plan dira
      // "sin datos" en vez de reportar un numero poco confiable.
      if (acc && m.confidence !== 'low') {
        acc.sum += m.value;
        acc.count += 1;
      }
    }
  }

  // True si se acumulo al menos una muestra de alguna metrica rastreada. Evita
  // persistir un agregado vacio (todo null) que podria pisar datos buenos de
  // una conexion previa tras un reemplazo de sesion.
  hasSamples(): boolean {
    return TRACKED.some((k) => this.acc[k].count > 0);
  }

  snapshot(): MetricsAggregate {
    const out = {} as MetricsAggregate;
    for (const k of TRACKED) {
      const acc = this.acc[k];
      out[k] = acc.count > 0 ? acc.sum / acc.count : null;
    }
    return out;
  }
}

function metricsKey(sessionId: string): string {
  return `session:metrics:${sessionId}`;
}

export async function persistAggregate(
  redis: Redis,
  sessionId: string,
  agg: MetricsAggregate,
): Promise<void> {
  // Merge por-campo: un valor null nunca pisa un valor medido previamente. Asi,
  // tras un reemplazo de sesion, una conexion nueva que solo midio algunas
  // metricas no borra las que ya habia medido la conexion anterior. No es
  // atomico (read-modify-write), aceptable en F1: una conexion por sesion es lo
  // normal y la reconexion es un camino raro.
  const prev = await readAggregate(redis, sessionId);
  const merged: MetricsAggregate = {
    fluency: agg.fluency ?? prev.fluency,
    eye_contact: agg.eye_contact ?? prev.eye_contact,
    speech_rate: agg.speech_rate ?? prev.speech_rate,
  };
  await redis.set(metricsKey(sessionId), JSON.stringify(merged), 'EX', SESSION_REFRESH_TTL_SECONDS);
}

export async function readAggregate(
  redis: Redis,
  sessionId: string,
  log?: FastifyBaseLogger,
): Promise<MetricsAggregate> {
  const raw = await redis.get(metricsKey(sessionId));
  if (!raw) return { fluency: null, eye_contact: null, speech_rate: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    // Blob corrupto: degradamos a sin datos en vez de tumbar la generacion del
    // plan (las metricas son opcionales).
    log?.warn({ err, sessionId }, 'agregado de metricas no es JSON valido; se usa sin datos');
    return { fluency: null, eye_contact: null, speech_rate: null };
  }
  const result = MetricsAggregateSchema.safeParse(parsed);
  if (!result.success) {
    log?.warn(
      { sessionId, schemaErrors: result.error.format() },
      'agregado de metricas no matchea el schema; se usa sin datos',
    );
    return { fluency: null, eye_contact: null, speech_rate: null };
  }
  return result.data;
}
