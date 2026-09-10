/**
 * Structured Application Logger
 * Provides consistent JSON or formatted logging with severity levels,
 * contextual metadata (correlationId, sensorId, roomId, etc.), and sensitive data redaction.
 */

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

const LOG_LEVEL_PRIORITIES: Record<LogLevel, number> = {
  DEBUG: 10,
  INFO: 20,
  WARN: 30,
  ERROR: 40,
};

const CURRENT_LOG_LEVEL: LogLevel =
  (process.env.LOG_LEVEL as LogLevel) ||
  (process.env.NODE_ENV === 'production' ? 'INFO' : 'DEBUG');

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'secret',
  'token',
  'authorization',
  'cookie',
  'apikey',
]);

function redactSensitive(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(redactSensitive);

  const cleaned: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      cleaned[key] = '[REDACTED]';
    } else if (val && typeof val === 'object') {
      cleaned[key] = redactSensitive(val);
    } else {
      cleaned[key] = val;
    }
  }
  return cleaned;
}

export interface LogContext {
  module?: string;
  source?: string;
  homeId?: string;
  roomId?: string;
  sensorId?: string;
  deviceId?: string;
  correlationId?: string;
  latencyMs?: number;
  [key: string]: any;
}

class StructuredLogger {
  private formatLog(level: LogLevel, message: string, context?: LogContext, error?: Error): string {
    const timestamp = new Date().toISOString();
    const payload: Record<string, any> = {
      timestamp,
      level,
      message,
      ...(context ? redactSensitive(context) : {}),
    };

    if (error) {
      payload.error = {
        name: error.name,
        message: error.message,
        stack: error.stack?.split('\n').slice(0, 4).join('\n'),
      };
    }

    if (process.env.NODE_ENV === 'production') {
      return JSON.stringify(payload);
    }

    // High readability terminal output for local development
    const mod = context?.module ? `[${context.module}] ` : '';
    const meta = context && Object.keys(context).length > 0 ? ` ${JSON.stringify(redactSensitive(context))}` : '';
    const err = error ? `\n  Error: ${error.message}` : '';
    return `[${timestamp.substring(11, 19)}] [${level}] ${mod}${message}${meta}${err}`;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITIES[level] >= LOG_LEVEL_PRIORITIES[CURRENT_LOG_LEVEL];
  }

  public debug(message: string, context?: LogContext): void {
    if (this.shouldLog('DEBUG')) {
      console.debug(this.formatLog('DEBUG', message, context));
    }
  }

  public info(message: string, context?: LogContext): void {
    if (this.shouldLog('INFO')) {
      console.info(this.formatLog('INFO', message, context));
    }
  }

  public warn(message: string, context?: LogContext, error?: Error): void {
    if (this.shouldLog('WARN')) {
      console.warn(this.formatLog('WARN', message, context, error));
    }
  }

  public error(message: string, context?: LogContext, error?: Error): void {
    if (this.shouldLog('ERROR')) {
      console.error(this.formatLog('ERROR', message, context, error));
    }
  }
}

export const logger = new StructuredLogger();
