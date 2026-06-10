import { useEffect, useRef, useState } from 'react';
import { createSttController, type SttController } from '@warachikuy/voice-pipeline';
import type { CandidateTranscript } from '@warachikuy/shared-types';

export type MicStatus = 'idle' | 'listening' | 'denied' | 'unsupported';

export interface VoiceTurn {
  micStatus: MicStatus;
  start: () => void;
  stop: () => void;
}

// Envuelve el STT del paquete de voz para el loop de la entrevista: expone el
// estado del microfono, entrega solo los transcripts FINALES (los parciales se
// usan unicamente para detectar que el candidato empezo a hablar -> barge-in).
export function useVoiceTurn(
  sessionId: string,
  onFinalTranscript: (t: CandidateTranscript) => void,
  onSpeechStart: () => void,
): VoiceTurn {
  const [micStatus, setMicStatus] = useState<MicStatus>('idle');
  const controllerRef = useRef<SttController | null>(null);
  // Callbacks por ref: el controlador vive entre renders y no debe capturar
  // closures viejos del componente.
  const onFinalRef = useRef(onFinalTranscript);
  const onSpeechStartRef = useRef(onSpeechStart);
  onFinalRef.current = onFinalTranscript;
  onSpeechStartRef.current = onSpeechStart;
  // true mientras hay un turno hablado en curso (ya se aviso onSpeechStart)
  const inTurnRef = useRef(false);

  function ensureController(): SttController {
    if (controllerRef.current === null) {
      controllerRef.current = createSttController(
        sessionId,
        (t) => {
          if (!inTurnRef.current) {
            inTurnRef.current = true;
            onSpeechStartRef.current();
          }
          if (t.isFinal) {
            inTurnRef.current = false;
            onFinalRef.current(t);
          }
        },
        {
          // Errores terminales (not-allowed, audio-capture, service-not-allowed,
          // max-restart-attempts-exceeded): el mic queda fuera, cae el fallback tecleado
          onError: () => setMicStatus('denied'),
        },
      );
    }
    return controllerRef.current;
  }

  function start(): void {
    try {
      ensureController().start();
      setMicStatus('listening');
    } catch {
      // createSttController.start lanza sincronicamente si no hay Web Speech API
      setMicStatus('unsupported');
    }
  }

  function stop(): void {
    controllerRef.current?.stop();
    inTurnRef.current = false;
    setMicStatus('idle');
  }

  // Al desmontar la sala el STT no puede quedar escuchando
  useEffect(() => {
    return () => controllerRef.current?.stop();
  }, []);

  return { micStatus, start, stop };
}
