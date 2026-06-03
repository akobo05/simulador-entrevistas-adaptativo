import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { SessionProvider, useSession, type SessionData } from './SessionContext';

const sample: SessionData = {
  sessionId: 's1',
  token: 'a'.repeat(64),
  websocketUrl: 'ws://x/v1/sessions/s1/ws?token=a',
  industry: 'backend',
  level: 'mid',
};

function Probe() {
  const { session, setSession, clearSession } = useSession();
  return (
    <div>
      <span data-testid="sid">{session?.sessionId ?? 'none'}</span>
      <button onClick={() => setSession(sample)}>set</button>
      <button onClick={() => clearSession()}>clear</button>
    </div>
  );
}

describe('SessionContext', () => {
  beforeEach(() => sessionStorage.clear());

  it('arranca sin sesion y permite setear y limpiar', () => {
    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
    expect(screen.getByTestId('sid').textContent).toBe('none');
    act(() => screen.getByText('set').click());
    expect(screen.getByTestId('sid').textContent).toBe('s1');
    act(() => screen.getByText('clear').click());
    expect(screen.getByTestId('sid').textContent).toBe('none');
  });

  it('persiste en sessionStorage y rehidrata', () => {
    sessionStorage.setItem('warachikuy:session', JSON.stringify(sample));
    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
    expect(screen.getByTestId('sid').textContent).toBe('s1');
  });
});
