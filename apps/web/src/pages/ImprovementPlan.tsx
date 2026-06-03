import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/Card';
import { ProgressRing } from '../components/ProgressRing';
import './ImprovementPlan.css';

/* ── Mock datos de sesión ────────────────────────────────── */
const SESSION_NAME = 'Entrevista Técnica — Ingeniería de Software';

const COMPETENCIES = [
  {
    id: 'verbal',
    label: 'Comunicación Verbal',
    value: 78,
    delta: +10,
    color: '#2563EB',
    icon: '💬',
  },
  {
    id: 'corporal',
    label: 'Lenguaje Corporal',
    value: 62,
    delta: -6,
    color: '#0EA5E9',
    icon: '🧍',
  },
  {
    id: 'tecnico',
    label: 'Dominio Técnico',
    value: 91,
    delta: +17,
    color: '#16A34A',
    icon: '⚙️',
  },
  {
    id: 'estres',
    label: 'Gestión del Estrés',
    value: 34,
    delta: -18,
    color: '#DC2626',
    icon: '🧠',
  },
];

const QUICK_METRICS = [
  { label: 'Duración', value: '14:32 min' },
  { label: 'Turnos de habla', value: '18' },
  { label: 'Pausas largas', value: '4' },
  { label: 'Palabras/min', value: '127' },
];

const EXERCISES = [
  {
    id: 1,
    title: 'Técnica STAR para respuestas estructuradas',
    desc: 'Practica narrar situaciones usando el marco Situación → Tarea → Acción → Resultado. Graba 3 respuestas de 90 segundos.',
    difficulty: 'Medio',
    duration: '15 min',
    tag: 'Verbal',
  },
  {
    id: 2,
    title: 'Respiración 4-7-8 antes de responder',
    desc: 'Inhala 4s, sostén 7s, exhala 8s. Úsalo en los 2 segundos de silencio antes de cada respuesta para bajar el cortisol.',
    difficulty: 'Fácil',
    duration: '5 min',
    tag: 'Estrés',
  },
  {
    id: 3,
    title: 'Simulacro de whiteboard con voz en voz alta',
    desc: 'Resuelve un problema de algoritmos explicando cada paso mientras lo escribes. El objetivo es mantener el hilo verbal bajo presión técnica.',
    difficulty: 'Difícil',
    duration: '30 min',
    tag: 'Técnico',
  },
];

const DIFFICULTY_META: Record<string, { bg: string; color: string }> = {
  Fácil: { bg: 'var(--ip-diff-easy-bg)', color: 'var(--ip-diff-easy-text)' },
  Medio: { bg: 'var(--ip-diff-medium-bg)', color: 'var(--ip-diff-medium-text)' },
  Difícil: { bg: 'var(--ip-diff-hard-bg)', color: 'var(--ip-diff-hard-text)' },
};

const TIMELINE = [
  {
    id: 1,
    time: '00:00',
    label: 'Inicio de sesión',
    note: 'Presentación fluida, tono seguro.',
    active: false,
  },
  {
    id: 2,
    time: '06:14',
    label: 'Pico de estrés detectado',
    note: 'Pausa de 4.2s antes de respuesta técnica. Voz tensa.',
    active: true,
  },
  {
    id: 3,
    time: '12:50',
    label: 'Mejor respuesta técnica',
    note: 'Explicación clara de arquitectura, sin muletillas.',
    active: false,
  },
];

/* ── Componente ──────────────────────────────────────────── */
export function ImprovementPlan() {
  const navigate = useNavigate();

  /* Animación: los rings arrancan en 0 y suben al valor real al montar */
  const [animated, setAnimated] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 120);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="ip-root">
      {/* ── Page header ──────────────────────────────── */}
      <header className="ip-header">
        <div className="ip-header__text">
          <p className="ip-header__eyebrow">Plan de mejora</p>
          <h1 className="ip-header__title">{SESSION_NAME}</h1>
        </div>
        <div className="ip-header__actions">
          <button className="ip-btn ip-btn--ghost" onClick={() => navigate('/onboarding')}>
            Nueva sesión
          </button>
          <button className="ip-btn ip-btn--primary" onClick={() => navigate('/progress')}>
            Visualizar Progreso
          </button>
        </div>
      </header>

      {/* ── Métricas rápidas ──────────────────────────── */}
      <div className="ip-quick-metrics">
        {QUICK_METRICS.map((m) => (
          <div key={m.label} className="ip-quick-metric">
            <span className="ip-quick-metric__value">{m.value}</span>
            <span className="ip-quick-metric__label">{m.label}</span>
          </div>
        ))}
      </div>

      {/* ── Competencias ─────────────────────────────── */}
      <section className="ip-section">
        <h2 className="ip-section__title">Competencias evaluadas</h2>
        <div className="ip-competencies">
          {COMPETENCIES.map((c) => (
            <Card key={c.id} className="ip-comp-card">
              <div className="ip-comp-card__ring">
                <ProgressRing
                  value={animated ? c.value : 0}
                  size={96}
                  color={c.color}
                  label={c.label.split(' ')[0]}
                />
              </div>
              <div className="ip-comp-card__info">
                <div className="ip-comp-card__name">
                  <span className="ip-comp-card__icon">{c.icon}</span>
                  {c.label}
                </div>
                <div className={`ip-delta ${c.delta >= 0 ? 'ip-delta--pos' : 'ip-delta--neg'}`}>
                  {c.delta >= 0 ? '▲' : '▼'} {Math.abs(c.delta)} pts
                  {c.delta >= 0 ? ' vs sesión anterior' : ' vs sesión anterior'}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* ── Ejercicios ───────────────────────────────── */}
      <section className="ip-section">
        <h2 className="ip-section__title">Ejercicios priorizados</h2>
        <div className="ip-exercises">
          {EXERCISES.map((ex, i) => {
            const diff = DIFFICULTY_META[ex.difficulty];
            if (!diff) return null;
            return (
              <div key={ex.id} className="ip-exercise">
                <div className="ip-exercise__rank">#{i + 1}</div>
                <div className="ip-exercise__body">
                  <div className="ip-exercise__top">
                    <span className="ip-exercise__title">{ex.title}</span>
                    <div className="ip-exercise__badges">
                      <span className="ip-badge" style={{ background: diff.bg, color: diff.color }}>
                        {ex.difficulty}
                      </span>
                      <span className="ip-badge ip-badge--neutral">{ex.duration}</span>
                      <span className="ip-badge ip-badge--tag">{ex.tag}</span>
                    </div>
                  </div>
                  <p className="ip-exercise__desc">{ex.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Timeline ─────────────────────────────────── */}
      <section className="ip-section">
        <h2 className="ip-section__title">Momentos clave de la sesión</h2>
        <div className="ip-timeline">
          {TIMELINE.map((t, i) => (
            <div key={t.id} className="ip-timeline__item">
              {/* Nodo */}
              <div className={`ip-timeline__node ${t.active ? 'ip-timeline__node--active' : ''}`} />
              {/* Línea conectora (no en el último) */}
              {i < TIMELINE.length - 1 && <div className="ip-timeline__line" />}
              {/* Contenido */}
              <div className="ip-timeline__content">
                <span className="ip-timeline__time">{t.time}</span>
                <span className="ip-timeline__label">{t.label}</span>
                <p className="ip-timeline__note">{t.note}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Acciones inferiores ───────────────────────── */}
      <div className="ip-footer-actions">
        <button className="ip-btn ip-btn--ghost" onClick={() => navigate('/onboarding')}>
          Nueva sesión
        </button>
        <button className="ip-btn ip-btn--primary" onClick={() => navigate('/progress')}>
          Visualizar Progreso
        </button>
      </div>
    </div>
  );
}
