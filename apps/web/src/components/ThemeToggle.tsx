'use client';

import { useTheme } from '@/lib/theme';

/**
 * Icon button that toggles between light and dark themes.
 *
 * Shows a moon in light mode (tap to go dark) and a sun in dark mode (tap to go
 * light). Styled to match the existing 34px icon buttons (e.g. `.rail-toggle`)
 * via a small scoped <style> using design tokens — no classes are added to
 * globals.css.
 */
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === 'dark';

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-label="Toggle theme"
        title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
        className="theme-toggle"
      >
        {isDark ? <SunIcon /> : <MoonIcon />}
      </button>
      <style>{`
        .theme-toggle {
          display: grid;
          place-items: center;
          width: 34px;
          height: 34px;
          padding: 0;
          border: 1px solid var(--color-line);
          border-radius: var(--radius-control);
          background: var(--color-surface);
          color: var(--color-ink-2);
          cursor: pointer;
          flex: none;
          transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
        }
        .theme-toggle:hover {
          background: var(--color-surface-2);
          border-color: var(--color-line-2);
          color: var(--color-ink);
        }
        .theme-toggle:focus-visible {
          outline: 2px solid var(--color-brand);
          outline-offset: 2px;
        }
        .theme-toggle svg {
          display: block;
        }
      `}</style>
    </>
  );
}

function MoonIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}
