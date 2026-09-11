'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

/**
 * Dark/light theme system.
 *
 * The active theme is expressed as `document.documentElement.dataset.theme`
 * (`data-theme="light" | "dark"`), which `globals.css` reads. The user's
 * explicit choice is persisted in localStorage under `acp-theme`; when unset we
 * follow the OS via `matchMedia('(prefers-color-scheme: dark)')`.
 *
 * This module ONLY sets/persists the attribute — it never defines colors.
 *
 * Hydration safety: we never read localStorage during render. The first client
 * render uses a deterministic default (`'light'`, matching the server) and the
 * real theme is applied in a mount effect, so children can render immediately.
 */

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'acp-theme';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** OS preference, guarded for SSR and older engines. */
function prefersDark(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    );
  } catch {
    return false;
  }
}

/** The user's explicit stored choice, or `null` when following the OS. */
function readStoredTheme(): Theme | null {
  try {
    if (typeof window === 'undefined') return null;
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

/** Effective theme: the explicit choice if any, else the OS preference. */
function resolveTheme(): Theme {
  return readStoredTheme() ?? (prefersDark() ? 'dark' : 'light');
}

/** What is currently reflected on `<html>`, falling back to the resolved theme. */
function readAppliedTheme(): Theme {
  try {
    if (typeof document !== 'undefined') {
      const v = document.documentElement.dataset.theme;
      if (v === 'light' || v === 'dark') return v;
    }
  } catch {
    /* no document — fall through */
  }
  return resolveTheme();
}

function applyTheme(theme: Theme): void {
  try {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.theme = theme;
  } catch {
    /* no document (SSR) — ignore */
  }
}

function persistTheme(theme: Theme): void {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* localStorage unavailable (private mode, disabled, etc.) — ignore */
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Deterministic default so the server and first client render agree; the real
  // theme is adopted on mount (below) to avoid an SSR/client hydration mismatch.
  const [theme, setThemeState] = useState<Theme>('light');

  // On mount: adopt the stored (or OS) theme and reflect it on <html>.
  useEffect(() => {
    const initial = resolveTheme();
    setThemeState(initial);
    applyTheme(initial);
  }, []);

  // While the user hasn't made an explicit choice, follow live OS changes.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (readStoredTheme() !== null) return; // explicit choice wins over the OS
      const next: Theme = mql.matches ? 'dark' : 'light';
      setThemeState(next);
      applyTheme(next);
    };
    // `addEventListener` is the modern API; fall back for older Safari.
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    }
    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    persistTheme(next);
    applyTheme(next);
  }, []);

  const toggle = useCallback(() => {
    // Flip based on what's actually on the DOM, so it stays correct even if
    // React state briefly lags an out-of-band change.
    setTheme(readAppliedTheme() === 'dark' ? 'light' : 'dark');
  }, [setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

/**
 * Read/control the theme. Usable inside a `<ThemeProvider>` (preferred) or, as a
 * fallback, standalone — in which case it reads/writes the DOM directly.
 * SSR-safe: every `window`/`document` access is guarded.
 */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);

  // Fallback state, used only when rendered outside a provider. Declared
  // unconditionally so hook order stays stable across renders.
  const [fallbackTheme, setFallbackTheme] = useState<Theme>('light');
  useEffect(() => {
    if (ctx) return;
    setFallbackTheme(readAppliedTheme());
  }, [ctx]);

  if (ctx) return ctx;

  const setTheme = (next: Theme) => {
    setFallbackTheme(next);
    persistTheme(next);
    applyTheme(next);
  };
  const toggle = () => setTheme(readAppliedTheme() === 'dark' ? 'light' : 'dark');

  return { theme: fallbackTheme, setTheme, toggle };
}
