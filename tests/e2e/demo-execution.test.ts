import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import { demoRunner } from '@/server/demo/runner';
import { querySystemEvents } from '@/server/observability/events';

describe('Phase 8: End-to-End Demo Scenario Execution Tests', () => {
  let home: any;

  beforeAll(async () => {
    home = await prisma.home.findFirst();
    if (!home) throw new Error('No test home found');
  });

  afterAll(async () => {
    demoRunner.reset();
  });

  it('starts scenario, advances steps, and completes execution with audit timeline tracking', async () => {
    const startStatus = await demoRunner.startScenario('NORMAL_HOUSEHOLD', home.id);

    expect(startStatus.active).toBe(true);
    expect(startStatus.scenarioId).toBe('NORMAL_HOUSEHOLD');
    expect(startStatus.currentStep).toBe(0);
    expect(startStatus.correlationId).toBeDefined();

    const correlationId = startStatus.correlationId!;

    // Step 1
    const step1 = await demoRunner.step();
    expect(step1.status.currentStep).toBe(1);
    expect(step1.stepDetails?.stepIndex).toBe(1);

    // Step 2
    const step2 = await demoRunner.step();
    expect(step2.status.currentStep).toBe(2);

    // Step 3 (Final step)
    const step3 = await demoRunner.step();
    expect(step3.status.currentStep).toBe(3);
    expect(step3.status.status).toBe('COMPLETED');

    // Verify causal audit timeline contains the demo events
    const timeline = await querySystemEvents({
      homeId: home.id,
      correlationId,
      limit: 10,
    });

    expect(timeline.totalCount).toBeGreaterThanOrEqual(2);
    const startEvent = timeline.events.find((e) => e.eventType === 'DEMO_SCENARIO_STARTED');
    expect(startEvent).toBeDefined();
    expect(startEvent?.summary).toContain('Nominal Household Baseline');

    const stepEvents = timeline.events.filter((e) => e.eventType === 'DEMO_STEP_EXECUTED');
    expect(stepEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('executes autoRun on CO2_VENTILATION scenario exercising real pipeline', async () => {
    const finalStatus = await demoRunner.autoRun('CO2_VENTILATION', 50, home.id);

    expect(finalStatus.status).toBe('COMPLETED');
    expect(finalStatus.currentStep).toBe(finalStatus.totalSteps);
    expect(finalStatus.history.length).toBe(finalStatus.totalSteps);
  });

  it('resets runner state cleanly to IDLE', () => {
    const resetStatus = demoRunner.reset();
    expect(resetStatus.active).toBe(false);
    expect(resetStatus.status).toBe('IDLE');
    expect(resetStatus.currentStep).toBe(0);
    expect(resetStatus.scenarioId).toBeNull();
  });
});
