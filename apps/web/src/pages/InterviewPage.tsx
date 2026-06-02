import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { OrbeAnimado } from '../components/OrbeAnimado';
import { MessageBubble } from '../components/MessageBubble';
import { ChatForm } from '../components/ChatForm';
import { Button } from '../components/Button';
import { useSession } from '../context/SessionContext';
import { useInterviewSocket } from '../hooks/useInterviewSocket';
import { endSession } from '../lib/apiClient';

export function InterviewPage() {
  const { session } = useSession();
  const navigate = useNavigate();
  const [ending, setEnding] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);

  // Hooks antes de cualquier return condicional. Si no hay sesion el hook recibe
  // strings vacios (no conecta) y el componente redirige.
  const socket = useInterviewSocket(session?.websocketUrl ?? '', session?.sessionId ?? '');

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

  return (
    <div className="interview-root">
      <div className="interview-orb">
        <OrbeAnimado />
      </div>
      <p className="interview-status">
        Fase: {socket.phase} · Turno: {socket.turnNumber} ·{' '}
        {socket.status === 'open'
          ? 'Conectado'
          : socket.status === 'connecting'
            ? 'Conectando...'
            : 'Desconectado'}
      </p>

      <div className="message-list">
        {socket.items.map((item) => (
          <MessageBubble key={item.id} item={item} />
        ))}
      </div>

      {socket.lastError?.recoverable && (
        <p className="interview-banner">{socket.lastError.message}</p>
      )}
      {endError && <p className="setup-error">{endError}</p>}

      {socket.closing ? (
        <Button onClick={finish} disabled={ending}>
          {ending ? 'Generando...' : 'Ver mi plan de mejora'}
        </Button>
      ) : (
        <>
          <ChatForm onSendMessage={(text) => socket.sendAnswer(text)} />
          <Button className="interview-finish" onClick={finish} disabled={ending}>
            Finalizar entrevista
          </Button>
        </>
      )}
    </div>
  );
}
