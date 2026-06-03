import { useState } from 'react';
import { Trophy, TrendingUp, TrendingDown, Minus, Users, Target, Zap } from 'lucide-react';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { ProgressRing } from '../components/ProgressRing';
import './Ranking.css';

// ── Types ────────────────────────────────────────────────
type Tab = 'Semanal' | 'Mensual' | 'Global';

interface RankUser {
  id: number;
  name: string;
  avatar: string; // initials
  score: number;
  sessions: number;
  delta: number; // posiciones ganadas/perdidas vs semana anterior
  badge?: string;
}

interface Challenge {
  id: number;
  icon: React.ReactNode;
  title: string;
  desc: string;
  progress: number; // 0-100
  members: number;
  reward: string;
}

// ── Mock data ────────────────────────────────────────────
const MOCK_USERS: RankUser[] = [
  {
    id: 1,
    name: 'Sofía Quispe',
    avatar: 'SQ',
    score: 2840,
    sessions: 24,
    delta: 2,
    badge: 'Élite',
  },
  { id: 2, name: 'Diego Paredes', avatar: 'DP', score: 2710, sessions: 21, delta: 0 },
  { id: 3, name: 'Valeria Torres', avatar: 'VT', score: 2590, sessions: 19, delta: -1 },
  { id: 4, name: 'Rodrigo Cáceres', avatar: 'RC', score: 2380, sessions: 17, delta: 3 },
  { id: 5, name: 'Camila Flores', avatar: 'CF', score: 2210, sessions: 16, delta: -2 },
  { id: 6, name: 'Javier Mendoza', avatar: 'JM', score: 2080, sessions: 14, delta: 1 },
  { id: 7, name: 'Alex Mamani', avatar: 'AM', score: 1950, sessions: 13, delta: 2, badge: 'Tú' },
  { id: 8, name: 'Lucía Pinto', avatar: 'LP', score: 1820, sessions: 11, delta: -1 },
];

// Posición del usuario actual (1-indexed) — definida aquí
const CURRENT_USER_ID = 7;
const CURRENT_USER_RANK = MOCK_USERS.findIndex((u) => u.id === CURRENT_USER_ID) + 1;

const CHALLENGES: Challenge[] = [
  {
    id: 1,
    icon: <Target size={18} />,
    title: '5 sesiones esta semana',
    desc: 'Completa 5 simulaciones antes del domingo y sube en el ranking grupal.',
    progress: 68,
    members: 34,
    reward: '+150 pts',
  },
  {
    id: 2,
    icon: <Zap size={18} />,
    title: 'Sin errores críticos',
    desc: 'Termina 3 entrevistas consecutivas sin cometer errores de nivel crítico.',
    progress: 42,
    members: 21,
    reward: 'Insignia Foco',
  },
  {
    id: 3,
    icon: <Users size={18} />,
    title: 'Colaboración grupal',
    desc: 'Deja al menos 2 comentarios de feedback a otros participantes esta semana.',
    progress: 85,
    members: 56,
    reward: '+80 pts',
  },
];

// ── Helpers ──────────────────────────────────────────────
function DeltaBadge({ delta }: { delta: number }) {
  if (delta === 0)
    return (
      <span className="ranking__delta ranking__delta--neutral">
        <Minus size={11} /> 0
      </span>
    );
  if (delta > 0)
    return (
      <span className="ranking__delta ranking__delta--up">
        <TrendingUp size={11} /> +{delta}
      </span>
    );
  return (
    <span className="ranking__delta ranking__delta--down">
      <TrendingDown size={11} /> {delta}
    </span>
  );
}

function medalClass(rank: number) {
  if (rank === 1) return 'ranking__medal ranking__medal--gold';
  if (rank === 2) return 'ranking__medal ranking__medal--silver';
  if (rank === 3) return 'ranking__medal ranking__medal--bronze';
  return 'ranking__medal ranking__medal--default';
}

function UserRow({
  user,
  rank,
  isCurrentUser,
  style,
}: {
  user: RankUser;
  rank: number;
  isCurrentUser: boolean;
  style?: React.CSSProperties;
}) {
  const isTop3 = rank <= 3;
  const classes = [
    'ranking__row',
    isTop3 ? 'ranking__row--top3' : '',
    isCurrentUser ? 'ranking__row--current' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} style={style}>
      <span className={medalClass(rank)}>{rank <= 3 ? <Trophy size={13} /> : rank}</span>

      <div className="ranking__avatar">{user.avatar}</div>

      <div className="ranking__info">
        <span className="ranking__name">
          {user.name}
          {user.badge && (
            <Badge label={user.badge} color={user.badge === 'Tú' ? 'primary' : 'accent'} />
          )}
        </span>
        <span className="ranking__sessions">{user.sessions} sesiones</span>
      </div>

      <div className="ranking__score-col">
        <span className="ranking__score">{user.score.toLocaleString()}</span>
        <DeltaBadge delta={user.delta} />
      </div>
    </div>
  );
}

// ── Page component ───────────────────────────────────────
export function Ranking() {
  const [activeTab, setActiveTab] = useState<Tab>('Semanal');

  const showStickyRow = CURRENT_USER_RANK > 5;
  const currentUser = MOCK_USERS[CURRENT_USER_ID - 1]!;

  return (
    <div className="ranking-page">
      {/* ── Header ── */}
      <header className="ranking-page__header">
        <div>
          <h1 className="ranking-page__title">
            <Trophy size={22} className="ranking-page__title-icon" />
            Ranking
          </h1>
          <p className="ranking-page__subtitle">
            Compite con la comunidad y sube posiciones cada semana.
          </p>
        </div>

        {/* TODO: navegar a /ranking/global cuando exista la ruta */}
        <button className="ranking-page__global-btn" disabled>
          Ver Ranking Global
        </button>
      </header>

      <div className="ranking-page__body">
        {/* ── Columna izquierda: tabla ── */}
        <section className="ranking-page__left">
          {/* Tabs */}
          <div className="ranking__tabs" role="tablist">
            {(['Semanal', 'Mensual', 'Global'] as Tab[]).map((tab) => (
              <button
                key={tab}
                role="tab"
                aria-selected={activeTab === tab}
                className={`ranking__tab${activeTab === tab ? ' ranking__tab--active' : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Lista de usuarios */}
          <Card className="ranking__list-card">
            <div className="ranking__list" role="list">
              {MOCK_USERS.map((user, idx) => (
                <UserRow
                  key={user.id}
                  user={user}
                  rank={idx + 1}
                  isCurrentUser={user.id === CURRENT_USER_ID}
                  style={{ animationDelay: `${idx * 60}ms` }}
                />
              ))}
            </div>

            {/* Sticky bottom: solo si usuario no está en top 5 */}
            {showStickyRow && (
              <div className="ranking__sticky">
                <UserRow user={currentUser} rank={CURRENT_USER_RANK} isCurrentUser />
              </div>
            )}
          </Card>
        </section>

        {/* ── Columna derecha: retos grupales ── */}
        <section className="ranking-page__right">
          <h2 className="ranking-page__section-title">
            <Users size={16} />
            Retos grupales
          </h2>

          <div className="ranking__challenges">
            {CHALLENGES.map((ch) => (
              <Card key={ch.id} className="ranking__challenge-card" hoverable>
                <div className="challenge__header">
                  <span className="challenge__icon">{ch.icon}</span>
                  <div className="challenge__meta">
                    <span className="challenge__title">{ch.title}</span>
                    <span className="challenge__members">
                      <Users size={11} /> {ch.members} participantes
                    </span>
                  </div>
                  <Badge label={ch.reward} color="success" />
                </div>

                <p className="challenge__desc">{ch.desc}</p>

                <div className="challenge__progress-row">
                  <ProgressRing value={ch.progress} size={48} />
                  <div className="challenge__bar-col">
                    <div className="challenge__bar-label">
                      Progreso grupal
                      <span>{ch.progress}%</span>
                    </div>
                    <div className="challenge__bar-track">
                      <div className="challenge__bar-fill" style={{ width: `${ch.progress}%` }} />
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
