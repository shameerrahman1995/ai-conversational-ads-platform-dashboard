import { z } from 'zod';

/**
 * Central environment schema. Fail fast at boot if configuration is invalid.
 * Secrets are read server-side only and must never reach the browser
 * (blueprint §12 / §17: never expose provider tokens to browsers).
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // API
  API_PORT: z.coerce.number().int().positive().default(4000),
  API_BASE_URL: z.string().url().default('http://localhost:4000'),

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
  MODEL_GATEWAY_DEFAULT_MODEL: z.string().default('claude-sonnet-5'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parse and validate an environment object (defaults to process.env).
 * Throws a readable error listing every invalid/missing variable.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
