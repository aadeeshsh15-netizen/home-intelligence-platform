import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { SensorType } from '@prisma/client';
import { downsampleTimeSeries, calculateDistribution } from '@/lib/statistics';
import { enforceHomeAccess } from '@/lib/auth';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const auth = await enforceHomeAccess(req);
    if (!auth.authorized || !auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status || 401 });
    }

    const { searchParams } = new URL(req.url);
    const metric = (searchParams.get('metric') || 'POWER') as SensorType;
    const range = searchParams.get('range') || '24h'; // "24h" | "7d" | "30d"
    const roomId = searchParams.get('roomId');

    let durationMs = 24 * 60 * 60 * 1000;
    let targetBuckets = 72; // 20-minute buckets for 24h

    if (range === '7d') {
      durationMs = 7 * 24 * 60 * 60 * 1000;
      targetBuckets = 84; // 2-hour buckets for 7d
    } else if (range === '30d') {
      durationMs = 30 * 24 * 60 * 60 * 1000;
      targetBuckets = 90; // 8-hour buckets for 30d
    }

    const now = new Date();
    const currentPeriodStart = new Date(now.getTime() - durationMs);
    const previousPeriodStart = new Date(currentPeriodStart.getTime() - durationMs);

    // Filter sensors strictly by the authenticated user's home
    const sensorWhere: any = {
      type: metric,
      room: {
        floor: {
          homeId: auth.user.homeId,
        },
      },
    };

    if (roomId) {
      sensorWhere.roomId = roomId;
    }

    const matchingSensors = await prisma.sensor.findMany({
      where: sensorWhere,
      select: { id: true, unit: true, room: { select: { name: true } } },
    });

    if (matchingSensors.length === 0) {
      return NextResponse.json({
        metric,
        range,
        summary: null,
        series: [],
        dataCoverage: {
          available: false,
          totalPoints: 0,
          rangeQueried: range,
        },
        message: 'No sensors found for this metric in authorized home',
      });
    }

    const sensorIds = matchingSensors.map((s) => s.id);
    const unit = matchingSensors[0].unit;

    // Fetch current period readings
    const currentReadings = await prisma.telemetryReading.findMany({
      where: {
        sensorId: { in: sensorIds },
        timestamp: { gte: currentPeriodStart },
        quality: 'VALID',
      },
      orderBy: { timestamp: 'asc' },
      select: { timestamp: true, value: true, sensorId: true },
    });

    // Fetch previous period readings for comparative delta
    const previousReadings = await prisma.telemetryReading.findMany({
      where: {
        sensorId: { in: sensorIds },
        timestamp: { gte: previousPeriodStart, lt: currentPeriodStart },
        quality: 'VALID',
      },
      select: { value: true },
    });

    if (currentReadings.length === 0) {
      return NextResponse.json({
        metric,
        range,
        unit,
        summary: {
          current: 0,
          avg: 0,
          min: 0,
          max: 0,
          deltaPercent: 0,
          peakTimestamp: null,
        },
        dataCoverage: {
          available: false,
          totalPoints: 0,
          rangeQueried: range,
        },
        series: [],
      });
    }

    const values = currentReadings.map((r) => r.value);
    const distribution = calculateDistribution(values);

    // Current latest value
    const latestReading = currentReadings[currentReadings.length - 1];
    const current = Number(latestReading.value.toFixed(1));

    // Peak detection
    let peakValue = -Infinity;
    let peakTimestamp: string | null = null;
    for (const r of currentReadings) {
      if (r.value > peakValue) {
        peakValue = r.value;
        peakTimestamp = new Date(r.timestamp).toISOString();
      }
    }

    // Previous period comparative average
    let deltaPercent = 0;
    if (previousReadings.length > 0) {
      const prevSum = previousReadings.reduce((sum, r) => sum + r.value, 0);
      const prevAvg = prevSum / previousReadings.length;
      if (prevAvg > 0) {
        deltaPercent = Number((((distribution.mean - prevAvg) / prevAvg) * 100).toFixed(1));
      }
    }

    // Downsample for clean charting
    const downsampled = downsampleTimeSeries(currentReadings, targetBuckets);

    // Fetch baseline values for each bucket to overlay standard deviation corridor
    const seriesWithBaselines = await Promise.all(
      downsampled.map(async (point) => {
        const d = new Date(point.timestamp);
        const day = d.getUTCDay();
        const hour = d.getUTCHours();

        const baselines = await prisma.telemetryBaseline.findMany({
          where: {
            sensorId: { in: sensorIds },
            dayOfWeek: day,
            hourOfDay: hour,
          },
          select: { mean: true, stdDev: true },
        });

        let baselineMean = point.value;
        let baselineStdDev = 0;

        if (baselines.length > 0) {
          baselineMean = Number(
            (baselines.reduce((acc, b) => acc + b.mean, 0) / baselines.length).toFixed(1)
          );
          baselineStdDev = Number(
            (baselines.reduce((acc, b) => acc + b.stdDev, 0) / baselines.length).toFixed(1)
          );
        }

        return {
          timestamp: point.timestamp,
          value: point.value,
          min: point.min,
          max: point.max,
          baselineMean,
          baselineUpper: Number((baselineMean + 2 * baselineStdDev).toFixed(1)),
          baselineLower: Number(Math.max(0, baselineMean - 2 * baselineStdDev).toFixed(1)),
        };
      })
    );

    const firstReadingTime = currentReadings[0].timestamp;
    const lastReadingTime = currentReadings[currentReadings.length - 1].timestamp;

    return NextResponse.json({
      metric,
      range,
      unit,
      summary: {
        current,
        avg: distribution.mean,
        min: distribution.min,
        max: distribution.max,
        deltaPercent,
        peakValue: Number(peakValue.toFixed(1)),
        peakTimestamp,
      },
      distribution,
      dataCoverage: {
        available: true,
        totalPoints: currentReadings.length,
        from: firstReadingTime,
        to: lastReadingTime,
        rangeQueried: range,
      },
      series: seriesWithBaselines,
    });
  } catch (error: any) {
    logger.error('API /analytics failure', { module: 'api/analytics' }, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
