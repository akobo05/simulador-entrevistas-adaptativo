import type { Industry } from '@warachikuy/shared-types';
import { INTERVIEWING_TURNS, WARMUP_TURN } from './constants.js';

export interface SeedQuestion {
  id: string;
  topic: string; // ej. 'apis', 'databases', 'concurrency', 'testing', 'system-design'
  prompt: string; // pregunta troncal en espanol neutro
}

// 5 troncales de backend, una por tema, en dificultad creciente. El LLM las
// reformula al contexto y puede anteponer un follow-up a la respuesta previa.
export const BACKEND_QUESTION_BANK: SeedQuestion[] = [
  {
    id: 'be-apis',
    topic: 'apis',
    prompt:
      'Como disenarias una API REST para un recurso con relaciones, y que criterios usas para versionarla?',
  },
  {
    id: 'be-databases',
    topic: 'databases',
    prompt:
      'Cuando elegirias una base de datos relacional sobre una NoSQL, y como decides los indices de una tabla con muchas lecturas?',
  },
  {
    id: 'be-concurrency',
    topic: 'concurrency',
    prompt:
      'Explica como manejarias condiciones de carrera al actualizar un mismo registro desde multiples requests concurrentes.',
  },
  {
    id: 'be-testing',
    topic: 'testing',
    prompt:
      'Que estrategia de testing aplicarias a un servicio backend, y como decides que va a unit, integration o end-to-end?',
  },
  {
    id: 'be-system-design',
    topic: 'system-design',
    prompt:
      'Como escalarias un endpoint que de repente recibe diez veces mas trafico del esperado?',
  },
];

const BANKS: Record<Industry, SeedQuestion[]> = {
  backend: BACKEND_QUESTION_BANK,
  // En F1 solo existe el banco de backend. Las demas industrias caen a el por
  // ahora: una sesion no-backend recibe preguntas de backend sin error. F2
  // agrega bancos propios de frontend, data y fullstack. El Record fuerza un
  // error de compilacion si se agrega una industria nueva sin su banco.
  frontend: BACKEND_QUESTION_BANK,
  data: BACKEND_QUESTION_BANK,
  fullstack: BACKEND_QUESTION_BANK,
};

export function getQuestionBank(industry: Industry): SeedQuestion[] {
  return BANKS[industry];
}

// Devuelve la troncal del turno actual. Solo aplica en interviewing (turnos
// 1..INTERVIEWING_TURNS); en warmup y closing no hay seed. La seleccion es por
// indice acotado, no hay caso de agotamiento.
export function selectSeed(industry: Industry, turnNumber: number): SeedQuestion | undefined {
  if (turnNumber <= WARMUP_TURN || turnNumber > INTERVIEWING_TURNS) return undefined;
  const bank = getQuestionBank(industry);
  return bank[turnNumber - 1];
}
