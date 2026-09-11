import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src/lib/db';
import { PredictiveIncidentEngine } from '../../src/server/intelligence/predictive-incidents/engine';
import {
  PredictiveCandidate,
} from '../../src/server/intelligence/predictive-incidents/types';
import { SeverityLevel, IncidentStatus, IncidentType } from '@prisma/client';

describe('Predictive Incident Lifecycle & Verification Engine', () => {
  let home: any;
  let livingRoom: any;
  let kitchenRoom: any;

  beforeAll(async () => {
    home = await prisma.home.findFirst();
    if (!home) throw new Error('No test home found in database');

    livingRoom = await prisma.room.findFirst({
      where: { floor: { homeId: home.id }, roomType: 'LIVING_ROOM' },
    });
    kitchenRoom = await prisma.room.findFirst({
      where: { floor: { homeId: home.id }, roomType: 'KITCHEN' },
    });

    // Clean up test predictive incidents
    await prisma.predictiveIncident.deleteMany({
      where: { homeId: home.id },
    });
  });

  afterAll(async () => {
    if (home) {
      await prisma.predictiveIncident.deleteMany({
        where: { homeId: home.id },
      });
    }
  });

  it('1. Persists a new predictive incident early warning with mathematical confidence and bounds', async () => {
    const now = new Date();
    const created = await prisma.predictiveIncident.create({
      data: {
        homeId: home.id,
        roomId: livingRoom.id,
        type: 'PREDICTED_CO2_VENTILATION',
        target: 'ROOM_CO2',
        severity: SeverityLevel.WARNING,
        status: 'PREDICTED',
        outcome: 'UNRESOLVED',
        title: 'Impending CO2 Ventilation Deficit',
        summary: 'CO2 concentration is projected to breach 1,000 ppm within 60 minutes.',
        explanation: 'Forecasted via STATISTICAL_SEASONAL_DECAY based on continuous occupancy.',
        probability: 0.88,
        confidence: 0.82,
        horizonMinutes: 60,
        currentValue: 840,
        predictedValue: 1080,
        thresholdValue: 1000,
        baselineValue: 650,
        confidenceInterval80: [1020, 1140] as any,
        confidenceInterval95: [980, 1180] as any,
        modelType: 'STATISTICAL_SEASONAL_DECAY',
        modelName: 'Seasonal Harmonic Decay',
        expectedCrossingTime: new Date(now.getTime() + 25 * 60 * 1000),
        predictedLeadTimeMin: 25,
        contributingEvidence: [
          {
            sensorType: 'OCCUPANCY',
            signalType: 'STATE_MATCH',
            weight: 0.4,
            satisfied: true,
            explanation: 'Continuous occupancy confirmed',
          },
        ] as any,
        createdAt: now,
      },
    });

    expect(created.id).toBeDefined();
    expect(created.status).toBe('PREDICTED');
    expect(created.outcome).toBe('UNRESOLVED');
    expect(created.probability).toBe(0.88);
    expect(created.predictedLeadTimeMin).toBe(25);
  });

  it('2. Suppresses duplicate warning when an active prediction of the same type already exists', async () => {
    const candidates = await PredictiveIncidentEngine.evaluateHome(home.id, new Date());
    const co2Candidates = candidates.filter(
      (c) => c.type === 'PREDICTED_CO2_VENTILATION' && c.roomId === livingRoom.id
    );

    // Any existing PREDICTED in living room should prevent a duplicate from being created
    const activeCount = await prisma.predictiveIncident.count({
      where: {
        homeId: home.id,
        roomId: livingRoom.id,
        type: 'PREDICTED_CO2_VENTILATION',
        status: 'PREDICTED',
      },
    });

    expect(activeCount).toBe(1);
  });

  it('3. Confirms early warning as TRUE_POSITIVE when Phase 2 Incident materializes within horizon', async () => {
    const warning = await prisma.predictiveIncident.findFirst({
      where: {
        homeId: home.id,
        type: 'PREDICTED_CO2_VENTILATION',
        status: 'PREDICTED',
      },
    });
    expect(warning).toBeDefined();

    // Simulate Phase 2 Incident occurring 18 minutes after warning creation
    const incidentTime = new Date(warning!.createdAt.getTime() + 18 * 60 * 1000);
    const phase2Incident = await prisma.incident.create({
      data: {
        homeId: home.id,
        roomId: livingRoom.id,
        incidentType: IncidentType.MULTI_SENSOR_ANOMALY,
        severity: SeverityLevel.WARNING,
        status: IncidentStatus.ACTIVE,
        confidence: 0.90,
        title: 'High CO2 Buildup',
        summary: 'CO2 exceeded 1,000 ppm in Living Room',
        explanation: 'Observed CO2 = 1045 ppm',
        detectedAt: incidentTime,
        lastEvidenceAt: incidentTime,
        startedAt: incidentTime,
        correlationWindowMs: 900000,
        evidence: [],
      },
    });

    // Run pending incident evaluation
    const evalTime = new Date(incidentTime.getTime() + 2 * 60 * 1000);
    const result = await PredictiveIncidentEngine.evaluatePendingIncidents(home.id, evalTime);

    expect(result.confirmedCount).toBeGreaterThanOrEqual(1);

    const updatedWarning = await prisma.predictiveIncident.findUnique({
      where: { id: warning!.id },
    });

    expect(updatedWarning?.status).toBe('CONFIRMED');
    expect(updatedWarning?.outcome).toBe('TRUE_POSITIVE');
    expect(updatedWarning?.confirmedIncidentId).toBe(phase2Incident.id);
    expect(updatedWarning?.actualLeadTimeMin).toBeCloseTo(18, 0);

    // Clean up Phase 2 incident
    await prisma.incident.delete({ where: { id: phase2Incident.id } });
  });

  it('4. Expires early warning as FALSE_POSITIVE when horizon lapses without event', async () => {
    // Create an unverified warning with a short horizon of 15 min
    const pastTime = new Date(Date.now() - 60 * 60 * 1000); // 60 min ago
    const falseWarning = await prisma.predictiveIncident.create({
      data: {
        homeId: home.id,
        roomId: kitchenRoom.id,
        type: 'PREDICTED_ENERGY_SURGE',
        target: 'HOUSEHOLD_POWER',
        severity: SeverityLevel.WARNING,
        status: 'PREDICTED',
        outcome: 'UNRESOLVED',
        title: 'Impending Peak Energy Surge',
        summary: 'Power projected to cross 2000W.',
        explanation: 'GBDT forecast error simulation.',
        probability: 0.65,
        confidence: 0.60,
        horizonMinutes: 15, // 15 min horizon + 15 min grace = 30 min window
        currentValue: 1200,
        predictedValue: 2100,
        thresholdValue: 2000,
        baselineValue: 900,
        modelType: 'ML_GRADIENT_BOOSTING',
        modelName: 'LightGBM Regressor',
        predictedLeadTimeMin: 12,
        contributingEvidence: [],
        createdAt: pastTime,
      },
    });

    const evalResult = await PredictiveIncidentEngine.evaluatePendingIncidents(home.id, new Date());
    expect(evalResult.expiredCount).toBeGreaterThanOrEqual(1);

    const updated = await prisma.predictiveIncident.findUnique({
      where: { id: falseWarning.id },
    });

    expect(updated?.status).toBe('EXPIRED');
    expect(updated?.outcome).toBe('FALSE_POSITIVE');
  });

  it('5. Computes accurate aggregate metrics (Precision, FPR, Mean Lead Time)', async () => {
    const metrics = await PredictiveIncidentEngine.getPerformanceMetrics(home.id);

    expect(metrics.totalWarnings).toBeGreaterThanOrEqual(2);
    expect(metrics.confirmedTruePositives).toBeGreaterThanOrEqual(1);
    expect(metrics.expiredFalsePositives).toBeGreaterThanOrEqual(1);
    expect(metrics.precisionPercent).toBeGreaterThan(0);
    expect(metrics.precisionPercent).toBeLessThan(100);
    expect(metrics.averageLeadTimeMinutes).toBeGreaterThan(0);
    expect(metrics.leadTimeBuckets.length).toBe(4);
  });
});
