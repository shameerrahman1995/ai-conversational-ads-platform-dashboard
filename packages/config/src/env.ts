import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

/**
 * Load a local `.env` file into `process.env` for dev/local runs (dependency-free).
 * Real injected environment variables always win — a key already present in
 * `process.env` is never overwritten — so this is a no-op harm-free call in
 * production, where secrets are injected directly and no `.env` file exists.
 * Must run before {@link loadEnv} so validation sees the loaded values.
 *
 * @returns the number of keys applied (0 if the file is absent).
 */
export function loadDotEnvFile(file = resolve(process.cwd(), '.env')): number {
  if (!existsSync(file)) return 0;
  let applied = 0;
  for (const rawLine of readFileSync(file, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (process.env[key] !== undefined) continue; // real env wins
    let val = line.slice(eq + 1).trim();
    // Strip a trailing inline comment only on unquoted values.
    if (!/^["']/.test(val)) val = val.replace(/\s+#.*$/, '').trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
    applied += 1;
  }
  return applied;
}

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
  CORS_ORIGINS: z.string().default('http://localhost:4001'),
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

  // Google Ads API (live connector). All optional so dev/test defaults to the
  // stub; the live adapter activates only when PROVIDERS_MODE=live AND the OAuth
  // client + developer token + refresh token below are all present. Never sent to
  // the browser (blueprint §12/§17).
  GOOGLE_ADS_CLIENT_ID: z.string().optional(),
  GOOGLE_ADS_CLIENT_SECRET: z.string().optional(),
  GOOGLE_ADS_DEVELOPER_TOKEN: z.string().optional(),
  GOOGLE_ADS_REFRESH_TOKEN: z.string().optional(),
  // Manager (MCC) account that owns access — sent as the login-customer-id header.
  GOOGLE_ADS_LOGIN_CUSTOMER_ID: z.string().optional(),
  // Default operating customer id (the account campaigns are created under) when a
  // publish plan does not carry its own accountId.
  GOOGLE_ADS_CUSTOMER_ID: z.string().optional(),
  // Pinned Google Ads REST API version.
  GOOGLE_ADS_API_VERSION: z.string().default('v25'),
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
