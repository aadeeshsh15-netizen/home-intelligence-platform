import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/live
 * Kubernetes / Container Liveness Probe.
 * Returns 200 immediately if the Node.js event loop and process are alive.
 */
export async function GET() {
  return NextResponse.json(
    {
      status: 'ALIVE',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    },
    { status: 200 }
  );
}
