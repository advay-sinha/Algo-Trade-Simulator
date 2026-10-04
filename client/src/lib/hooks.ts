import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthed } from "./session";
import { describeError } from "./errors";

export interface AsyncState<T> {
  data: T | null;
  /** True only for the first load (no data yet) — show skeletons. */
  loading: boolean;
  /** True while reloading with data already on screen — keep the frame, dim it. */
  refreshing: boolean;
  error: string | null;
  reload: () => Promise<void>;
  setData: (updater: (previous: T | null) => T | null) => void;
}

/**
 * Load data with the session token. Handles 401 (signs out), friendly errors, stale-response
 * protection, and keeps the previous data visible during refreshes.
 */
export function useAuthedQuery<T>(
  loader: (token: string) => Promise<T>,
  deps: unknown[],
  options: { action?: string; enabled?: boolean } = {},
): AsyncState<T> {
  const { token, handleAuthError } = useAuthed();
  const { action = "load this data", enabled = true } = options;
  const [data, setDataState] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const hasData = useRef(false);

  const run = useCallback(async () => {
    const id = ++requestId.current;
    if (hasData.current) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const result = await loader(token);
      if (id !== requestId.current) return;
      hasData.current = true;
      setDataState(result);
    } catch (caught) {
      if (id !== requestId.current) return;
      if (handleAuthError(caught)) return;
      setError(describeError(caught, action));
    } finally {
      if (id === requestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [token, ...deps]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    void run();
  }, [run, enabled]);

  const setData = useCallback((updater: (previous: T | null) => T | null) => {
    setDataState((previous) => updater(previous));
  }, []);

  return { data, loading, refreshing, error, reload: run, setData };
}

/** Call `callback` every `intervalMs` while the tab is visible; resumes (and refreshes) on return. */
export function useVisiblePolling(callback: () => void, intervalMs: number, enabled = true) {
  const saved = useRef(callback);
  saved.current = callback;

  useEffect(() => {
    if (!enabled) return;
    let timer: number | undefined;
    const start = () => {
      stop();
      timer = window.setInterval(() => saved.current(), intervalMs);
    };
    const stop = () => {
      if (timer !== undefined) window.clearInterval(timer);
      timer = undefined;
    };
    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        saved.current();
        start();
      }
    };
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs, enabled]);
}

/** Focus a search input when "/" is pressed outside of text fields (List pattern convention). */
export function useSlashFocus(ref: React.RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      event.preventDefault();
      ref.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ref]);
}
