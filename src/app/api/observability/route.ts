import { NextResponse } from 'next/server';
import { SystemHealthService } from '@/server/observability/health';
import { metricsService } from '@/server/observability/metrics';
import { querySystemEvents } from '@/server/observability/events';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [health, metrics, timeline] = await Promise.all([
      SystemHealthService.evaluateHealth(),
      Promise.resolve(metricsService.getSnapshot()),
      querySystemEvents({ limit: 20, offset: 0 }),
    ]);

    return NextResponse.json({
      health,
      metrics,
      recentEvents: timeline.events,
      totalEvents: timeline.totalCount,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to retrieve observability data' },
      { status: 500 }
    );
  }
}
