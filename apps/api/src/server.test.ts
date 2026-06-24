import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import RedisMock from 'ioredis-mock';
import type Redis from 'ioredis';
import type { FastifyInstance } from 'fastify';
import { buildServer } from './server';
import { loadEnv } from './config/env';
import { makeTestDb } from './db/test-helpers.js';

const testEnv = loadEnv({
  PORT: '3000',
  DATABASE_URL: 'postgresql://x:x@x/x',
  REDIS_URL: 'redis://x:6379',
  GEMINI_API_KEY: 'k',
  LOG_LEVEL: 'silent',
  CORS_ORIGINS: 'http://localhost:5173',
});

describe('buildServer', () => {
  let server: FastifyInstance;
  let redis: Redis;

  beforeEach(async () => {
    redis = new RedisMock() as unknown as Redis;
    server = await buildServer(testEnv, { redis });
  });

  afterEach(async () => {
    await server.close();
  });

  it('responde 200 con {status:"ok"} en /health', async () => {
    const res = await server.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ status: 'ok' });
  });

  it('responde 204 al preflight CORS de un origen permitido', async () => {
    const res = await server.inject({
      method: 'OPTIONS',
      url: '/health',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'GET',
      },
    });
    expect(res.statusCode).toBe(204);
  });

  it('responde 200 a petición de origen no permitido sin header access-control-allow-origin', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'http://evil.example.com' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('redacta ?token= en los logs de request', async () => {
    // Capturamos el output del logger de Fastify pasandole un stream que
    // acumula los chunks. Usamos un sub-server con LOG_LEVEL=info y
    // destination custom para no contaminar la suite con logs reales.
    const writes: string[] = [];
    const captureStream = {
      write: (chunk: string) => {
        writes.push(chunk);
        return true;
      },
    };
    const captureEnv = { ...testEnv, LOG_LEVEL: 'info' as const };
    const sub = await buildServer(captureEnv, { redis, loggerDestination: captureStream });

    await sub.inject({
      method: 'GET',
      url: '/health?token=' + 'a'.repeat(64),
    });

    const joined = writes.join('');
    expect(joined).toContain('REDACTED');
    expect(joined).not.toContain('a'.repeat(64));
    await sub.close();
  });

  it('handler de errores convierte excepciones no atrapadas al envelope ApiError', async () => {
    // Registramos una ruta temporal que lanza para verificar el handler global.
    server.get('/_test/throws-sync', () => {
      throw new Error('boom');
    });
    const res = await server.inject({ method: 'GET', url: '/_test/throws-sync' });
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body)).toEqual({
      error: { code: 'internal_error', message: 'Error interno' },
    });
  });

  it('handler de errores convierte rechazos async al envelope ApiError', async () => {
    server.get('/_test/throws-async', async () => {
      await Promise.reject(new Error('async boom'));
    });
    const res = await server.inject({ method: 'GET', url: '/_test/throws-async' });
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body)).toEqual({
      error: { code: 'internal_error', message: 'Error interno' },
    });
  });

  it('una ruta generica hereda el rate-limit global por default (opt-out)', async () => {
    // Con global: true, cualquier ruta sin override ni allowList recibe el
    // limite default. La presencia del header x-ratelimit-limit confirma que
    // el rate-limit se aplico, y su valor confirma el default de 1000.
    server.get('/_test/plain', async () => ({ ok: true }));
    const res = await server.inject({ method: 'GET', url: '/_test/plain' });
    expect(res.statusCode).toBe(200);
    expect(Number(res.headers['x-ratelimit-limit'])).toBe(1000);
  });

  it('/health esta exento del rate-limit (allowList por path)', async () => {
    // allowList exime el healthcheck operacional: no debe llevar headers de
    // rate-limit. Esto valida que la allowList matchea por path y no por IP.
    const res = await server.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-ratelimit-limit']).toBeUndefined();
  });

  it('POST /api/v1/sessions mantiene su override de 60/h sobre el global', async () => {
    // La ruta tiene su propio config.rateLimit que sobreescribe el default
    // global. El body vacio devuelve 400 pero el header de rate-limit se
    // agrega igual porque el hook corre antes del handler.
    const res = await server.inject({ method: 'POST', url: '/api/v1/sessions', payload: {} });
    expect(Number(res.headers['x-ratelimit-limit'])).toBe(60);
  });
});

describe('decoracion de db', () => {
  it('expone server.db cuando se inyecta por deps', async () => {
    const redis = new RedisMock() as unknown as Redis;
    const db = await makeTestDb();
    const server = await buildServer(testEnv, { redis, db });
    expect(server.db).toBe(db);
    await server.close();
  });
});
