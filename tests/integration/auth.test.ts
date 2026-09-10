import { describe, it, expect } from 'vitest';
import { generateSessionToken, verifySessionToken } from '../../src/lib/auth';

describe('Authentication & Tenancy Security', () => {
  const dummyUser = {
    id: 'user_test_123',
    email: 'tenant_a@homeintel.internal',
    role: 'OWNER',
  };
  const dummyHomeId = 'home_test_abc';

  it('generates a valid signed HMAC-SHA256 session token', () => {
    const token = generateSessionToken(dummyUser, dummyHomeId, 24);
    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(2);

    const verified = verifySessionToken(token);
    expect(verified).not.toBeNull();
    expect(verified?.userId).toBe(dummyUser.id);
    expect(verified?.email).toBe(dummyUser.email);
    expect(verified?.homeId).toBe(dummyHomeId);
  });

  it('rejects tampered or forged session tokens', () => {
    const token = generateSessionToken(dummyUser, dummyHomeId, 24);
    const [payload, sig] = token.split('.');

    // Tamper with payload
    const decodedPayload = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    decodedPayload.role = 'SUPER_ADMIN'; // Privilege escalation attempt
    const tamperedPayload = Buffer.from(JSON.stringify(decodedPayload)).toString('base64url');
    const forgedToken = `${tamperedPayload}.${sig}`;

    const verified = verifySessionToken(forgedToken);
    expect(verified).toBeNull();
  });

  it('rejects expired session tokens', () => {
    // Generate token that expired 1 hour ago (-1 hours)
    const expiredToken = generateSessionToken(dummyUser, dummyHomeId, -1);
    const verified = verifySessionToken(expiredToken);
    expect(verified).toBeNull();
  });

  it('rejects completely invalid token strings', () => {
    expect(verifySessionToken('')).toBeNull();
    expect(verifySessionToken('random-invalid-token')).toBeNull();
    expect(verifySessionToken('part1.part2.part3')).toBeNull();
  });
});
