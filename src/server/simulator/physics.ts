/**
 * Mathematical and physical models for realistic indoor environmental telemetry simulation.
 * Replaces random noise with thermodynamic equations, moisture conservation,
 * human metabolic exhalation, and realistic appliance power signatures.
 */

export interface OutdoorConditions {
  temperature: number; // °C
  humidity: number;    // %
  solarRadiation: number; // 0 to 1 normalized
}

export interface RoomThermalState {
  temperature: number;
  humidity: number;
  co2: number;
  occupancy: boolean;
  powerWatts: number;
  noiseDb: number;
}

/**
 * Calculates outdoor environmental conditions for any given timestamp.
 * Follows diurnal solar radiation and thermal lag.
 */
export function getOutdoorConditions(date: Date): OutdoorConditions {
  const hour = date.getUTCHours() + date.getUTCMinutes() / 60;
  
  // Daily temperature cycle: min at 5:30 AM, max at 3:30 PM (15:30)
  const tempBase = 16.0;
  const tempAmplitude = 6.5;
  const phaseShiftHours = 9.5; // Peak at 15:30
  const solarAngle = ((hour - phaseShiftHours) / 24) * 2 * Math.PI;
  const temperature = tempBase + tempAmplitude * Math.sin(solarAngle);

  // Humidity is inversely correlated with temperature outdoors
  const humidityBase = 68.0;
  const humidityAmplitude = 18.0;
  const humidity = Math.max(30, Math.min(95, humidityBase - humidityAmplitude * Math.sin(solarAngle)));

  // Solar radiation index (0 at night, peak at 12:00-13:00)
  let solarRadiation = 0;
  if (hour >= 6 && hour <= 19) {
    solarRadiation = Math.sin(((hour - 6) / 13) * Math.PI);
  }

  return {
    temperature: Number(temperature.toFixed(2)),
    humidity: Number(humidity.toFixed(2)),
    solarRadiation: Number(solarRadiation.toFixed(2)),
  };
}

/**
 * Simulates thermal transfer for an indoor room over deltaSeconds:
 * dT/dt = -k_wall * (T_in - T_out) + Q_solar + Q_internal + Q_hvac
 */
export function stepRoomTemperature(
  currentTemp: number,
  outdoorTemp: number,
  solarRadiation: number,
  hvacActive: boolean,
  hvacMode: 'COOLING' | 'HEATING' | 'OFF',
  occupantsCount: number,
  deltaSeconds: number = 30
): number {
  const kWall = 0.00012; // Wall heat transfer coefficient per second
  const deltaTOutdoor = (outdoorTemp - currentTemp) * kWall * deltaSeconds;

  // Solar gain through windows
  const solarGain = solarRadiation * 0.00025 * deltaSeconds;

  // Human metabolic sensible heat (~80W per person)
  const internalGain = occupantsCount * 0.00015 * deltaSeconds;

  // HVAC heating or cooling power
  let hvacEffect = 0;
  if (hvacActive) {
    if (hvacMode === 'COOLING') {
      hvacEffect = -0.0018 * deltaSeconds; // Drops ~1°C in ~9 minutes
    } else if (hvacMode === 'HEATING') {
      hvacEffect = 0.0022 * deltaSeconds;  // Raises ~1°C in ~8 minutes
    }
  }

  const newTemp = currentTemp + deltaTOutdoor + solarGain + internalGain + hvacEffect;
  // Natural subtle stochastic thermal fluctuation (sensor precision limit)
  const jitter = (Math.random() - 0.5) * 0.04;
  return Number((newTemp + jitter).toFixed(2));
}

/**
 * Simulates indoor CO2 mass balance:
 * dCO2/dt = G_people - Ventilation_Rate * (CO2_in - CO2_out)
 */
export function stepRoomCO2(
  currentCO2: number,
  occupantsCount: number,
  ventilationRate: number, // 0.0002 (closed window) to 0.002 (open window/active fan)
  deltaSeconds: number = 30
): number {
  const outdoorCO2 = 415; // Ambient background ppm
  // Each person exhales ~0.005 ppm equivalent per second in standard residential volume
  const generation = occupantsCount * 0.18 * deltaSeconds;
  const decay = ventilationRate * (currentCO2 - outdoorCO2) * deltaSeconds;

  const newCO2 = Math.max(outdoorCO2, currentCO2 + generation - decay);
  const jitter = (Math.random() - 0.5) * 2.0;
  return Number((newCO2 + jitter).toFixed(1));
}

/**
 * Simulates indoor relative humidity:
 * Couples to temperature (psychrometrics) plus occupant moisture and bathroom events.
 */
export function stepRoomHumidity(
  currentHumidity: number,
  roomType: string,
  occupantsCount: number,
  isShowerActive: boolean,
  ventilationFanActive: boolean,
  deltaSeconds: number = 30
): number {
  const baselineRH = 48.0;

  if (roomType === 'BATHROOM' && isShowerActive) {
    // Rapid moisture surge up to 85-95%
    const moistureSurge = 1.2 * (deltaSeconds / 30);
    return Math.min(96, Number((currentHumidity + moistureSurge).toFixed(1)));
  }

  // Ventilation or natural decay towards baseline
  const decayRate = ventilationFanActive ? 0.0025 : 0.0004;
  const decay = decayRate * (currentHumidity - baselineRH) * deltaSeconds;
  const occupantMoisture = occupantsCount * 0.02 * (deltaSeconds / 30);

  const newRH = Math.max(30, Math.min(80, currentHumidity - decay + occupantMoisture));
  const jitter = (Math.random() - 0.5) * 0.2;
  return Number((newRH + jitter).toFixed(1));
}

/**
 * Calculates realistic instantaneous power consumption based on room type,
 * time of day, active appliances, and baseline vampire draw.
 */
export function getSimulatedRoomPower(
  roomType: string,
  date: Date,
  occupancy: boolean,
  hvacActive: boolean
): number {
  const hour = date.getUTCHours() + date.getUTCMinutes() / 60;
  let power = 0;

  switch (roomType) {
    case 'LIVING_ROOM':
      power = 35; // Standby electronics, router
      if (occupancy) {
        power += 180; // TV, sound system, ambient LED lighting
        if (hour >= 18 && hour <= 23) power += 120; // Extra entertainment/lighting
      }
      if (hvacActive) power += 850; // Inverter heat pump cooling/heating
      break;

    case 'KITCHEN':
      power = 85; // Refrigerator compressor idle/cycle
      // Refrigerator compressor kick-in every ~40 mins (150W cycle)
      const fridgeCycle = Math.sin((hour * 60) / 40 * Math.PI) > 0.3;
      if (fridgeCycle) power += 140;

      // Breakfast cooking (7:00 - 8:30)
      if (hour >= 7 && hour <= 8.5 && occupancy) {
        power += 1400; // Coffee machine + induction burner
      }
      // Dinner cooking (18:30 - 20:30)
      if (hour >= 18.5 && hour <= 20.5 && occupancy) {
        power += 2200; // Oven / stove / exhaust
      }
      // Dishwasher cycle post-dinner (21:00 - 22:30)
      if (hour >= 21 && hour <= 22.5) {
        power += 1200;
      }
      break;

    case 'BEDROOM':
      power = 15; // Clock, charger standby
      if (occupancy) {
        if (hour >= 22 || hour <= 7) {
          power += 40; // CPAP or phone fast-charging + fan
        } else {
          power += 85; // Lighting, laptop
        }
      }
      if (hvacActive) power += 600;
      break;

    case 'OFFICE':
      power = 25; // Monitors standby
      if (occupancy) {
        power += 280; // Dual 4K monitors, desktop PC, desk lamp
      }
      break;

    case 'BATHROOM':
      power = 5;
      if (occupancy) {
        power += 110; // Vanity mirror lighting, exhaust fan
      }
      break;

    default:
      power = 20;
  }

  // Gaussian electrical noise
  const noise = (Math.random() - 0.5) * 8;
  return Math.max(5, Math.round(power + noise));
}
