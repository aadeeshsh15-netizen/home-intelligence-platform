import { prisma } from '@/lib/db';
import { MqttGatewayService } from '@/server/iot/mqtt-gateway';
import { simulatorEngine } from '@/server/simulator/engine';
import { metricsService } from './metrics';
import {
  HealthStatusType,
  SubsystemHealthCheck,
  SystemHealthReport,
} from '@/domain/observability.schema';
import { DeviceStatus } from '@prisma/client';

export class SystemHealthService {
  /**
   * Evaluates health across all core subsystems and aggregates fleet status deterministically.
   */
  public static async evaluateHealth(): Promise<SystemHealthReport> {
    const timestamp = new Date().toISOString();

    // 1. Database Check
    let dbStatus: HealthStatusType = 'HEALTHY';
    let dbLatencyMs = 0;
    let dbMessage = 'PostgreSQL connection responsive';
    try {
      const dbStart = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      dbLatencyMs = Date.now() - dbStart;

      if (dbLatencyMs > 1000) {
        dbStatus = 'CRITICAL';
        dbMessage = `Database latency critically elevated (${dbLatencyMs}ms)`;
      } else if (dbLatencyMs > 200) {
        dbStatus = 'DEGRADED';
        dbMessage = `Database latency elevated (${dbLatencyMs}ms)`;
      }
    } catch (err) {
      dbStatus = 'CRITICAL';
      dbLatencyMs = 0;
      dbMessage = `Database unreachable: ${err instanceof Error ? err.message : String(err)}`;
    }

    const databaseCheck: SubsystemHealthCheck = {
      name: 'database',
      status: dbStatus,
      latencyMs: dbLatencyMs,
      message: dbMessage,
    };

    // 2. MQTT Gateway Check
    const mqttGateway = MqttGatewayService.getInstance();
    const mqttGatewayStatus = mqttGateway.getStatus();
    const isMqttConnected = mqttGateway.isGatewayConnected();

    const mqttCheck: SubsystemHealthCheck = {
      name: 'mqtt_gateway',
      status: isMqttConnected ? 'HEALTHY' : 'DEGRADED',
      message: isMqttConnected
        ? 'Connected to MQTT broker, listening for device telemetry and acks'
        : 'MQTT broker disconnected; running on local/simulated fallback',
      details: {
        brokerUrl: mqttGatewayStatus.brokerUrl,
        clientId: mqttGatewayStatus.clientId,
      },
    };

    // 3. Telemetry Ingestion Check
    let ingestionStatus: HealthStatusType = 'HEALTHY';
    let lastTelemetryTime: string | null = null;
    let ingestionMessage = 'Telemetry ingestion operational';

    try {
      const latestReading = await prisma.telemetryReading.findFirst({
        orderBy: { timestamp: 'desc' },
      });

      if (latestReading) {
        lastTelemetryTime = latestReading.timestamp.toISOString();
        const diffMin = (Date.now() - latestReading.timestamp.getTime()) / 60000;
        if (diffMin > 30) {
          ingestionStatus = 'DEGRADED';
          ingestionMessage = `No telemetry received for ${Math.round(diffMin)} minutes`;
        }
      } else {
        ingestionStatus = 'HEALTHY';
        ingestionMessage = 'No historical telemetry; awaiting first tick';
      }
    } catch {
      ingestionStatus = 'DEGRADED';
      ingestionMessage = 'Unable to query latest telemetry';
    }

    const snapshot = metricsService.getSnapshot();
    const ingestionCheck: SubsystemHealthCheck = {
      name: 'ingestion_pipeline',
      status: ingestionStatus,
      latencyMs: snapshot.latencies.ingestion.mean,
      message: ingestionMessage,
      details: {
        throughputPerSec: snapshot.throughputs.telemetryPerSec,
        validationFailures: snapshot.counters.validationFailures,
        duplicateRejections: snapshot.counters.duplicateRejections,
      },
    };

    // 4. Simulator Engine Check
    const simStatus = simulatorEngine.getStatus();
    const simulatorCheck: SubsystemHealthCheck = {
      name: 'simulator_engine',
      status: 'HEALTHY',
      message: simStatus.isRunning
        ? `Physics simulator active (${simStatus.activeAnomalies.length} active anomalies)`
        : 'Physics simulator standby',
      details: simStatus,
    };

    // 5. Intelligence Engine Check
    const intelligenceCheck: SubsystemHealthCheck = {
      name: 'intelligence_engine',
      status: 'HEALTHY',
      latencyMs: snapshot.latencies.predictionGeneration.mean,
      message: 'Statistical baselines, GBDT model, and analytical CDF reasoning active',
      details: {
        anomaliesDetected: snapshot.counters.anomaliesDetected,
        incidentsDetected: snapshot.counters.incidentsDetected,
        incidentsPredicted: snapshot.counters.incidentsPredicted,
      },
    };

    // 6. Automation & Actuator Dispatcher Check
    let automationStatus: HealthStatusType = 'HEALTHY';
    let automationMessage = 'Closed-loop automation engine active';

    const dispatched = snapshot.counters.commandsDispatched;
    const completed = snapshot.counters.commandsAcknowledged;
    const timeouts = snapshot.counters.commandsTimedOut;
    const rejected = snapshot.counters.commandsRejected;

    const commandSuccessRate =
      dispatched > 0 ? Number((completed / dispatched).toFixed(2)) : 1.0;

    if (dispatched >= 5) {
      if (commandSuccessRate < 0.5) {
        automationStatus = 'CRITICAL';
        automationMessage = `Command success rate critically low (${(commandSuccessRate * 100).toFixed(0)}%)`;
      } else if (commandSuccessRate < 0.8) {
        automationStatus = 'DEGRADED';
        automationMessage = `Command success rate degraded (${(commandSuccessRate * 100).toFixed(0)}%)`;
      }
    }

    const automationCheck: SubsystemHealthCheck = {
      name: 'automation_engine',
      status: automationStatus,
      latencyMs: snapshot.latencies.automationDecision.mean,
      message: automationMessage,
      details: {
        commandsDispatched: dispatched,
        commandsCompleted: completed,
        commandsTimedOut: timeouts,
        commandsRejected: rejected,
        successRate: commandSuccessRate,
      },
    };

    // 7. Device Fleet Health
    let onlineCount = 0;
    let staleCount = 0;
    let offlineCount = 0;
    let totalDevices = 0;

    try {
      const devices = await prisma.device.findMany({
        select: { status: true },
      });
      totalDevices = devices.length;
      for (const d of devices) {
        if (d.status === DeviceStatus.ONLINE) onlineCount++;
        else if (d.status === DeviceStatus.STALE) staleCount++;
        else offlineCount++;
      }
    } catch {
      // Fallback if db query fails
    }

    // Determine deterministic overall status
    let overallStatus: HealthStatusType = 'HEALTHY';
    if (databaseCheck.status === 'CRITICAL' || automationCheck.status === 'CRITICAL') {
      overallStatus = 'CRITICAL';
    } else if (
      databaseCheck.status === 'DEGRADED' ||
      mqttCheck.status === 'DEGRADED' ||
      ingestionCheck.status === 'DEGRADED' ||
      automationCheck.status === 'DEGRADED' ||
      staleCount > 0
    ) {
      overallStatus = 'DEGRADED';
    }

    // Counts of active incidents
    let activeIncidentsCount = 0;
    let predictedIncidentsCount = 0;
    try {
      [activeIncidentsCount, predictedIncidentsCount] = await Promise.all([
        prisma.incident.count({ where: { status: 'ACTIVE' } }),
        prisma.predictiveIncident.count({ where: { status: 'PREDICTED' } }),
      ]);
    } catch {}

    return {
      status: overallStatus,
      timestamp,
      subsystems: {
        database: databaseCheck,
        mqtt_gateway: mqttCheck,
        ingestion_pipeline: ingestionCheck,
        simulator_engine: simulatorCheck,
        intelligence_engine: intelligenceCheck,
        automation_engine: automationCheck,
      },
      fleet: {
        totalDevices,
        onlineCount,
        staleCount,
        offlineCount,
      },
      metrics: {
        lastTelemetryTimestamp: lastTelemetryTime,
        eventProcessingLatencyMs: snapshot.latencies.ingestion.mean,
        commandSuccessRate,
        activeIncidentsCount,
        predictedIncidentsCount,
      },
    };
  }
}
