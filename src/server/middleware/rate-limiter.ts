import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/api-response';

export type RateLimitPolicy = 'AUTH' | 'PROVISION' | 'COMMANDS' | 'DEMO' | 'TELEMETRY' | 'DEFAULT';

interface PolicyConfig {
  maxRequests: number;
  windowMs: number;
}

export const RATE_LIMIT_POLICIES: Record<RateLimitPolicy, PolicyConfig> = {
  AUTH: { maxRequests: 10, windowMs: 60_000 },       // 10 requests / min
  PROVISION: { maxRequests: 20, windowMs: 60_000 },  // 20 requests / min
  COMMANDS: { maxRequests: 30, windowMs: 60_000 },   // 30 requests / min
  DEMO: { maxRequests: 30, windowMs: 60_000 },       // 30 requests / min
  TELEMETRY: { maxRequests: 1200, windowMs: 60_000 },// 1,200 readings / min (20/s)
  DEFAULT: { maxRequests: 120, windowMs: 60_000 },   // 120 requests / min
};

interface WindowEntry {
  timestamps: number[];
}

class InMemoryRateLimiter {
  private store: Map<string, WindowEntry> = new Map();
  private lastCleanup: number = Date.now();
  private readonly cleanupIntervalMs: number = 60_000;

  public check(
    key: string,
    policyName: RateLimitPolicy = 'DEFAULT'
  ): {
    allowed: boolean;
    limit: number;
    remaining: number;
    resetTime: number;
    retryAfterSeconds: number;
  } {
    const now = Date.now();
    this.maybeCleanup(now);

    const policy = RATE_LIMIT_POLICIES[policyName] || RATE_LIMIT_POLICIES.DEFAULT;
    const windowStart = now - policy.windowMs;

    const entry = this.store.get(key) || { timestamps: [] };
    // Filter timestamps outside current window
    const validTimestamps = entry.timestamps.filter((ts) => ts > windowStart);

    if (validTimestamps.length >= policy.maxRequests) {
      const oldest = validTimestamps[0];
      const resetTime = oldest + policy.windowMs;
      const retryAfterSeconds = Math.max(1, Math.ceil((resetTime - now) / 1000));

      return {
        allowed: false,
        limit: policy.maxRequests,
        remaining: 0,
        resetTime,
        retryAfterSeconds,
      };
    }

    validTimestamps.push(now);
    this.store.set(key, { timestamps: validTimestamps });

    return {
      allowed: true,
      limit: policy.maxRequests,
      remaining: policy.maxRequests - validTimestamps.length,
      resetTime: now + policy.windowMs,
      retryAfterSeconds: 0,
    };
  }

  public reset(key?: string) {
    if (key) {
      this.store.delete(key);
    } else {
      this.store.clear();
    }
  }

  private maybeCleanup(now: number) {
    if (now - this.lastCleanup < this.cleanupIntervalMs) return;

    this.lastCleanup = now;
    const oldestAllowed = now - 120_000; // purge entries inactive for > 2 min

    for (const [key, entry] of this.store.entries()) {
      const active = entry.timestamps.filter((ts) => ts > oldestAllowed);
      if (active.length === 0) {
        this.store.delete(key);
      } else {
        this.store.set(key, { timestamps: active });
      }
    }
  }
}

export const rateLimiter = new InMemoryRateLimiter();

/**
 * Extracts a client identifier from NextRequest for rate-limiting purposes.
 */
export function getClientIdentifier(req: NextRequest): string {
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }
  const realIp = req.headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }
  return '127.0.0.1';
}

/**
 * Middleware helper to apply deterministic rate limiting to an API route.
 * Returns null if allowed, or a 429 NextResponse if limit is exceeded.
 */
export function enforceRateLimit(
  req: NextRequest,
  policyName: RateLimitPolicy,
  customIdentifier?: string
): NextResponse | null {
  if (process.env.RATE_LIMIT_ENABLED === 'false' || process.env.RATE_LIMIT_ENABLED === '0') {
    return null;
  }

  const clientId = customIdentifier || getClientIdentifier(req);
  const key = `${policyName}:${clientId}`;
  const result = rateLimiter.check(key, policyName);

  if (!result.allowed) {
    return apiError(
      'RATE_LIMIT_EXCEEDED',
      `Rate limit exceeded for ${policyName}. Please retry in ${result.retryAfterSeconds} seconds.`,
      429,
      {
        details: {
          limit: result.limit,
          remaining: result.remaining,
          retryAfter: result.retryAfterSeconds,
        },
        headers: {
          'Retry-After': String(result.retryAfterSeconds),
          'X-RateLimit-Limit': String(result.limit),
          'X-RateLimit-Remaining': String(result.remaining),
          'X-RateLimit-Reset': String(result.resetTime),
        },
      }
    );
  }

  return null;
}
