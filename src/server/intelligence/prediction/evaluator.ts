import { prisma } from '@/lib/db';
import {
  PredictionTarget,
  ModelType,
  EvaluationReport,
  HorizonEvaluationMetric,
} from '@/domain/types';
import { predictionEngine } from './engine';
import { mapTargetToSensorType } from './features';
import { logger } from '@/lib/logger';

interface EvaluationSample {
  horizonMinutes: number;
  actual: number;
  predicted: number;
  absError: number;
  sqError: number;
  pctError?: number;
}

/**
 * Rolling-Origin Walk-Forward Backtesting Evaluator.
 *
 * Implements rigorous out-of-sample backtesting without lookahead bias.
 * Progressively slides origin timestamps across the evaluation window,
 * generating multi-horizon forecasts using historical data up to origin t_k,
 * and compares against ground-truth readings at t_k + horizon.
 */
export async function evaluateModel(params: {
  homeId: string;
  target: PredictionTarget;
  modelType?: ModelType;
  roomId?: string | null;
  days?: number;
}): Promise<EvaluationReport> {
  const days = params.days || 7;
  const now = new Date();
  const evaluationWindow = `${days}d`;

  await predictionEngine.ensureModelsSeeded();

  // Find corresponding sensor to query ground truth
  const sensorType = mapTargetToSensorType(params.target);
  const sensorWhere: any = {
    type: sensorType,
    room: {
      floor: {
        homeId: params.homeId,
      },
    },
  };

  if (params.roomId) {
    sensorWhere.roomId = params.roomId;
  }

  const sensor = await prisma.sensor.findFirst({
    where: sensorWhere,
    select: { id: true, roomId: true },
  });

  if (!sensor) {
    throw new Error(`Sensor not found for target ${params.target}`);
  }

  const provider = predictionEngine.resolveProvider(params.target, params.modelType);

  // Target horizons to evaluate
  const targetHorizons = [15, 60, 240, 1440];
  const horizonSamples: Map<number, EvaluationSample[]> = new Map();
  for (const h of targetHorizons) {
    horizonSamples.set(h, []);
  }

  // Pre-fetch all sensor readings for ground truth lookup during the evaluation period
  const windowStart = new Date(now.getTime() - days * 24 * 3600 * 1000);
  const readings = await prisma.telemetryReading.findMany({
    where: {
      sensorId: sensor.id,
      timestamp: {
        gte: windowStart,
        lte: now,
      },
      quality: 'VALID',
    },
    select: {
      timestamp: true,
      value: true,
    },
    orderBy: { timestamp: 'asc' },
  });

  // Helper to find actual ground-truth reading close to a target timestamp
  const findActual = (targetMs: number): number | null => {
    const toleranceMs = 5 * 60 * 1000; // 5 minute window
    for (const r of readings) {
      const diff = Math.abs(r.timestamp.getTime() - targetMs);
      if (diff <= toleranceMs) {
        return r.value;
      }
    }
    return null;
  };

  // Determine origin points (every 6 hours from windowStart to now - 24 hours)
  const maxOriginMs = now.getTime() - 24 * 3600 * 1000;
  const stepMs = 6 * 3600 * 1000; // 6 hours between rolling origins
  let originMs = windowStart.getTime() + 48 * 3600 * 1000; // Ensure 48h history before first origin

  const latencies: number[] = [];

  while (originMs <= maxOriginMs) {
    const originTime = new Date(originMs);

    const startPerf = performance.now();
    try {
      const forecastResponse = await predictionEngine.getForecast({
        homeId: params.homeId,
        target: params.target,
        roomId: params.roomId,
        modelType: provider.type,
        horizon: '24h',
        stepMinutes: 15,
        referenceTime: originTime,
      });

      const elapsed = performance.now() - startPerf;
      latencies.push(elapsed);

      for (const hMin of targetHorizons) {
        const point = forecastResponse.forecast.find((p) => p.horizonMinutes === hMin);
        if (!point) continue;

        const actualVal = findActual(originMs + hMin * 60 * 1000);
        if (actualVal !== null) {
          const absErr = Math.abs(actualVal - point.predicted);
          const sqErr = Math.pow(actualVal - point.predicted, 2);
          const pctErr = actualVal !== 0 ? (absErr / Math.abs(actualVal)) * 100 : undefined;

          horizonSamples.get(hMin)?.push({
            horizonMinutes: hMin,
            actual: actualVal,
            predicted: point.predicted,
            absError: absErr,
            sqError: sqErr,
            pctError: pctErr,
          });
        }
      }
    } catch (err: any) {
      logger.warn('Rolling origin backtest step skipped', {
        originTime: originTime.toISOString(),
        error: err.message,
      });
    }

    originMs += stepMs;
  }

  // Aggregate metrics per horizon
  let totalAbsError = 0;
  let totalSqError = 0;
  let totalCount = 0;
  let totalPctError = 0;
  let pctCount = 0;

  const horizonMetrics: HorizonEvaluationMetric[] = [];

  for (const hMin of targetHorizons) {
    const samples = horizonSamples.get(hMin) || [];
    let label = `${hMin}m`;
    if (hMin === 60) label = '1h';
    else if (hMin === 240) label = '4h';
    else if (hMin === 1440) label = '24h';

    if (samples.length === 0) {
      horizonMetrics.push({
        horizonMinutes: hMin,
        horizonLabel: label,
        mae: 0,
        rmse: 0,
        sampleCount: 0,
      });
      continue;
    }

    const hMae = samples.reduce((s, x) => s + x.absError, 0) / samples.length;
    const hRmse = Math.sqrt(samples.reduce((s, x) => s + x.sqError, 0) / samples.length);
    const validPct = samples.filter((x) => x.pctError !== undefined);
    const hMape =
      validPct.length > 0
        ? validPct.reduce((s, x) => s + x.pctError!, 0) / validPct.length
        : undefined;

    horizonMetrics.push({
      horizonMinutes: hMin,
      horizonLabel: label,
      mae: Number(hMae.toFixed(3)),
      rmse: Number(hRmse.toFixed(3)),
      mape: hMape !== undefined ? Number(hMape.toFixed(2)) : undefined,
      sampleCount: samples.length,
    });

    for (const s of samples) {
      totalAbsError += s.absError;
      totalSqError += s.sqError;
      totalCount++;
      if (s.pctError !== undefined) {
        totalPctError += s.pctError;
        pctCount++;
      }
    }
  }

  const overallMae = totalCount > 0 ? Number((totalAbsError / totalCount).toFixed(3)) : 0;
  const overallRmse = totalCount > 0 ? Number(Math.sqrt(totalSqError / totalCount).toFixed(3)) : 0;
  const overallMape = pctCount > 0 ? Number((totalPctError / pctCount).toFixed(2)) : undefined;
  const avgLatency =
    latencies.length > 0
      ? Number((latencies.reduce((s, l) => s + l, 0) / latencies.length).toFixed(2))
      : 5.0;

  // Find or create PredictionModel in DB to link the evaluation
  const modelRecord = await prisma.predictionModel.findFirst({
    where: {
      target: params.target,
      type: provider.type,
    },
  });

  if (modelRecord) {
    const horizonMetricsObj: Record<string, any> = {};
    for (const hm of horizonMetrics) {
      horizonMetricsObj[hm.horizonLabel] = {
        mae: hm.mae,
        rmse: hm.rmse,
        mape: hm.mape,
        sampleCount: hm.sampleCount,
      };
    }

    await prisma.modelEvaluation.create({
      data: {
        modelId: modelRecord.id,
        homeId: params.homeId,
        target: params.target,
        evaluationWindow,
        sampleCount: totalCount,
        mae: overallMae,
        rmse: overallRmse,
        horizonMetrics: horizonMetricsObj,
        inferenceLatencyMs: avgLatency,
      },
    });
  }

  return {
    modelId: modelRecord?.id || provider.id,
    modelName: provider.name,
    modelType: provider.type,
    target: params.target,
    overallMae,
    overallRmse,
    overallMape,
    inferenceLatencyMs: avgLatency,
    evaluatedAt: new Date().toISOString(),
    horizonMetrics,
  };
}
