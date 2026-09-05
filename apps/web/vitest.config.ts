import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Vitest config for the web app: jsdom environment for React component tests
 * and the `@/` path alias mirrored from tsconfig so component imports resolve
 * the same way in tests.
 *
 * NOTE: JSX is transformed by Vitest's built-in esbuild (automatic runtime →
 * `react/jsx-runtime`) rather than `@vitejs/plugin-react`. The installed
 * plugin-react (6.x) requires a `vite/internal` entrypoint that the installed
 * Vite (7.3.6) does not expose, so loading the plugin crashes config parsing.
 * esbuild needs no React Fast Refresh for a headless test run, so this is the
 * correct, dependency-free transform here.
 */
export default defineConfig({
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    css: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html'],
      reportsDirectory: './coverage',
      // Only measure the presentational primitives we actually cover here; the
      // route/page tree is exercised by Playwright e2e, not unit coverage.
      // Thresholds are intentionally modest: these specs cover the Chip /
      // StatusChip / Icon primitives, not every exported component in ui.tsx,
      // so the function-coverage bar in particular is kept low. Raise these as
      // more component tests land.
      include: ['src/components/ui.tsx', 'src/components/Icon.tsx'],
      thresholds: {
        statements: 40,
        branches: 35,
        functions: 20,
        lines: 40,
      },
    },
  },
});
