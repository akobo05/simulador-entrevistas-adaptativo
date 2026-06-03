// ══════════════════════════════════════════════════════════
//  Warachikuy — Tipos compartidos
//  web/src/types/index.ts
// ══════════════════════════════════════════════════════════

import type { CompetencyId, ExperienceLevel, InterestArea } from '../utils/constants';

// Re-exporta los tipos derivados de constantes para que
// los consumidores importen desde un solo lugar.
export type { CompetencyId, ExperienceLevel, InterestArea };

// ── UserProfile ───────────────────────────────────────────
export interface UserProfile {
  id: string;
  displayName: string;
  avatarUrl?: string;
  role: string;
  experienceLevel: ExperienceLevel;
  interests: InterestArea[];
  dyslexiaFont: 'default' | 'opendyslexic' | 'lexie';
  accessibility: {
    reducedMotion: boolean;
    audioFirst: boolean;
    liveSubtitles: boolean;
  };
  createdAt: string; // ISO 8601
}

// ── CompetencyScore ───────────────────────────────────────
// Puntuación 0–100 para una competencia en una sesión.
export interface CompetencyScore {
  competencyId: CompetencyId;
  score: number; // 0 – 100
  delta?: number; // diferencia respecto a sesión anterior
  feedback?: string; // comentario generado por IA
}

// ── SessionMetrics ────────────────────────────────────────
// Métricas en tiempo real recibidas por WebSocket durante la sesión.
export interface SessionMetrics {
  sessionId: string;
  userId: string;
  timestampMs: number;
  speakingRatioSec: number; // segundos hablando en la sesión
  pauseCount: number; // número de silencios > 2 s
  avgPauseMs: number; // duración media de pausa
  wordsPerMinute: number;
  fillerWordCount: number; // "eh", "um", "o sea", etc.
  competencyScores: CompetencyScore[];
}

// ── SessionResult ─────────────────────────────────────────
// Resultado final persistido al terminar la sesión.
export interface SessionResult {
  sessionId: string;
  userId: string;
  startedAt: string; // ISO 8601
  endedAt: string; // ISO 8601
  durationSeconds: number;
  topic: string;
  competencyScores: CompetencyScore[];
  overallScore: number; // 0 – 100, promedio ponderado
  aiSummary?: string; // resumen generado por IA
  badgesEarned: string[]; // ids de badges desbloqueados
}

// ── Badge ─────────────────────────────────────────────────
export interface Badge {
  id: string;
  label: string;
  description: string;
  icon: string; // nombre de icono Tabler (ti-*)
  color: string; // hex — puede venir de COMPETENCIES
  earnedAt?: string; // ISO 8601; undefined si no desbloqueado
  condition: string; // descripción legible del criterio
}

// ── RankingEntry ──────────────────────────────────────────
export interface RankingEntry {
  rank: number;
  userId: string;
  displayName: string;
  avatarUrl?: string;
  overallScore: number; // promedio histórico 0–100
  sessionCount: number;
  badgeCount: number;
  topCompetency?: CompetencyId;
  isCurrentUser: boolean;
}

// ── GroupChallenge ────────────────────────────────────────
export interface GroupChallenge {
  id: string;
  title: string;
  description: string;
  startDate: string; // ISO 8601
  endDate: string; // ISO 8601
  targetMetric: CompetencyId | 'overallScore';
  targetValue: number; // score mínimo para completar
  participants: string[]; // userIds
  completedBy: string[]; // userIds que alcanzaron el objetivo
  status: 'upcoming' | 'active' | 'finished';
  rewardBadge?: Badge;
}
