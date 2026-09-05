import { z } from 'zod';

/**
 * Central environment schema. Fail fast at boot if configuration is invalid.
 * Secrets are read server-side only and must never reach the browser
 * (blueprint §12 / §17: never expose provider tokens to browsers).
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // API
  API_PORT: z.coerce.number().int().positive().default(4000),
  API_BASE_URL: z.string().url().default('http://localhost:4000'),
  // Comma-separated allowlist of browser origins for CORS ('*' only in dev).
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  // Expose Swagger /docs (default off; enable explicitly in non-prod).
  ENABLE_DOCS: z
    .string()
    .optional()
    .transform((v) => v === 'true' || v === '1'),

  // Auth
  JWT_SECRET: z.string().min(16).default('dev-insecure-jwt-secret-change-me'),
  // Field-level PII encryption key (>=32 chars); required in production.
  FIELD_ENCRYPTION_KEY: z.string().optional(),

  // Data plane
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  // Object storage (S3-compatible)
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_BUCKET: z.string().default('acp-assets'),

  // AI model gateway (provider-neutral)
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_BASE_URL: z.string().url().optional(),
  MODEL_GATEWAY_DEFAULT_MODEL: z.string().default('claude-sonnet-5'),

  // Provider selection: 'stub' (default) or 'live' — 'live' requires real creds.
  PROVIDERS_MODE: z.enum(['stub', 'live']).default('stub'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parse and validate an environment object (defaults to process.env).
 * Throws a readable error listing every invalid/missing variable. In production
 * a set of otherwise-optional secrets become required (fail fast, not at runtime).
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const env = parsed.data;
  if (env.NODE_ENV === 'production') {
    const required: Array<[keyof Env, unknown]> = [
      ['JWT_SECRET', env.JWT_SECRET !== 'dev-insecure-jwt-secret-change-me' && env.JWT_SECRET],
      ['FIELD_ENCRYPTION_KEY', env.FIELD_ENCRYPTION_KEY && env.FIELD_ENCRYPTION_KEY.length >= 32],
      ['S3_ENDPOINT', env.S3_ENDPOINT],
      ['S3_ACCESS_KEY_ID', env.S3_ACCESS_KEY_ID],
      ['S3_SECRET_ACCESS_KEY', env.S3_SECRET_ACCESS_KEY],
    ];
    const missing = required.filter(([, ok]) => !ok).map(([k]) => k);
    if (missing.length) {
      throw new Error(
        `Production requires these to be set to real values: ${missing.join(', ')}`,
      );
    }
  }
  return env;
}
