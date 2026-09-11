import { NextRequest, NextResponse } from 'next/server';
import { enforceHomeAccess } from '@/lib/auth';
import { PredictionTargetEnum } from '@/domain/prediction.schema';
import { predictionEngine } from '@/server/intelligence/prediction/engine';
import { logger } from '@/lib/logger';
import { PredictionTarget } from '@/domain/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const auth = await enforceHomeAccess(req);
    if (!auth.authorized || !auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status || 401 });
    }

    const { searchParams } = new URL(req.url);
    const targetParam = searchParams.get('target');

    let target: PredictionTarget | undefined;
    if (targetParam) {
      const parsed = PredictionTargetEnum.safeParse(targetParam);
      if (parsed.success) {
        target = parsed.data;
      }
    }

    const models = await predictionEngine.listModels(target);

    return NextResponse.json({
      models,
      count: models.length,
    });
  } catch (error: any) {
    logger.error('Failed to list prediction models', { error: error.message });
    return NextResponse.json(
      { error: 'Internal error listing models', details: error.message },
      { status: 500 }
    );
  }
}
