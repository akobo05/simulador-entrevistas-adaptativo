import { z } from 'zod';

export const MetricNameSchema = z.enum([
  'fluency', // porcentaje de palabras sin muletilla en los últimos 30 segundos
  'eye_contact', // porcentaje del tiempo con mirada al centro de la cámara
  'speech_rate', // palabras por minuto, ideal entre 130 y 160
]);
export type MetricName = z.infer<typeof MetricNameSchema>;

export const AuraMetricSchema = z.object({
  name: MetricNameSchema,
  value: z.number().min(0).max(100), // valor normalizado 0-100
  confidence: z.enum(['low', 'medium', 'high']),
  timestamp: z.number().int(), // unix ms
});
export type AuraMetric = z.infer<typeof AuraMetricSchema>;

export const AuraStateSchema = z.object({
  sessionId: z.string().uuid(),
  metrics: z.array(AuraMetricSchema).max(10),
  collectedAt: z.number().int(),
});
export type AuraState = z.infer<typeof AuraStateSchema>;
