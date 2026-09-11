import { NextResponse } from 'next/server';
import { SystemHealthService } from '@/server/observability/health';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const report = await SystemHealthService.evaluateHealth();
    const httpStatus = report.status === 'CRITICAL' ? 503 : report.status === 'DEGRADED' ? 200 : 200;

    return NextResponse.json(report, { status: httpStatus });
  } catch (error: any) {
    return NextResponse.json(
      {
        status: 'CRITICAL',
        timestamp: new Date().toISOString(),
        error: error.message || 'System health evaluation failed',
      },
      { status: 500 }
    );
  }
}
