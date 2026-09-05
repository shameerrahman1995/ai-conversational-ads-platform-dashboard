import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { defineConfig, type Plugin } from 'vitest/config';

/**
 * NestJS relies on `emitDecoratorMetadata` (the `design:paramtypes` reflection
 * data) for type-based dependency injection. Vitest's default esbuild transform
 * does NOT emit decorator metadata, which breaks DI when booting the real
 * AppModule (e.g. via Test.createTestingModule). We don't have an SWC plugin
 * installed, so we transpile the API's own `src/**.ts` with the TypeScript
 * compiler — which does emit that metadata — via this small pre-transform. Unit
 * specs (which construct providers directly) are unaffected; only the source
 * under `src/` is rerouted through tsc.
 */
const API_SRC = fileURLToPath(new URL('./src/', import.meta.url));

function nestDecoratorMetadata(): Plugin {
  return {
    name: 'nest-decorator-metadata',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0];
      if (!file.startsWith(API_SRC) || !file.endsWith('.ts')) return null;
      const out = ts.transpileModule(code, {
        fileName: file,
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
          moduleResolution: ts.ModuleResolutionKind.Bundler,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          esModuleInterop: true,
          importHelpers: false,
          sourceMap: true,
          inlineSources: true,
        },
      });
      return { code: out.outputText, map: out.sourceMapText ?? null };
    },
  };
}

export default defineConfig({
  plugins: [nestDecoratorMetadata()],
  test: {
    include: ['test/**/*.spec.ts'],
    environment: 'node',
    // Seed dummy connection strings the env schema (@acp/config) requires.
    // Several Nest modules call loadEnv() at module-evaluation time (e.g.
    // AuthModule's JwtModule.register), which runs the moment AppModule is
    // imported — before any beforeAll — so they must be set at config level.
    // Nothing is actually dialed: Prisma, Redis and S3 all connect lazily.
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/convoads_test',
      REDIS_URL: 'redis://localhost:6379',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/main.ts',
        'src/**/*.module.ts',
        'src/**/dto.ts',
        'src/**/*.dto.ts',
        'src/**/index.ts',
      ],
      thresholds: {
        statements: 30,
        branches: 30,
        functions: 30,
        lines: 30,
      },
    },
  },
});
