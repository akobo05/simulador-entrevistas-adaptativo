import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Industry, Level } from '@warachikuy/shared-types';

export interface SessionData {
  sessionId: string;
  token: string;
  websocketUrl: string;
  industry: Industry;
  level: Level;
}

const STORAGE_KEY = 'warachikuy:session';

interface SessionContextValue {
  session: SessionData | null;
  setSession: (s: SessionData) => void;
  clearSession: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

function hydrate(): SessionData | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionData;
  } catch {
    return null;
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<SessionData | null>(hydrate);

  const setSession = useCallback((s: SessionData) => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    setSessionState(s);
  }, []);

  const clearSession = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setSessionState(null);
  }, []);

  const value = useMemo(
    () => ({ session, setSession, clearSession }),
    [session, setSession, clearSession],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession debe usarse dentro de SessionProvider');
  return ctx;
}
