import { describe, it, expect } from 'vitest';
import { apiSuccess, apiError } from '../../src/lib/api-response';

describe('Phase 9: API Response Normalization Unit Tests', () => {
  it('formats standardized success response', async () => {
    const payload = { status: 'HEALTHY', activeDevices: 4 };
    const response = apiSuccess(payload, 200);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/json');

    const body = await response.json();
    expect(body.status).toBe('HEALTHY');
    expect(body.activeDevices).toBe(4);
  });

  it('formats standardized error envelope with correlationId', async () => {
    const response = apiError(
      'UNAUTHORIZED_ACCESS',
      'Authentication token expired or missing',
      401,
      { correlationId: 'corr_test_9988' }
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('X-Correlation-ID')).toBe('corr_test_9988');

    const body = await response.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('UNAUTHORIZED_ACCESS');
    expect(body.error.message).toContain('Authentication token expired');
    expect(body.error.correlationId).toBe('corr_test_9988');
  });

  it('suppresses sensitive technical details in production mode', async () => {
    const originalEnv = process.env.NODE_ENV;
    (process.env as any).NODE_ENV = 'production';

    const response = apiError(
      'DATABASE_QUERY_ERROR',
      'Database connection failed',
      503,
      {
        correlationId: 'corr_test_prod',
        details: { rawQuery: 'SELECT * FROM users WHERE password = ...', stack: 'Error at...' },
      }
    );

    const body = await response.json();
    expect(body.error.details).toBeUndefined();

    (process.env as any).NODE_ENV = originalEnv;
  });
});
