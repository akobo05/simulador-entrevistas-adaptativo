import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { MessageBubble } from '../components/MessageBubble';
import { ChatForm } from '../components/ChatForm';
import { Button } from '../components/Button';
import { useSession } from '../context/SessionContext';
import { useInterviewSocket } from '../hooks/useInterviewSocket';
import { useSessionTimer } from '../hooks/useSessionTimer';
import { auraStateToAvatarProps } from '../lib/auraVisual';
import { endSession } from '../lib/apiClient';
import { createTtsController, type TtsController } from '@warachikuy/voice-pipeline';
import { useVoiceTurn } from '../hooks/useVoiceTurn';
import { useAuraPipeline } from '../hooks/useAuraPipeline';
import { PermissionGate, type PermissionGrants } from '../components/PermissionGate';
import { TtsSelector } from '../components/TtsSelector';
import { usePreferences } from '../hooks/usePreferences';
import type { CandidateTranscript } from '@warachikuy/shared-types';
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
  const { prefs, setPref } = usePreferences();
  const [ttsActive, setTtsActive] = useState(() => prefs.ttsEnabled);

  // Hooks antes de cualquier return condicional. Si no hay sesion el hook recibe
  // strings vacios (no conecta) y el componente redirige.
  const [grants, setGrants] = useState<PermissionGrants | null>(null);
  const [ttsSpeaking, setTtsSpeaking] = useState(false);
  // Borrador del campo de respuesta: el dictado del microfono se acumula aqui
  // y el candidato lo revisa/corrige antes de enviarlo.
  const [draft, setDraft] = useState('');
  const ttsRef = useRef<TtsController | null>(null);
  if (ttsRef.current === null) {
    // Recuperar la voz guardada en localStorage antes de crear el controller
    const savedVoice =
      prefs.ttsVoiceURI && typeof window !== 'undefined' && window.speechSynthesis
        ? (window.speechSynthesis.getVoices().find((v) => v.voiceURI === prefs.ttsVoiceURI) ?? null)
        : null;
    ttsRef.current = createTtsController({
      voice: savedVoice,
      rate: prefs.ttsRate,
      onStart: () => setTtsSpeaking(true),
      onEnd: () => setTtsSpeaking(false),
      // Sin speechSynthesis la entrevista sigue solo con texto
      onUnsupported: () => undefined,
    });
  }

  // El WS recien conecta cuando el candidato resolvio el gate de permisos: asi
  // el entrevistador no empieza a hablar detras de la pantalla de permisos.
  const socket = useInterviewSocket(
    grants && session ? session.websocketUrl : '',
    session?.sessionId ?? '',
  );

  const terminalError = socket.lastError !== null && !socket.lastError.recoverable;
  // Cierre inesperado del WS (caida de red) que NO vino como mensaje de error.
  // Lo tratamos como terminal salvo que estemos cerrando la sesion a proposito
  // (ending), donde el cierre 4001 del backend es esperado y navegamos al plan.
  const disconnected = socket.status === 'closed' && !ending;
  const ended = terminalError || disconnected;

  const pipeline = useAuraPipeline(
    session?.sessionId ?? '',
    // En estado terminal la camara se apaga (el LED no puede quedar prendido
    // detras de la pantalla de error); el guard de sendMetrics ya descartaba
    // los snapshots, esto libera ademas el hardware.
    (grants?.camera ?? false) && !ended,
    socket.sendMetrics,
  );

  function handleFinalTranscript(t: CandidateTranscript): void {
    pipeline.feedTranscript(t);
    // El dictado NO se envia solo: se acumula en el campo editable para que el
    // candidato corrija errores del STT y decida cuando enviar.
    setDraft((prev) => (prev ? `${prev} ${t.text}` : t.text));
  }
  function handleSend(text: string): void {
    socket.sendAnswer(text);
    // Al enviar termina el turno: el microfono descansa y el campo se limpia.
    voice.stop();
    setDraft('');
  }
  function handleSpeechStart(): void {
    // Barge-in: si el candidato habla encima de la pregunta, se corta el TTS
    ttsRef.current?.cancel();
  }
  const voice = useVoiceTurn(session?.sessionId ?? '', handleFinalTranscript, handleSpeechStart);

  // El timer arranca cuando el WS abre. timer.start es estable (useCallback),
  // asi que solo socket.status entra en las dependencias.
  const timer = useSessionTimer(false);
  useEffect(() => {
    if (socket.status === 'open') timer.start();
    // Se depende de timer.start (estable, useCallback) y no del objeto timer,
    // que cambia cada tick y reejecutaria el efecto sin necesidad.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket.status, timer.start]);

  // Habla cada interviewer.message nuevo. En reconexion el historial llega de
  // golpe: se habla solo el ultimo (no se re-lee lo viejo).
  const spokenCountRef = useRef(0);
  useEffect(() => {
    const msgs = socket.items.filter((i) => i.role === 'interviewer');
    if (msgs.length === 0 || msgs.length === spokenCountRef.current) return;
    if (ttsActive) ttsRef.current?.speak(msgs[msgs.length - 1]!.text);
    spokenCountRef.current = msgs.length;
    // Es el turno del entrevistador: el microfono descansa (el candidato lo
    // reactiva con el boton cuando le toca responder).
    voice.stop();
    // voice.stop solo toca refs y setState funcional, asi que una referencia
    // "vieja" por el closure es segura; el efecto reacciona solo a items.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket.items]);

  // Al salir de la sala no puede quedar audio sonando ni mic escuchando
  useEffect(() => {
    const tts = ttsRef.current;
    return () => tts?.cancel();
  }, []);

  const terminalMessage =
    terminalError && socket.lastError
      ? socket.lastError.message
      : 'Se perdio la conexion con el entrevistador.';

  useEffect(() => {
    if (socket.closing || ended) voice.stop();
    // En estado terminal tampoco puede seguir sonando la pregunta (en closing
    // si: el mensaje de cierre se habla). El stop/cancel son idempotentes y el
    // efecto solo debe reaccionar a los booleanos de cierre, no a la identidad
    // por-render de voice.stop.
    if (ended) ttsRef.current?.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket.closing, ended]);

  if (!session) return <Navigate to="/setup" replace />;

  if (!grants) {
    return (
      <div className="ip-root">
        <PermissionGate onReady={setGrants} />
      </div>
    );
  }

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

  const auraProps = auraStateToAvatarProps(pipeline.auraState);

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
          <button
            type="button"
            className={ttsActive ? 'ip-btn-tts ip-btn-tts--on' : 'ip-btn-tts'}
            onClick={() => {
              const next = !ttsActive;
              setTtsActive(next);
              setPref('ttsEnabled', next);
              if (!next) ttsRef.current?.cancel();
            }}
            aria-pressed={ttsActive}
            title={ttsActive ? 'Silenciar entrevistador' : 'Activar voz del entrevistador'}
            data-testid="ip-btn-tts"
          >
            {ttsActive ? '🔊' : '🔇'}
          </button>
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
            <AvatarAura {...auraProps} speaking={ttsSpeaking} />
          </Suspense>
          {(pipeline.cameraStatus === 'denied' || pipeline.cameraStatus === 'failed') && (
            <p className="ip-camera-note" data-testid="ip-camera-note">
              Cámara no disponible: el contacto visual queda sin datos.
            </p>
          )}
        </section>

        {/* Panel derecho: transcripcion + input */}
        <aside className="ip-side-panel">
          {/* Transcripcion */}
          <div className="ip-transcript">
            <div className="ip-transcript__header">
              <span className="ip-transcript__title">Transcripción</span>
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
                {grants.mic && voice.micStatus !== 'denied' && voice.micStatus !== 'unsupported' ? (
                  <button
                    type="button"
                    className={voice.micStatus === 'listening' ? 'ip-mic ip-mic--on' : 'ip-mic'}
                    onClick={() => (voice.micStatus === 'listening' ? voice.stop() : voice.start())}
                    aria-pressed={voice.micStatus === 'listening'}
                    data-testid="ip-mic-toggle"
                  >
                    {voice.micStatus === 'listening' ? 'Escuchando…' : 'Hablar'}
                  </button>
                ) : (
                  <div className="ip-mic-placeholder" />
                )}
                <ChatForm
                  value={draft}
                  onChange={setDraft}
                  onSendMessage={handleSend}
                  disabled={socket.status !== 'open'}
                />
              </div>
            )}
          </div>

          {/* Selector de voz del TTS — visible solo si TTS esta activo */}
          {ttsActive && (
            <div className="ip-tts-settings">
              <TtsSelector onChange={(v, r) => ttsRef.current?.setVoice(v, r)} />
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}
