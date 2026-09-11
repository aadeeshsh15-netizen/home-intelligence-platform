import { z } from 'zod';

/**
 * Server-Side Environment Variable Validation Schema
 * Enforces production readiness, security boundaries, and sensible defaults.
 */
export const envSchema = z.object({
  // Runtime Environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1024).max(65535).default(3000),

  // Database Connection (PostgreSQL)
  DATABASE_URL: z
    .string({
      required_error: 'DATABASE_URL is required to connect to the PostgreSQL database',
    })
    .url('DATABASE_URL must be a valid connection URL (e.g., postgresql://user:pass@host:5432/db)'),

  // Cryptographic Secrets (minimum 32 characters for security)
  APP_SECRET: z
    .string({
      required_error: 'APP_SECRET is required for cryptographic HMAC token signing',
    })
    .min(32, 'APP_SECRET must be at least 32 characters long for cryptographic security'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters long').optional(),

  // MQTT Broker Configuration
  MQTT_BROKER_URL: z.string().default('mqtt://localhost:1883'),
  MQTT_USERNAME: z.string().optional(),
  MQTT_PASSWORD: z.string().optional(),
  MQTT_BROKER_HOST: z.string().default('127.0.0.1'),
  MQTT_BROKER_PORT: z.coerce.number().int().default(1883),

  // Logging & Observability
  LOG_LEVEL: z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR']).optional(),

  // Thermodynamic Simulator Configuration
  SIMULATOR_ENABLED: z
    .enum(['true', 'false', '1', '0'])
    .transform((val) => val === 'true' || val === '1')
    .or(z.boolean())
    .default(true),
  SIMULATOR_INTERVAL_MS: z.coerce.number().int().min(500).max(60000).default(5000),

  // Telemetry Ingestion Guardrails
  TELEMETRY_STALE_THRESHOLD_SECONDS: z.coerce.number().int().min(10).max(86400).default(120),

  // Optional External Machine Learning Microservice
  PREDICTION_ML_SERVICE_URL: z.string().url().optional(),

  // Rate Limiting & Abuse Controls
  RATE_LIMIT_ENABLED: z
    .enum(['true', 'false', '1', '0'])
    .transform((val) => val === 'true' || val === '1')
    .or(z.boolean())
    .default(true),
});

export type EnvConfig = z.infer<typeof envSchema>;

let cachedEnv: EnvConfig | null = null;

/**
 * Validates the current runtime environment variables.
 * In production, fails fast with descriptive error messages.
 */
export function validateEnv(options: { strict?: boolean } = {}): {
  success: boolean;
  data?: EnvConfig;
  errors?: string[];
} {
  // Guard against client-side leakage
  if (typeof window !== 'undefined') {
    throw new Error('FATAL: Attempted to load server-only environment configuration on client!');
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const shouldEnforceStrict = options.strict ?? isProduction;

  // In non-strict development/test mode, provide safe defaults for cryptographic secrets if absent
  const rawEnv = {
    ...process.env,
    APP_SECRET:
      process.env.APP_SECRET ||
      (!shouldEnforceStrict
        ? 'dev-fallback-secret-key-for-home-intelligence-platform-32chars'
        : undefined),
  };

  const result = envSchema.safeParse(rawEnv);

  if (!result.success) {
    const formattedErrors = result.error.issues.map(
      (issue) => `[CONFIG ERROR] ${issue.path.join('.')}: ${issue.message}`
    );

    if (shouldEnforceStrict) {
      const errorBanner = [
        '================================================================================',
        'CRITICAL CONFIGURATION ERROR: Environment validation failed!',
        'The Home Intelligence Platform cannot start safely with invalid environment configuration.',
        '--------------------------------------------------------------------------------',
        ...formattedErrors,
        '================================================================================',
      ].join('\n');
      console.error(errorBanner);
      throw new Error(`Environment validation failed:\n${formattedErrors.join('\n')}`);
    }

    return { success: false, errors: formattedErrors };
  }

  cachedEnv = result.data;
  return { success: true, data: result.data };
}

/**
 * Retrieves the validated environment configuration.
 * Caches the result on initial invocation.
 */
export function getEnv(): EnvConfig {
  if (!cachedEnv) {
    const { success, data, errors } = validateEnv();
    if (!success || !data) {
      throw new Error(`Failed to initialize environment: ${errors?.join(', ')}`);
    }
    cachedEnv = data;
  }
  return cachedEnv;
}
