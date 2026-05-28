import React from 'react';
import { MainLayout } from '../layouts/MainLayout';
import { useCustomWebSocket } from '../hooks/useCustomWebSocket';
import { MessageBubble } from '../components/MessageBubble';
import { ChatForm } from '../components/ChatForm';

export function ChatRoom() {
  const { mensajes, sendJsonMessage, readyState } = useCustomWebSocket();

  const handleSend = (contenido: string) => {
    sendJsonMessage({ tipo: 'user', contenido });
  };

  return (
    <MainLayout>
      <h2>Sala de Entrevista</h2>
      <p>Estado de conexión: {readyState === 1 ? ' Conectado' : ' Desconectado'}</p>

      <div style={{ height: '300px', overflowY: 'auto', background: '#fff', padding: '10px' }}>
        {mensajes.map((msg, idx) => (
          <MessageBubble key={idx} mensaje={msg} />
        ))}
      </div>

      <ChatForm onSendMessage={handleSend} />
    </MainLayout>
  );
}
