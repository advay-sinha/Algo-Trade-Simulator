import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { logout as apiLogout, type AuthResponse } from "../api";
import type { User } from "../types";
import { isAuthError } from "./errors";

const STORAGE_KEY = "algo-trade-session";

interface StoredSession {
  token: string;
  user: User;
}

interface SessionContextValue {
  token: string | null;
  user: User | null;
  /** Set when the session ended unexpectedly (expired / revoked), shown on the sign-in screen. */
  notice: string | null;
  signIn: (response: AuthResponse) => void;
  signOut: () => void;
  /** Call from any catch block: returns true (and signs out locally) when the error was a 401. */
  handleAuthError: (error: unknown) => boolean;
  clearNotice: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

function readStoredSession(): StoredSession | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    return parsed.token && parsed.user ? parsed : null;
  } catch {
    return null;
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<StoredSession | null>(() => readStoredSession());
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    try {
      if (session) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Storage can be unavailable (private mode); the session still works for this tab.
    }
  }, [session]);

  const signIn = useCallback((response: AuthResponse) => {
    setNotice(null);
    setSession({ token: response.token, user: response.user });
  }, []);

  // Revoke server-side, then clear local state. Local sign-out happens even if the request fails.
  const signOut = useCallback(() => {
    const token = session?.token;
    setSession(null);
    if (token) {
      apiLogout(token).catch(() => undefined);
    }
  }, [session]);

  const handleAuthError = useCallback((error: unknown) => {
    if (!isAuthError(error)) return false;
    setSession(null);
    setNotice("Your session ended. Sign in again to continue.");
    return true;
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      token: session?.token ?? null,
      user: session?.user ?? null,
      notice,
      signIn,
      signOut,
      handleAuthError,
      clearNotice: () => setNotice(null),
    }),
    [session, notice, signIn, signOut, handleAuthError],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession must be used inside SessionProvider");
  return context;
}

/** For pages behind the auth gate: token and user are guaranteed non-null there. */
export function useAuthed() {
  const context = useSession();
  if (!context.token || !context.user) throw new Error("useAuthed used outside the authenticated area");
  return { ...context, token: context.token, user: context.user };
}
