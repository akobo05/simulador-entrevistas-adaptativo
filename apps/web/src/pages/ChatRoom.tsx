import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AvatarAura } from '../components/AvatarAura';
import './ChatRoom.css';

/* ── Mock de métricas ────────────────────────────────────── */
const MOCK_METRICS = {
  fluency: 78,
  rhythm: 84,
  level: 'B2',
  pause: 1.4,
};

/* ── Mock de transcripción ───────────────────────────────── */
const MOCK_TRANSCRIPT = [
  {
    id: '1',
    speaker: 'AI',
    text: 'Hola, bienvenido a tu sesión de práctica. Cuéntame, ¿cuál es tu experiencia profesional más relevante?',
    ts: '00:00',
  },
  {
    id: '2',
    speaker: 'TÚ',
    text: 'Estuve trabajando tres años como desarrollador backend en una empresa de fintech, principalmente con Node.js y bases de datos relacionales.',
    ts: '00:18',
  },
  {
    id: '3',
    speaker: 'AI',
    text: 'Interesante. ¿Puedes describir un desafío técnico que hayas resuelto en ese rol?',
    ts: '00:32',
  },
  {
    id: '4',
    speaker: 'TÚ',
    text: 'Tuvimos un problema de rendimiento con consultas muy lentas. Optimicé los índices y reduje el tiempo de respuesta en un 60%.',
    ts: '00:51',
  },
];

/* ── Duración total de la sesión (segundos) ──────────────── */
const SESSION_DURATION = 15 * 60; // 15 minutos

export function ChatRoom() {
  const navigate = useNavigate();
  const [elapsed, setElapsed] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* Timer */
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setElapsed((prev) => {
        if (prev >= SESSION_DURATION) {
          clearInterval(intervalRef.current!);
          return prev;
        }
        return prev + 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current!);
  }, []);

  /* Simula speaking toggle para demo */
  useEffect(() => {
    const t = setInterval(() => setSpeaking((s) => !s), 3500);
    return () => clearInterval(t);
  }, []);

  /* Helpers timer */
  const remaining = SESSION_DURATION - elapsed;
  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');
  const progress = elapsed / SESSION_DURATION; // 0–1
  const circumference = 2 * Math.PI * 26; // r=26
  const strokeDash = circumference * (1 - progress);

  return (
    <div className="cr-root">
      {/* ── Header bar ─────────────────────────────────── */}
      <header className="cr-header">
        <div className="cr-header__left">
          <img
            src="/logo.svg"
            alt="Logo"
            style={{ width: '50px', height: 'auto' }} // Ajusta el tamaño a tu gusto
          />
          <span className="cr-logo">Warachikuy</span>
          <span className="cr-badge-live">EN VIVO</span>
        </div>

        {/* Timer circular */}
        <div className="cr-timer" title={`${mm}:${ss} restantes`}>
          <svg viewBox="0 0 60 60" className="cr-timer__svg">
            {/* Track */}
            <circle
              cx="30"
              cy="30"
              r="26"
              fill="none"
              stroke="rgba(240,244,255,0.08)"
              strokeWidth="3"
            />
            {/* Progress */}
            <circle
              cx="30"
              cy="30"
              r="26"
              fill="none"
              stroke="#2563EB"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDash}
              transform="rotate(-90 30 30)"
              className="cr-timer__arc"
            />
          </svg>
          <span className="cr-timer__label">
            {mm}:{ss}
          </span>
        </div>

        <div className="cr-header__right">
          <button className="cr-btn-end" onClick={() => navigate('/improvement')}>
            Finalizar
          </button>
        </div>
      </header>

      {/* ── Main stage ─────────────────────────────────── */}
      <main className="cr-stage">
        {/* Avatar + aura */}
        <section className="cr-avatar-wrap">
          <AvatarAura
            fluency={MOCK_METRICS.fluency}
            rhythm={MOCK_METRICS.rhythm}
            level={MOCK_METRICS.level}
            pause={MOCK_METRICS.pause}
            speaking={speaking}
          />
          <p className="cr-avatar-label">{speaking ? 'Escuchando…' : 'Procesando…'}</p>
        </section>

        {/* Panel derecho: audio + transcripción */}
        <aside className="cr-side-panel">
          {/* Panel audio */}
          <div className="cr-audio-panel">
            <div className="cr-audio-panel__title">Audio en tiempo real</div>
            <div className="cr-waveform">
              {Array.from({ length: 28 }).map((_, i) => (
                <div
                  key={i}
                  className={`cr-waveform__bar ${speaking ? 'cr-waveform__bar--active' : ''}`}
                  style={{ animationDelay: `${(i * 47) % 600}ms` }}
                />
              ))}
            </div>
            <div className="cr-audio-meta">
              <span className="cr-audio-meta__item">
                <span className="cr-dot cr-dot--green" />
                Micrófono activo
              </span>
              <span className="cr-audio-meta__item">
                <span className="cr-dot cr-dot--blue" />
                {speaking ? 'Hablando' : 'En silencio'}
              </span>
            </div>
          </div>

          {/* Transcripción */}
          <div className="cr-transcript">
            <div className="cr-transcript__header">
              <span className="cr-transcript__title">Transcripción</span>
              <span className="cr-transcript__count">{MOCK_TRANSCRIPT.length} mensajes</span>
            </div>
            <div className="cr-transcript__body">
              {MOCK_TRANSCRIPT.map((msg) => (
                <div
                  key={msg.id}
                  className={`cr-msg ${msg.speaker === 'TÚ' ? 'cr-msg--user' : 'cr-msg--ai'}`}
                >
                  <div className="cr-msg__meta">
                    <span className="cr-msg__speaker">{msg.speaker}</span>
                    <span className="cr-msg__ts">{msg.ts}</span>
                  </div>
                  <p className="cr-msg__text">{msg.text}</p>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
