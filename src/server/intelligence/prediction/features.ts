import { prisma } from '@/lib/db';
import { PredictionTarget, SensorType } from '@prisma/client';
import {
  CyclicalFeatures,
  LagFeatures,
  RollingMoments,
  EnvironmentalContext,
  PredictionFeatureVector,
  BaselineMatrix,
  BaselineCell,
} from './types';
import { calculateMeanAndStdDev, calculateDriftRatePerMinute } from '@/lib/statistics';
import { getOutdoorConditions } from '@/server/simulator/physics';

/**
 * Computes deterministic cyclical sine/cosine encodings for time-of-day and day-of-week.
 */
export function computeCyclicalFeatures(date: Date): CyclicalFeatures {
  const utcHours = date.getUTCHours();
  const utcMinutes = date.getUTCMinutes();
  const hourOfDay = utcHours + utcMinutes / 60;
  const dayOfWeek = date.getUTCDay();

  const hourSin = Number(Math.sin((2 * Math.PI * hourOfDay) / 24).toFixed(4));
  const hourCos = Number(Math.cos((2 * Math.PI * hourOfDay) / 24).toFixed(4));

  const dayOfWeekSin = Number(Math.sin((2 * Math.PI * dayOfWeek) / 7).toFixed(4));
  const dayOfWeekCos = Number(Math.cos((2 * Math.PI * dayOfWeek) / 7).toFixed(4));

  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  return {
    hourSin,
    hourCos,
    dayOfWeekSin,
    dayOfWeekCos,
    isWeekend,
    hourOfDay,
    dayOfWeek,
  };
}

/**
 * Maps PredictionTarget to the primary underlying SensorType.
 */
export function mapTargetToSensorType(target: PredictionTarget): SensorType {
  switch (target) {
    case 'HOUSEHOLD_POWER':
      return SensorType.POWER;
    case 'ROOM_TEMPERATURE':
      return SensorType.TEMPERATURE;
    case 'ROOM_CO2':
      return SensorType.CO2;
    case 'OCCUPANCY_PROBABILITY':
      return SensorType.OCCUPANCY;
    default:
      throw new Error(`Unsupported prediction target: ${target}`);
  }
}

export interface ExtractedFeatureResult {
  features: PredictionFeatureVector;
  sensor: {
    id: string;
    unit: string;
    type: SensorType;
    roomId: string;
    roomName: string;
  };
  baselineMatrix: BaselineMatrix;
}

/**
 * Finds the closest reading to a target timestamp within a tolerance window (in milliseconds).
 */
function findClosestReading(
  readings: { timestamp: Date; value: number }[],
  targetTimeMs: number,
  toleranceMs: number
): number | undefined {
  let closestVal: number | undefined = undefined;
  let minDiff = Infinity;

  for (const r of readings) {
    const diff = Math.abs(r.timestamp.getTime() - targetTimeMs);
    if (diff <= toleranceMs && diff < minDiff) {
      minDiff = diff;
      closestVal = r.value;
    }
  }

  return closestVal;
}

/**
 * Loads baseline matrix from TelemetryBaseline table.
 */
export async function loadBaselineMatrix(sensorId: string): Promise<BaselineMatrix> {
  const baselines = await prisma.telemetryBaseline.findMany({
    where: { sensorId },
  });

  const matrix: BaselineMatrix = new Map();
  for (const b of baselines) {
    matrix.set(`${b.dayOfWeek}_${b.hourOfDay}`, {
      dayOfWeek: b.dayOfWeek,
      hourOfDay: b.hourOfDay,
      mean: b.mean,
      stdDev: b.stdDev,
      sampleCount: b.sampleCount,
    });
  }

  return matrix;
}

/**
 * Extracts comprehensive feature vector and data quality assessment for prediction inference.
 */
export async function extractFeatures(
  homeId: string,
  target: PredictionTarget,
  roomId?: string | null,
  referenceTime: Date = new Date()
): Promise<ExtractedFeatureResult> {
  const sensorType = mapTargetToSensorType(target);

  // Find relevant sensor
  const sensorWhere: any = {
    type: sensorType,
    room: {
      floor: {
        homeId,
      },
    },
  };

  if (roomId) {
    sensorWhere.roomId = roomId;
  }

  const sensor = await prisma.sensor.findFirst({
    where: sensorWhere,
    include: {
      room: true,
    },
  });

  if (!sensor) {
    throw new Error(
      `No sensor of type ${sensorType} found for target ${target} in home ${homeId}${
        roomId ? ` (room ${roomId})` : ''
      }`
    );
  }

  const baselineMatrix = await loadBaselineMatrix(sensor.id);

  // Check historical span (oldest reading)
  const oldestReading = await prisma.telemetryReading.findFirst({
    where: {
      sensorId: sensor.id,
      timestamp: { lte: referenceTime },
    },
    orderBy: { timestamp: 'asc' },
    select: { timestamp: true },
  });

  const refMs = referenceTime.getTime();
  const historicalHours = oldestReading
    ? Math.max(0, (refMs - oldestReading.timestamp.getTime()) / (1000 * 3600))
    : 0;

  // Retrieve readings for the past 7 days up to referenceTime
  const sevenDaysAgo = new Date(refMs - 7 * 24 * 3600 * 1000);
  const rawReadings = await prisma.telemetryReading.findMany({
    where: {
      sensorId: sensor.id,
      timestamp: {
        gte: sevenDaysAgo,
        lte: referenceTime,
      },
    },
    select: {
      timestamp: true,
      value: true,
      quality: true,
    },
    orderBy: { timestamp: 'desc' },
  });

  const readings = rawReadings.map((r) => ({
    timestamp: r.timestamp,
    value: r.value,
  }));

  // Data quality assessment
  const validSamplesCount = readings.length;
  const oneDayAgoMs = refMs - 24 * 3600 * 1000;
  const last24hReadingsCount = readings.filter((r) => r.timestamp.getTime() >= oneDayAgoMs).length;
  const expected24hCount = Math.floor((24 * 3600) / Math.max(10, sensor.samplingIntervalSec));
  const missingDataPercent =
    expected24hCount > 0
      ? Math.max(0, Math.min(100, Math.round(((expected24hCount - last24hReadingsCount) / expected24hCount) * 100)))
      : 0;

  let qualityStatus: 'HEALTHY' | 'DEGRADED' | 'INSUFFICIENT_DATA' = 'HEALTHY';
  if (historicalHours < 48 || validSamplesCount < 10) {
    qualityStatus = 'INSUFFICIENT_DATA';
  } else if (missingDataPercent > 25) {
    qualityStatus = 'DEGRADED';
  }

  // Current observed value: latest reading or baseline mean if missing
  const latestReading = readings.length > 0 ? readings[0] : null;
  const cyclical = computeCyclicalFeatures(referenceTime);
  const baselineKey = `${cyclical.dayOfWeek}_${Math.floor(cyclical.hourOfDay)}`;
  const currentBaseline = baselineMatrix.get(baselineKey);

  const currentValue =
    latestReading !== null ? latestReading.value : currentBaseline ? currentBaseline.mean : 0;

  // Lag extraction (with tolerance windows)
  const lags: LagFeatures = {
    lag15m: findClosestReading(readings, refMs - 15 * 60 * 1000, 5 * 60 * 1000),
    lag30m: findClosestReading(readings, refMs - 30 * 60 * 1000, 10 * 60 * 1000),
    lag1h: findClosestReading(readings, refMs - 60 * 60 * 1000, 15 * 60 * 1000),
    lag4h: findClosestReading(readings, refMs - 4 * 3600 * 1000, 30 * 60 * 1000),
    lag24h: findClosestReading(readings, refMs - 24 * 3600 * 1000, 60 * 60 * 1000),
    lag168h: findClosestReading(readings, refMs - 7 * 24 * 3600 * 1000, 120 * 60 * 1000),
  };

  // Rolling moments over the past 15m and 1h
  const readings15m = readings.filter((r) => r.timestamp.getTime() >= refMs - 15 * 60 * 1000);
  const readings1h = readings.filter((r) => r.timestamp.getTime() >= refMs - 60 * 60 * 1000);

  const mean15m =
    readings15m.length > 0
      ? readings15m.reduce((sum, r) => sum + r.value, 0) / readings15m.length
      : currentValue;

  const vals1h = readings1h.map((r) => r.value);
  const { mean: mean1h, stdDev: std1h } =
    vals1h.length > 0 ? calculateMeanAndStdDev(vals1h) : { mean: currentValue, stdDev: 0 };

  const min1h = vals1h.length > 0 ? Math.min(...vals1h) : currentValue;
  const max1h = vals1h.length > 0 ? Math.max(...vals1h) : currentValue;

  // Slope / drift rate over last 1h (ascending order for linear regression)
  const ascending1h = [...readings1h].reverse();
  const slopePerMinute =
    ascending1h.length >= 2 ? calculateDriftRatePerMinute(ascending1h) : 0;

  const rolling: RollingMoments = {
    mean15m: Number(mean15m.toFixed(2)),
    mean1h: Number(mean1h.toFixed(2)),
    std1h: Number(std1h.toFixed(2)),
    slopePerMinute: Number(slopePerMinute.toFixed(4)),
    min1h: Number(min1h.toFixed(2)),
    max1h: Number(max1h.toFixed(2)),
  };

  // Environmental context
  const outdoor = getOutdoorConditions(referenceTime);
  const context: EnvironmentalContext = {
    outdoorTemperature: outdoor.temperature,
  };

  if (sensor.roomId) {
    const siblingSensors = await prisma.sensor.findMany({
      where: { roomId: sensor.roomId },
      select: { type: true, lastReadingValue: true },
    });

    for (const sib of siblingSensors) {
      if (sib.lastReadingValue !== null) {
        if (sib.type === SensorType.TEMPERATURE) context.roomTemperature = sib.lastReadingValue;
        if (sib.type === SensorType.CO2) context.roomCo2 = sib.lastReadingValue;
        if (sib.type === SensorType.OCCUPANCY) context.occupancyState = sib.lastReadingValue > 0.5;
      }
    }
  }

  const features: PredictionFeatureVector = {
    timestamp: referenceTime,
    target,
    currentValue: Number(currentValue.toFixed(2)),
    cyclical,
    lags,
    rolling,
    context,
    dataQuality: {
      status: qualityStatus,
      historicalHours: Number(historicalHours.toFixed(1)),
      missingDataPercent,
      validSamplesCount,
    },
  };

  return {
    features,
    sensor: {
      id: sensor.id,
      unit: sensor.unit,
      type: sensor.type,
      roomId: sensor.roomId,
      roomName: sensor.room.name,
    },
    baselineMatrix,
  };
}
