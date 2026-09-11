import { NextResponse } from 'next/server';
import { metricsService } from '@/server/observability/metrics';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const snapshot = metricsService.getSnapshot();
    return NextResponse.json(snapshot);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to retrieve metrics' },
      { status: 500 }
    );
  }
}
