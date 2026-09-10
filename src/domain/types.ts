import { SensorType, SensorHealth, DeviceStatus, DeviceProtocol, SeverityLevel, EventStatus, InsightType } from '@prisma/client';

export type {
  SensorType,
  SensorHealth,
  DeviceStatus,
  DeviceProtocol,
  SeverityLevel,
  EventStatus,
  InsightType
};

export interface RoomWithSensors {
  id: string;
  floorId: string;
  name: string;
  roomType: string;
  targetTemp: number | null;
  layoutX: number;
  layoutY: number;
  layoutW: number;
  layoutH: number;
  devices: DeviceSummary[];
  sensors: SensorSummary[];
  metrics: {
    temperature?: number;
    humidity?: number;
    co2?: number;
    power?: number;
    occupancy?: boolean;
    noise?: number;
    pm2_5?: number;
  };
  activeAlertCount: number;
}

export interface DeviceSummary {
  id: string;
  roomId: string;
  name: string;
  deviceType: string;
  protocol: DeviceProtocol;
  identifier: string;
  status: DeviceStatus;
  lastSeenAt: Date | string;
  firmwareVersion?: string | null;
}

export interface SensorSummary {
  id: string;
  roomId: string;
  deviceId?: string | null;
  type: SensorType;
  unit: string;
  samplingIntervalSec: number;
  lastReadingValue?: number | null;
  lastReadingTime?: Date | string | null;
  health: SensorHealth;
}

export interface HomeOverview {
  home: {
    id: string;
    name: string;
    timezone: string;
    totalFloors: number;
    totalRooms: number;
    totalDevices: number;
    totalSensors: number;
  };
  climate: {
    avgTemperature: number;
    avgHumidity: number;
    avgCO2: number;
    airQualityStatus: 'EXCELLENT' | 'GOOD' | 'MODERATE' | 'POOR';
  };
  energy: {
    currentTotalWatts: number;
    todayKwh: number;
    peakWattsToday: number;
    baselineComparisonPercent: number;
  };
  occupancy: {
    isHomeOccupied: boolean;
    occupiedRoomsCount: number;
    occupiedRoomNames: string[];
  };
  fleetHealth: {
    totalDevices: number;
    onlineDevices: number;
    degradedDevices: number;
    offlineDevices: number;
    staleSensors: number;
  };
  activeAlertsCount: number;
}

export interface AnomalyExplanation {
  sensorId: string;
  sensorType: SensorType;
  roomName: string;
  currentValue: number;
  baselineMean: number;
  baselineStdDev: number;
  zScore: number;
  deviationPercent: number;
  isHeuristic: boolean;
  timestamp: string;
  narrative: string;
}
