import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getIndustries, createSession, endSession, getPlan, ApiClientError } from './apiClient';

function mockFetch(status: number, body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      statusText: 'x',
    })) as unknown as typeof fetch,
  );
}

describe('apiClient', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    // createSession acuna el candidateId en localStorage; se limpia para no
    // filtrar estado entre tests.
    localStorage.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('getIndustries devuelve la lista', async () => {
    mockFetch(200, { industries: [{ id: 'backend', name: 'Backend' }] });
    expect(await getIndustries()).toEqual([{ id: 'backend', name: 'Backend' }]);
  });

  it('createSession parsea la respuesta', async () => {
    const resp = {
      sessionId: '550e8400-e29b-41d4-a716-446655440000',
      websocketUrl: 'ws://localhost:3000/v1/sessions/x/ws?token=abc',
      token: 'a'.repeat(64),
    };
    mockFetch(201, resp);
    expect(await createSession({ industry: 'backend', level: 'mid' })).toEqual(resp);
  });

  it('createSession adjunta el candidateId al body', async () => {
    const resp = {
      sessionId: '550e8400-e29b-41d4-a716-446655440000',
      websocketUrl: 'ws://localhost:3000/v1/sessions/x/ws?token=abc',
      token: 'a'.repeat(64),
    };
    const fetchMock: ReturnType<typeof vi.fn<typeof fetch>> = vi.fn(
      async () =>
        ({
          ok: true,
          status: 201,
          json: async () => resp,
          statusText: 'x',
        }) as unknown as Response,
    );
    vi.stubGlobal('fetch', fetchMock);
    await createSession({ industry: 'backend', level: 'mid' });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body.candidateId).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('createSession lanza ApiClientError con el code del envelope', async () => {
    mockFetch(400, { error: { code: 'invalid_input', message: 'Body invalido' } });
    await expect(createSession({ industry: 'backend', level: 'mid' })).rejects.toBeInstanceOf(
      ApiClientError,
    );
    await expect(createSession({ industry: 'backend', level: 'mid' })).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'invalid_input',
    });
  });

  it('endSession devuelve sessionId y planId', async () => {
    mockFetch(202, { sessionId: 's1', planId: 'p1' });
    expect(await endSession('s1', 'tok')).toEqual({ sessionId: 's1', planId: 'p1' });
  });

  it('getPlan ready devuelve el plan', async () => {
    const plan = {
      planId: '550e8400-e29b-41d4-a716-446655440000',
      sessionId: '550e8400-e29b-41d4-a716-446655440001',
      summary: 'ok',
      competencies: [],
      strengths: [],
      improvements: [],
      exercises: [],
      generatedAt: 1,
    };
    mockFetch(200, { status: 'ready', plan });
    expect(await getPlan('s1', 'tok')).toEqual({ status: 'ready', plan });
  });

  it('getPlan generating (202) devuelve el status', async () => {
    mockFetch(202, { status: 'generating' });
    expect(await getPlan('s1', 'tok')).toEqual({ status: 'generating' });
  });

  it('getPlan 404 devuelve not_found', async () => {
    mockFetch(404, { error: { code: 'plan_not_found', message: 'x' } });
    expect(await getPlan('s1', 'tok')).toEqual({ status: 'not_found' });
  });
});
