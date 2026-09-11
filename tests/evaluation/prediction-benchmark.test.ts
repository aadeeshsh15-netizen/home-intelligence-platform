import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '../../src/lib/db';
import { evaluateModel } from '../../src/server/intelligence/prediction/evaluator';

describe('Predictive Intelligence Evaluation & Walk-Forward Benchmark', () => {
  let home: any;
  let livingRoom: any;

  beforeAll(async () => {
    home = await prisma.home.findFirst();
    if (!home) throw new Error('No home found in test database');

    livingRoom = await prisma.room.findFirst({
      where: { floor: { homeId: home.id }, roomType: 'LIVING_ROOM' },
    });
  });

  it('executes rolling-origin walk-forward backtest and persists metrics in database', async () => {
    const report = await evaluateModel({
      homeId: home.id,
      target: 'ROOM_TEMPERATURE',
      roomId: livingRoom.id,
      modelType: 'STATISTICAL_SEASONAL_DECAY',
      days: 7,
    });

    expect(report).toBeDefined();
    expect(report.target).toBe('ROOM_TEMPERATURE');
    expect(report.modelType).toBe('STATISTICAL_SEASONAL_DECAY');
    expect(report.inferenceLatencyMs).toBeLessThan(100); // Fast in-memory inference

    // Verify horizon degradation metrics
    expect(report.horizonMetrics.length).toBe(4);
    const horizonLabels = report.horizonMetrics.map((h) => h.horizonLabel);
    expect(horizonLabels).toEqual(['15m', '1h', '4h', '24h']);

    for (const hm of report.horizonMetrics) {
      expect(hm.mae).toBeGreaterThanOrEqual(0);
      expect(hm.rmse).toBeGreaterThanOrEqual(0);
    }

    // Verify persistence in ModelEvaluation table
    const dbRecord = await prisma.modelEvaluation.findFirst({
      where: {
        homeId: home.id,
        target: 'ROOM_TEMPERATURE',
      },
      orderBy: { evaluatedAt: 'desc' },
      include: {
        model: true,
      },
    });

    expect(dbRecord).not.toBeNull();
    expect(dbRecord?.target).toBe('ROOM_TEMPERATURE');
    expect(dbRecord?.model.type).toBe('STATISTICAL_SEASONAL_DECAY');
    expect(dbRecord?.mae).toBe(report.overallMae);
    expect(dbRecord?.rmse).toBe(report.overallRmse);
    expect(dbRecord?.horizonMetrics).toBeDefined();
  });
});
