// Pantalla MOCK a proposito: demuestra el modulo de interactividad (sala del
// observador del peer-mock, con timer EN VIVO simulado) con datos inline,
// como permite el enunciado del curso. La sala real con WebRTC y roles es de
// la fase F3, ver issue #52. Pantalla original de Max (PR #48).
import { useState, useEffect, useRef } from 'react';
import './ObserverRoom.css';

/* ── ObserverAura inline (aura local de esta sala) ─────────────── */
function ObserverAura({ speaking }: { speaking: boolean }) {
  return (
    <div className={`aura-root ${speaking ? 'aura-root--speaking' : ''}`}>
      <div className="aura-ring aura-ring--1" />
      <div className="aura-ring aura-ring--2" />
      <div className="aura-ring aura-ring--3" />
      <div className="aura-core">
        <svg
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="aura-icon"
        >
          <circle cx="32" cy="32" r="32" fill="rgba(37,99,235,0.15)" />
          <circle cx="32" cy="24" r="10" fill="#2563EB" opacity="0.9" />
          <ellipse cx="32" cy="46" rx="16" ry="10" fill="#2563EB" opacity="0.7" />
          <path
            d="M14 32 Q18 26 22 32 Q26 38 30 32"
            stroke="#0EA5E9"
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
            className="aura-wave"
          />
          <path
            d="M34 32 Q38 26 42 32 Q46 38 50 32"
            stroke="#6366F1"
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
            className="aura-wave aura-wave--delayed"
          />
        </svg>
      </div>
    </div>
  );
}

/* ── Tipos ──────────────────────────────────────────────── */
interface TranscriptLine {
  id: number;
  speaker: 'candidate' | 'ai';
  text: string;
  time: string;
}

interface Comment {
  id: number;
  text: string;
  time: string;
  anchoredTo: string;
}

/* ── Datos mock ─────────────────────────────────────────── */
const CANDIDATE_NAME = 'Valentina Ríos';
const CANDIDATE_ROLE = 'Senior UX Research Lead';

const MOCK_TRANSCRIPT: TranscriptLine[] = [
  {
    id: 1,
    speaker: 'ai',
    text: 'Buenos días Valentina, gracias por estar con nosotros hoy. ¿Podrías comenzar contándonos sobre tu experiencia liderando equipos de investigación?',
    time: '09:01',
  },
  {
    id: 2,
    speaker: 'candidate',
    text: 'Por supuesto. En los últimos cuatro años he liderado equipos de entre cinco y doce investigadores en proyectos de fintech y salud digital. Mi enfoque siempre ha sido mezclar métodos cualitativos con análisis de datos cuantitativos para generar insights accionables.',
    time: '09:02',
  },
  {
    id: 3,
    speaker: 'ai',
    text: 'Interesante. ¿Puedes darnos un ejemplo concreto de cómo un hallazgo tuyo cambió la dirección de un producto?',
    time: '09:03',
  },
  {
    id: 4,
    speaker: 'candidate',
    text: 'Claro. En mi último proyecto con una fintech, descubrimos mediante entrevistas etnográficas que el 68% de los usuarios abandonaban el onboarding en el paso de verificación de identidad. No por dificultad técnica, sino por desconfianza. Rediseñamos la narrativa de ese paso y la tasa de completación subió 34 puntos en dos semanas.',
    time: '09:05',
  },
  {
    id: 5,
    speaker: 'ai',
    text: '¿Qué metodologías utilizaste para llegar a esa conclusión sobre la desconfianza?',
    time: '09:06',
  },
  {
    id: 6,
    speaker: 'candidate',
    text: 'Combinamos entrevistas semiestructuradas con grabaciones de sesión y un análisis de los micromomentos de fricción. También usamos card sorting para entender el modelo mental del usuario respecto a la seguridad financiera digital.',
    time: '09:07',
  },
  {
    id: 7,
    speaker: 'ai',
    text: 'Excelente. Ahora cuéntame, ¿cómo manejas el conflicto cuando tus hallazgos van en contra de lo que el equipo de producto ya asumía?',
    time: '09:09',
  },
  {
    id: 8,
    speaker: 'candidate',
    text: 'Es uno de los momentos más delicados pero también más importantes del trabajo. Siempre presento los datos de forma que cuenten una historia, no una sentencia. Invito al equipo a co-interpretar los hallazgos, lo que genera apropiación en lugar de resistencia.',
    time: '09:11',
  },
  {
    id: 9,
    speaker: 'ai',
    text: '¿Alguna vez no lograste convencer al equipo y el producto sufrió consecuencias?',
    time: '09:12',
  },
  {
    id: 10,
    speaker: 'candidate',
    text: 'Sí, una vez. Y fue una lección muy valiosa sobre la importancia de documentar las recomendaciones formalmente. Cuando los resultados confirmaron mis hallazgos tres meses después, pudimos usar esa experiencia para establecer un proceso de validación obligatorio antes de cualquier lanzamiento mayor.',
    time: '09:14',
  },
];

const METRICS = [
  {
    key: 'confidence',
    label: 'Confianza',
    value: 78,
    color: '#2563EB',
    bg: 'rgba(37,99,235,0.12)',
  },
  { key: 'attention', label: 'Atención', value: 85, color: '#0EA5E9', bg: 'rgba(14,165,233,0.12)' },
  { key: 'stress', label: 'Estrés', value: 32, color: '#DC2626', bg: 'rgba(220,38,38,0.12)' },
  {
    key: 'engagement',
    label: 'Engagement',
    value: 91,
    color: '#16A34A',
    bg: 'rgba(22,163,74,0.12)',
  },
];

const TABS = ['Transcripción', 'Análisis', 'Notas'] as const;
type Tab = (typeof TABS)[number];

/* ══════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
   ══════════════════════════════════════════════════════════ */
export function ObserverRoom() {
  const [activeTab, setActiveTab] = useState<Tab>('Transcripción');
  const [speaking, setSpeaking] = useState(true);
  const [anchorOpen, setAnchorOpen] = useState(false);
  const [anchorText, setAnchorText] = useState('');
  const [anchoredLine, setAnchoredLine] = useState<TranscriptLine | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [elapsed, setElapsed] = useState(823); // segundos
  const transcriptRef = useRef<HTMLDivElement>(null);

  /* Auto-scroll transcripción */
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [activeTab]);

  /* Simula speaking toggle cada 4s */
  useEffect(() => {
    const id = setInterval(() => setSpeaking((p) => !p), 4000);
    return () => clearInterval(id);
  }, []);

  /* Timer */
  useEffect(() => {
    const id = setInterval(() => setElapsed((p) => p + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
      .toString()
      .padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  /* Anclar comentario */
  const openAnchor = (line: TranscriptLine) => {
    setAnchoredLine(line);
    setAnchorOpen(true);
    setAnchorText('');
  };

  const saveComment = () => {
    if (!anchorText.trim() || !anchoredLine) return;
    setComments((prev) => [
      ...prev,
      {
        id: Date.now(),
        text: anchorText.trim(),
        time: new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }),
        anchoredTo: anchoredLine.text.slice(0, 48) + '…',
      },
    ]);
    setAnchorOpen(false);
    setAnchorText('');
    setAnchoredLine(null);
  };

  const cancelAnchor = () => {
    setAnchorOpen(false);
    setAnchorText('');
    setAnchoredLine(null);
  };

  return (
    <div className="obs-root">
      {/* ── HEADER ─────────────────────────────────────────── */}
      <header className="obs-header">
        <div className="obs-header__left">
          <div className="obs-logo">W</div>
          <div className="obs-header__info">
            <span className="obs-header__name">{CANDIDATE_NAME}</span>
            <span className="obs-header__role">{CANDIDATE_ROLE}</span>
          </div>
        </div>

        <div className="obs-header__center">
          <span className="obs-live-dot" />
          <span className="obs-live-label">EN VIVO</span>
          <span className="obs-timer">{formatTime(elapsed)}</span>
        </div>

        <div className="obs-header__right">
          <div className="obs-badge obs-badge--observer">
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            Observador
          </div>
        </div>
      </header>

      {/* ── BODY ───────────────────────────────────────────── */}
      <main className="obs-body">
        {/* ── COL IZQUIERDA: Video + Avatar + Audio ─────────── */}
        <div className="obs-col obs-col--left">
          {/* Video candidato */}
          <div className="obs-video-card">
            <div className="obs-video-placeholder">
              <div className="obs-video-avatar">
                <svg width="48" height="48" viewBox="0 0 64 64" fill="none">
                  <circle cx="32" cy="24" r="14" fill="#1E293B" />
                  <ellipse cx="32" cy="52" rx="22" ry="14" fill="#1E293B" />
                </svg>
              </div>
              <span className="obs-video-name">{CANDIDATE_NAME}</span>
            </div>
            <div className="obs-video-badge">
              <span className="obs-video-dot" />
              CAM
            </div>
          </div>

          {/* Avatar IA + ObserverAura */}
          <div className="obs-avatar-card">
            <div className="obs-avatar-label">Entrevistador IA</div>
            <ObserverAura speaking={speaking} />
            <div className="obs-avatar-status">
              {speaking ? (
                <>
                  <span className="obs-pulse obs-pulse--blue" /> Hablando…
                </>
              ) : (
                <>
                  <span className="obs-pulse obs-pulse--gray" /> Escuchando
                </>
              )}
            </div>
          </div>

          {/* Onda de audio */}
          <div className="obs-audio-card">
            <div className="obs-audio-header">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#0EA5E9"
                strokeWidth="2"
              >
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
              <span>Audio en tiempo real</span>
            </div>
            <div className="obs-waveform">
              {Array.from({ length: 28 }).map((_, i) => (
                <div key={i} className="obs-wave-bar" style={{ animationDelay: `${i * 60}ms` }} />
              ))}
            </div>
          </div>
        </div>

        {/* ── COL CENTRAL: Métricas ─────────────────────────── */}
        <div className="obs-col obs-col--center">
          <div className="obs-metrics-title">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#0EA5E9"
              strokeWidth="2"
            >
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            Análisis en tiempo real
          </div>

          {METRICS.map((m) => (
            <div
              key={m.key}
              className="obs-metric-card"
              style={{ '--metric-bg': m.bg } as React.CSSProperties}
            >
              <div className="obs-metric-top">
                <span className="obs-metric-label">{m.label}</span>
                <span className="obs-metric-value" style={{ color: m.color }}>
                  {m.value}%
                </span>
              </div>
              <div className="obs-progress-track">
                <div
                  className="obs-progress-fill"
                  style={
                    {
                      width: `${m.value}%`,
                      background: m.color,
                      '--fill-color': m.color,
                    } as React.CSSProperties
                  }
                />
              </div>
            </div>
          ))}

          {/* Score global */}
          <div className="obs-score-card">
            <div className="obs-score-label">Score Global</div>
            <div className="obs-score-ring">
              <svg viewBox="0 0 80 80" className="obs-score-svg">
                <circle cx="40" cy="40" r="34" fill="none" stroke="#1E293B" strokeWidth="6" />
                <circle
                  cx="40"
                  cy="40"
                  r="34"
                  fill="none"
                  stroke="url(#scoreGrad)"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray="213.6"
                  strokeDashoffset="46"
                  transform="rotate(-90 40 40)"
                />
                <defs>
                  <linearGradient id="scoreGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#2563EB" />
                    <stop offset="100%" stopColor="#0EA5E9" />
                  </linearGradient>
                </defs>
              </svg>
              <span className="obs-score-number">78</span>
            </div>
            <div className="obs-score-sub">Excelente candidato/a</div>
          </div>

          {/* Comentarios anclados */}
          {comments.length > 0 && (
            <div className="obs-comments-card">
              <div className="obs-comments-title">
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#0EA5E9"
                  strokeWidth="2"
                >
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                Notas ancladas
              </div>
              {comments.map((c) => (
                <div key={c.id} className="obs-comment-item">
                  <div className="obs-comment-anchor">&ldquo;{c.anchoredTo}&rdquo;</div>
                  <div className="obs-comment-text">{c.text}</div>
                  <div className="obs-comment-time">{c.time}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── COL DERECHA: Transcripción / Análisis / Notas ─── */}
        <div className="obs-col obs-col--right">
          {/* Tabs */}
          <div className="obs-tabs">
            {TABS.map((tab) => (
              <button
                key={tab}
                className={`obs-tab ${activeTab === tab ? 'obs-tab--active' : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Panel transcripción */}
          {activeTab === 'Transcripción' && (
            <div className="obs-transcript" ref={transcriptRef}>
              {MOCK_TRANSCRIPT.map((line) => (
                <div
                  key={line.id}
                  className={`obs-transcript-line obs-transcript-line--${line.speaker}`}
                >
                  <div className="obs-transcript-meta">
                    <span className="obs-transcript-speaker">
                      {line.speaker === 'ai' ? 'IA Entrevistador' : CANDIDATE_NAME}
                    </span>
                    <span className="obs-transcript-time">{line.time}</span>
                  </div>
                  <p className="obs-transcript-text">{line.text}</p>
                  <button
                    className="obs-anchor-btn"
                    onClick={() => openAnchor(line)}
                    title="Anclar comentario"
                  >
                    <svg
                      width="11"
                      height="11"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                    Anclar nota
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Panel análisis */}
          {activeTab === 'Análisis' && (
            <div className="obs-analysis">
              <div className="obs-analysis-section">
                <div className="obs-analysis-head">Fortalezas detectadas</div>
                {[
                  'Comunicación estructurada con evidencia cuantitativa',
                  'Alta capacidad de reflexión sobre errores pasados',
                  'Dominio metodológico mixto (cual + cuant)',
                  'Habilidad para gestionar resistencia organizacional',
                ].map((f, i) => (
                  <div key={i} className="obs-analysis-item obs-analysis-item--positive">
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#16A34A"
                      strokeWidth="2.5"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {f}
                  </div>
                ))}
              </div>
              <div className="obs-analysis-section">
                <div className="obs-analysis-head">Áreas de atención</div>
                {[
                  'Respuestas algo extensas — podría ser más concisa',
                  'Poca mención de métricas de impacto de negocio',
                ].map((f, i) => (
                  <div key={i} className="obs-analysis-item obs-analysis-item--warning">
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#D97706"
                      strokeWidth="2.5"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    {f}
                  </div>
                ))}
              </div>
              <div className="obs-analysis-section">
                <div className="obs-analysis-head">Palabras clave detectadas</div>
                <div className="obs-tags">
                  {[
                    'UX Research',
                    'Fintech',
                    'Onboarding',
                    'Entrevistas',
                    'Card sorting',
                    'Métricas',
                    'Insights',
                    'Stakeholders',
                  ].map((tag) => (
                    <span key={tag} className="obs-tag">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Panel notas */}
          {activeTab === 'Notas' && (
            <div className="obs-notes">
              {comments.length === 0 ? (
                <div className="obs-notes-empty">
                  <svg
                    width="36"
                    height="36"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#334155"
                    strokeWidth="1.5"
                  >
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  <p>No hay notas aún.</p>
                  <p>Ancla comentarios desde la transcripción.</p>
                </div>
              ) : (
                comments.map((c) => (
                  <div key={c.id} className="obs-note-card">
                    <div className="obs-note-anchor">
                      <svg
                        width="11"
                        height="11"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#0EA5E9"
                        strokeWidth="2"
                      >
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                      </svg>
                      {c.anchoredTo}
                    </div>
                    <p className="obs-note-text">{c.text}</p>
                    <span className="obs-note-time">{c.time}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </main>

      {/* ── INPUT FLOTANTE: Anclar comentario ──────────────── */}
      {anchorOpen && (
        <div className="obs-anchor-overlay" onClick={cancelAnchor}>
          <div className="obs-anchor-modal" onClick={(e) => e.stopPropagation()}>
            <div className="obs-anchor-modal__header">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#0EA5E9"
                strokeWidth="2"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              Anclar nota
            </div>
            {anchoredLine && (
              <div className="obs-anchor-modal__ref">
                &ldquo;{anchoredLine.text.slice(0, 80)}&hellip;&rdquo;
              </div>
            )}
            <textarea
              className="obs-anchor-modal__input"
              placeholder="Escribe tu observación…"
              value={anchorText}
              onChange={(e) => setAnchorText(e.target.value)}
              autoFocus
              rows={4}
            />
            <div className="obs-anchor-modal__actions">
              <button className="obs-anchor-modal__cancel" onClick={cancelAnchor}>
                Cancelar
              </button>
              <button
                className="obs-anchor-modal__save"
                onClick={saveComment}
                disabled={!anchorText.trim()}
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
