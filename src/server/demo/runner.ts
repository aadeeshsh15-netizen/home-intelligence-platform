import { prisma } from '@/lib/db';
import { DEMO_SCENARIOS, DemoScenarioDefinition, DemoStep } from './scenarios';
import { processTelemetryIngest, IngestionSummary } from '@/server/telemetry/pipeline';
import { recordSystemEvent } from '@/server/observability/events';
import { logger } from '@/lib/logger';
import { IngestTelemetryPayload, SingleReading } from '@/domain/telemetry.schema';

export interface DemoRunnerStatus {
  active: boolean;
  scenarioId: string | null;
  scenarioTitle: string | null;
  currentStep: number;
  totalSteps: number;
  status: 'IDLE' | 'RUNNING' | 'STEP_COMPLETE' | 'COMPLETED' | 'ERROR';
  correlationId: string | null;
  lastError: string | null;
  history: Array<{
    step: number;
    title: string;
    timestamp: string;
    summary: IngestionSummary;
  }>;
}

export class DemoScenarioRunner {
  private static instance: DemoScenarioRunner | null = null;

  private activeScenario: DemoScenarioDefinition | null = null;
  private targetHomeId: string | null = null;
  private currentStepIndex: number = 0;
  private isAutoRunning: boolean = false;
  private status: 'IDLE' | 'RUNNING' | 'STEP_COMPLETE' | 'COMPLETED' | 'ERROR' = 'IDLE';
  private correlationId: string | null = null;
  private lastError: string | null = null;
  private history: Array<{
    step: number;
    title: string;
    timestamp: string;
    summary: IngestionSummary;
  }> = [];

  private constructor() {}

  public static getInstance(): DemoScenarioRunner {
    if (!DemoScenarioRunner.instance) {
      DemoScenarioRunner.instance = new DemoScenarioRunner();
    }
    return DemoScenarioRunner.instance;
  }

  public getAvailableScenarios(): DemoScenarioDefinition[] {
    return Object.values(DEMO_SCENARIOS);
  }

  public getStatus(): DemoRunnerStatus {
    return {
      active: this.activeScenario !== null,
      scenarioId: this.activeScenario?.id || null,
      scenarioTitle: this.activeScenario?.title || null,
      currentStep: this.currentStepIndex,
      totalSteps: this.activeScenario?.steps.length || 0,
      status: this.status,
      correlationId: this.correlationId,
      lastError: this.lastError,
      history: [...this.history],
    };
  }

  public async startScenario(scenarioId: string, homeId?: string): Promise<DemoRunnerStatus> {
    const scenario = DEMO_SCENARIOS[scenarioId];
    if (!scenario) {
      throw new Error(`Demo scenario ${scenarioId} not found`);
    }

    // Resolve target home
    let targetHome: any = null;
    if (homeId) {
      targetHome = await prisma.home.findUnique({ where: { id: homeId } });
    }
    if (!targetHome) {
      targetHome = await prisma.home.findFirst();
    }
    if (!targetHome) {
      throw new Error('No target home found in database for demo execution');
    }

    this.activeScenario = scenario;
    this.targetHomeId = targetHome.id;
    this.currentStepIndex = 0;
    this.status = 'RUNNING';
    this.correlationId = `demo_${scenario.id.toLowerCase()}_${Date.now()}`;
    this.lastError = null;
    this.history = [];

    await recordSystemEvent({
      homeId: targetHome.id,
      category: 'SYSTEM',
      eventType: 'DEMO_SCENARIO_STARTED',
      severity: 'INFO',
      source: 'DEMO_RUNNER',
      entityType: 'SYSTEM',
      summary: `Started demo scenario: ${scenario.title}`,
      metadata: {
        scenarioId: scenario.id,
        totalSteps: scenario.steps.length,
        correlationId: this.correlationId,
      },
      correlationId: this.correlationId,
    });

    logger.info('Demo scenario started', {
      scenarioId: scenario.id,
      homeId: targetHome.id,
      correlationId: this.correlationId,
      module: 'demo-runner',
    });

    return this.getStatus();
  }

  public async step(): Promise<{
    status: DemoRunnerStatus;
    stepDetails: DemoStep | null;
    ingestionSummary: IngestionSummary | null;
  }> {
    if (!this.activeScenario || !this.targetHomeId) {
      throw new Error('No active demo scenario. Call startScenario() first.');
    }
    const homeId = this.targetHomeId;

    if (this.currentStepIndex >= this.activeScenario.steps.length) {
      this.status = 'COMPLETED';
      return { status: this.getStatus(), stepDetails: null, ingestionSummary: null };
    }

    const currentStep = this.activeScenario.steps[this.currentStepIndex];
    const now = new Date();

    try {
      // Resolve physical/simulated sensors for the home
      const readings: SingleReading[] = [];

      for (const t of currentStep.telemetry) {
        let sensor: any = null;

        if (t.roomType) {
          // Find sensor in matching room
          sensor = await prisma.sensor.findFirst({
            where: {
              type: t.sensorType,
              room: {
                floor: { homeId: this.targetHomeId },
                name: { contains: t.roomType.replace('_', ' '), mode: 'insensitive' },
              },
            },
          });
        }

        // Fallback: any sensor in home with matching type
        if (!sensor) {
          sensor = await prisma.sensor.findFirst({
            where: {
              type: t.sensorType,
              room: { floor: { homeId: this.targetHomeId } },
            },
          });
        }

        if (sensor) {
          readings.push({
            sensorId: sensor.id,
            value: t.value,
            unit: t.unit || sensor.unit,
            timestamp: now.toISOString(),
            quality: 'VALID',
          });
        }
      }

      let summary: IngestionSummary = {
        processedCount: 0,
        rejectedCount: 0,
        duplicateCount: 0,
        errors: [],
        anomaliesDetected: 0,
        eventsTriggered: 0,
      };

      if (readings.length > 0) {
        const payload: IngestTelemetryPayload = {
          producerId: `demo:${this.activeScenario.id}`,
          readings,
        };
        summary = await processTelemetryIngest(payload);
      }

      this.currentStepIndex++;
      const isLastStep = this.currentStepIndex >= this.activeScenario.steps.length;
      this.status = isLastStep ? 'COMPLETED' : 'STEP_COMPLETE';

      this.history.push({
        step: currentStep.stepIndex,
        title: currentStep.title,
        timestamp: now.toISOString(),
        summary,
      });

      await recordSystemEvent({
        homeId,
        category: 'SYSTEM',
        eventType: 'DEMO_STEP_EXECUTED',
        severity: 'INFO',
        source: 'DEMO_RUNNER',
        entityType: 'SYSTEM',
        summary: `Executed Step ${currentStep.stepIndex}/${this.activeScenario.steps.length}: ${currentStep.title}`,
        metadata: {
          stepIndex: currentStep.stepIndex,
          expectedOutcome: currentStep.expectedOutcome,
          processedCount: summary.processedCount,
          anomaliesDetected: summary.anomaliesDetected,
        },
        correlationId: this.correlationId,
      });

      return {
        status: this.getStatus(),
        stepDetails: currentStep,
        ingestionSummary: summary,
      };
    } catch (err: any) {
      this.status = 'ERROR';
      this.lastError = err.message || String(err);
      logger.error('Error executing demo step', {
        stepIndex: currentStep.stepIndex,
        error: this.lastError,
        module: 'demo-runner',
      });
      throw err;
    }
  }

  public async autoRun(scenarioId: string, stepDelayMs: number = 1500, homeId?: string): Promise<DemoRunnerStatus> {
    await this.startScenario(scenarioId, homeId);

    while (this.activeScenario && this.currentStepIndex < this.activeScenario.steps.length) {
      await this.step();
      if (this.currentStepIndex < this.activeScenario.steps.length) {
        await new Promise((r) => setTimeout(r, stepDelayMs));
      }
    }

    return this.getStatus();
  }

  public reset(): DemoRunnerStatus {
    this.activeScenario = null;
    this.targetHomeId = null;
    this.currentStepIndex = 0;
    this.status = 'IDLE';
    this.correlationId = null;
    this.lastError = null;
    this.history = [];
    return this.getStatus();
  }
}

export const demoRunner = DemoScenarioRunner.getInstance();
