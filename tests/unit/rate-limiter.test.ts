import { describe, it, expect, beforeEach } from 'vitest';
import { rateLimiter, RATE_LIMIT_POLICIES } from '../../src/server/middleware/rate-limiter';

describe('Phase 9: In-Memory Rate Limiter Unit Tests', () => {
  beforeEach(() => {
    rateLimiter.reset();
  });

  it('allows requests within policy limits', () => {
    const key = 'test-client-1';
    const policy = 'AUTH'; // limit: 10 requests

    for (let i = 0; i < 5; i++) {
      const result = rateLimiter.check(key, policy);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(RATE_LIMIT_POLICIES.AUTH.maxRequests - (i + 1));
    }
  });

  it('blocks requests once threshold is exceeded and returns retry duration', () => {
    const key = 'test-client-exceeded';
    const policy = 'AUTH';
    const maxReqs = RATE_LIMIT_POLICIES.AUTH.maxRequests;

    // Exhaust all permitted requests
    for (let i = 0; i < maxReqs; i++) {
      const result = rateLimiter.check(key, policy);
      expect(result.allowed).toBe(true);
    }

    // Exceed limit
    const blockedResult = rateLimiter.check(key, policy);
    expect(blockedResult.allowed).toBe(false);
    expect(blockedResult.remaining).toBe(0);
    expect(blockedResult.retryAfterSeconds).toBeGreaterThan(0);
    expect(blockedResult.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it('maintains independent quotas across distinct clients', () => {
    const clientA = 'client-a';
    const clientB = 'client-b';

    // Exhaust client A
    for (let i = 0; i < RATE_LIMIT_POLICIES.AUTH.maxRequests; i++) {
      rateLimiter.check(clientA, 'AUTH');
    }

    expect(rateLimiter.check(clientA, 'AUTH').allowed).toBe(false);
    // Client B must still have full quota
    const clientBResult = rateLimiter.check(clientB, 'AUTH');
    expect(clientBResult.allowed).toBe(true);
    expect(clientBResult.remaining).toBe(RATE_LIMIT_POLICIES.AUTH.maxRequests - 1);
  });

  it('resets client quota when reset is explicitly called', () => {
    const key = 'test-client-reset';
    for (let i = 0; i < RATE_LIMIT_POLICIES.AUTH.maxRequests; i++) {
      rateLimiter.check(key, 'AUTH');
    }
    expect(rateLimiter.check(key, 'AUTH').allowed).toBe(false);

    rateLimiter.reset(key);
    expect(rateLimiter.check(key, 'AUTH').allowed).toBe(true);
  });
});
