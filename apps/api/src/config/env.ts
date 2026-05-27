import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY es obligatoria'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  // Origenes permitidos para CORS, separados por coma. Por defecto el
  // frontend de desarrollo (Vite). En produccion el deploy de Vercel
  // debe agregar su propio dominio aqui.
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((s) =>
      s
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    ),
  WS_BASE_URL: z.string().url().default('ws://localhost:3000'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Error lanzado por loadEnv cuando las variables de entorno no validan.
 * Se modela como clase para que el caller pueda discriminarlo con
 * `err instanceof EnvValidationError` y manejarlo distinto de errores
 * genericos.
 */
export class EnvValidationError extends Error {
  constructor(public readonly issues: z.ZodFormattedError<unknown>) {
    super('Variables de entorno invalidas');
    this.name = 'EnvValidationError';
  }
}

/**
 * Valida y devuelve las variables de entorno tipadas.
 * No mata el proceso. El caller decide que hacer si lanza
 * EnvValidationError (tipicamente en `index.ts`: loguear y salir).
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    throw new EnvValidationError(parsed.error.format());
  }
  return parsed.data;
}
