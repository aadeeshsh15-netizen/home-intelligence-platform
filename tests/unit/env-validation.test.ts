import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { envSchema, validateEnv } from '../../src/lib/env';

describe('Phase 9: Environment Configuration & Validation Unit Tests', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('validates a complete, healthy production environment configuration', () => {
    const validConfig = {
      NODE_ENV: 'production',
      PORT: 3000,
      DATABASE_URL: 'postgresql://postgres:secretpassword@localhost:5432/home_intelligence?schema=public',
      APP_SECRET: 'super-secure-production-key-at-least-32-chars-long',
      JWT_SECRET: 'super-secure-production-jwt-at-least-32-chars-long',
      MQTT_BROKER_URL: 'mqtt://localhost:1883',
      LOG_LEVEL: 'INFO',
      SIMULATOR_ENABLED: 'true',
      SIMULATOR_INTERVAL_MS: '5000',
      TELEMETRY_STALE_THRESHOLD_SECONDS: '120',
      RATE_LIMIT_ENABLED: 'true',
    };

    const result = envSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.NODE_ENV).toBe('production');
      expect(result.data.PORT).toBe(3000);
      expect(result.data.SIMULATOR_ENABLED).toBe(true);
      expect(result.data.RATE_LIMIT_ENABLED).toBe(true);
    }
  });

  it('rejects an invalid DATABASE_URL format', () => {
    const invalidConfig = {
      DATABASE_URL: 'not-a-valid-url',
      APP_SECRET: 'super-secure-production-key-at-least-32-chars-long',
    };

    const result = envSchema.safeParse(invalidConfig);
    expect(result.success).toBe(false);
    if (!result.success) {
      const dbError = result.error.issues.find((i) => i.path.includes('DATABASE_URL'));
      expect(dbError).toBeDefined();
    }
  });

  it('enforces minimum 32 character length on APP_SECRET for cryptographic security', () => {
    const shortSecretConfig = {
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
      APP_SECRET: 'too-short',
    };

    const result = envSchema.safeParse(shortSecretConfig);
    expect(result.success).toBe(false);
    if (!result.success) {
      const secretError = result.error.issues.find((i) => i.path.includes('APP_SECRET'));
      expect(secretError).toBeDefined();
      expect(secretError?.message).toContain('32 characters');
    }
  });

  it('fails fast in strict mode when required production secrets are absent', () => {
    delete process.env.APP_SECRET;
    delete process.env.DATABASE_URL;

    expect(() => {
      validateEnv({ strict: true });
    }).toThrow(/Environment validation failed/);
  });

  it('provides safe fallback defaults in non-strict development mode', () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
    delete process.env.APP_SECRET;

    const result = validateEnv({ strict: false });
    expect(result.success).toBe(true);
    expect(result.data?.APP_SECRET).toBeDefined();
    expect(result.data?.APP_SECRET.length).toBeGreaterThanOrEqual(32);
  });
});
