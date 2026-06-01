import { MainLayout } from '../layouts/MainLayout';
import { useCustomWebSocket } from '../hooks/useCustomWebSocket';
import { MessageBubble } from '../components/MessageBubble';
import { ChatForm } from '../components/ChatForm';

export function ChatRoom() {
  const { mensajes, sendJsonMessage, readyState } = useCustomWebSocket();

  const handleSend = (contenido: string) => {
    sendJsonMessage({ id: crypto.randomUUID(), tipo: 'user', contenido });
  };

  return (
    <MainLayout>
      <h2>Sala de Entrevista</h2>
      <p>Estado de conexión: {readyState === 1 ? 'Conectado' : 'Desconectado'}</p>

      <div className="message-list">
        {mensajes.map((msg) => (
          <MessageBubble key={msg.id} mensaje={msg} />
        ))}
      </div>

      <ChatForm onSendMessage={handleSend} />
    </MainLayout>
  );
}
