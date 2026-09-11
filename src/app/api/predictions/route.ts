import { NextRequest, NextResponse } from 'next/server';
import { enforceHomeAccess } from '@/lib/auth';
import { QueryPredictionSchema } from '@/domain/prediction.schema';
import { predictionEngine } from '@/server/intelligence/prediction/engine';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const auth = await enforceHomeAccess(req);
    if (!auth.authorized || !auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status || 401 });
    }

    const { searchParams } = new URL(req.url);
    const parseResult = QueryPredictionSchema.safeParse({
      target: searchParams.get('target'),
      roomId: searchParams.get('roomId') || undefined,
      modelType: searchParams.get('modelType') || undefined,
      horizon: searchParams.get('horizon') || '24h',
      stepMinutes: searchParams.get('stepMinutes') || 15,
    });

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: parseResult.error.format(),
        },
        { status: 400 }
      );
    }

    const { target, roomId, modelType, horizon, stepMinutes } = parseResult.data;

    const forecast = await predictionEngine.getForecast({
      homeId: auth.user.homeId,
      target,
      roomId,
      modelType,
      horizon,
      stepMinutes,
    });

    return NextResponse.json(forecast);
  } catch (error: any) {
    logger.error('Prediction API execution failed', { error: error.message });

    if (error.message && error.message.includes('No sensor of type')) {
      return NextResponse.json(
        { error: error.message },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Internal error generating forecast', details: error.message },
      { status: 500 }
    );
  }
}
