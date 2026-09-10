import { prisma } from '@/lib/db';
import {
  getOutdoorConditions,
  stepRoomTemperature,
  stepRoomCO2,
  stepRoomHumidity,
  getSimulatedRoomPower,
} from './physics';
import { processTelemetryIngest } from '../telemetry/pipeline';
import { evaluateDeviceAndSensorConnectivity } from '../event-engine/rules';
import { logger } from '@/lib/logger';

export interface AnomalyInjection {
  type: 'AC_FAILURE' | 'WINDOW_OPEN' | 'POWER_SURGE' | 'SHOWER_SURGE' | 'CO2_SPIKE';
  roomId: string;
  active: boolean;
  intensity: number; // 1.0 = normal
}

class TelemetrySimulatorEngine {
  private isRunning: boolean = false;
  private timer: NodeJS.Timeout | null = null;
  private injectedAnomalies: Map<string, AnomalyInjection> = new Map();

  public injectAnomaly(anomaly: AnomalyInjection) {
    this.injectedAnomalies.set(`${anomaly.roomId}_${anomaly.type}`, anomaly);
  }

  public clearAnomaly(roomId: string, type: AnomalyInjection['type']) {
    this.injectedAnomalies.delete(`${roomId}_${type}`);
  }

  public getActiveAnomalies(): AnomalyInjection[] {
    return Array.from(this.injectedAnomalies.values()).filter((a) => a.active);
  }

  /**
   * Advances the physical state of the home by one simulation step and pushes readings to the ingestion pipeline.
   */
  public async tick(): Promise<void> {
    try {
      const now = new Date();
      const outdoor = getOutdoorConditions(now);

      const rooms = await prisma.room.findMany({
        include: {
          sensors: true,
          devices: true,
        },
      });

      const readingsToIngest: {
        sensorId: string;
        timestamp: Date;
        value: number;
        quality: 'VALID' | 'DEGRADED' | 'INTERPOLATED';
      }[] = [];

      for (const room of rooms) {
        const hour = now.getHours() + now.getMinutes() / 60;

        // Occupancy heuristic by room type and hour
        let isOccupied = false;
        if (room.roomType === 'BEDROOM' && (hour >= 22.5 || hour <= 7.0)) {
          isOccupied = true;
        } else if (room.roomType === 'LIVING_ROOM' && hour >= 18.0 && hour <= 22.5) {
          isOccupied = true;
        } else if (room.roomType === 'KITCHEN' && ((hour >= 7.0 && hour <= 8.5) || (hour >= 18.5 && hour <= 20.5))) {
          isOccupied = true;
        } else if (room.roomType === 'OFFICE' && hour >= 9.0 && hour <= 17.5) {
          isOccupied = true;
        }

        // Check active anomalies for this room
        const acFailure = this.injectedAnomalies.get(`${room.id}_AC_FAILURE`)?.active;
        const windowOpen = this.injectedAnomalies.get(`${room.id}_WINDOW_OPEN`)?.active;
        const powerSurge = this.injectedAnomalies.get(`${room.id}_POWER_SURGE`)?.active;
        const showerSurge = this.injectedAnomalies.get(`${room.id}_SHOWER_SURGE`)?.active;
        const co2Spike = this.injectedAnomalies.get(`${room.id}_CO2_SPIKE`)?.active;

        const hvacActive = !acFailure && (isOccupied || Math.abs((room.targetTemp || 21.5) - outdoor.temperature) > 3.0);
        const hvacMode = outdoor.temperature > 22.0 ? 'COOLING' : 'HEATING';

        for (const sensor of room.sensors) {
          const currentVal = sensor.lastReadingValue ?? 21.0;
          let nextVal = currentVal;

          switch (sensor.type) {
            case 'TEMPERATURE':
              if (windowOpen) {
                // Room drifts rapidly toward outdoor temperature
                nextVal = currentVal + (outdoor.temperature - currentVal) * 0.08;
              } else {
                const targetTemp = room.targetTemp || 21.5;
                let active = false;
                let mode: 'COOLING' | 'HEATING' | 'OFF' = 'OFF';
                if (!acFailure) {
                  if (currentVal > targetTemp + 0.3) {
                    active = true;
                    mode = 'COOLING';
                  } else if (currentVal < targetTemp - 0.3) {
                    active = true;
                    mode = 'HEATING';
                  }
                }
                nextVal = stepRoomTemperature(
                  currentVal,
                  outdoor.temperature,
                  outdoor.solarRadiation,
                  active,
                  mode,
                  isOccupied ? 1 : 0,
                  5
                );
              }
              break;

            case 'HUMIDITY':
              nextVal = stepRoomHumidity(
                currentVal,
                room.roomType,
                isOccupied ? 1 : 0,
                showerSurge || (room.roomType === 'BATHROOM' && hour >= 7.2 && hour <= 7.5),
                false,
                5
              );
              break;

            case 'CO2':
              if (co2Spike) {
                nextVal = Math.min(2600, currentVal + 28);
              } else {
                const ventRate = windowOpen ? 0.003 : 0.0003;
                nextVal = stepRoomCO2(currentVal, isOccupied ? 2 : 0, ventRate, 5);
              }
              break;

            case 'POWER':
              let basePower = getSimulatedRoomPower(room.roomType, now, isOccupied, hvacActive);
              if (powerSurge) {
                basePower += 2800; // e.g. faulty heating element or EV charger rogue draw
              }
              nextVal = basePower;
              break;

            case 'OCCUPANCY':
              nextVal = isOccupied ? 1 : 0;
              break;

            case 'LIGHT':
              let lux = outdoor.solarRadiation * 800;
              if (isOccupied && (hour < 7 || hour > 18)) lux += 350;
              nextVal = Math.max(5, Math.round(lux + (Math.random() - 0.5) * 10));
              break;

            case 'NOISE':
              let db = 32; // Quiet ambient
              if (isOccupied) db = room.roomType === 'LIVING_ROOM' ? 58 : 46;
              nextVal = Math.round(db + (Math.random() - 0.5) * 4);
              break;

            case 'PM2_5':
              let pm = 8.0;
              if (room.roomType === 'KITCHEN' && hour >= 19.0 && hour <= 19.8) pm = 48.0; // Sautéing
              nextVal = Number((pm + (Math.random() - 0.5) * 1.5).toFixed(1));
              break;
          }

          readingsToIngest.push({
            sensorId: sensor.id,
            timestamp: now,
            value: nextVal,
            quality: 'VALID',
          });
        }
      }

      if (readingsToIngest.length > 0) {
        await processTelemetryIngest({
          producerId: 'simulated-physics-engine',
          readings: readingsToIngest,
        });
      }

      // Check device connectivity timeouts and stale sensor states
      await evaluateDeviceAndSensorConnectivity(120);
    } catch (err) {
      logger.error('TelemetrySimulatorEngine tick error', { module: 'simulator' }, err as Error);
    }
  }

  public start(intervalMs: number = 5000) {
    if (this.isRunning) return;
    this.isRunning = true;
    logger.info(`TelemetrySimulatorEngine started with ${intervalMs}ms cadence`, { module: 'simulator' });
    this.timer = setInterval(() => {
      this.tick();
    }, intervalMs);
  }

  public stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    logger.info('TelemetrySimulatorEngine stopped', { module: 'simulator' });
  }

  public getStatus() {
    return {
      isRunning: this.isRunning,
      activeAnomalies: this.getActiveAnomalies(),
    };
  }
}

// Global singleton for server runtime
const globalSimulator = globalThis as unknown as {
  simulatorEngine: TelemetrySimulatorEngine | undefined;
};

export const simulatorEngine = globalSimulator.simulatorEngine ?? new TelemetrySimulatorEngine();
if (process.env.NODE_ENV !== 'production') {
  globalSimulator.simulatorEngine = simulatorEngine;
}
