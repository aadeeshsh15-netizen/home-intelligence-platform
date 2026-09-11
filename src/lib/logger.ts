/**
 * Structured Application Logger
 * Provides consistent JSON or formatted logging with severity levels,
 * contextual metadata (correlationId, entityId, component, eventType, etc.),
 * and automatic sensitive data redaction.
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

export const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'secret',
  'token',
  'authtoken',
  'authorization',
  'cookie',
  'apikey',
  'bearer',
  'auth',
  'privatekey',
  'devicekey',
  'credential',
  'passphrase',
  'jwt',
]);

/**
 * Deeply sanitizes an object or string, redacting sensitive credentials and keys.
 */
export function redactSensitive(obj: any): any {
  if (!obj) return obj;
  if (typeof obj === 'string') {
    // Redact bearer tokens or authorization patterns in raw strings
    if (/bearer\s+[a-zA-Z0-9_\-\.]+/i.test(obj)) {
      return obj.replace(/bearer\s+[a-zA-Z0-9_\-\.]+/gi, 'Bearer [REDACTED]');
    }
    return obj;
  }
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(redactSensitive);

  const cleaned: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lowerKey) || lowerKey.includes('secret') || lowerKey.includes('password')) {
      cleaned[key] = '[REDACTED]';
    } else if (val && typeof val === 'object') {
      cleaned[key] = redactSensitive(val);
    } else {
      cleaned[key] = typeof val === 'string' ? redactSensitive(val) : val;
    }
  }
  return cleaned;
}

export interface LogContext {
  module?: string;
  component?: string;
  source?: string;
  homeId?: string;
  roomId?: string;
  sensorId?: string;
  deviceId?: string;
  entityId?: string;
  eventType?: string;
  correlationId?: string;
  latencyMs?: number;
  [key: string]: any;
}

export class StructuredLogger {
  public formatLog(level: LogLevel, message: string, context?: LogContext, error?: Error): string {
    const timestamp = new Date().toISOString();
    const component = context?.component || context?.module || 'system';

    const payload: Record<string, any> = {
      timestamp,
      level,
      component,
      message,
      ...(context ? redactSensitive(context) : {}),
    };

    if (error) {
      payload.error = {
        name: error.name,
        message: error.message,
        stack: process.env.NODE_ENV === 'production' ? undefined : error.stack?.split('\n').slice(0, 4).join('\n'),
      };
    }

    if (process.env.NODE_ENV === 'production') {
      return JSON.stringify(payload);
    }

    // High readability terminal output for local development
    const mod = component ? `[${component}] ` : '';
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
