import { NextRequest, NextResponse } from 'next/server';
import { enforceHomeAccess } from '@/lib/auth';
import { PredictiveIncidentEngine } from '@/server/intelligence/predictive-incidents/engine';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const auth = await enforceHomeAccess(req);
    if (!auth.authorized || !auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status || 401 });
    }

    const metrics = await PredictiveIncidentEngine.getPerformanceMetrics(auth.user.homeId);

    return NextResponse.json({ metrics });
  } catch (error: any) {
    logger.error('API /predictive-incidents/metrics GET failure', { module: 'api/predictive-incidents/metrics' }, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
