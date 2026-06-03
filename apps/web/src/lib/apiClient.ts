import {
  ApiErrorSchema,
  CreateSessionResponseSchema,
  PlanResponseSchema,
  type CreateSessionRequest,
  type CreateSessionResponse,
  type Industry,
  type PlanResponse,
} from '@warachikuy/shared-types';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export class ApiClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export interface IndustryOption {
  id: Industry;
  name: string;
}

export type PlanFetchResult = PlanResponse | { status: 'not_found' };

// Lee el envelope de error del backend (ApiErrorSchema) si esta presente; si no,
// arma un error http generico.
async function readError(res: Response): Promise<ApiClientError> {
  try {
    const parsed = ApiErrorSchema.safeParse(await res.json());
    if (parsed.success)
      return new ApiClientError(parsed.data.error.code, parsed.data.error.message);
  } catch {
    // cuerpo no-JSON; cae al generico
  }
  return new ApiClientError('http_error', `HTTP ${res.status}`);
}

export async function getIndustries(): Promise<IndustryOption[]> {
  const res = await fetch(`${BASE}/api/v1/industries`);
  if (!res.ok) throw await readError(res);
  // TODO(F2): validar con un schema de shared-types en vez de un cast.
  const body = (await res.json()) as { industries: IndustryOption[] };
  return body.industries;
}

export async function createSession(req: CreateSessionRequest): Promise<CreateSessionResponse> {
  const res = await fetch(`${BASE}/api/v1/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw await readError(res);
  return CreateSessionResponseSchema.parse(await res.json());
}

export async function endSession(
  sessionId: string,
  token: string,
): Promise<{ sessionId: string; planId: string }> {
  const res = await fetch(`${BASE}/api/v1/sessions/${sessionId}/end?token=${token}`, {
    method: 'POST',
  });
  if (!res.ok) throw await readError(res);
  // TODO(F2): validar con un schema de shared-types en vez de un cast.
  return (await res.json()) as { sessionId: string; planId: string };
}

export async function getPlan(sessionId: string, token: string): Promise<PlanFetchResult> {
  const res = await fetch(`${BASE}/api/v1/sessions/${sessionId}/plan?token=${token}`);
  if (res.status === 404) return { status: 'not_found' };
  if (!res.ok && res.status !== 202) throw await readError(res);
  return PlanResponseSchema.parse(await res.json());
}
