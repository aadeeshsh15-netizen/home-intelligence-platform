import { prisma } from '@/lib/db';
import { SensorType } from '@prisma/client';
import { PredictionFeatureVector, BaselineMatrix } from '../types';
import { computeCyclicalFeatures, loadBaselineMatrix } from '../features';
import { calculateMeanAndStdDev, calculateDriftRatePerMinute } from '@/lib/statistics';
import { getOutdoorConditions } from '@/server/simulator/physics';

export const FEATURE_VERSION_POWER = 'features_v1_power';

export const FEATURE_NAMES_V1_POWER: string[] = [
  'current_value',
  'lag_15m',
  'lag_30m',
  'lag_1h',
  'lag_4h',
  'lag_24h',
  'lag_168h',
  'mean_15m',
  'mean_1h',
  'std_1h',
  'min_1h',
  'max_1h',
  'slope_1h',
  'hour_sin',
  'hour_cos',
  'dow_sin',
  'dow_cos',
  'is_weekend',
  'outdoor_temp',
  'room_temp',
  'room_co2',
  'occupancy_state',
  'baseline_mean',
  'baseline_std',
];

export interface TabularDataRow {
  timestamp: Date;
  features: number[];
  targets: Record<number, number>; // horizonMinutes -> actual target value
}

export interface DatasetSplit {
  train: TabularDataRow[];
  val: TabularDataRow[];
  test: TabularDataRow[];
}

/**
 * Converts a runtime PredictionFeatureVector and BaselineMatrix into the ordered 24-dim numerical vector.
 * Used during live inference to ensure exact feature parity with training.
 */
export function extractFeatureVectorFromContext(
  features: PredictionFeatureVector,
  baselines?: BaselineMatrix | null
): number[] {
  const currentVal = features.currentValue;
  const lags = features.lags;
  const rolling = features.rolling;
  const cyc = features.cyclical;
  const ctx = features.context;

  const baselineKey = `${cyc.dayOfWeek}_${Math.floor(cyc.hourOfDay)}`;
  const bCell = baselines?.get(baselineKey);

  return [
    currentVal,
    lags.lag15m ?? currentVal,
    lags.lag30m ?? currentVal,
    lags.lag1h ?? currentVal,
    lags.lag4h ?? currentVal,
    lags.lag24h ?? currentVal,
    lags.lag168h ?? currentVal,
    rolling.mean15m ?? currentVal,
    rolling.mean1h ?? currentVal,
    rolling.std1h ?? 0,
    rolling.min1h ?? currentVal,
    rolling.max1h ?? currentVal,
    rolling.slopePerMinute ?? 0,
    cyc.hourSin,
    cyc.hourCos,
    cyc.dayOfWeekSin,
    cyc.dayOfWeekCos,
    cyc.isWeekend ? 1 : 0,
    ctx.outdoorTemperature ?? 20.0,
    ctx.roomTemperature ?? 21.0,
    ctx.roomCo2 ?? 450.0,
    ctx.occupancyState ? 1 : 0,
    bCell?.mean ?? currentVal,
    bCell?.stdDev ?? 10.0,
  ];
}

/**
 * Builds the complete historical tabular dataset for HOUSEHOLD_POWER from PostgreSQL telemetry.
 * Enforces strict causality (no lookahead) during lag and moment calculation.
 */
export async function buildHouseholdPowerDataset(homeId: string): Promise<TabularDataRow[]> {
  // Find power meter sensor
  const powerSensor = await prisma.sensor.findFirst({
    where: {
      type: SensorType.POWER,
      room: { floor: { homeId } },
    },
    include: { room: true },
  });

  if (!powerSensor) {
    throw new Error(`No POWER sensor found for home ${homeId}`);
  }

  // Find auxiliary sensors in the same room for environmental context
  const auxSensors = await prisma.sensor.findMany({
    where: { roomId: powerSensor.roomId },
    select: { id: true, type: true },
  });

  const tempSensor = auxSensors.find((s) => s.type === SensorType.TEMPERATURE);
  const co2Sensor = auxSensors.find((s) => s.type === SensorType.CO2);
  const occSensor = auxSensors.find((s) => s.type === SensorType.OCCUPANCY);

  // Load all power readings ordered chronologically
  const rawPowerReadings = await prisma.telemetryReading.findMany({
    where: { sensorId: powerSensor.id, quality: 'VALID' },
    select: { timestamp: true, value: true },
    orderBy: { timestamp: 'asc' },
  });

  if (rawPowerReadings.length < 50) {
    throw new Error(`Insufficient telemetry readings (${rawPowerReadings.length}) to build dataset`);
  }

  // Load auxiliary readings if available
  const rawTempReadings = tempSensor
    ? await prisma.telemetryReading.findMany({
        where: { sensorId: tempSensor.id, quality: 'VALID' },
        select: { timestamp: true, value: true },
        orderBy: { timestamp: 'asc' },
      })
    : [];

  const rawCo2Readings = co2Sensor
    ? await prisma.telemetryReading.findMany({
        where: { sensorId: co2Sensor.id, quality: 'VALID' },
        select: { timestamp: true, value: true },
        orderBy: { timestamp: 'asc' },
      })
    : [];

  const rawOccReadings = occSensor
    ? await prisma.telemetryReading.findMany({
        where: { sensorId: occSensor.id, quality: 'VALID' },
        select: { timestamp: true, value: true },
        orderBy: { timestamp: 'asc' },
      })
    : [];

  const baselineMatrix = await loadBaselineMatrix(powerSensor.id);

  // Robust linear interpolation / nearest neighbor lookup
  const interpolateValueAt = (
    readings: { timestamp: Date; value: number }[],
    targetMs: number
  ): number | undefined => {
    if (readings.length === 0) return undefined;
    const firstMs = readings[0].timestamp.getTime();
    const lastMs = readings[readings.length - 1].timestamp.getTime();

    if (targetMs < firstMs - 15 * 60 * 1000 || targetMs > lastMs + 15 * 60 * 1000) {
      return undefined;
    }

    // Binary search for bracket
    let low = 0;
    let high = readings.length - 1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const tMid = readings[mid].timestamp.getTime();
      if (tMid === targetMs) return readings[mid].value;
      if (tMid < targetMs) low = mid + 1;
      else high = mid - 1;
    }

    const r1 = readings[high];
    const r2 = readings[low];
    if (!r1) return r2?.value;
    if (!r2) return r1?.value;

    const t1 = r1.timestamp.getTime();
    const t2 = r2.timestamp.getTime();
    const dt = t2 - t1;

    if (dt > 0 && dt <= 65 * 60 * 1000) {
      const factor = (targetMs - t1) / dt;
      return r1.value + factor * (r2.value - r1.value);
    }
    if (Math.abs(targetMs - t1) <= 20 * 60 * 1000) return r1.value;
    if (Math.abs(targetMs - t2) <= 20 * 60 * 1000) return r2.value;
    return undefined;
  };

  const firstTimestampMs = rawPowerReadings[0].timestamp.getTime();
  const lastTimestampMs = rawPowerReadings[rawPowerReadings.length - 1].timestamp.getTime();

  // Evaluate points every 30 minutes, starting after 48 hours cold-start warmup
  const stepMs = 30 * 60 * 1000;
  const startMs = firstTimestampMs + 48 * 3600 * 1000; // Cold-start 48h warmup
  const maxTargetHorizonMs = 24 * 3600 * 1000; // 24h horizon
  const endMs = lastTimestampMs - maxTargetHorizonMs; // Ensure room for 24h future target

  const targetHorizons = [15, 60, 240, 1440];
  const datasetRows: TabularDataRow[] = [];

  for (let tMs = startMs; tMs <= endMs; tMs += stepMs) {
    const originTime = new Date(tMs);

    // Get all power readings up to tMs (strictly causal: <= tMs)
    const historicalPower = rawPowerReadings.filter((r) => r.timestamp.getTime() <= tMs);
    if (historicalPower.length < 10) continue;

    const currentVal = historicalPower[historicalPower.length - 1].value;

    // Lags
    const lag15m = interpolateValueAt(historicalPower, tMs - 15 * 60 * 1000) ?? currentVal;
    const lag30m = interpolateValueAt(historicalPower, tMs - 30 * 60 * 1000) ?? currentVal;
    const lag1h = interpolateValueAt(historicalPower, tMs - 60 * 60 * 1000) ?? currentVal;
    const lag4h = interpolateValueAt(historicalPower, tMs - 4 * 3600 * 1000) ?? currentVal;
    const lag24h = interpolateValueAt(historicalPower, tMs - 24 * 3600 * 1000) ?? currentVal;
    const lag168h = interpolateValueAt(historicalPower, tMs - 7 * 24 * 3600 * 1000) ?? currentVal;

    // Rolling moments
    const readings15m = historicalPower.filter((r) => r.timestamp.getTime() >= tMs - 15 * 60 * 1000);
    const readings1h = historicalPower.filter((r) => r.timestamp.getTime() >= tMs - 60 * 60 * 1000);

    const mean15m = readings15m.length > 0
      ? readings15m.reduce((sum, r) => sum + r.value, 0) / readings15m.length
      : currentVal;

    const vals1h = readings1h.map((r) => r.value);
    const { mean: mean1h, stdDev: std1h } = vals1h.length > 0
      ? calculateMeanAndStdDev(vals1h)
      : { mean: currentVal, stdDev: 0 };

    const min1h = vals1h.length > 0 ? Math.min(...vals1h) : currentVal;
    const max1h = vals1h.length > 0 ? Math.max(...vals1h) : currentVal;

    const slope1h = readings1h.length >= 2
      ? calculateDriftRatePerMinute(readings1h)
      : 0;

    // Cyclical features
    const cyc = computeCyclicalFeatures(originTime);
    const bKey = `${cyc.dayOfWeek}_${Math.floor(cyc.hourOfDay)}`;
    const bCell = baselineMatrix.get(bKey);

    // Environmental context
    const outdoor = getOutdoorConditions(originTime);
    const roomTemp = interpolateValueAt(rawTempReadings, tMs) ?? 21.0;
    const roomCo2 = interpolateValueAt(rawCo2Readings, tMs) ?? 450.0;
    const roomOcc = (interpolateValueAt(rawOccReadings, tMs) ?? 0) > 0.5 ? 1 : 0;

    const featureVector: number[] = [
      Number(currentVal.toFixed(2)),
      Number(lag15m.toFixed(2)),
      Number(lag30m.toFixed(2)),
      Number(lag1h.toFixed(2)),
      Number(lag4h.toFixed(2)),
      Number(lag24h.toFixed(2)),
      Number(lag168h.toFixed(2)),
      Number(mean15m.toFixed(2)),
      Number(mean1h.toFixed(2)),
      Number(std1h.toFixed(2)),
      Number(min1h.toFixed(2)),
      Number(max1h.toFixed(2)),
      Number(slope1h.toFixed(4)),
      cyc.hourSin,
      cyc.hourCos,
      cyc.dayOfWeekSin,
      cyc.dayOfWeekCos,
      cyc.isWeekend ? 1 : 0,
      Number(outdoor.temperature.toFixed(2)),
      Number(roomTemp.toFixed(2)),
      Number(roomCo2.toFixed(1)),
      roomOcc,
      bCell?.mean ?? currentVal,
      bCell?.stdDev ?? 10.0,
    ];

    // Find actual future targets
    const targets: Record<number, number> = {};
    let allTargetsFound = true;

    for (const h of targetHorizons) {
      const targetTimeMs = tMs + h * 60 * 1000;
      const actualVal = interpolateValueAt(rawPowerReadings, targetTimeMs);
      if (actualVal === undefined) {
        allTargetsFound = false;
        break;
      }
      targets[h] = Number(actualVal.toFixed(2));
    }

    if (allTargetsFound) {
      datasetRows.push({
        timestamp: originTime,
        features: featureVector,
        targets,
      });
    }
  }

  return datasetRows;
}

/**
 * Splits dataset into chronological partitions (Days 2-18 train, Days 18-23 val, Days 23-30 test).
 */
export function splitDatasetChronologically(
  dataset: TabularDataRow[],
  valRatio: number = 0.20,
  testRatio: number = 0.25
): DatasetSplit {
  const total = dataset.length;
  const trainCount = Math.floor(total * (1 - valRatio - testRatio));
  const valCount = Math.floor(total * valRatio);

  const train = dataset.slice(0, trainCount);
  const val = dataset.slice(trainCount, trainCount + valCount);
  const test = dataset.slice(trainCount + valCount);

  return { train, val, test };
}
