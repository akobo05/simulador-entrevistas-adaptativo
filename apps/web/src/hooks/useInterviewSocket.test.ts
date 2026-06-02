import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useInterviewSocket } from './useInterviewSocket';

class MockWebSocket {
  static OPEN = 1;
  static instances: MockWebSocket[] = [];
  url: string;
  readyState = 0;
  sent: string[] = [];
  private listeners: Record<string, ((e: unknown) => void)[]> = {};
  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }
  addEventListener(type: string, cb: (e: unknown) => void): void {
    (this.listeners[type] ??= []).push(cb);
  }
  removeEventListener(): void {}
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.readyState = 3;
    this.emit('close', { code: 1000, reason: '' });
  }
  emit(type: string, e: unknown): void {
    (this.listeners[type] ?? []).forEach((cb) => cb(e));
  }
  open(): void {
    this.readyState = 1;
    this.emit('open', {});
  }
  message(obj: unknown): void {
    this.emit('message', { data: JSON.stringify(obj) });
  }
}

describe('useInterviewSocket', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket);
  });
  afterEach(() => vi.unstubAllGlobals());

  function last(): MockWebSocket {
    return MockWebSocket.instances[MockWebSocket.instances.length - 1]!;
  }

  it('discrimina interviewer.message, session.state y error', () => {
    const { result } = renderHook(() => useInterviewSocket('ws://x', 's1'));
    act(() => last().open());
    expect(result.current.status).toBe('open');

    act(() =>
      last().message({
        type: 'interviewer.message',
        payload: { sessionId: 's1', text: 'Hola', intent: 'question', timestamp: 1 },
      }),
    );
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]).toMatchObject({ role: 'interviewer', text: 'Hola' });

    act(() =>
      last().message({
        type: 'session.state',
        payload: { sessionId: 's1', phase: 'interviewing', turnNumber: 2 },
      }),
    );
    expect(result.current.phase).toBe('interviewing');
    expect(result.current.turnNumber).toBe(2);

    act(() =>
      last().message({
        type: 'error',
        payload: { code: 'llm_unavailable', message: 'x', recoverable: true },
      }),
    );
    expect(result.current.lastError?.code).toBe('llm_unavailable');
  });

  it('setea closing al recibir intent closing', () => {
    const { result } = renderHook(() => useInterviewSocket('ws://x', 's1'));
    act(() => last().open());
    act(() =>
      last().message({
        type: 'interviewer.message',
        payload: { sessionId: 's1', text: 'Gracias, terminamos.', intent: 'closing', timestamp: 9 },
      }),
    );
    expect(result.current.closing).toBe(true);
  });

  it('sendAnswer envia candidate.transcript y hace append optimista', () => {
    const { result } = renderHook(() => useInterviewSocket('ws://x', 's1'));
    act(() => last().open());
    act(() => result.current.sendAnswer('mi respuesta'));
    expect(result.current.items.at(-1)).toMatchObject({ role: 'candidate', text: 'mi respuesta' });
    const sent = JSON.parse(last().sent.at(-1)!);
    expect(sent).toMatchObject({
      type: 'candidate.transcript',
      payload: { sessionId: 's1', text: 'mi respuesta', isFinal: true },
    });
  });

  it('cierra el socket al desmontar y no deja conexiones abiertas', () => {
    const { unmount } = renderHook(() => useInterviewSocket('ws://x', 's1'));
    act(() => last().open());
    const socket = last();
    unmount();
    expect(socket.readyState).toBe(3); // CLOSED
  });

  it('ignora mensajes que no validan el schema', () => {
    const { result } = renderHook(() => useInterviewSocket('ws://x', 's1'));
    act(() => last().open());
    act(() => last().message({ type: 'basura', payload: {} }));
    expect(result.current.items).toHaveLength(0);
  });
});
