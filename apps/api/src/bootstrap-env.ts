import { loadDotEnvFile } from '@acp/config';

/**
 * Side-effect module: load `apps/api/.env` into `process.env` at import time.
 * Imported FIRST in main.ts (right after reflect-metadata) so it runs before any
 * module that reads configuration — several modules (e.g. auth.module) call
 * `loadEnv()` at import time, which would otherwise see an unloaded environment.
 * Real injected env always wins, so this is a no-op in production.
 */
loadDotEnvFile();
