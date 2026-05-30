import { describe, it, expect } from 'vitest';
import { ConversationEntrySchema } from './llm';

describe('ConversationEntrySchema', () => {
  it('acepta una entrada valida del entrevistador', () => {
    const entry = { role: 'interviewer', text: 'Hola, contame de ti.', timestamp: 1 };
    expect(ConversationEntrySchema.parse(entry)).toEqual(entry);
  });

  it('acepta una entrada valida del candidato', () => {
    const entry = { role: 'candidate', text: 'Soy backend.', timestamp: 2 };
    expect(ConversationEntrySchema.parse(entry)).toEqual(entry);
  });

  it('rechaza un role desconocido', () => {
    const r = ConversationEntrySchema.safeParse({ role: 'system', text: 'x', timestamp: 1 });
    expect(r.success).toBe(false);
  });
});
