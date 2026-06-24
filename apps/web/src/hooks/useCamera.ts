import { useCallback, useEffect, useRef, useState } from 'react';

export type CameraStatus = 'off' | 'starting' | 'on' | 'on_no_metrics' | 'denied' | 'failed';

export interface UseCameraOptions {
  constraints?: MediaTrackConstraints;
  autoStart?: boolean;
}

export interface UseCameraReturn {
  stream: MediaStream | null;
  status: CameraStatus;
  start: () => Promise<void>;
  stop: () => void;
}

const DEFAULT_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 640 },
  height: { ideal: 480 },
  frameRate: { ideal: 15 },
};

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function useCamera(options: UseCameraOptions = {}): UseCameraReturn {
  const autoStart = options.autoStart ?? false;
  const constraintsRef = useRef(options.constraints ?? DEFAULT_CONSTRAINTS);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>('off');
  const streamRef = useRef<MediaStream | null>(null);
  const genRef = useRef(0); // generacion: cada start/stop la incrementa e invalida lo anterior

  // Libera el stream actual SIN tocar el status (lo decide el caller).
  function releaseStream(): void {
    const s = streamRef.current;
    if (s) {
      s.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setStream(null);
  }

  const stop = useCallback(() => {
    genRef.current += 1; // invalida cualquier start en vuelo
    releaseStream();
    setStatus('off');
  }, []);

  const start = useCallback(async () => {
    const myGen = (genRef.current += 1); // esta llamada pasa a ser la vigente
    setStatus('starting');
    releaseStream(); // limpia cualquier stream previo sin pisar 'starting'

    const maxRetries = 2;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: constraintsRef.current });
        if (genRef.current !== myGen) {
          s.getTracks().forEach((t) => t.stop()); // llegamos tarde: este stream ya no es el vigente
          return;
        }
        streamRef.current = s;
        setStream(s);
        setStatus('on');
        s.getTracks().forEach((track) =>
          track.addEventListener('ended', () => {
            if (genRef.current !== myGen) return;
            setStatus('failed');
            setStream(null);
            streamRef.current = null;
          }),
        );
        return;
      } catch (err) {
        const isNotAllowed = (err as DOMException)?.name === 'NotAllowedError';
        if (genRef.current !== myGen) return;
        if (isNotAllowed) {
          setStatus('denied');
          return;
        }
        if (attempt < maxRetries) {
          await delay(1000 * (attempt + 1));
          if (genRef.current !== myGen) return;
          continue;
        }
        setStatus('failed');
        return;
      }
    }
  }, []);

  useEffect(() => {
    if (autoStart) void start();
    return () => stop();
  }, [autoStart, start, stop]);

  return { stream, status, start, stop };
}
