import { NextRequest, NextResponse } from 'next/server';
import { querySystemEvents } from '@/server/observability/events';
import { EventQueryFilterSchema } from '@/domain/observability.schema';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const filterObj: Record<string, any> = {};
    if (searchParams.get('homeId')) filterObj.homeId = searchParams.get('homeId');
    if (searchParams.get('category')) filterObj.category = searchParams.get('category');
    if (searchParams.get('severity')) filterObj.severity = searchParams.get('severity');
    if (searchParams.get('entityType')) filterObj.entityType = searchParams.get('entityType');
    if (searchParams.get('entityId')) filterObj.entityId = searchParams.get('entityId');
    if (searchParams.get('correlationId')) filterObj.correlationId = searchParams.get('correlationId');
    if (searchParams.get('search')) filterObj.search = searchParams.get('search');
    if (searchParams.get('limit')) filterObj.limit = searchParams.get('limit');
    if (searchParams.get('offset')) filterObj.offset = searchParams.get('offset');
    if (searchParams.get('startDate')) filterObj.startDate = searchParams.get('startDate');
    if (searchParams.get('endDate')) filterObj.endDate = searchParams.get('endDate');

    const parsedFilter = EventQueryFilterSchema.parse(filterObj);
    const result = await querySystemEvents(parsedFilter);

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to query event timeline' },
      { status: 400 }
    );
  }
}
