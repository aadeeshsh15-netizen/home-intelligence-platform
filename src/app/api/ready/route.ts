import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * GET /api/ready
 * Kubernetes / Container Readiness Probe.
 * Returns 200 ONLY when mandatory runtime dependencies (PostgreSQL) are operational.
 * Returns 503 if dependencies are unreachable, removing the container from load-balancer pools.
 */
export async function GET() {
  const t0 = performance.now();

  try {
    // Ping primary PostgreSQL database
    await prisma.$queryRaw`SELECT 1`;
    const latencyMs = Number((performance.now() - t0).toFixed(2));

    return NextResponse.json(
      {
        status: 'READY',
        dependencies: {
          database: {
            status: 'UP',
            latencyMs,
          },
        },
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (err: any) {
    const latencyMs = Number((performance.now() - t0).toFixed(2));
    logger.error('Readiness check failed: database unreachable', {
      error: err.message || String(err),
      latencyMs,
      module: 'readiness',
    });

    return NextResponse.json(
      {
        status: 'NOT_READY',
        dependencies: {
          database: {
            status: 'DOWN',
            latencyMs,
            error: process.env.NODE_ENV === 'production' ? 'Database unreachable' : err.message,
          },
        },
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
