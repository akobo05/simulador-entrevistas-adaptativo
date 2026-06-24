const STORAGE_KEY = 'warachikuy:candidateId';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Fallback en memoria por carga cuando localStorage no esta disponible
// (modo privado / acceso denegado): la sesion funciona, solo no se enlaza
// entre recargas.
let memoryId: string | null = null;

// Id local anonimo del candidato (#56). Estable entre sesiones del mismo
// navegador; no autenticado a proposito (la identidad real es F5).
export function getOrCreateCandidateId(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && UUID_RE.test(stored)) return stored;
    const fresh = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, fresh);
    return fresh;
  } catch {
    if (!memoryId) memoryId = crypto.randomUUID();
    return memoryId;
  }
}
