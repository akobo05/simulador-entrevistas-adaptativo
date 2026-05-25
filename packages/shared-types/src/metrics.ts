import { z } from 'zod';

export const MetricNameSchema = z.enum(['fluency', 'eye_contact', 'speech_rate']);
export type MetricName = z.infer<typeof MetricNameSchema>;

export const AuraMetricSchema = z.object({
  name: MetricNameSchema,
  value: z.number().min(0).max(100),
  confidence: z.enum(['low', 'medium', 'high']),
  timestamp: z.number().int(),
});
export type AuraMetric = z.infer<typeof AuraMetricSchema>;
