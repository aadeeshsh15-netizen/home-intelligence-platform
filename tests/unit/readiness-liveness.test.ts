import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET as getLive } from '../../src/app/api/live/route';
import { GET as getReady } from '../../src/app/api/ready/route';
import { prisma } from '../../src/lib/db';

describe('Phase 9: Liveness & Readiness Probes Unit Tests', () => {
  it('/api/live returns 200 with process status ALIVE and uptime', async () => {
    const response = await getLive();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe('ALIVE');
    expect(typeof body.uptimeSeconds).toBe('number');
    expect(body.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(body.timestamp).toBeDefined();
  });

  it('/api/ready returns 200 when database connectivity is healthy', async () => {
    const response = await getReady();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe('READY');
    expect(body.dependencies?.database?.status).toBe('UP');
    expect(typeof body.dependencies?.database?.latencyMs).toBe('number');
  });

  it('/api/ready returns 503 when database connectivity fails', async () => {
    const originalQueryRaw = prisma.$queryRaw;
    // Mock database failure
    prisma.$queryRaw = vi.fn().mockRejectedValueOnce(new Error('Connection terminated by server'));

    try {
      const response = await getReady();
      expect(response.status).toBe(503);

      const body = await response.json();
      expect(body.status).toBe('NOT_READY');
      expect(body.dependencies?.database?.status).toBe('DOWN');
      expect(body.dependencies?.database?.error).toBeDefined();
    } finally {
      prisma.$queryRaw = originalQueryRaw;
    }
  });
});
