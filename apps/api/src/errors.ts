import type { ApiError } from '@warachikuy/shared-types';

// Helper para construir respuestas de error uniformes. Mantiene la shape
// exacta del ApiErrorSchema de shared-types para que el frontend pueda
// validarla con safeParse en su interceptor.
export function apiError(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): ApiError {
  return {
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  };
}
