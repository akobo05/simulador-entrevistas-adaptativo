import { describe, it, expect } from 'vitest';
import { ApiErrorSchema } from '@warachikuy/shared-types';
import { apiError } from './errors';

describe('apiError', () => {
  it('devuelve estructura mínima sin details', () => {
    const result = apiError('invalid_input', 'Body invalido');
    expect(result).toEqual({
      error: { code: 'invalid_input', message: 'Body invalido' },
    });
  });

  it('incluye details cuando se proveen', () => {
    const result = apiError('invalid_input', 'Body invalido', { field: 'industry' });
    expect(result.error.details).toEqual({ field: 'industry' });
  });

  it('valida con ApiErrorSchema de shared-types', () => {
    const result = apiError('internal_error', 'Algo fallo');
    expect(ApiErrorSchema.safeParse(result).success).toBe(true);
  });
});
