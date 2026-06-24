import { useState, useRef, useEffect } from 'react';
import { Card } from '../components/Card';
import { SparklineChart } from '../components/SparklineChart';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { usePreferences } from '../hooks/usePreferences';
import { getProgress } from '../lib/apiClient';
import type { ProgressSummary, CompetencyProgress } from '@warachikuy/shared-types';
import './MyProgress.css';

/* ── Lucide icons (inline SVG para evitar dependencia extra) ── */
const Icon = {
  Award: () => (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="8" r="6" />
      <path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11" />
    </svg>
  ),
  Flame: () => (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
    </svg>
  ),
  Mic: () => (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  ),
  TrendingUp: () => (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  ),
  Zap: () => (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
  Clock: () => (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  BookOpen: () => (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  ),
  Music: () => (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  ),
  Check: () => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  Lock: () => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  ),
  ChevronRight: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  ),
  ChevronLeft: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  ),
  Send: () => (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  ),
  Bot: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="11" width="18" height="10" rx="2" />
      <circle cx="12" cy="5" r="2" />
      <path d="M12 7v4" />
      <line x1="8" y1="16" x2="8" y2="16" />
      <line x1="16" y1="16" x2="16" y2="16" />
    </svg>
  ),
  User: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  Star: () => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  ),
};

/* ── Helpers ──────────────────────────────────────────────────── */
const COMPETENCY_LABELS: Record<string, string> = {
  fluency: 'Fluidez',
  eye_contact: 'Contacto Visual',
  speech_rate: 'Ritmo',
  content: 'Contenido',
};

const COMPETENCY_COLORS: Record<string, string> = {
  fluency: '#16A34A',
  eye_contact: '#0EA5E9',
  speech_rate: '#2563EB',
  content: '#F59E0B',
};

function formatDate(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString('es-PE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

type NodeStatus = 'done' | 'active' | 'locked';

const LEARNING_PATH: {
  id: number;
  label: string;
  sublabel: string;
  status: NodeStatus;
}[] = [
  { id: 1, label: 'Fundamentos', sublabel: 'Completado', status: 'done' },
  { id: 2, label: 'Entrevista Técnica', sublabel: 'Completado', status: 'done' },
  { id: 3, label: 'Comunicación', sublabel: 'En progreso', status: 'active' },
  { id: 4, label: 'Liderazgo', sublabel: 'Próximamente', status: 'locked' },
  { id: 5, label: 'Negociación', sublabel: 'Próximamente', status: 'locked' },
];

interface Badge {
  id: number;
  name: string;
  desc: string;
  icon: keyof typeof Icon;
  unlocked: boolean;
}
const BADGES: Badge[] = [
  {
    id: 1,
    name: 'Primera Entrevista',
    desc: 'Completaste tu 1ª sesión',
    icon: 'Award',
    unlocked: false,
  },
  {
    id: 2,
    name: 'Racha 7 días',
    desc: '7 días consecutivos activo',
    icon: 'Flame',
    unlocked: false,
  },
  { id: 3, name: 'Comunicador', desc: 'Fluidez > 80% tres veces', icon: 'Mic', unlocked: false },
  {
    id: 4,
    name: 'En ascenso',
    desc: 'Mejora continua 4 semanas',
    icon: 'TrendingUp',
    unlocked: false,
  },
  { id: 5, name: 'Respuesta rápida', desc: 'Pausa < 1s promedio', icon: 'Zap', unlocked: false },
  { id: 6, name: 'Sin pausa', desc: 'Sesión sin pausas > 3s', icon: 'Clock', unlocked: false },
  {
    id: 7,
    name: 'Vocabulario B2',
    desc: 'Nivel B2 certificado por IA',
    icon: 'BookOpen',
    unlocked: false,
  },
  {
    id: 8,
    name: 'Maestro del ritmo',
    desc: 'Ritmo > 90% en 5 sesiones',
    icon: 'Music',
    unlocked: false,
  },
];

interface ChatMsg {
  role: 'assistant' | 'user';
  text: string;
}
const INITIAL_CHAT: ChatMsg[] = [
  {
    role: 'assistant',
    text: '¡Hola! Revisé tus últimas sesiones. ¿Quieres feedback sobre alguna competencia en particular?',
  },
];

type PageStatus = 'loading' | 'ready' | 'empty' | 'error';

/* ══════════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
   ══════════════════════════════════════════════════════════════ */
export function MyProgress() {
  const [pageStatus, setPageStatus] = useState<PageStatus>('loading');
  const [progress, setProgress] = useState<ProgressSummary | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const [assistantOpen, setAssistantOpen] = useState(true);
  const [chatHistory, setChatHistory] = useState<ChatMsg[]>(INITIAL_CHAT);
  const [inputText, setInputText] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const systemReduced = useReducedMotion();
  const { prefs } = usePreferences();
  const reduced = prefs.reducedMotion ?? systemReduced;

  useEffect(() => {
    let cancelled = false;
    setPageStatus('loading');
    getProgress()
      .then((data) => {
        if (cancelled) return;
        if (data.sessionCount === 0) {
          setPageStatus('empty');
        } else {
          setProgress(data);
          setPageStatus('ready');
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setErrorMsg(err instanceof Error ? err.message : 'Error al cargar progreso');
        setPageStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /* Auto-scroll chat */
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth' });
  }, [chatHistory, reduced]);

  const sendMessage = () => {
    const trimmed = inputText.trim();
    if (!trimmed) return;
    const userMsg: ChatMsg = { role: 'user', text: trimmed };
    const botMsg: ChatMsg = {
      role: 'assistant',
      text: '¡Excelente pregunta! Estoy analizando tu historial para darte una respuesta personalizada. Dame un momento…',
    };
    setChatHistory((prev) => [...prev, userMsg, botMsg]);
    setInputText('');
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  /* ── Estados de carga, vacío y error ── */
  if (pageStatus === 'loading') {
    return (
      <div className="mp-root">
        <div className="mp-status-overlay">
          <div className="mp-status-spinner" />
          <p className="mp-status-text">Cargando tu progreso…</p>
        </div>
      </div>
    );
  }

  if (pageStatus === 'empty') {
    return (
      <div className="mp-root">
        <div className="mp-status-overlay">
          <Icon.Award />
          <h2 className="mp-status-title">Aún no tienes sesiones</h2>
          <p className="mp-status-text">
            Completa tu primera entrevista para ver tu progreso, estadísticas y evolución aquí.
          </p>
        </div>
      </div>
    );
  }

  if (pageStatus === 'error') {
    return (
      <div className="mp-root">
        <div className="mp-status-overlay">
          <p className="mp-status-text mp-status-text--error">{errorMsg}</p>
          <button className="mp-retry-btn" onClick={() => window.location.reload()}>
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  /* ── Datos derivados ── */
  const { sessionCount, firstSessionAt, lastSessionAt, competencies } = progress!;
  const level = Math.min(10, Math.floor(sessionCount / 3) + 1);
  const xp = sessionCount * 250;
  const xpNext = (level + 1) * 750;
  const xpPct = Math.round((xp / xpNext) * 100);
  const firstDate = firstSessionAt ? formatDate(firstSessionAt) : '—';
  const lastDate = lastSessionAt ? formatDate(lastSessionAt) : '—';

  const competencyCards: { label: string; color: string; data: CompetencyProgress }[] =
    competencies.map((c) => ({
      label: COMPETENCY_LABELS[c.name] ?? c.name,
      color: COMPETENCY_COLORS[c.name] ?? '#2563EB',
      data: c,
    }));

  return (
    <div className="mp-root">
      {/* ── HEADER ────────────────────────────────────────────── */}
      <header className="mp-header">
        <div className="mp-header__left">
          <div className="mp-avatar">
            {(sessionCount + 1).toString(16).toUpperCase().slice(0, 2)}
          </div>
          <div className="mp-header__info">
            <span className="mp-header__name">Mi Progreso</span>
            <span className="mp-header__sub">
              Nivel {level} · {sessionCount} sesión{sessionCount !== 1 ? 'es' : ''}
            </span>
          </div>
        </div>

        {/* XP bar */}
        <div className="mp-xp-wrap">
          <div className="mp-xp-label">
            <span>XP</span>
            <span className="mp-xp-nums">
              {xp.toLocaleString()} / {xpNext.toLocaleString()}
            </span>
          </div>
          <div className="mp-xp-track">
            <div className="mp-xp-fill" style={{ width: `${xpPct}%` }} />
          </div>
          <span className="mp-xp-pct">{xpPct}%</span>
        </div>

        {/* Stats rápidas */}
        <div className="mp-stats-row">
          <div className="mp-stat">
            <span className="mp-stat__val">{sessionCount}</span>
            <span className="mp-stat__lbl">Entrevistas</span>
          </div>
          <div className="mp-stat-sep" />
          <div className="mp-stat">
            <span className="mp-stat__val">{firstDate}</span>
            <span className="mp-stat__lbl">Primera</span>
          </div>
          <div className="mp-stat-sep" />
          <div className="mp-stat">
            <span className="mp-stat__val">{lastDate}</span>
            <span className="mp-stat__lbl">Última</span>
          </div>
        </div>
      </header>

      {/* ── BODY ──────────────────────────────────────────────── */}
      <div className={`mp-body ${assistantOpen ? 'mp-body--panel-open' : ''}`}>
        {/* ── CONTENIDO PRINCIPAL ─────────────────────────────── */}
        <main className="mp-main">
          {/* ── Ruta de aprendizaje ─────────────────────────── */}
          <section className="mp-section">
            <div className="mp-section-header">
              <h2 className="mp-section-title">Ruta de aprendizaje</h2>
              <span className="mp-section-badge">{sessionCount} sesiones</span>
            </div>

            <div className="mp-path">
              {LEARNING_PATH.map((node, idx) => (
                <div key={node.id} className="mp-path-item">
                  {idx < LEARNING_PATH.length - 1 && (
                    <div
                      className={`mp-path-line ${node.status === 'done' ? 'mp-path-line--done' : ''}`}
                    />
                  )}
                  <div className={`mp-path-node mp-path-node--${node.status}`}>
                    <div className="mp-path-node__icon">
                      {node.status === 'done' && <Icon.Check />}
                      {node.status === 'active' && <span className="mp-path-node__pulse" />}
                      {node.status === 'locked' && <Icon.Lock />}
                    </div>
                    <div className="mp-path-node__body">
                      <span className="mp-path-node__label">{node.label}</span>
                      <span className="mp-path-node__sub">{node.sublabel}</span>
                    </div>
                    {node.status === 'active' && (
                      <span className="mp-path-node__cta">
                        Continuar <Icon.ChevronRight />
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ── Sparklines métricas ─────────────────────────── */}
          <section className="mp-section">
            <div className="mp-section-header">
              <h2 className="mp-section-title">Evolución de métricas</h2>
              <span className="mp-section-sub">{sessionCount} sesiones</span>
            </div>

            <div className="mp-sparks-grid">
              {competencyCards.map((c) => {
                const values = c.data.points
                  .map((p) => p.score)
                  .filter((s): s is number => s !== null);
                if (values.length < 2) {
                  return (
                    <Card key={c.label} className="mp-spark-card">
                      <div className="mp-spark-top">
                        <span className="mp-spark-label">{c.label}</span>
                      </div>
                      <p className="mp-spark-no-data">Datos insuficientes</p>
                    </Card>
                  );
                }
                const last = values[values.length - 1]!;
                const prev = values.length >= 2 ? values[values.length - 2]! : null;
                const delta = prev !== null ? last - prev : 0;
                return (
                  <Card key={c.label} className="mp-spark-card">
                    <div className="mp-spark-top">
                      <span className="mp-spark-label">{c.label}</span>
                      <span className="mp-spark-value" style={{ color: c.color }}>
                        {Math.round(last)}%
                      </span>
                    </div>
                    <SparklineChart data={values} color={c.color} width={100} height={36} />
                    <span
                      className={`mp-spark-delta ${delta >= 0 ? 'mp-spark-delta--up' : 'mp-spark-delta--down'}`}
                    >
                      {delta >= 0 ? '▲' : '▼'} {Math.abs(Math.round(delta))}pts
                    </span>
                  </Card>
                );
              })}
            </div>
          </section>

          {/* ── Badges ──────────────────────────────────────── */}
          <section className="mp-section">
            <div className="mp-section-header">
              <h2 className="mp-section-title">Logros</h2>
              <span className="mp-section-badge">Próximamente</span>
            </div>

            <div className="mp-badges-grid">
              {BADGES.map((badge) => {
                const IconComp = Icon[badge.icon] ?? Icon.Award;
                return (
                  <Card
                    key={badge.id}
                    hoverable
                    className={`mp-badge-card ${badge.unlocked ? 'mp-badge-card--unlocked' : 'mp-badge-card--locked'}`}
                  >
                    <div
                      className={`mp-badge-icon ${badge.unlocked ? 'mp-badge-icon--unlocked' : 'mp-badge-icon--locked'}`}
                    >
                      <IconComp />
                    </div>
                    <span className="mp-badge-name">{badge.name}</span>
                    <span className="mp-badge-desc">{badge.desc}</span>
                  </Card>
                );
              })}
            </div>
          </section>
        </main>

        {/* ── PANEL ASISTENTE ───────────────────────────────── */}
        <aside
          className={`mp-assistant ${assistantOpen ? 'mp-assistant--open' : 'mp-assistant--closed'}`}
        >
          <button
            className="mp-assistant-toggle"
            onClick={() => setAssistantOpen((p) => !p)}
            aria-label={assistantOpen ? 'Cerrar asistente' : 'Abrir asistente'}
          >
            {assistantOpen ? <Icon.ChevronRight /> : <Icon.ChevronLeft />}
          </button>

          {assistantOpen && (
            <>
              <div className="mp-assistant-header">
                <div className="mp-assistant-title">
                  <Icon.Bot />
                  Asistente IA
                </div>
                <span className="mp-assistant-online" />
              </div>

              <div className="mp-chat-history">
                {chatHistory.map((msg, i) => (
                  <div key={i} className={`mp-chat-msg mp-chat-msg--${msg.role}`}>
                    <div className="mp-chat-msg__icon">
                      {msg.role === 'assistant' ? <Icon.Bot /> : <Icon.User />}
                    </div>
                    <p className="mp-chat-msg__text">{msg.text}</p>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>

              <div className="mp-chat-input-wrap">
                <textarea
                  className="mp-chat-input"
                  placeholder="Escribe una pregunta…"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKey}
                  rows={2}
                />
                <button
                  className="mp-chat-send"
                  onClick={sendMessage}
                  disabled={!inputText.trim()}
                  aria-label="Enviar"
                >
                  <Icon.Send />
                </button>
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
