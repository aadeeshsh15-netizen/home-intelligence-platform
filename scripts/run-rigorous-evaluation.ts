import { prisma } from '../src/lib/db';
import { predictionEngine } from '../src/server/intelligence/prediction/engine';
import { extractFeatures, loadBaselineMatrix, mapTargetToSensorType } from '../src/server/intelligence/prediction/features';
import { PredictionTarget, ModelType } from '@/domain/types';
import { IPredictionProvider } from '../src/server/intelligence/prediction/types';
import fs from 'fs';
import path from 'path';

interface HorizonMetrics {
  horizonMinutes: number;
  horizonLabel: string;
  mae: number;
  rmse: number;
  mape?: number;
  sampleCount: number;
  coverage80: number; // Percentage of points within 80% CI
  coverage95: number; // Percentage of points within 95% CI
}

interface ProviderEvaluationResult {
  target: PredictionTarget;
  providerType: ModelType;
  providerName: string;
  overallMae: number;
  overallRmse: number;
  overallMape?: number;
  avgLatencyMs: number;
  totalSamples: number;
  coverage80: number;
  coverage95: number;
  horizonMetrics: HorizonMetrics[];
}

async function runEvaluation() {
  console.log('========================================================================');
  console.log('   HOME INTELLIGENCE PLATFORM — PHASE 3 RIGOROUS PREDICTION REVIEW      ');
  console.log('========================================================================\n');

  const home = await prisma.home.findFirst();
  if (!home) throw new Error('No home found in DB');
  const homeId = home.id;

  await predictionEngine.ensureModelsSeeded();

  const targets: PredictionTarget[] = [
    'HOUSEHOLD_POWER',
    'ROOM_TEMPERATURE',
    'ROOM_CO2',
    'OCCUPANCY_PROBABILITY',
  ];

  const targetHorizons = [15, 60, 240, 1440];
  const horizonLabels: Record<number, string> = {
    15: '15m',
    60: '1h',
    240: '4h',
    1440: '24h',
  };

  const results: ProviderEvaluationResult[] = [];
  const coldStartFindings: any[] = [];

  for (const target of targets) {
    console.log(`\nEvaluating Target: ${target}`);
    console.log('----------------------------------------------------');

    const sensorType = mapTargetToSensorType(target);
    const sensor = await prisma.sensor.findFirst({
      where: {
        type: sensorType,
        room: { floor: { homeId } },
      },
      include: { room: true },
    });

    if (!sensor) {
      console.warn(`No sensor found for target ${target}, skipping.`);
      continue;
    }

    console.log(`Using Sensor ID: ${sensor.id} (${sensor.type} in ${sensor.room.name}, unit: ${sensor.unit})`);

    // Fetch all historical readings for this sensor
    const allReadings = await prisma.telemetryReading.findMany({
      where: { sensorId: sensor.id, quality: 'VALID' },
      orderBy: { timestamp: 'asc' },
      select: { timestamp: true, value: true },
    });

    if (allReadings.length < 100) {
      console.warn(`Insufficient readings (${allReadings.length}) for sensor ${sensor.id}`);
      continue;
    }

    const tStart = allReadings[0].timestamp.getTime();
    const tEnd = allReadings[allReadings.length - 1].timestamp.getTime();
    const totalHours = (tEnd - tStart) / (1000 * 3600);
    console.log(`Sensor dataset span: ${totalHours.toFixed(1)} hours (${allReadings.length} readings)`);

    // Missing data calculation
    const expectedReadings = Math.floor((tEnd - tStart) / (sensor.samplingIntervalSec * 1000));
    const missingRate = expectedReadings > 0
      ? Math.max(0, Number(((1 - allReadings.length / expectedReadings) * 100).toFixed(2)))
      : 0;
    console.log(`Sensor expected readings: ${expectedReadings}, actual: ${allReadings.length}, missing rate: ${missingRate}%`);

    // Ground-truth interpolation function
    const getGroundTruth = (targetMs: number): number | null => {
      // Find readings immediately preceding and succeeding targetMs
      let prev: { timestamp: Date; value: number } | null = null;
      let next: { timestamp: Date; value: number } | null = null;

      for (let i = 0; i < allReadings.length; i++) {
        const t = allReadings[i].timestamp.getTime();
        if (t <= targetMs) {
          prev = allReadings[i];
        }
        if (t >= targetMs) {
          next = allReadings[i];
          break;
        }
      }

      if (!prev || !next) return null;
      if (prev === next) return prev.value;

      const diffMs = next.timestamp.getTime() - prev.timestamp.getTime();
      if (diffMs > 60 * 60 * 1000) return null; // Too wide gap (>1h) to interpolate reliably

      // Linear interpolation between consecutive points
      const alpha = (targetMs - prev.timestamp.getTime()) / diffMs;
      return prev.value + alpha * (next.value - prev.value);
    };

    // Evaluate Cold Start Behavior (at 12h, 24h, 36h from start)
    const coldOrigins = [
      new Date(tStart + 12 * 3600 * 1000),
      new Date(tStart + 24 * 3600 * 1000),
      new Date(tStart + 36 * 3600 * 1000),
    ];
    for (const cOrigin of coldOrigins) {
      try {
        const { features } = await extractFeatures(homeId, target, sensor.roomId, cOrigin);
        coldStartFindings.push({
          target,
          originTime: cOrigin.toISOString(),
          historicalHours: features.dataQuality.historicalHours,
          status: features.dataQuality.status,
          samplesCount: features.dataQuality.validSamplesCount,
        });
      } catch (err: any) {
        coldStartFindings.push({
          target,
          originTime: cOrigin.toISOString(),
          error: err.message,
        });
      }
    }

    // Determine candidate providers to evaluate
    const candidateTypes: ModelType[] = [];
    if (target === 'OCCUPANCY_PROBABILITY') {
      candidateTypes.push('STATISTICAL_PERSISTENCE', 'BAYESIAN_OCCUPANCY');
    } else {
      candidateTypes.push('STATISTICAL_PERSISTENCE', 'STATISTICAL_EMA', 'STATISTICAL_SEASONAL_DECAY');
    }

    // Rolling origins setup:
    // Start at tStart + 48h (fully warm baseline), End at tEnd - 24h (so 24h horizon has ground truth)
    const minOriginMs = tStart + 48 * 3600 * 1000;
    const maxOriginMs = tEnd - 24 * 3600 * 1000;
    const stepMs = 4 * 3600 * 1000; // Slide origin every 4 hours across the 28 days

    for (const pType of candidateTypes) {
      const provider = predictionEngine.getProvider(pType);
      if (!provider || !provider.supports(target)) continue;

      console.log(`  Evaluating Provider: ${provider.name} (${pType})...`);

      const horizonSamples: Map<number, {
        actual: number;
        predicted: number;
        absErr: number;
        sqErr: number;
        pctErr?: number;
        in80: boolean;
        in95: boolean;
      }[]> = new Map();

      for (const h of targetHorizons) {
        horizonSamples.set(h, []);
      }

      const latencies: number[] = [];
      let currentOriginMs = minOriginMs;

      while (currentOriginMs <= maxOriginMs) {
        const originTime = new Date(currentOriginMs);

        try {
          const t0 = performance.now();
          const forecastResponse = await predictionEngine.getForecast({
            homeId,
            target,
            roomId: sensor.roomId,
            modelType: pType,
            horizon: '24h',
            stepMinutes: 15,
            referenceTime: originTime,
          });
          const latency = performance.now() - t0;
          latencies.push(latency);

          for (const hMin of targetHorizons) {
            const pt = forecastResponse.forecast.find((p) => p.horizonMinutes === hMin);
            if (!pt) continue;

            const actualVal = getGroundTruth(currentOriginMs + hMin * 60 * 1000);
            if (actualVal === null) continue;

            const absErr = Math.abs(actualVal - pt.predicted);
            const sqErr = Math.pow(actualVal - pt.predicted, 2);

            // MAPE is only mathematically meaningful for continuous strictly positive targets
            // For power, avoid division by zero when idle (clamp threshold > 5W)
            let pctErr: number | undefined = undefined;
            if (target === 'HOUSEHOLD_POWER' && Math.abs(actualVal) >= 10) {
              pctErr = (absErr / Math.abs(actualVal)) * 100;
            } else if (target === 'ROOM_TEMPERATURE' || target === 'ROOM_CO2') {
              pctErr = (absErr / Math.abs(actualVal)) * 100;
            }

            const in80 = actualVal >= pt.confidenceInterval80.lower && actualVal <= pt.confidenceInterval80.upper;
            const in95 = actualVal >= pt.confidenceInterval95.lower && actualVal <= pt.confidenceInterval95.upper;

            horizonSamples.get(hMin)?.push({
              actual: actualVal,
              predicted: pt.predicted,
              absErr,
              sqErr,
              pctErr,
              in80,
              in95,
            });
          }
        } catch (err: any) {
          // Skip point if error
        }

        currentOriginMs += stepMs;
      }

      // Aggregate metrics per horizon
      let totalAbsErr = 0;
      let totalSqErr = 0;
      let totalCount = 0;
      let totalPctErr = 0;
      let pctCount = 0;
      let totalIn80 = 0;
      let totalIn95 = 0;

      const horizonMetricsList: HorizonMetrics[] = [];

      for (const hMin of targetHorizons) {
        const samples = horizonSamples.get(hMin) || [];
        const label = horizonLabels[hMin];

        if (samples.length === 0) continue;

        const hMae = samples.reduce((s, x) => s + x.absErr, 0) / samples.length;
        const hRmse = Math.sqrt(samples.reduce((s, x) => s + x.sqErr, 0) / samples.length);
        const validPct = samples.filter((x) => x.pctErr !== undefined);
        const hMape = validPct.length > 0
          ? validPct.reduce((s, x) => s + x.pctErr!, 0) / validPct.length
          : undefined;

        const cov80 = (samples.filter((x) => x.in80).length / samples.length) * 100;
        const cov95 = (samples.filter((x) => x.in95).length / samples.length) * 100;

        horizonMetricsList.push({
          horizonMinutes: hMin,
          horizonLabel: label,
          mae: Number(hMae.toFixed(3)),
          rmse: Number(hRmse.toFixed(3)),
          mape: hMape !== undefined ? Number(hMape.toFixed(2)) : undefined,
          sampleCount: samples.length,
          coverage80: Number(cov80.toFixed(1)),
          coverage95: Number(cov95.toFixed(1)),
        });

        for (const s of samples) {
          totalAbsErr += s.absErr;
          totalSqErr += s.sqErr;
          totalCount++;
          if (s.in80) totalIn80++;
          if (s.in95) totalIn95++;
          if (s.pctErr !== undefined) {
            totalPctErr += s.pctErr;
            pctCount++;
          }
        }
      }

      const overallMae = totalCount > 0 ? Number((totalAbsErr / totalCount).toFixed(3)) : 0;
      const overallRmse = totalCount > 0 ? Number(Math.sqrt(totalSqErr / totalCount).toFixed(3)) : 0;
      const overallMape = pctCount > 0 ? Number((totalPctErr / pctCount).toFixed(2)) : undefined;
      const avgLatencyMs = latencies.length > 0
        ? Number((latencies.reduce((s, l) => s + l, 0) / latencies.length).toFixed(2))
        : 0;
      const overallCov80 = totalCount > 0 ? Number(((totalIn80 / totalCount) * 100).toFixed(1)) : 0;
      const overallCov95 = totalCount > 0 ? Number(((totalIn95 / totalCount) * 100).toFixed(1)) : 0;

      const evalResult: ProviderEvaluationResult = {
        target,
        providerType: pType,
        providerName: provider.name,
        overallMae,
        overallRmse,
        overallMape,
        avgLatencyMs,
        totalSamples: totalCount,
        coverage80: overallCov80,
        coverage95: overallCov95,
        horizonMetrics: horizonMetricsList,
      };

      results.push(evalResult);

      console.log(`    MAE: ${overallMae} | RMSE: ${overallRmse} | Latency: ${avgLatencyMs}ms | Cov80: ${overallCov80}% | Cov95: ${overallCov95}%`);

      // Persist to PostgreSQL ModelEvaluation table
      const modelRecord = await prisma.predictionModel.findFirst({
        where: { target, type: pType },
      });
      if (modelRecord) {
        const horizonMetricsObj: Record<string, any> = {};
        for (const hm of horizonMetricsList) {
          horizonMetricsObj[hm.horizonLabel] = {
            mae: hm.mae,
            rmse: hm.rmse,
            mape: hm.mape,
            sampleCount: hm.sampleCount,
            coverage80: hm.coverage80,
            coverage95: hm.coverage95,
          };
        }
        await prisma.modelEvaluation.create({
          data: {
            modelId: modelRecord.id,
            homeId,
            target,
            evaluationWindow: '28d',
            sampleCount: totalCount,
            mae: overallMae,
            rmse: overallRmse,
            horizonMetrics: horizonMetricsObj,
            inferenceLatencyMs: avgLatencyMs,
          },
        });
      }
    }
  }

  // Save full JSON evaluation dump
  const outPath = path.join(process.cwd(), 'scripts', 'evaluation-results.json');
  fs.writeFileSync(outPath, JSON.stringify({ results, coldStartFindings }, null, 2));
  console.log(`\nEvaluation complete! Raw metrics saved to: ${outPath}`);
}

runEvaluation().catch(console.error).finally(() => process.exit());
