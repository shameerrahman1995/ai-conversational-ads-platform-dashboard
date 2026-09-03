/**
 * Minimal structured logger with hard redaction of sensitive fields.
 *
 * Blueprint §18: "Never place raw access tokens, message content, phone numbers,
 * emails, or uploaded source text in application logs." This logger redacts known
 * sensitive keys before serialization; replace with pino/OTEL in P1.O1 without
 * changing call sites.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const SENSITIVE_KEY_PATTERN =
  /(token|secret|password|authorization|api[_-]?key|access[_-]?key|phone|email|transcript|message|source[_-]?text)/i;

const REDACTED = '[REDACTED]';

export function redact(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value as object)) return '[Circular]';
  seen.add(value as object);

  if (Array.isArray(value)) return value.map((v) => redact(v, seen));

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : redact(val, seen);
  }
  return out;
}

export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export function createLogger(
  opts: { name?: string; level?: LogLevel; bindings?: Record<string, unknown> } = {},
): Logger {
  const level = opts.level ?? 'info';
  const bindings = opts.bindings ?? {};

  const emit = (lvl: LogLevel, msg: string, meta?: Record<string, unknown>) => {
    if (LEVEL_ORDER[lvl] < LEVEL_ORDER[level]) return;
    const line = {
      ts: new Date().toISOString(),
      level: lvl,
      name: opts.name,
      msg,
      ...(redact(bindings) as Record<string, unknown>),
      ...(meta ? (redact(meta) as Record<string, unknown>) : {}),
    };
    const sink = lvl === 'error' || lvl === 'warn' ? console.error : console.log;
    sink(JSON.stringify(line));
  };

  return {
    debug: (m, meta) => emit('debug', m, meta),
    info: (m, meta) => emit('info', m, meta),
    warn: (m, meta) => emit('warn', m, meta),
    error: (m, meta) => emit('error', m, meta),
    child: (childBindings) =>
      createLogger({ ...opts, bindings: { ...bindings, ...childBindings } }),
  };
}
