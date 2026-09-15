import { resolve } from 'node:path';
import { loadDotEnvFile } from '@acp/config';

/**
 * Side-effect module: load `apps/api/.env` into `process.env` at import time.
 * Imported FIRST in main.ts (right after reflect-metadata) so it runs before any
 * module that reads configuration — several modules (e.g. auth.module) call
 * `loadEnv()` at import time, which would otherwise see an unloaded environment.
 * Real injected env always wins, so this is a no-op in production.
 *
 * Load `apps/api/.env` by an absolute path derived from this file's location
 * (__dirname is apps/api/dist at runtime → ../.env is apps/api/.env). The bare
 * `loadDotEnvFile()` default is CWD-relative, and run-local.sh starts the API from
 * the repo root — so a plain './.env' silently missed the real file, leaving the
 * process in stub mode even with PROVIDERS_MODE=live configured. Also try the CWD
 * default as a fallback for setups that start from apps/api. Double-load is safe
 * (already-set keys are never overwritten).
 */
loadDotEnvFile(resolve(__dirname, '..', '.env'));
loadDotEnvFile();
