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
  const cancelledRef = useRef(false);

  function stopTracks(): void {
    const s = streamRef.current;
    if (s) {
      s.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setStream(null);
    setStatus('off');
  }

  const stop = useCallback(() => {
    cancelledRef.current = true;
    stopTracks();
  }, []);

  const start = useCallback(async () => {
    cancelledRef.current = false;
    setStatus('starting');

    stopTracks();

    const maxRetries = 2;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: constraintsRef.current,
        });

        if (cancelledRef.current) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = s;
        setStream(s);
        setStatus('on');

        s.getTracks().forEach((track) =>
          track.addEventListener('ended', () => {
            if (cancelledRef.current) return;
            setStatus('failed');
            setStream(null);
            streamRef.current = null;
          }),
        );

        return;
      } catch (err) {
        const isNotAllowed = (err as DOMException)?.name === 'NotAllowedError';
        if (cancelledRef.current) return;
        if (isNotAllowed) {
          setStatus('denied');
          return;
        }
        if (attempt < maxRetries) {
          await delay(1000 * (attempt + 1));
          if (cancelledRef.current) return;
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
