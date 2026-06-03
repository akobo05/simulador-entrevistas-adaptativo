import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { MessageBubble } from '../components/MessageBubble';
import { ChatForm } from '../components/ChatForm';
import { Button } from '../components/Button';
import { useSession } from '../context/SessionContext';
import { useInterviewSocket } from '../hooks/useInterviewSocket';
import { useSessionTimer } from '../hooks/useSessionTimer';
import { auraStateToAvatarProps } from '../lib/auraVisual';
import { endSession } from '../lib/apiClient';
import './InterviewPage.css';

// Carga diferida para que Three.js no bloquee el handshake WS
const AvatarAura = lazy(() =>
  import('../components/AvatarAura').then((m) => ({ default: m.AvatarAura })),
);

export function InterviewPage() {
  const { session, clearSession } = useSession();
  const navigate = useNavigate();
  const [ending, setEnding] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);

  // Hooks antes de cualquier return condicional. Si no hay sesion el hook recibe
  // strings vacios (no conecta) y el componente redirige.
  const socket = useInterviewSocket(session?.websocketUrl ?? '', session?.sessionId ?? '');

  // El timer arranca cuando el WS abre. timer.start es estable (useCallback),
  // asi que solo socket.status entra en las dependencias.
  const timer = useSessionTimer(false);
  useEffect(() => {
    if (socket.status === 'open') timer.start();
  }, [socket.status, timer.start]);

  if (!session) return <Navigate to="/setup" replace />;

  const activeSession = session;

  async function finish(): Promise<void> {
    setEnding(true);
    setEndError(null);
    try {
      await endSession(activeSession.sessionId, activeSession.token);
      navigate(`/plan/${activeSession.sessionId}`);
    } catch {
      setEndError('No se pudo finalizar la entrevista. Intenta de nuevo.');
      setEnding(false);
    }
  }

  function restart(): void {
    clearSession();
    navigate('/');
  }

  const terminalError = socket.lastError !== null && !socket.lastError.recoverable;
  // Cierre inesperado del WS (caida de red) que NO vino como mensaje de error.
  // Lo tratamos como terminal salvo que estemos cerrando la sesion a proposito
  // (ending), donde el cierre 4001 del backend es esperado y navegamos al plan.
  const disconnected = socket.status === 'closed' && !ending;
  const ended = terminalError || disconnected;
  const terminalMessage =
    terminalError && socket.lastError
      ? socket.lastError.message
      : 'Se perdio la conexion con el entrevistador.';

  // El hook no expone auraState todavia (paso multimodal futuro).
  // Se pasa null al selector, que devuelve { fluency: null, speechRate: null, eyeContact: null }.
  const auraProps = auraStateToAvatarProps(null);

  const statusLabel =
    socket.status === 'open'
      ? 'Conectado'
      : socket.status === 'connecting'
        ? 'Conectando...'
        : 'Desconectado';

  return (
    <div className="ip-root">
      {/* ── Header ──────────────────────────────────── */}
      <header className="ip-header">
        <div className="ip-header__left">
          <span className="ip-logo">Warachikuy</span>
          <span className="ip-badge-live">EN VIVO</span>
        </div>

        {/* Timer ascendente */}
        <div className="ip-timer" data-testid="ip-timer">
          <span className="ip-timer__label">{timer.formattedTime}</span>
        </div>

        {/* Estado de conexion (fase y turno) */}
        <p
          className={socket.status === 'open' ? 'ip-status' : 'ip-status ip-status--warn'}
          data-testid="ip-connection-status"
        >
          Fase: {socket.phase} · Turno: {socket.turnNumber} · {statusLabel}
        </p>

        <div className="ip-header__right">
          {!ended && !socket.closing && (
            <button
              className="ip-btn-end"
              onClick={finish}
              disabled={ending}
              data-testid="ip-btn-finalizar"
            >
              {ending ? 'Generando...' : 'Finalizar'}
            </button>
          )}
        </div>
      </header>

      {/* ── Stage ───────────────────────────────────── */}
      <main className="ip-stage">
        {/* Avatar + aura (izquierda) */}
        <section className="ip-avatar-wrap">
          <Suspense fallback={<div className="aura-fallback" />}>
            <AvatarAura {...auraProps} speaking={false} />
          </Suspense>
        </section>

        {/* Panel derecho: transcripcion + input */}
        <aside className="ip-side-panel">
          {/* Transcripcion */}
          <div className="ip-transcript">
            <div className="ip-transcript__header">
              <span className="ip-transcript__title">Transcripcion</span>
              <span className="ip-transcript__count">{socket.items.length} mensajes</span>
            </div>
            <div className="ip-transcript__body" data-testid="ip-transcript-body">
              {socket.items.map((item) => (
                <MessageBubble key={item.id} item={item} />
              ))}
            </div>
          </div>

          {/* Banners de error recuperable y de fallo en endSession */}
          {socket.lastError?.recoverable && (
            <p className="ip-banner" data-testid="ip-recoverable-error">
              {socket.lastError.message}
            </p>
          )}
          {endError && (
            <p className="ip-banner ip-banner--error" data-testid="ip-end-error">
              {endError}
            </p>
          )}

          {/* ── Zona inferior: estado terminal / closing / input ── */}
          <div className="ip-input-area">
            {ended ? (
              // Estado terminal: error no recuperable o desconexion inesperada
              <div className="ip-terminal" data-testid="ip-terminal">
                <p className="ip-terminal__msg">{terminalMessage}</p>
                <Button onClick={restart}>Volver al inicio</Button>
              </div>
            ) : socket.closing ? (
              // Cierre de entrevista: el backend envio intent=closing
              <div className="ip-closing" data-testid="ip-closing">
                <Button onClick={finish} disabled={ending}>
                  {ending ? 'Generando...' : 'Ver mi plan de mejora'}
                </Button>
              </div>
            ) : (
              // Estado normal: input del candidato
              <div className="ip-normal-input" data-testid="ip-normal-input">
                {/* placeholder del mic - paso multimodal */}
                <div className="ip-mic-placeholder" />
                <ChatForm
                  onSendMessage={(text) => socket.sendAnswer(text)}
                  disabled={socket.status !== 'open'}
                />
              </div>
            )}
          </div>
        </aside>
      </main>
    </div>
  );
}
