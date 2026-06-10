import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { CandidateTranscript } from '@warachikuy/shared-types';
import { useVoiceTurn } from './useVoiceTurn';

// Captura el callback y las opciones que el hook le pasa al controlador real
const startMock = vi.fn();
const stopMock = vi.fn();
let capturedOnTranscript: (t: CandidateTranscript) => void = () => undefined;
let capturedOnError: ((code: string) => void) | undefined;

vi.mock('@warachikuy/voice-pipeline', () => ({
  createSttController: vi.fn(
    (
      _sessionId: string,
      onTranscript: (t: CandidateTranscript) => void,
      options?: { onError?: (code: string) => void },
    ) => {
      capturedOnTranscript = onTranscript;
      capturedOnError = options?.onError;
      return { start: startMock, stop: stopMock };
    },
  ),
}));

function transcript(text: string, isFinal: boolean): CandidateTranscript {
  return { sessionId: 's1', text, isFinal, timestamp: Date.now() };
}

describe('useVoiceTurn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('start arranca el STT y pasa a listening', () => {
    const { result } = renderHook(() => useVoiceTurn('s1', vi.fn(), vi.fn()));
    expect(result.current.micStatus).toBe('idle');
    act(() => result.current.start());
    expect(startMock).toHaveBeenCalledOnce();
    expect(result.current.micStatus).toBe('listening');
  });

  it('dispara onSpeechStart una vez por turno y onFinalTranscript con el final', () => {
    const onFinal = vi.fn();
    const onSpeechStart = vi.fn();
    const { result } = renderHook(() => useVoiceTurn('s1', onFinal, onSpeechStart));
    act(() => result.current.start());
    act(() => capturedOnTranscript(transcript('hola', false)));
    act(() => capturedOnTranscript(transcript('hola que', false)));
    expect(onSpeechStart).toHaveBeenCalledOnce(); // solo el primer parcial del turno
    expect(onFinal).not.toHaveBeenCalled();
    act(() => capturedOnTranscript(transcript('hola que tal', true)));
    expect(onFinal).toHaveBeenCalledWith(expect.objectContaining({ text: 'hola que tal' }));
    // Nuevo turno: el proximo parcial vuelve a disparar barge-in
    act(() => capturedOnTranscript(transcript('otra', false)));
    expect(onSpeechStart).toHaveBeenCalledTimes(2);
  });

  it('error terminal del STT -> denied', () => {
    const { result } = renderHook(() => useVoiceTurn('s1', vi.fn(), vi.fn()));
    act(() => result.current.start());
    act(() => capturedOnError?.('not-allowed'));
    expect(result.current.micStatus).toBe('denied');
  });

  it('start que lanza (sin Web Speech API) -> unsupported', () => {
    startMock.mockImplementationOnce(() => {
      throw new Error('Web Speech API no disponible en este navegador');
    });
    const { result } = renderHook(() => useVoiceTurn('s1', vi.fn(), vi.fn()));
    act(() => result.current.start());
    expect(result.current.micStatus).toBe('unsupported');
  });

  it('stop no borra los estados terminales (denied queda pegajoso)', () => {
    const { result } = renderHook(() => useVoiceTurn('s1', vi.fn(), vi.fn()));
    act(() => result.current.start());
    act(() => capturedOnError?.('not-allowed'));
    act(() => result.current.stop());
    expect(result.current.micStatus).toBe('denied');
  });

  it('un transcript tardio despues de stop se ignora', () => {
    const onFinal = vi.fn();
    const onSpeechStart = vi.fn();
    const { result } = renderHook(() => useVoiceTurn('s1', onFinal, onSpeechStart));
    act(() => result.current.start());
    act(() => result.current.stop());
    act(() => capturedOnTranscript(transcript('tardio', true)));
    expect(onSpeechStart).not.toHaveBeenCalled();
    expect(onFinal).not.toHaveBeenCalled();
  });

  it('start sin sessionId no arranca (la sesion aun no existe)', () => {
    const { result } = renderHook(() => useVoiceTurn('', vi.fn(), vi.fn()));
    act(() => result.current.start());
    expect(startMock).not.toHaveBeenCalled();
    expect(result.current.micStatus).toBe('idle');
  });

  it('stop detiene el STT y al desmontar tambien se detiene', () => {
    const { result, unmount } = renderHook(() => useVoiceTurn('s1', vi.fn(), vi.fn()));
    act(() => result.current.start());
    act(() => result.current.stop());
    expect(stopMock).toHaveBeenCalledOnce();
    expect(result.current.micStatus).toBe('idle');
    unmount();
    expect(stopMock).toHaveBeenCalledTimes(2);
  });
});
