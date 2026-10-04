import { useCallback, useEffect, useState } from "react";

export type ThemeChoice = "light" | "dark" | "system";
const STORAGE_KEY = "algo-trade-theme";

function readChoice(): ThemeChoice {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

function systemPrefersDark(): boolean {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

export function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
}

/** Apply the stored theme before React renders to avoid a light/dark flash. */
export function initTheme() {
  applyTheme(readChoice());
}

export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(() => readChoice());
  const [systemDark, setSystemDark] = useState(() => systemPrefersDark());

  useEffect(() => {
    const query = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!query) return;
    const onChange = () => setSystemDark(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const resolved: "light" | "dark" = choice === "system" ? (systemDark ? "dark" : "light") : choice;

  const toggle = useCallback(() => {
    const next: ThemeChoice = resolved === "dark" ? "light" : "dark";
    setChoice(next);
    applyTheme(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Preference just won't persist.
    }
  }, [resolved]);

  return { choice, resolved, toggle };
}

/** Re-render charts when the effective theme changes (attribute toggle or OS change). */
export function useThemeVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((value) => value + 1);
    const observer = new MutationObserver(bump);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const query = window.matchMedia?.("(prefers-color-scheme: dark)");
    query?.addEventListener("change", bump);
    return () => {
      observer.disconnect();
      query?.removeEventListener("change", bump);
    };
  }, []);
  return version;
}

export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
