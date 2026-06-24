// Pantalla MOCK a proposito: demuestra el modulo de personalizacion continua
// (XP, nivel, racha, evolucion por competencia) con datos simulados inline,
// como permite el enunciado del curso. El backend real (historial
// longitudinal multi-sesion) es de la fase F2, ver issue #51. Pantalla
// original de Max (PR #48).

import { useState, useRef, useEffect } from 'react';
import { Card } from '../components/Card';
import { SparklineChart } from '../components/SparklineChart';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { usePreferences } from '../hooks/usePreferences';
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

/* ── Datos mock ─────────────────────────────────────────────── */
const USER = {
  name: 'Camila Torres',
  level: 4,
  xp: 2340,
  xpNext: 3000,
  avatar: 'CT',
  interviews: 12,
  streak: 7,
  rank: 'Top 8%',
};

type NodeStatus = 'done' | 'active' | 'locked';

const LEARNING_PATH: {
  id: number;
  label: string;
  sublabel: string;
  status: NodeStatus;
  sessions: number;
}[] = [
  { id: 1, label: 'Fundamentos', sublabel: '8 sesiones completadas', status: 'done', sessions: 8 },
  {
    id: 2,
    label: 'Entrevista Técnica',
    sublabel: '6 sesiones completadas',
    status: 'done',
    sessions: 6,
  },
  { id: 3, label: 'Comunicación', sublabel: '2 de 5 sesiones', status: 'active', sessions: 5 },
  { id: 4, label: 'Liderazgo', sublabel: 'Desbloquea en nivel 5', status: 'locked', sessions: 6 },
  { id: 5, label: 'Negociación', sublabel: 'Desbloquea en nivel 6', status: 'locked', sessions: 8 },
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
    unlocked: true,
  },
  {
    id: 2,
    name: 'Racha 7 días',
    desc: '7 días consecutivos activo',
    icon: 'Flame',
    unlocked: true,
  },
  { id: 3, name: 'Comunicador', desc: 'Fluidez > 80% tres veces', icon: 'Mic', unlocked: true },
  {
    id: 4,
    name: 'En ascenso',
    desc: 'Mejora continua 4 semanas',
    icon: 'TrendingUp',
    unlocked: true,
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

const SPARKLINES = [
  { label: 'Confianza', data: [52, 58, 55, 63, 70, 68, 74, 78, 75, 82], color: '#2563EB' },
  { label: 'Fluidez', data: [60, 64, 61, 67, 72, 76, 74, 80, 83, 85], color: '#16A34A' },
  { label: 'Engagement', data: [45, 50, 53, 49, 58, 62, 65, 61, 68, 71], color: '#0EA5E9' },
];

interface ChatMsg {
  role: 'assistant' | 'user';
  text: string;
}
const INITIAL_CHAT: ChatMsg[] = [
  {
    role: 'assistant',
    text: '¡Hola Camila! Revisé tus últimas 3 sesiones. Tu fluidez subió 12 puntos esta semana. ¿Quieres trabajar en las pausas?',
  },
  { role: 'user', text: 'Sí, siento que me trabo al inicio de las respuestas.' },
  {
    role: 'assistant',
    text: 'Es normal. Te recomiendo practicar la técnica de "pausa intencional": respira 1 segundo antes de responder. Esta semana enfócate en eso.',
  },
];

/* ══════════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
   ══════════════════════════════════════════════════════════════ */
export function MyProgress() {
  const [assistantOpen, setAssistantOpen] = useState(true);
  const [chatHistory, setChatHistory] = useState<ChatMsg[]>(INITIAL_CHAT);
  const [inputText, setInputText] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const systemReduced = useReducedMotion();
  const { prefs } = usePreferences();
  const reduced = prefs.reducedMotion ?? systemReduced;

  const xpPct = Math.round((USER.xp / USER.xpNext) * 100);

  /* Auto-scroll chat: instant si el usuario prefiere movimiento reducido */
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

  return (
    <div className="mp-root">
      {/* ── HEADER ────────────────────────────────────────────── */}
      <header className="mp-header">
        <div className="mp-header__left">
          <div className="mp-avatar">{USER.avatar}</div>
          <div className="mp-header__info">
            <span className="mp-header__name">{USER.name}</span>
            <span className="mp-header__sub">
              Nivel {USER.level} · {USER.rank}
            </span>
          </div>
        </div>

        {/* XP bar */}
        <div className="mp-xp-wrap">
          <div className="mp-xp-label">
            <span>XP</span>
            <span className="mp-xp-nums">
              {USER.xp.toLocaleString()} / {USER.xpNext.toLocaleString()}
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
            <span className="mp-stat__val">{USER.interviews}</span>
            <span className="mp-stat__lbl">Entrevistas</span>
          </div>
          <div className="mp-stat-sep" />
          <div className="mp-stat">
            <span className="mp-stat__val">{USER.streak}</span>
            <span className="mp-stat__lbl">Racha días</span>
          </div>
          <div className="mp-stat-sep" />
          <div className="mp-stat">
            <span className="mp-stat__val">{USER.rank}</span>
            <span className="mp-stat__lbl">Ranking</span>
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
              <span className="mp-section-badge">2 de 5 completadas</span>
            </div>

            <div className="mp-path">
              {LEARNING_PATH.map((node, idx) => (
                <div key={node.id} className="mp-path-item">
                  {/* Línea conectora */}
                  {idx < LEARNING_PATH.length - 1 && (
                    <div
                      className={`mp-path-line ${node.status === 'done' ? 'mp-path-line--done' : ''}`}
                    />
                  )}

                  {/* Nodo */}
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
              <span className="mp-section-sub">Últimas 10 sesiones</span>
            </div>

            <div className="mp-sparks-grid">
              {SPARKLINES.map((s) => {
                const last = s.data[s.data.length - 1] ?? 0;
                const prev = s.data[s.data.length - 2] ?? 0;
                const delta = last - prev;
                return (
                  <Card key={s.label} className="mp-spark-card">
                    <div className="mp-spark-top">
                      <span className="mp-spark-label">{s.label}</span>
                      <span className="mp-spark-value" style={{ color: s.color }}>
                        {last}%
                      </span>
                    </div>
                    <SparklineChart data={s.data} color={s.color} width={100} height={36} />
                    <span
                      className={`mp-spark-delta ${delta >= 0 ? 'mp-spark-delta--up' : 'mp-spark-delta--down'}`}
                    >
                      {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}pts
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
              <span className="mp-section-badge">
                {BADGES.filter((b) => b.unlocked).length} desbloqueados
              </span>
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
                    {badge.unlocked && (
                      <span className="mp-badge-star">
                        <Icon.Star />
                      </span>
                    )}
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
          {/* Toggle */}
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

              {/* Historial */}
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

              {/* Input */}
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
