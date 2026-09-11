import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { enforceHomeAccess } from '@/lib/auth';
import { EvaluateModelSchema, PredictionTargetEnum } from '@/domain/prediction.schema';
import { evaluateModel } from '@/server/intelligence/prediction/evaluator';
import { logger } from '@/lib/logger';
import { PredictionTarget } from '@/domain/types';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const auth = await enforceHomeAccess(req);
    if (!auth.authorized || !auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status || 401 });
    }

    const body = await req.json();
    const parseResult = EvaluateModelSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: parseResult.error.format(),
        },
        { status: 400 }
      );
    }

    const { target, modelType, days, roomId } = parseResult.data;

    const report = await evaluateModel({
      homeId: auth.user.homeId,
      target,
      modelType,
      roomId,
      days,
    });

    return NextResponse.json(report);
  } catch (error: any) {
    logger.error('Model evaluation execution failed', { error: error.message });
    return NextResponse.json(
      { error: 'Failed to run model evaluation', details: error.message },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await enforceHomeAccess(req);
    if (!auth.authorized || !auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status || 401 });
    }

    const { searchParams } = new URL(req.url);
    const targetParam = searchParams.get('target');

    const where: any = {
      homeId: auth.user.homeId,
    };

    if (targetParam) {
      const parsed = PredictionTargetEnum.safeParse(targetParam);
      if (parsed.success) {
        where.target = parsed.data;
      }
    }

    const evaluations = await prisma.modelEvaluation.findMany({
      where,
      orderBy: { evaluatedAt: 'desc' },
      take: 20,
      include: {
        model: {
          select: {
            id: true,
            name: true,
            type: true,
            version: true,
          },
        },
      },
    });

    return NextResponse.json({
      evaluations,
      count: evaluations.length,
    });
  } catch (error: any) {
    logger.error('Failed to query model evaluations', { error: error.message });
    return NextResponse.json(
      { error: 'Failed to query model evaluations', details: error.message },
      { status: 500 }
    );
  }
}
