import { useState, useEffect } from 'react';
import { CompetencyRing } from '../components/CompetencyRing';
import { useRoomSocket } from '../hooks/useRoomSocket';
import type { RoomRole } from '@warachikuy/shared-types';
import './ObserverRoom.css';

/* ── Types ────────────────────────────────────────────────── */
interface TimestampComment {
  id: string;
  timestamp: number;
  text: string;
}

export type ObserverType = 'student' | 'teacher' | 'recruiter' | 'guest';

const OBSERVER_TYPES: { value: ObserverType; label: string }[] = [
  { value: 'student', label: 'Estudiante' },
  { value: 'teacher', label: 'Docente' },
  { value: 'recruiter', label: 'Reclutador' },
  { value: 'guest', label: 'Invitado' },
];

function observerLabel(type: ObserverType): string {
  return OBSERVER_TYPES.find((t) => t.value === type)?.label ?? 'Invitado';
}

/* ── Helpers ──────────────────────────────────────────────── */
function formatTimer(s: number): string {
  const m = Math.floor(s / 60)
    .toString()
    .padStart(2, '0');
  const sec = (s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

/* ── Lobby ────────────────────────────────────────────────── */
function Lobby({ onJoin }: { onJoin: (roomId: string, type: ObserverType) => void }) {
  const [roomId] = useState(() => crypto.randomUUID().slice(0, 8));
  const [obsType, setObsType] = useState<ObserverType>('guest');
  const [inputRoom, setInputRoom] = useState(roomId);

  const handleJoin = () => {
    const id = inputRoom.trim() || roomId;
    onJoin(id, obsType);
  };

  return (
    <div className="obs-lobby">
      <div className="obs-lobby-card">
        <div className="obs-lobby-icon">W</div>
        <h1 className="obs-lobby-title">Sala de observación</h1>
        <p className="obs-lobby-sub">
          Todos los que entran son observadores. Selecciona tu perfil.
        </p>

        <div className="obs-lobby-field">
          <label className="obs-lobby-label">ID de sala</label>
          <input
            className="obs-lobby-input"
            value={inputRoom}
            onChange={(e) => setInputRoom(e.target.value)}
            placeholder="room-id"
          />
        </div>

        <div className="obs-lobby-field">
          <label className="obs-lobby-label">Tu perfil como observador</label>
          <div className="obs-lobby-roles">
            {OBSERVER_TYPES.map((t) => (
              <button
                key={t.value}
                className={`obs-lobby-role ${obsType === t.value ? 'obs-lobby-role--active' : ''}`}
                onClick={() => setObsType(t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <button className="obs-lobby-join" onClick={handleJoin}>
          Entrar a la sala
        </button>
      </div>
    </div>
  );
}

/* ── Room ─────────────────────────────────────────────────── */
function Room({ roomId, obsType }: { roomId: string; obsType: ObserverType }) {
  const [elapsed, setElapsed] = useState(0);
  const [comments, setComments] = useState<TimestampComment[]>([]);
  const [commentInput, setCommentInput] = useState('');
  const [metrics, setMetrics] = useState<{
    fluency: number | null;
    eyeContact: number | null;
    speechRate: number | null;
  }>({
    fluency: null,
    eyeContact: null,
    speechRate: null,
  });

  const role: RoomRole = 'observer';

  const { peerId, participants } = useRoomSocket({
    roomId,
    role,
    onMetricsUpdate: (_from, incoming) => {
      const m = {
        fluency: null as number | null,
        eyeContact: null as number | null,
        speechRate: null as number | null,
      };
      for (const metric of incoming) {
        if (metric.name === 'fluency') m.fluency = metric.value;
        else if (metric.name === 'eye_contact') m.eyeContact = metric.value;
        else if (metric.name === 'speech_rate') m.speechRate = metric.value;
      }
      setMetrics(m);
    },
  });

  useEffect(() => {
    const id = setInterval(() => setElapsed((p) => p + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const addComment = () => {
    const text = commentInput.trim();
    if (!text) return;
    setComments((prev) => [...prev, { id: crypto.randomUUID(), timestamp: elapsed, text }]);
    setCommentInput('');
  };

  return (
    <div className="obs-room">
      <header className="obs-header">
        <div className="obs-header__left">
          <div className="obs-logo">W</div>
          <div className="obs-header__info">
            <span className="obs-header__name">Sala: {roomId}</span>
            <span className="obs-header__role">{observerLabel(obsType)}</span>
          </div>
        </div>

        <div className="obs-header__center">
          <span className="obs-live-dot" />
          <span className="obs-live-label">EN VIVO</span>
          <span className="obs-timer">{formatTimer(elapsed)}</span>
        </div>

        <div className="obs-header__right">
          <div className="obs-badge obs-badge--observer">
            {participants.length} participante{participants.length !== 1 ? 's' : ''}
          </div>
        </div>
      </header>

      <main className="obs-body">
        <div className="obs-col obs-col--left">
          <div className="obs-col-header">Participantes</div>
          <div className="obs-participant-list">
            {participants.map((p) => (
              <div key={p.peerId} className="obs-participant-item">
                <span className="obs-participant-dot obs-participant-dot--observer" />
                <span className="obs-participant-name">Observador</span>
                {p.peerId === peerId && (
                  <span className="obs-participant-you">tú — {observerLabel(obsType)}</span>
                )}
              </div>
            ))}
            {participants.length === 0 && (
              <span className="obs-col-empty">Esperando participantes…</span>
            )}
          </div>
        </div>

        <div className="obs-col obs-col--center">
          <div className="obs-col-header">Métricas en vivo</div>
          <div className="obs-metrics__rings">
            <CompetencyRing label="Fluidez" score={metrics.fluency} />
            <CompetencyRing label="Contacto visual" score={metrics.eyeContact} />
            <CompetencyRing label="Ritmo del habla" score={metrics.speechRate} />
          </div>
        </div>

        <div className="obs-col obs-col--right">
          <div className="obs-col-header">Comentarios</div>
          <div className="obs-comments__list">
            {comments.length === 0 && <span className="obs-col-empty">Aún no hay comentarios</span>}
            {comments.map((c) => (
              <div key={c.id} className="obs-comment-item">
                <span className="obs-comment-time">{formatTimer(c.timestamp)}</span>
                <span className="obs-comment-text">{c.text}</span>
              </div>
            ))}
          </div>
          <div className="obs-comments__input-row">
            <input
              className="obs-comments__input"
              value={commentInput}
              onChange={(e) => setCommentInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  addComment();
                }
              }}
              placeholder="Ancla un comentario…"
            />
            <button
              className="obs-comments__send"
              onClick={addComment}
              disabled={!commentInput.trim()}
            >
              Anclar
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   PAGE
   ══════════════════════════════════════════════════════════ */
export function ObserverRoom() {
  const [joined, setJoined] = useState<{ roomId: string; obsType: ObserverType } | null>(null);

  const handleJoin = (roomId: string, obsType: ObserverType) => {
    setJoined({ roomId, obsType });
  };

  if (joined) {
    return <Room roomId={joined.roomId} obsType={joined.obsType} />;
  }

  return <Lobby onJoin={handleJoin} />;
}
