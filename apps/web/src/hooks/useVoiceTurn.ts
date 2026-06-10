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
  // true entre start() y stop(): la Web Speech API puede entregar un resultado
  // final DESPUES de stop(), y ese transcript tardio no debe disparar barge-in
  // ni enviarse como respuesta
  const activeRef = useRef(false);

  // OJO: el controlador captura sessionId en el PRIMER start() y no se recrea.
  // En esta app la pagina vive atada a una sesion (remonta al cambiar), y
  // start() no corre sin sessionId, asi que el invariante se sostiene.
  function ensureController(): SttController {
    if (controllerRef.current === null) {
      controllerRef.current = createSttController(
        sessionId,
        (t) => {
          if (!activeRef.current) return; // resultado tardio tras stop(): se ignora
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
          onError: () => {
            activeRef.current = false;
            inTurnRef.current = false;
            setMicStatus('denied');
          },
        },
      );
    }
    return controllerRef.current;
  }

  function start(): void {
    if (!sessionId) return; // sin sesion no hay transcript valido que construir
    try {
      ensureController().start();
      activeRef.current = true;
      setMicStatus('listening');
    } catch {
      // createSttController.start lanza sincronicamente si no hay Web Speech API
      setMicStatus('unsupported');
    }
  }

  function stop(): void {
    controllerRef.current?.stop();
    activeRef.current = false;
    inTurnRef.current = false;
    // Los estados terminales (denied/unsupported) son pegajosos: un stop()
    // programatico (cierre de sesion) no debe resucitar el boton del mic
    setMicStatus((s) => (s === 'listening' ? 'idle' : s));
  }

  // Al desmontar la sala el STT no puede quedar escuchando
  useEffect(() => {
    return () => controllerRef.current?.stop();
  }, []);

  return { micStatus, start, stop };
}
