import { useState } from 'react';
import { Button } from './Button';
import './PermissionGate.css';

export interface PermissionGrants {
  mic: boolean;
  camera: boolean;
}

interface PermissionGateProps {
  onReady: (grants: PermissionGrants) => void;
}

// Pide los permisos ANTES de entrar a la sala, con un boton explicito (los
// navegadores castigan los prompts sin gesto del usuario). Cada permiso se
// solicita por separado para degradar de forma independiente: sin mic queda el
// modo tecleado, sin camara el eye_contact sale "sin datos".
export function PermissionGate({ onReady }: PermissionGateProps) {
  const [requesting, setRequesting] = useState(false);

  async function requestOne(constraints: MediaStreamConstraints): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      // Solo se pedia el permiso: el stream real lo abre cada pipeline despues
      stream.getTracks().forEach((t) => t.stop());
      return true;
    } catch {
      return false;
    }
  }

  async function activate(): Promise<void> {
    setRequesting(true);
    const mic = await requestOne({ audio: true });
    const camera = await requestOne({ video: true });
    onReady({ mic, camera });
  }

  return (
    <section className="pg-root" data-testid="permission-gate">
      <h2 className="pg-title">Antes de empezar</h2>
      <p className="pg-text">
        Para la entrevista por voz activá el micrófono y la cámara. El video se procesa en tu
        navegador y <strong>nunca sale de tu equipo</strong>: solo viajan métricas numéricas.
      </p>
      <div className="pg-actions">
        <Button onClick={() => void activate()} disabled={requesting}>
          {requesting ? 'Solicitando permisos...' : 'Activar micrófono y cámara'}
        </Button>
        <button
          type="button"
          className="pg-skip"
          onClick={() => onReady({ mic: false, camera: false })}
          disabled={requesting}
        >
          Continuar sin activar (responderé por texto)
        </button>
      </div>
    </section>
  );
}
