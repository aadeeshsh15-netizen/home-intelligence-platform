import { prisma } from '@/lib/db';
import { calculateZScore, calculateDriftRatePerMinute } from '@/lib/statistics';
import { getBaselineForTimestamp } from './baseline';
import { SeverityLevel } from '@prisma/client';
import {
  IAnomalyDetector,
  AnomalyDetectionRequest,
  AnomalyDetectionResult,
} from './types';
import { logger } from '@/lib/logger';

export interface EvaluatedAnomaly {
  isAnomaly: boolean;
  zScore: number;
  deviationPercent: number;
  baselineMean: number;
  baselineStdDev: number;
  title: string;
  summary: string;
  explanation: string;
  confidence: number;
  isHeuristic: boolean;
  severity: SeverityLevel;
}

/**
 * Deterministic Statistical Z-Score Detector.
 * Implements IAnomalyDetector against established 168-hour Gaussian empirical baselines.
 */
export const SENSOR_MINIMUM_STD_DEV: Record<string, number> = {
  TEMPERATURE: 0.5, // ±0.5°C sensor precision tolerance
  HUMIDITY: 2.0,    // ±2% RH relative humidity tolerance
  CO2: 30.0,        // ±30 ppm NDIR sensor tolerance
  POWER: 20.0,      // ±20 W baseline electrical fluctuation
  NOISE: 3.0,       // ±3 dB acoustic noise threshold
  LIGHT: 25.0,      // ±25 lux ambient light tolerance
  PM2_5: 3.0,       // ±3 µg/m³ particle sensor tolerance
};

export class StatisticalZScoreDetector implements IAnomalyDetector {
  public readonly id = 'statistical-gaussian-zscore';
  public readonly name = 'Empirical Gaussian Z-Score Anomaly Detector';
  public readonly paradigm = 'STATISTICAL_BASELINE' as const;

  public async evaluate(request: AnomalyDetectionRequest): Promise<AnomalyDetectionResult | null> {
    const baseline = await getBaselineForTimestamp(request.sensorId, request.timestamp);

    if (!baseline || baseline.sampleCount < 5) {
      logger.debug('Insufficient baseline samples for statistical anomaly evaluation', {
        sensorId: request.sensorId,
        sampleCount: baseline?.sampleCount || 0,
        module: 'intelligence',
      });
      return null;
    }

    const { mean, stdDev } = baseline;
    const minStd = SENSOR_MINIMUM_STD_DEV[request.sensorType] ?? 0.5;
    const effectiveStd = Math.max(minStd, stdDev);
    const zScore = calculateZScore(request.value, mean, effectiveStd);
    const diff = request.value - mean;
    const deviationPercent = mean !== 0 ? Number(((diff / Math.abs(mean)) * 100).toFixed(1)) : 0;

    // Threshold: Absolute Z-Score >= 2.50 AND physical difference exceeding measurement tolerance
    const isAnomaly = Math.abs(zScore) >= 2.5 && Math.abs(diff) >= minStd;
    if (!isAnomaly) return null;

    const confidence = Number(Math.min(0.99, 0.5 + (Math.abs(zScore) / 5) * 0.49).toFixed(2));
    const sign = deviationPercent > 0 ? '+' : '';

    const title = `${request.roomName} ${request.sensorType} Deviation`;
    const summary = `${request.roomName} ${request.sensorType.toLowerCase()} is ${Math.abs(deviationPercent)}% ${
      deviationPercent > 0 ? 'above' : 'below'
    } typical baseline.`;

    const dayName = request.timestamp.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
    const hour = request.timestamp.getUTCHours();

    const explanation =
      `Current observation: ${request.value} ${request.unit}. ` +
      `Historical baseline for ${dayName} at ${hour}:00 UTC: ` +
      `μ = ${mean} ${request.unit}, σ = ${stdDev} ${request.unit} (n=${baseline.sampleCount}). ` +
      `Standard score: Z = ${zScore > 0 ? '+' : ''}${zScore}. ` +
      `Deviation: ${sign}${deviationPercent}% relative to baseline.`;

    return {
      isAnomaly: true,
      detectorId: this.id,
      paradigm: this.paradigm,
      score: zScore,
      title,
      summary,
      explanation,
      confidence,
      isHeuristic: false,
      evidenceData: {
        value: request.value,
        baselineMean: mean,
        baselineStdDev: stdDev,
        zScore,
        deviationPercent,
        unit: request.unit,
        sampleCount: baseline.sampleCount,
      },
    };
  }
}

// Global detector registry (pluggable architecture ready for future ML models)
const detectorRegistry: IAnomalyDetector[] = [new StatisticalZScoreDetector()];

export function registerAnomalyDetector(detector: IAnomalyDetector) {
  detectorRegistry.push(detector);
}

/**
 * Main evaluation entry point for incoming telemetry readings.
 */
export async function evaluateTelemetryAnomaly(
  sensorId: string,
  value: number,
  timestamp: Date = new Date()
): Promise<EvaluatedAnomaly | null> {
  const sensor = await prisma.sensor.findUnique({
    where: { id: sensorId },
    include: { room: true },
  });

  if (!sensor) return null;

  const request: AnomalyDetectionRequest = {
    sensorId,
    sensorType: sensor.type,
    unit: sensor.unit,
    roomName: sensor.room.name,
    value,
    timestamp,
  };

  for (const detector of detectorRegistry) {
    const result = await detector.evaluate(request);
    if (result && result.isAnomaly) {
      const zScore = result.score;
      const deviationPercent = result.evidenceData.deviationPercent || 0;

      let severity: SeverityLevel = SeverityLevel.WARNING;
      if (Math.abs(zScore) >= 4.0 || Math.abs(deviationPercent) >= 80) {
        severity = SeverityLevel.CRITICAL;
      } else if (Math.abs(zScore) >= 3.0) {
        severity = SeverityLevel.ERROR;
      }

      return {
        isAnomaly: true,
        zScore,
        deviationPercent,
        baselineMean: result.evidenceData.baselineMean || 0,
        baselineStdDev: result.evidenceData.baselineStdDev || 0,
        title: result.title,
        summary: result.summary,
        explanation: result.explanation,
        confidence: result.confidence,
        isHeuristic: result.isHeuristic,
        severity,
      };
    }
  }

  return null;
}

/**
 * Checks for persistent linear CO2 accumulation in occupied rooms (ventilation deficiency).
 */
export async function evaluateCO2VentilationAnomaly(
  roomId: string
): Promise<{ detected: boolean; slopePpmPerMin: number; explanation?: string } | null> {
  const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000);

  const co2Sensor = await prisma.sensor.findFirst({
    where: { roomId, type: 'CO2' },
  });

  if (!co2Sensor) return null;

  const recentReadings = await prisma.telemetryReading.findMany({
    where: {
      sensorId: co2Sensor.id,
      timestamp: { gte: thirtyMinsAgo },
    },
    orderBy: { timestamp: 'asc' },
    select: { timestamp: true, value: true },
  });

  if (recentReadings.length < 5) return null;

  const slope = calculateDriftRatePerMinute(recentReadings);

  // If CO2 is rising by > 12 ppm/min continuously over 30 mins
  if (slope > 12) {
    const latestValue = recentReadings[recentReadings.length - 1].value;
    const firstValue = recentReadings[0].value;
    return {
      detected: true,
      slopePpmPerMin: slope,
      explanation: `CO2 in room has risen continuously from ${firstValue} to ${latestValue} ppm over 30 minutes (rate: +${slope.toFixed(1)} ppm/min). Natural air exchange rate is insufficient.`,
    };
  }

  return { detected: false, slopePpmPerMin: slope };
}
