import { describe, it, expect } from 'vitest';
import {
  getOutdoorConditions,
  stepRoomTemperature,
  stepRoomCO2,
  stepRoomHumidity,
} from '../../src/server/simulator/physics';

describe('Simulator Physics & Thermodynamics', () => {
  it('generates continuous diurnal outdoor conditions with afternoon peak', () => {
    // 3:30 PM (15:30) should be near peak temperature
    const afternoon = new Date('2026-06-15T15:30:00Z');
    const afternoonConditions = getOutdoorConditions(afternoon);

    // 5:30 AM should be near minimum temperature
    const morning = new Date('2026-06-15T05:30:00Z');
    const morningConditions = getOutdoorConditions(morning);

    expect(afternoonConditions.temperature).toBeGreaterThan(morningConditions.temperature);
    expect(afternoonConditions.solarRadiation).toBeGreaterThan(0);
    expect(morningConditions.solarRadiation).toBe(0);
  });

  it('cools room down when HVAC cooling is active', () => {
    const initialTemp = 24.5;
    const outdoorTemp = 28.0;
    const solarRadiation = 0.5;

    const nextTemp = stepRoomTemperature(
      initialTemp,
      outdoorTemp,
      solarRadiation,
      true, // HVAC Active
      'COOLING',
      1,
      60 // 60 seconds
    );

    expect(nextTemp).toBeLessThan(initialTemp);
  });

  it('accumulates CO2 when occupants are present in poorly ventilated room', () => {
    const initialCO2 = 500;
    const nextCO2 = stepRoomCO2(initialCO2, 2, 0.0002, 60);

    expect(nextCO2).toBeGreaterThan(initialCO2);
  });

  it('rapidly elevates humidity during shower in bathroom', () => {
    const initialRH = 50.0;
    const showerRH = stepRoomHumidity(initialRH, 'BATHROOM', 1, true, false, 60);

    expect(showerRH).toBeGreaterThan(initialRH);
  });
});
