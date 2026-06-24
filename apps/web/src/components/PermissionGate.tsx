import { useState } from 'react';
import { Button } from './Button';
import { usePreferences } from '../hooks/usePreferences';
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
  const { prefs, setPref } = usePreferences();

  async function requestOne(constraints: MediaStreamConstraints): Promise<boolean> {
    try {
      if (!navigator.mediaDevices?.getUserMedia) return false;
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
    setPref('responseMode', 'voice');
    setPref('cameraEnabled', camera);
    onReady({ mic, camera });
  }

  function skipToText(): void {
    setPref('responseMode', 'text');
    setPref('cameraEnabled', false);
    onReady({ mic: false, camera: false });
  }

  const hasPrevPref = prefs.cameraEnabled !== null;
  const prevLabel =
    prefs.responseMode === 'text'
      ? 'Continuar como la última vez (modo texto)'
      : 'Continuar como la última vez (voz y cámara)';

  return (
    <section className="pg-root" data-testid="permission-gate">
      <h2 className="pg-title">Antes de empezar</h2>
      <p className="pg-text">
        Para la entrevista por voz activa el micrófono y la cámara. El video se procesa en tu
        navegador y <strong>nunca sale de tu equipo</strong>: solo viajan métricas numéricas.
      </p>
      <div className="pg-actions">
        <Button onClick={() => void activate()} loading={requesting}>
          {requesting ? 'Solicitando permisos...' : 'Activar micrófono y cámara'}
        </Button>
        <button type="button" className="pg-skip" onClick={skipToText} disabled={requesting}>
          Continuar sin activar (responderé por texto)
        </button>
        {hasPrevPref && (
          <button
            type="button"
            className="pg-skip pg-skip--prev"
            onClick={() => {
              if (prefs.responseMode === 'text') {
                skipToText();
              } else {
                void activate();
              }
            }}
            disabled={requesting}
          >
            {prevLabel}
          </button>
        )}
      </div>
    </section>
  );
}
