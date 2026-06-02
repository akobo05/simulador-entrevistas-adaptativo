import { z } from 'zod';
import { Type } from '@google/genai';
import type Redis from 'ioredis';
import type { FastifyBaseLogger } from 'fastify';
import type { ConversationEntry, ImprovementPlan, SessionState } from '@warachikuy/shared-types';
import { ImprovementPlanSchema } from '@warachikuy/shared-types';
import { GeminiTransientError, type GeminiClient, type GeminiTurn } from './gemini-client.js';
import { readHistory } from './conversation.js';
import { readAggregate, type MetricsAggregate } from './metrics-aggregator.js';
import { buildCoachPrompt } from './prompts.js';
import { setPlanReady, setPlanFailed } from './plan-store.js';

export interface CoachDeps {
  redis: Redis;
  gemini: GeminiClient;
  log: FastifyBaseLogger;
}

// Schema de la salida CRUDA del LLM Coach. Solo puntua "content"; los 3 puntajes
// no verbales los inyecta el backend desde las metricas medidas, no el LLM.
const CoachOutputSchema = z.object({
  summary: z.string().min(1),
  competencyComments: z.object({
    fluency: z.string(),
    eye_contact: z.string(),
    speech_rate: z.string(),
    content: z.string(),
  }),
  contentScore: z.number().min(0).max(100),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  exercises: z.array(z.object({ title: z.string(), description: z.string() })),
});
type CoachOutput = z.infer<typeof CoachOutputSchema>;

// Schema de respuesta para el modo JSON de Gemini. Usa el enum Type del SDK
// (@google/genai), que expone OBJECT/STRING/ARRAY/NUMBER.
const COACH_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING },
    competencyComments: {
      type: Type.OBJECT,
      properties: {
        fluency: { type: Type.STRING },
        eye_contact: { type: Type.STRING },
        speech_rate: { type: Type.STRING },
        content: { type: Type.STRING },
      },
      required: ['fluency', 'eye_contact', 'speech_rate', 'content'],
    },
    contentScore: { type: Type.NUMBER },
    strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
    improvements: { type: Type.ARRAY, items: { type: Type.STRING } },
    exercises: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { title: { type: Type.STRING }, description: { type: Type.STRING } },
        required: ['title', 'description'],
      },
    },
  },
  required: [
    'summary',
    'competencyComments',
    'contentScore',
    'strengths',
    'improvements',
    'exercises',
  ],
};

// Mapea el historial a turnos de Gemini y agrega un turno final que dispara la
// generacion. Garantiza contents no vacio (Gemini rechaza un contents vacio).
// 'interviewer' es el LLM -> 'model'; 'candidate' es el usuario -> 'user'.
function toContents(history: ConversationEntry[]): GeminiTurn[] {
  const contents: GeminiTurn[] = history.map((e) => ({
    role: e.role === 'interviewer' ? 'model' : 'user',
    text: e.text,
  }));
  contents.push({ role: 'user', text: 'Genera ahora el plan de mejora de esta entrevista.' });
  return contents;
}

// Ensambla el ImprovementPlan final: inyecta los 3 puntajes medidos por el
// sistema (fluency, eye_contact, speech_rate) y usa el contentScore del LLM.
function assemble(
  planId: string,
  sessionId: string,
  out: CoachOutput,
  metrics: MetricsAggregate,
): ImprovementPlan {
  return {
    planId,
    sessionId,
    summary: out.summary,
    competencies: [
      { name: 'fluency', score: metrics.fluency, comment: out.competencyComments.fluency },
      {
        name: 'eye_contact',
        score: metrics.eye_contact,
        comment: out.competencyComments.eye_contact,
      },
      {
        name: 'speech_rate',
        score: metrics.speech_rate,
        comment: out.competencyComments.speech_rate,
      },
      { name: 'content', score: out.contentScore, comment: out.competencyComments.content },
    ],
    strengths: out.strengths,
    improvements: out.improvements,
    exercises: out.exercises,
    generatedAt: Date.now(),
  };
}

// Genera el plan de mejora. Pensada para fire-and-forget desde POST /end: nunca
// rechaza; cualquier fallo termina en setPlanFailed.
export async function generatePlan(
  deps: CoachDeps,
  state: SessionState,
  planId: string,
): Promise<void> {
  const sessionId = state.id;
  try {
    const history = await readHistory(deps.redis, sessionId, deps.log);
    const metrics = await readAggregate(deps.redis, sessionId, deps.log);
    const systemPrompt = buildCoachPrompt({
      industry: state.industry,
      level: state.level,
      metrics,
    });
    const contents = toContents(history);

    let raw: unknown;
    try {
      raw = await deps.gemini.generateJson(systemPrompt, contents, COACH_RESPONSE_SCHEMA);
    } catch (err) {
      // Un fallo transitorio (red/timeout/5xx) amerita un unico reintento.
      if (err instanceof GeminiTransientError) {
        deps.log.warn({ err }, 'coach: gemini transitorio, reintentando una vez');
        raw = await deps.gemini.generateJson(systemPrompt, contents, COACH_RESPONSE_SCHEMA);
      } else {
        throw err;
      }
    }

    const out = CoachOutputSchema.parse(raw);
    const plan = assemble(planId, sessionId, out, metrics);
    ImprovementPlanSchema.parse(plan); // defensa: validamos el plan ensamblado
    await setPlanReady(deps.redis, sessionId, plan);
  } catch (err) {
    deps.log.error({ err, sessionId }, 'fallo la generacion del plan de mejora');
    await setPlanFailed(deps.redis, sessionId, planId);
  }
}
