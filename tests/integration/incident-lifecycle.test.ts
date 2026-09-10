import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src/lib/db';
import { CrossSensorCorrelationEngine } from '../../src/server/intelligence/correlation/engine';
import { IncidentCandidate } from '../../src/server/intelligence/correlation/types';
import { IncidentStatus, SeverityLevel } from '@prisma/client';

describe('Cross-Sensor Incident Lifecycle & Deduplication Integration', () => {
  let home: any;
  let kitchenRoom: any;
  let powderRoom: any;

  beforeAll(async () => {
    home = await prisma.home.findFirst();
    if (!home) throw new Error('No home found in test database');

    kitchenRoom = await prisma.room.findFirst({
      where: { floor: { homeId: home.id }, roomType: 'KITCHEN' },
    });
    powderRoom = await prisma.room.findFirst({
      where: { floor: { homeId: home.id }, roomType: 'BATHROOM' },
    });

    // Clean up any test incidents
    await prisma.incident.deleteMany({
      where: { homeId: home.id },
    });
  });

  afterAll(async () => {
    // Clean up test incidents
    if (home) {
      await prisma.incident.deleteMany({
        where: { homeId: home.id },
      });
    }
  });

  it('1. Persists a new incident candidate into the database with active status and audit trace', async () => {
    const now = new Date();
    const candidate: IncidentCandidate = {
      homeId: home.id,
      roomId: kitchenRoom.id,
      ruleId: 'rule-cooking-event',
      incidentType: 'COOKING_EVENT',
      severity: SeverityLevel.INFO,
      confidence: 0.88,
      title: 'Kitchen Cooking Activity',
      summary: 'Correlated culinary activity detected in Kitchen across 3 physical channels.',
      explanation: 'Occupancy + Power + Temperature rise detected.',
      evidence: [
        {
          sensorId: 'sensor-k-occ',
          sensorType: 'OCCUPANCY',
          roomName: kitchenRoom.name,
          signalType: 'VALUE_EQ',
          observedValue: 1,
          unit: '',
          weight: 0.25,
          satisfied: true,
          timestamp: now.toISOString(),
          explanation: 'Occupancy verified',
        },
        {
          sensorId: 'sensor-k-pwr',
          sensorType: 'POWER',
          roomName: kitchenRoom.name,
          signalType: 'VALUE_GT',
          observedValue: 1850,
          unit: 'W',
          weight: 0.30,
          satisfied: true,
          timestamp: now.toISOString(),
          explanation: 'Cooktop active',
        },
        {
          sensorId: 'sensor-k-pm',
          sensorType: 'PM2_5',
          roomName: kitchenRoom.name,
          signalType: 'VALUE_GT',
          observedValue: 45,
          unit: 'µg/m³',
          weight: 0.20,
          satisfied: true,
          timestamp: now.toISOString(),
          explanation: 'Particulates elevated',
        },
      ],
      firstDetectedAt: now,
      lastEvidenceAt: now,
      auditPayload: {
        ruleId: 'rule-cooking-event',
        timeWindowMinutes: 15,
        distinctSensorCount: 3,
        rawConfidence: 0.75,
        corroborationFactor: 0.90,
      },
    };

    const result = await CrossSensorCorrelationEngine.processIncidentCandidates([candidate], home.id, now);
    expect(result.created).toBe(1);
    expect(result.updated).toBe(0);

    const saved = await prisma.incident.findFirst({
      where: { homeId: home.id, incidentType: 'COOKING_EVENT', roomId: kitchenRoom.id },
    });

    expect(saved).toBeDefined();
    expect(saved?.status).toBe(IncidentStatus.ACTIVE);
    expect(saved?.confidence).toBe(0.88);
    expect(Array.isArray(saved?.evidence)).toBe(true);
    expect((saved?.evidence as any[]).length).toBe(3);
    expect(saved?.auditPayload).toHaveProperty('distinctSensorCount', 3);
  });

  it('2. Suppresses duplicates and merges evidence when the same incident continues to fire', async () => {
    const existingCountBefore = await prisma.incident.count({
      where: { homeId: home.id, incidentType: 'COOKING_EVENT', roomId: kitchenRoom.id },
    });
    expect(existingCountBefore).toBe(1);

    // Later timestamp with updated confidence and readings
    const laterTime = new Date(Date.now() + 60 * 1000);
    const subsequentCandidate: IncidentCandidate = {
      homeId: home.id,
      roomId: kitchenRoom.id,
      ruleId: 'rule-cooking-event',
      incidentType: 'COOKING_EVENT',
      severity: SeverityLevel.INFO,
      confidence: 0.94,
      title: 'Kitchen Cooking Activity',
      summary: 'Correlated culinary activity detected in Kitchen across 4 physical channels.',
      explanation: 'Updated evidence chain with thermal plume.',
      evidence: [
        {
          sensorId: 'sensor-k-occ',
          sensorType: 'OCCUPANCY',
          roomName: kitchenRoom.name,
          signalType: 'VALUE_EQ',
          observedValue: 1,
          unit: '',
          weight: 0.25,
          satisfied: true,
          timestamp: laterTime.toISOString(),
          explanation: 'Occupancy sustained',
        },
        {
          sensorId: 'sensor-k-pwr',
          sensorType: 'POWER',
          roomName: kitchenRoom.name,
          signalType: 'VALUE_GT',
          observedValue: 2100,
          unit: 'W',
          weight: 0.30,
          satisfied: true,
          timestamp: laterTime.toISOString(),
          explanation: 'Cooktop active',
        },
      ],
      firstDetectedAt: new Date(),
      lastEvidenceAt: laterTime,
      auditPayload: {
        ruleId: 'rule-cooking-event',
        timeWindowMinutes: 15,
        distinctSensorCount: 4,
        rawConfidence: 1.0,
        corroborationFactor: 0.99,
      },
    };

    const result = await CrossSensorCorrelationEngine.processIncidentCandidates([subsequentCandidate], home.id, laterTime);
    expect(result.created).toBe(0);
    expect(result.updated).toBe(1);

    // Verify row count has NOT increased
    const existingCountAfter = await prisma.incident.count({
      where: { homeId: home.id, incidentType: 'COOKING_EVENT', roomId: kitchenRoom.id },
    });
    expect(existingCountAfter).toBe(1);

    // Verify lastEvidenceAt and confidence were updated
    const updated = await prisma.incident.findFirst({
      where: { homeId: home.id, incidentType: 'COOKING_EVENT', roomId: kitchenRoom.id },
    });
    expect(updated?.confidence).toBe(0.94);
    expect(new Date(updated!.lastEvidenceAt).getTime()).toBe(laterTime.getTime());
  });

  it('3. Auto-resolves active incident when evidence ceases beyond cooldown threshold (180s)', async () => {
    // Set lastEvidenceAt to 200 seconds in the past
    const pastTime = new Date(Date.now() - 200 * 1000);
    await prisma.incident.updateMany({
      where: { homeId: home.id, incidentType: 'COOKING_EVENT' },
      data: { lastEvidenceAt: pastTime, status: IncidentStatus.ACTIVE },
    });

    const currentTime = new Date();
    // Process empty candidates (cooking has ended)
    const result = await CrossSensorCorrelationEngine.processIncidentCandidates([], home.id, currentTime);
    expect(result.resolved).toBeGreaterThanOrEqual(1);

    const incident = await prisma.incident.findFirst({
      where: { homeId: home.id, incidentType: 'COOKING_EVENT', roomId: kitchenRoom.id },
    });
    expect(incident?.status).toBe(IncidentStatus.RESOLVED);
    expect(incident?.resolvedAt).toBeDefined();
  });

  it('4. Handles multiple concurrent incidents across different rooms independently', async () => {
    const now = new Date();
    const candidateWaterLeak: IncidentCandidate = {
      homeId: home.id,
      roomId: powderRoom.id,
      ruleId: 'rule-water-leak',
      incidentType: 'WATER_LEAK',
      severity: SeverityLevel.CRITICAL,
      confidence: 0.90,
      title: 'Critical Water Leak: Powder Room',
      summary: 'Continuous flow in unoccupied bathroom.',
      explanation: 'Flow > 0.5 L/min + Occupancy 0.',
      evidence: [
        {
          sensorId: 'sensor-flow-1',
          sensorType: 'WATER_FLOW',
          roomName: powderRoom.name,
          signalType: 'VALUE_GT',
          observedValue: 4.5,
          unit: 'L/min',
          weight: 0.40,
          satisfied: true,
          timestamp: now.toISOString(),
        },
        {
          sensorId: 'sensor-occ-2',
          sensorType: 'OCCUPANCY',
          roomName: powderRoom.name,
          signalType: 'VALUE_EQ',
          observedValue: 0,
          unit: '',
          weight: 0.35,
          satisfied: true,
          timestamp: now.toISOString(),
        },
      ],
      firstDetectedAt: now,
      lastEvidenceAt: now,
      auditPayload: {
        distinctSensorCount: 2,
        rawConfidence: 0.75,
        corroborationFactor: 0.80,
      },
    };

    const res = await CrossSensorCorrelationEngine.processIncidentCandidates([candidateWaterLeak], home.id, now);
    expect(res.created).toBe(1);

    const allActive = await prisma.incident.findMany({
      where: { homeId: home.id, status: IncidentStatus.ACTIVE },
    });

    expect(allActive.length).toBe(1);
    expect(allActive[0].incidentType).toBe('WATER_LEAK');
    expect(allActive[0].severity).toBe(SeverityLevel.CRITICAL);
  });
});
