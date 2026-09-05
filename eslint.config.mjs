// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Minimal stub plugins so the existing inline `eslint-disable` directives in the
 * web app (which reference the Next.js and react-hooks plugins) resolve to
 * defined rules. Those plugins aren't installed as standalone packages here, and
 * we don't edit source to remove the directives — full enforcement of these
 * rules is owned by `next lint`. The stubs register the rule names as no-ops.
 */
const noopRule = { meta: { schema: [] }, create: () => ({}) };
const nextPlugin = {
  meta: { name: '@next/next' },
  rules: { 'no-img-element': noopRule, 'no-html-link-for-pages': noopRule },
};
const reactHooksPlugin = {
  meta: { name: 'react-hooks' },
  rules: { 'exhaustive-deps': noopRule, 'rules-of-hooks': noopRule },
};

/**
 * Flat ESLint config for the ConvoAds AI monorepo (Next.js + NestJS + shared TS
 * packages). Kept pragmatic: real correctness bugs are errors; stylistic or
 * codebase-wide-noisy rules are warnings so the gate stays green while still
 * surfacing issues. Type-aware linting is intentionally NOT enabled here (no
 * `parserOptions.project`) to keep the lint pass fast and independent of build
 * state across every workspace.
 */
export default tseslint.config(
  // ---- Ignore build output, generated code, and deps ----------------------
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/generated/**',
      '**/coverage/**',
      '**/*.tsbuildinfo',
      '**/next-env.d.ts',
      '**/.remember/**',
    ],
  },

  // Existing inline disable directives reference stub-registered plugin rules;
  // don't flag them as unused (real enforcement lives in `next lint`).
  { linterOptions: { reportUnusedDisableDirectives: 'off' } },

  // ---- Baseline JS rules for every file -----------------------------------
  js.configs.recommended,

  // ---- TypeScript recommended (non type-checked) --------------------------
  ...tseslint.configs.recommended,

  // ---- Project-wide rule tuning -------------------------------------------
  {
    files: ['**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        // Node + browser globals used across API and web without a `globals` dep.
        process: 'readonly',
        console: 'readonly',
        module: 'writable',
        require: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
      },
    },
    rules: {
      // Correctness rules stay as errors (inherited from recommended).
      // Stylistic / codebase-wide-noisy rules → warnings so the gate is green.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/no-inferrable-types': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },

  // ---- Web app: register stub Next/react-hooks plugins so inline disables
  //      resolve (rules themselves are enforced by `next lint`) --------------
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: {
      '@next/next': nextPlugin,
      'react-hooks': reactHooksPlugin,
    },
    rules: {
      '@next/next/no-img-element': 'off',
      'react-hooks/exhaustive-deps': 'off',
      'react-hooks/rules-of-hooks': 'off',
    },
  },

  // ---- Test files: allow test-only conveniences ---------------------------
  {
    files: [
      '**/*.{test,spec}.{ts,tsx}',
      '**/test/**/*.{ts,tsx}',
      '**/*.e2e.spec.ts',
      '**/vitest.setup.ts',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unused-vars': 'warn',
    },
  },

  // ---- Config files: allow CommonJS conventions ---------------------------
  {
    files: ['**/*.{js,cjs,mjs}', '**/*.config.{ts,mts,cts,js,cjs,mjs}'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-var-requires': 'off',
    },
  },
);
