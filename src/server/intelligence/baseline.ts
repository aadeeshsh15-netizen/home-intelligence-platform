import { prisma } from '@/lib/db';
import { calculateMeanAndStdDev } from '@/lib/statistics';

/**
 * Recalculates the historical baseline for a given sensor across all 168 hours of the week
 * (7 days * 24 hours) using readings from the past 14 days.
 */
export async function computeSensorBaseline(sensorId: string): Promise<number> {
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  // Fetch readings from the last 14 days
  const readings = await prisma.telemetryReading.findMany({
    where: {
      sensorId,
      timestamp: { gte: fourteenDaysAgo },
      quality: 'VALID',
    },
    select: {
      timestamp: true,
      value: true,
    },
  });

  if (readings.length === 0) return 0;

  // Group readings by [dayOfWeek (0-6)][hourOfDay (0-23)]
  const buckets = new Map<string, number[]>();

  for (const r of readings) {
    const d = new Date(r.timestamp);
    const key = `${d.getUTCDay()}_${d.getUTCHours()}`;
    const list = buckets.get(key) || [];
    list.push(r.value);
    buckets.set(key, list);
  }

  let updatedCount = 0;

  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      const key = `${day}_${hour}`;
      const values = buckets.get(key);

      if (values && values.length >= 2) {
        const { mean, stdDev } = calculateMeanAndStdDev(values);

        await prisma.telemetryBaseline.upsert({
          where: {
            sensorId_dayOfWeek_hourOfDay: {
              sensorId,
              dayOfWeek: day,
              hourOfDay: hour,
            },
          },
          create: {
            sensorId,
            dayOfWeek: day,
            hourOfDay: hour,
            mean,
            // Ensure non-zero standard deviation to avoid division by zero
            stdDev: Math.max(0.1, stdDev),
            sampleCount: values.length,
          },
          update: {
            mean,
            stdDev: Math.max(0.1, stdDev),
            sampleCount: values.length,
          },
        });
        updatedCount++;
      }
    }
  }

  return updatedCount;
}

/**
 * Retrieves the expected baseline mean and standard deviation for a sensor at a specific timestamp.
 */
export async function getBaselineForTimestamp(
  sensorId: string,
  timestamp: Date = new Date()
): Promise<{ mean: number; stdDev: number; sampleCount: number } | null> {
  const dayOfWeek = timestamp.getUTCDay();
  const hourOfDay = timestamp.getUTCHours();

  const baseline = await prisma.telemetryBaseline.findUnique({
    where: {
      sensorId_dayOfWeek_hourOfDay: {
        sensorId,
        dayOfWeek,
        hourOfDay,
      },
    },
  });

  if (!baseline) return null;

  return {
    mean: baseline.mean,
    stdDev: baseline.stdDev,
    sampleCount: baseline.sampleCount,
  };
}
