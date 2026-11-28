const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;

export type LogLevel = keyof typeof LEVELS;

let minimumLevel: LogLevel = 'info';

const LOG_BUFFER_LIMIT = 1000;
const recentLines: string[] = [];

export function setLogLevel(level: LogLevel): void {
  minimumLevel = level;
}

/** Most recent emitted log lines, oldest first. Resets when the process restarts. */
export function getRecentLogs(limit = 200): string[] {
  const count = Math.max(1, Math.min(Math.floor(limit), LOG_BUFFER_LIMIT));
  return recentLines.slice(-count);
}

export function getLogBufferLimit(): number {
  return LOG_BUFFER_LIMIT;
}

function remember(line: string): void {
  recentLines.push(line);
  if (recentLines.length > LOG_BUFFER_LIMIT) recentLines.shift();
}

export interface Logger {
  debug(message: string, extra?: unknown): void;
  info(message: string, extra?: unknown): void;
  warn(message: string, extra?: unknown): void;
  error(message: string, extra?: unknown): void;
  child(scope: string): Logger;
}

function serialize(value: unknown): string {
  if (value instanceof Error) return value.stack ?? `${value.name}: ${value.message}`;
  if (typeof value === 'object' && value !== null) {
    try {
      return JSON.stringify(value, (_key, candidate: unknown) => {
        if (candidate instanceof Error) {
          return { name: candidate.name, message: candidate.message, stack: candidate.stack };
        }
        return candidate;
      });
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export function createLogger(scope = 'xbot'): Logger {
  const emit = (level: LogLevel, message: string, extra?: unknown): void => {
    if (LEVELS[level] < LEVELS[minimumLevel]) return;
    const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${scope}] ${message}`;
    const output = extra === undefined ? line : `${line} ${serialize(extra)}`;
    remember(output);
    if (level === 'error') process.stderr.write(`${output}\n`);
    else process.stdout.write(`${output}\n`);
  };

  return {
    debug: (message, extra) => emit('debug', message, extra),
    info: (message, extra) => emit('info', message, extra),
    warn: (message, extra) => emit('warn', message, extra),
    error: (message, extra) => emit('error', message, extra),
    child: (childScope) => createLogger(`${scope}:${childScope}`),
  };
}

export const logger = createLogger();
