import type { ChatItem } from '../hooks/useInterviewSocket';

interface Props {
  item: ChatItem;
}

// El texto se renderiza como children de React (escapado por defecto). Prohibido
// dangerouslySetInnerHTML sobre el output del LLM o del candidato.
export function MessageBubble({ item }: Props) {
  return (
    <div className={`message-bubble ${item.role}`}>
      <strong>{item.role === 'interviewer' ? 'Entrevistador' : 'Tú'}: </strong>
      <span>{item.text}</span>
    </div>
  );
}
