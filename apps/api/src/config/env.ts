import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY es obligatoria'),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    console.error('Variables de entorno inválidas:');
    console.error(parsed.error.format());
    process.exit(1);
  }
  return parsed.data;
}
