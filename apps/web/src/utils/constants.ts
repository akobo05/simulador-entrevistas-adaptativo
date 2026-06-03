// ══════════════════════════════════════════════════════════
//  Warachikuy — Constantes compartidas
//  web/src/utils/constants.ts
// ══════════════════════════════════════════════════════════

// ── WebSocket (lógica original — no modificar) ────────────
function resolveWsUrl(): string {
  const fromEnv = import.meta.env.VITE_WS_URL;
  if (import.meta.env.PROD) {
    if (!fromEnv) {
      throw new Error('VITE_WS_URL es obligatoria en produccion');
    }
    if (!fromEnv.startsWith('wss://')) {
      throw new Error('VITE_WS_URL debe usar wss:// en produccion');
    }
    return fromEnv;
  }
  return fromEnv || 'ws://localhost:3000';
}

export const WS_URL = resolveWsUrl();
export const APP_NAME = 'Warachikuy';

// ── Rutas ─────────────────────────────────────────────────
export const ROUTES = {
  HOME: '/',
  ONBOARDING: '/onboarding',
  ROOM: '/room',
  OBSERVER: '/observer',
  PROGRESS: '/progress',
  IMPROVEMENT: '/improvement',
  RANKING: '/ranking',
} as const;

export type AppRoute = (typeof ROUTES)[keyof typeof ROUTES];

// ── Competencias ──────────────────────────────────────────
// color: valor hex listo para SVG / Three.js (no puede leer CSS vars)
export const COMPETENCIES = [
  {
    id: 'verbal',
    label: 'Comunicación verbal',
    color: '#2563EB',
    icon: 'ti-message-circle',
  },
  {
    id: 'corporal',
    label: 'Lenguaje corporal',
    color: '#0EA5E9',
    icon: 'ti-user',
  },
  {
    id: 'tecnico',
    label: 'Contenido técnico',
    color: '#16A34A',
    icon: 'ti-code',
  },
  {
    id: 'estres',
    label: 'Gestión del estrés',
    color: '#DC2626',
    icon: 'ti-heart-rate-monitor',
  },
] as const;

export type CompetencyId = (typeof COMPETENCIES)[number]['id'];

// ── Niveles de experiencia ────────────────────────────────
export const EXPERIENCE_LEVELS = ['Junior', 'Mid', 'Senior', 'Expert'] as const;

export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

// ── Áreas de interés (mismas que ProfileSetup) ────────────
export const INTEREST_AREAS = [
  'Comunicación efectiva',
  'Liderazgo',
  'Negociación',
  'Presentaciones',
  'Trabajo en equipo',
  'Resolución de conflictos',
  'Entrevistas laborales',
  'Oratoria',
  'Escucha activa',
  'Pensamiento crítico',
  'Networking',
  'Gestión del tiempo',
] as const;

export type InterestArea = (typeof INTEREST_AREAS)[number];

// ── Configuración de sesión ───────────────────────────────
export const SESSION_CONFIG = {
  maxDurationMinutes: 30,
  warningThresholdMin: 5, // aviso antes de finalizar
  minTurnDurationSec: 5, // turno mínimo para registrar métricas
  maxParticipants: 6,
  observerMaxCount: 20,
} as const;

// ── Tema — valores hex para contextos sin CSS vars ────────
// Útil para pasar colores a SVG, Canvas, Three.js, etc.
export const THEME = {
  accent: '#2563EB',
  accent2: '#0EA5E9',
  accentGlow: 'rgba(37, 99, 235, 0.15)',
  bg: '#F4F6FB',
  bg2: '#FFFFFF',
  bg3: '#E8EDF6',
  text: '#0F172A',
  textMuted: '#64748B',
  border: '#CBD5E1',
  danger: '#DC2626',
  success: '#16A34A',
  warning: '#D97706',
} as const;
