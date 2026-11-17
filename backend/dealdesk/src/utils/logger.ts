/**
 * Lightweight structured logger with component prefixes.
 *
 * The plan calls for "structured-ish console logs with component prefix"
 * (e.g. `[worker]`, `[webhook]`, `[gateway]`). This module centralises that
 * convention so every component logs consistently and the minimum level can be
 * controlled via `LOG_LEVEL` (debug | info | warn | error, default info).
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function resolveMinLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') {
    return raw;
  }
  return 'info';
}

export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  child(component: string): Logger;
}

function format(component: string, message: string): string {
  return `[${component}] ${message}`;
}

export function createLogger(component: string): Logger {
  const minPriority = LEVEL_PRIORITY[resolveMinLevel()];

  const log = (
    level: LogLevel,
    message: string,
    ...args: unknown[]
  ): void => {
    if (LEVEL_PRIORITY[level] < minPriority) {
      return;
    }

    const fn =
      level === 'debug'
        ? console.debug
        : level === 'info'
          ? console.log
          : level === 'warn'
            ? console.warn
            : console.error;

    fn(format(component, message), ...args);
  };

  return {
    debug: (message, ...args) => log('debug', message, ...args),
    info: (message, ...args) => log('info', message, ...args),
    warn: (message, ...args) => log('warn', message, ...args),
    error: (message, ...args) => log('error', message, ...args),
    child: (childComponent) =>
      createLogger(`${component}:${childComponent}`),
  };
}

export const logger = createLogger('dealdesk');
