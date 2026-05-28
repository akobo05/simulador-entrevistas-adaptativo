import { describe, it, expect } from 'vitest';
import { loadEnv, EnvValidationError } from './env';

/** Base de variables validas. Cada test agrega/modifica solo lo que prueba. */
const baseEnv: NodeJS.ProcessEnv = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  GEMINI_API_KEY: 'sample-key',
};

describe('loadEnv', () => {
  describe('valores por defecto', () => {
    it('aplica el PORT por defecto cuando no esta presente', () => {
      const env = loadEnv(baseEnv);
      expect(env.PORT).toBe(3000);
    });

    it('aplica LOG_LEVEL info por defecto', () => {
      const env = loadEnv(baseEnv);
      expect(env.LOG_LEVEL).toBe('info');
    });

    it('aplica CORS_ORIGINS con el frontend de Vite por defecto', () => {
      const env = loadEnv(baseEnv);
      expect(env.CORS_ORIGINS).toEqual(['http://localhost:5173']);
    });
  });

  describe('PORT', () => {
    it('coerce string numerico a number', () => {
      const env = loadEnv({ ...baseEnv, PORT: '8080' });
      expect(env.PORT).toBe(8080);
      expect(typeof env.PORT).toBe('number');
    });

    it('lanza EnvValidationError cuando PORT no es numerico', () => {
      expect(() => loadEnv({ ...baseEnv, PORT: '3000abc' })).toThrow(EnvValidationError);
    });

    it('lanza EnvValidationError cuando PORT es negativo', () => {
      expect(() => loadEnv({ ...baseEnv, PORT: '-1' })).toThrow(EnvValidationError);
    });
  });

  describe('CORS_ORIGINS transform', () => {
    it('divide una lista normal separada por coma', () => {
      const env = loadEnv({ ...baseEnv, CORS_ORIGINS: 'http://a.com,http://b.com,http://c.com' });
      expect(env.CORS_ORIGINS).toEqual(['http://a.com', 'http://b.com', 'http://c.com']);
    });

    it('trimea espacios alrededor de cada origen', () => {
      const env = loadEnv({
        ...baseEnv,
        CORS_ORIGINS: 'http://a.com,  http://b.com  ,http://c.com',
      });
      expect(env.CORS_ORIGINS).toEqual(['http://a.com', 'http://b.com', 'http://c.com']);
    });

    it('descarta entradas vacias por comas dobles', () => {
      const env = loadEnv({ ...baseEnv, CORS_ORIGINS: 'http://a.com,,http://b.com' });
      expect(env.CORS_ORIGINS).toEqual(['http://a.com', 'http://b.com']);
    });

    it('devuelve array vacio cuando el valor es solo whitespace y comas', () => {
      const env = loadEnv({ ...baseEnv, CORS_ORIGINS: ' , , ' });
      expect(env.CORS_ORIGINS).toEqual([]);
    });

    it('acepta un solo origen sin coma', () => {
      const env = loadEnv({ ...baseEnv, CORS_ORIGINS: 'http://only.com' });
      expect(env.CORS_ORIGINS).toEqual(['http://only.com']);
    });
  });

  describe('GEMINI_API_KEY', () => {
    it('lanza EnvValidationError cuando esta ausente', () => {
      const { GEMINI_API_KEY: _omit, ...without } = baseEnv;
      expect(() => loadEnv(without)).toThrow(EnvValidationError);
    });

    it('lanza EnvValidationError cuando es string vacio', () => {
      expect(() => loadEnv({ ...baseEnv, GEMINI_API_KEY: '' })).toThrow(EnvValidationError);
    });
  });

  describe('DATABASE_URL y REDIS_URL', () => {
    it('lanza EnvValidationError cuando DATABASE_URL no es URL', () => {
      expect(() => loadEnv({ ...baseEnv, DATABASE_URL: 'no-es-url' })).toThrow(EnvValidationError);
    });

    it('lanza EnvValidationError cuando REDIS_URL esta ausente', () => {
      const { REDIS_URL: _omit, ...without } = baseEnv;
      expect(() => loadEnv(without)).toThrow(EnvValidationError);
    });
  });

  describe('LOG_LEVEL enum', () => {
    it('acepta valores validos del enum', () => {
      const env = loadEnv({ ...baseEnv, LOG_LEVEL: 'debug' });
      expect(env.LOG_LEVEL).toBe('debug');
    });

    it('lanza EnvValidationError para valores fuera del enum', () => {
      expect(() => loadEnv({ ...baseEnv, LOG_LEVEL: 'verbose' })).toThrow(EnvValidationError);
    });
  });

  describe('EnvValidationError', () => {
    it('expone el formato de issues de Zod', () => {
      try {
        loadEnv({ ...baseEnv, GEMINI_API_KEY: '' });
        expect.fail('Debio lanzar EnvValidationError');
      } catch (err) {
        expect(err).toBeInstanceOf(EnvValidationError);
        if (err instanceof EnvValidationError) {
          expect(err.issues).toBeDefined();
          expect(JSON.stringify(err.issues)).toContain('GEMINI_API_KEY');
        }
      }
    });
  });
});

describe('WS_BASE_URL', () => {
  const fullEnv = {
    PORT: '3000',
    DATABASE_URL: 'postgresql://x:x@x/x',
    REDIS_URL: 'redis://x:6379',
    GEMINI_API_KEY: 'k',
    LOG_LEVEL: 'info',
    CORS_ORIGINS: 'http://localhost:5173',
  };

  it('aplica ws://localhost:3000 por defecto cuando no se especifica', () => {
    const env = loadEnv(fullEnv);
    expect(env.WS_BASE_URL).toBe('ws://localhost:3000');
  });

  it('respeta WS_BASE_URL del entorno cuando se provee', () => {
    const env = loadEnv({ ...fullEnv, WS_BASE_URL: 'wss://api.warachikuy.com' });
    expect(env.WS_BASE_URL).toBe('wss://api.warachikuy.com');
  });

  it('rechaza WS_BASE_URL que no sea URL valida', () => {
    expect(() => loadEnv({ ...fullEnv, WS_BASE_URL: 'not a url' })).toThrow();
  });
});
