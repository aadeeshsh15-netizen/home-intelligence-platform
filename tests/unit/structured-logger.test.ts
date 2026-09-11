import { describe, it, expect } from 'vitest';
import { redactSensitive, logger } from '../../src/lib/logger';

describe('Phase 9: Structured Logger & Credential Redaction Unit Tests', () => {
  it('redacts sensitive keys in flat and nested objects', () => {
    const rawContext = {
      module: 'auth',
      homeId: 'home-123',
      password: 'super-secret-user-pass',
      token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz',
      nested: {
        apiKey: 'sk-998877665544332211',
        sensorId: 'sensor-temp-1',
        subSecret: 'do-not-leak-this',
      },
    };

    const sanitized = redactSensitive(rawContext);

    expect(sanitized.module).toBe('auth');
    expect(sanitized.homeId).toBe('home-123');
    expect(sanitized.password).toBe('[REDACTED]');
    expect(sanitized.token).toBe('[REDACTED]');
    expect(sanitized.nested.apiKey).toBe('[REDACTED]');
    expect(sanitized.nested.subSecret).toBe('[REDACTED]');
    expect(sanitized.nested.sensorId).toBe('sensor-temp-1');
  });

  it('redacts raw bearer token strings inside text metadata', () => {
    const rawMessage = 'Client provided header: Bearer abc123def456ghi789';
    const sanitized = redactSensitive(rawMessage);

    expect(sanitized).toBe('Client provided header: Bearer [REDACTED]');
  });

  it('formats structured log output with timestamp, level, component, and message', () => {
    const formatted = logger.formatLog('INFO', 'Telemetry packet received', {
      component: 'mqtt-gateway',
      sensorId: 'sens-co2-01',
      token: 'leaked-token',
    });

    expect(formatted).toContain('INFO');
    expect(formatted).toContain('mqtt-gateway');
    expect(formatted).toContain('Telemetry packet received');
    expect(formatted).toContain('[REDACTED]');
    expect(formatted).not.toContain('leaked-token');
  });
});
