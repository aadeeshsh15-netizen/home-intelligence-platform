import { prisma } from '@/lib/db';
import { SensorType, SeverityLevel } from '@prisma/client';
import {
  PredictiveIncidentRule,
  PredictiveIncidentRuleContext,
  PredictiveCandidate,
  PredictiveSensorEvidence,
} from './types';
import {
  calculateThresholdCrossingProbability,
  calculatePredictiveConfidence,
  interpolateCrossingMinute,
} from './math';
import { predictionEngine } from '../prediction/engine';
import { getOutdoorConditions } from '@/server/simulator/physics';

/**
 * 1. Predicted CO2 Ventilation Issue Rule
 */
export const RulePredictedCO2: PredictiveIncidentRule = {
  id: 'rule-predicted-co2',
  type: 'PREDICTED_CO2_VENTILATION',
  target: 'ROOM_CO2',
  name: 'Anticipated Indoor Air Quality Degradation / Ventilation Deficit',
  description:
    'Projects progressive CO2 accumulation in occupied rooms, predicting threshold breach before air quality becomes hazardous.',
  severity: SeverityLevel.WARNING,
  defaultHorizonMinutes: 60,

  async evaluate(context: PredictiveIncidentRuleContext): Promise<PredictiveCandidate | null> {
    const thresholdPpm = 1000.0;

    // Find rooms with CO2 sensors
    const co2Sensors = await prisma.sensor.findMany({
      where: {
        type: SensorType.CO2,
        room: { floor: { homeId: context.homeId } },
        ...(context.roomId ? { roomId: context.roomId } : {}),
      },
      include: { room: true },
    });

    for (const sensor of co2Sensors) {
      if (!sensor.roomId) continue;

      // Check current occupancy in the room
      const occSensor = await prisma.sensor.findFirst({
        where: { roomId: sensor.roomId, type: SensorType.OCCUPANCY },
      });
      const isOccupied = (occSensor?.lastReadingValue ?? 0) > 0.5;
      if (!isOccupied) continue;

      // Query forecast for this room
      const forecastResponse = await predictionEngine.getForecast({
        homeId: context.homeId,
        target: 'ROOM_CO2',
        roomId: sensor.roomId,
        horizon: '1h',
        stepMinutes: 15,
        referenceTime: context.currentTimestamp,
      });

      if (!forecastResponse.currentObserved || forecastResponse.forecast.length === 0) continue;

      const observedVal = sensor.lastReadingValue ?? forecastResponse.currentObserved.value;

      // Only trigger if currently below threshold but projected to breach
      if (observedVal >= thresholdPpm) continue;

      // Respiration accumulation in occupied room: ~4.0 ppm/min under active occupancy
      const accumulationRatePerMin = isOccupied ? 4.0 : 0.0;
      const effectivePoints = forecastResponse.forecast.map((p) => {
        const projected = Math.round(observedVal + accumulationRatePerMin * p.horizonMinutes);
        return {
          ...p,
          predicted: Math.max(p.predicted, projected),
        };
      });

      // Check if forecast crosses threshold
      const maxPredicted = Math.max(...effectivePoints.map((p) => p.predicted));
      if (maxPredicted < thresholdPpm) continue;

      // Find the forecast point with max predicted
      const breachPoint = effectivePoints.find((p) => p.predicted >= thresholdPpm) || effectivePoints[effectivePoints.length - 1];
      const standardError = breachPoint.standardError || 40.0;

      const crossingProb = calculateThresholdCrossingProbability(
        breachPoint.predicted,
        thresholdPpm,
        standardError,
        'UP'
      );

      // Trajectory interpolation
      const crossingMinutes = interpolateCrossingMinute(
        effectivePoints.map((p) => ({ horizonMinutes: p.horizonMinutes, predicted: p.predicted })),
        thresholdPpm,
        'UP'
      ) ?? breachPoint.horizonMinutes;

      const expectedCrossingTime = new Date(
        context.currentTimestamp.getTime() + crossingMinutes * 60 * 1000
      );

      // Evidence synthesis
      const evidence: PredictiveSensorEvidence[] = [
        {
          sensorId: sensor.id,
          sensorType: SensorType.CO2,
          roomName: sensor.room.name,
          role: 'PRIMARY_TARGET',
          observedValue: observedVal,
          unit: 'ppm',
          weight: 0.5,
          satisfied: true,
          explanation: `Current CO2 is ${observedVal} ppm, projected to reach ${breachPoint.predicted} ppm in ~${crossingMinutes} min.`,
        },
        {
          sensorId: occSensor?.id || 'occ-virtual',
          sensorType: SensorType.OCCUPANCY,
          roomName: sensor.room.name,
          role: 'CORROBORATING_CONTEXT',
          observedValue: isOccupied ? 1 : 0,
          unit: 'binary',
          weight: 0.5,
          satisfied: isOccupied,
          explanation: isOccupied
            ? 'Occupancy confirmed; human respiration driving accumulation.'
            : 'Unoccupied space; low accumulation likelihood.',
        },
      ];

      const satisfiedWeight = evidence.filter((e) => e.satisfied).reduce((s, e) => s + e.weight, 0);
      const totalWeight = evidence.reduce((s, e) => s + e.weight, 0);

      const confidence = calculatePredictiveConfidence({
        crossingProbability: crossingProb,
        satisfiedWeight,
        totalWeight,
        trendAligned: breachPoint.predicted > observedVal,
      });

      if (confidence < 0.60) continue;

      return {
        homeId: context.homeId,
        roomId: sensor.roomId,
        roomName: sensor.room.name,
        type: 'PREDICTED_CO2_VENTILATION',
        target: 'ROOM_CO2',
        severity: SeverityLevel.WARNING,
        title: `Predicted CO₂ Ventilation Issue in ${sensor.room.name}`,
        summary: `CO₂ in ${sensor.room.name} is currently normal (${observedVal} ppm) but forecasted to breach 1,000 ppm threshold in ~${crossingMinutes} minutes.`,
        explanation:
          `Predictive Reasoning Analysis:\n` +
          `• Current CO₂: ${observedVal} ppm (comfort limit: ${thresholdPpm} ppm)\n` +
          `• Forecasted Peak: ${breachPoint.predicted} ppm at horizon +${breachPoint.horizonMinutes}m (95% CI: ${breachPoint.confidenceInterval95.lower} - ${breachPoint.confidenceInterval95.upper} ppm)\n` +
          `• Calculated Threshold Breach Probability: ${(crossingProb * 100).toFixed(0)}%\n` +
          `• Room Occupancy: Confirmed active\n` +
          `• Recommended Action: Open window or enable mechanical ventilation ~${Math.max(5, crossingMinutes - 10)} min before anticipated breach.`,
        probability: crossingProb,
        confidence,
        horizonMinutes: breachPoint.horizonMinutes,
        currentValue: observedVal,
        predictedValue: breachPoint.predicted,
        thresholdValue: thresholdPpm,
        baselineValue: 450.0,
        confidenceInterval80: breachPoint.confidenceInterval80,
        confidenceInterval95: breachPoint.confidenceInterval95,
        modelType: forecastResponse.model.type,
        modelName: forecastResponse.model.name,
        expectedCrossingTime,
        predictedLeadTimeMin: crossingMinutes,
        contributingEvidence: evidence,
      };
    }

    return null;
  },
};

/**
 * 2. Predicted AC Failure / Thermal Inefficiency Rule
 */
export const RulePredictedACFailure: PredictiveIncidentRule = {
  id: 'rule-predicted-ac-failure',
  type: 'PREDICTED_AC_FAILURE',
  target: 'ROOM_TEMPERATURE',
  name: 'Anticipated Climate Control Cooling Failure',
  description:
    'Detects compressor energy consumption co-occurring with projected upward temperature departure before room overheats.',
  severity: SeverityLevel.ERROR,
  defaultHorizonMinutes: 60,

  async evaluate(context: PredictiveIncidentRuleContext): Promise<PredictiveCandidate | null> {
    const comfortThresholdC = 24.0;

    const tempSensors = await prisma.sensor.findMany({
      where: {
        type: SensorType.TEMPERATURE,
        room: { floor: { homeId: context.homeId } },
        ...(context.roomId ? { roomId: context.roomId } : {}),
      },
      include: { room: true },
    });

    for (const tempSensor of tempSensors) {
      if (!tempSensor.roomId) continue;

      // Check for HVAC power sensor in same room
      const hvacPowerSensor = await prisma.sensor.findFirst({
        where: {
          roomId: tempSensor.roomId,
          type: SensorType.POWER,
        },
      });

      const occSensor = await prisma.sensor.findFirst({
        where: { roomId: tempSensor.roomId, type: SensorType.OCCUPANCY },
      });

      const hvacPower = hvacPowerSensor?.lastReadingValue ?? 0;
      const isOccupied = (occSensor?.lastReadingValue ?? 0) > 0.5;

      // If HVAC is off, this is not an active failure
      if (hvacPower < 350) continue;

      const forecastResponse = await predictionEngine.getForecast({
        homeId: context.homeId,
        target: 'ROOM_TEMPERATURE',
        roomId: tempSensor.roomId,
        horizon: '1h',
        stepMinutes: 15,
        referenceTime: context.currentTimestamp,
      });

      if (!forecastResponse.currentObserved || forecastResponse.forecast.length === 0) continue;

      const observedVal = tempSensor.lastReadingValue ?? forecastResponse.currentObserved.value;
      if (observedVal >= comfortThresholdC) continue;

      // Thermal drift under active cooling failure: 0.03 °C/min
      const thermalDriftPerMin = hvacPower > 400 ? 0.03 : 0.0;
      const effectiveTempPoints = forecastResponse.forecast.map((p) => {
        const projected = Number((observedVal + thermalDriftPerMin * p.horizonMinutes).toFixed(2));
        return {
          ...p,
          predicted: Math.max(p.predicted, projected),
        };
      });

      // Only trigger if temperature is climbing towards/over threshold
      const peakPoint = effectiveTempPoints.reduce((max, p) => (p.predicted > max.predicted ? p : max), effectiveTempPoints[0]);
      if (peakPoint.predicted <= observedVal || peakPoint.predicted < 23.0) continue;

      const standardError = peakPoint.standardError || 0.15;
      const crossingProb = calculateThresholdCrossingProbability(
        peakPoint.predicted,
        comfortThresholdC,
        standardError,
        'UP'
      );

      const crossingMinutes = interpolateCrossingMinute(
        effectiveTempPoints.map((p) => ({ horizonMinutes: p.horizonMinutes, predicted: p.predicted })),
        comfortThresholdC,
        'UP'
      ) ?? peakPoint.horizonMinutes;

      const evidence: PredictiveSensorEvidence[] = [
        {
          sensorId: hvacPowerSensor?.id || 'power-virtual',
          sensorType: SensorType.POWER,
          roomName: tempSensor.room.name,
          role: 'HVAC_ACTUATOR',
          observedValue: hvacPower,
          unit: 'W',
          weight: 0.4,
          satisfied: hvacPower > 400,
          explanation: `Compressor drawing active power (${hvacPower}W) indicating cooling command active.`,
        },
        {
          sensorId: tempSensor.id,
          sensorType: SensorType.TEMPERATURE,
          roomName: tempSensor.room.name,
          role: 'PRIMARY_TARGET',
          observedValue: observedVal,
          unit: '°C',
          weight: 0.4,
          satisfied: peakPoint.predicted > observedVal,
          explanation: `Temperature is climbing (current: ${observedVal}°C, predicted: ${peakPoint.predicted}°C in ${peakPoint.horizonMinutes}m).`,
        },
        {
          sensorId: occSensor?.id || 'occ-virtual',
          sensorType: SensorType.OCCUPANCY,
          roomName: tempSensor.room.name,
          role: 'CORROBORATING_CONTEXT',
          observedValue: isOccupied ? 1 : 0,
          unit: 'binary',
          weight: 0.2,
          satisfied: isOccupied,
          explanation: isOccupied ? 'Occupants present suffering upcoming thermal discomfort.' : 'Unoccupied space.',
        },
      ];

      const satisfiedWeight = evidence.filter((e) => e.satisfied).reduce((s, e) => s + e.weight, 0);
      const totalWeight = evidence.reduce((s, e) => s + e.weight, 0);

      const confidence = calculatePredictiveConfidence({
        crossingProbability: crossingProb,
        satisfiedWeight,
        totalWeight,
        trendAligned: peakPoint.predicted > observedVal,
      });

      if (confidence < 0.65) continue;

      return {
        homeId: context.homeId,
        roomId: tempSensor.roomId,
        roomName: tempSensor.room.name,
        type: 'PREDICTED_AC_FAILURE',
        target: 'ROOM_TEMPERATURE',
        severity: SeverityLevel.ERROR,
        title: `Predicted AC Failure / Cooling Loss in ${tempSensor.room.name}`,
        summary: `HVAC compressor is actively drawing ${hvacPower}W in ${tempSensor.room.name}, yet temperature is forecast to climb to ${peakPoint.predicted}°C (comfort limit: ${comfortThresholdC}°C).`,
        explanation:
          `Thermodynamic Predictive Divergence:\n` +
          `• Compressor Power: ${hvacPower} W (Active)\n` +
          `• Current Temperature: ${observedVal} °C\n` +
          `• Predicted Temperature: ${peakPoint.predicted} °C in ~${crossingMinutes} min\n` +
          `• Probability of Overheating: ${(crossingProb * 100).toFixed(0)}%\n` +
          `• Diagnosis: Heat transfer is failing while energy is being consumed. Early warning of compressor stall, refrigerant leak, or clogged airflow.`,
        probability: crossingProb,
        confidence,
        horizonMinutes: peakPoint.horizonMinutes,
        currentValue: observedVal,
        predictedValue: peakPoint.predicted,
        thresholdValue: comfortThresholdC,
        baselineValue: 21.5,
        confidenceInterval80: peakPoint.confidenceInterval80,
        confidenceInterval95: peakPoint.confidenceInterval95,
        modelType: forecastResponse.model.type,
        modelName: forecastResponse.model.name,
        expectedCrossingTime: new Date(context.currentTimestamp.getTime() + crossingMinutes * 60 * 1000),
        predictedLeadTimeMin: crossingMinutes,
        contributingEvidence: evidence,
      };
    }

    return null;
  },
};

/**
 * 3. Predicted Household Energy Surge Rule (GBDT-backed)
 */
export const RulePredictedEnergySurge: PredictiveIncidentRule = {
  id: 'rule-predicted-energy-surge',
  type: 'PREDICTED_ENERGY_SURGE',
  target: 'HOUSEHOLD_POWER',
  name: 'Anticipated Household Electrical Surge / Peak Load',
  description:
    'Leverages Phase 4 GBDT tree ensembles to forecast impending peak demand spikes (> 2.5x baseline) across the next 1-4 hours.',
  severity: SeverityLevel.WARNING,
  defaultHorizonMinutes: 60,

  async evaluate(context: PredictiveIncidentRuleContext): Promise<PredictiveCandidate | null> {
    const surgeThresholdW = 2000.0;

    const powerSensors = await prisma.sensor.findMany({
      where: {
        type: SensorType.POWER,
        room: { floor: { homeId: context.homeId } },
      },
      include: { room: true },
    });

    if (powerSensors.length === 0) return null;
    const powerSensor = powerSensors[0];

    // Evaluate GBDT forecast
    const forecastResponse = await predictionEngine.getForecast({
      homeId: context.homeId,
      target: 'HOUSEHOLD_POWER',
      modelType: 'ML_GRADIENT_BOOSTING',
      horizon: '4h',
      stepMinutes: 15,
      referenceTime: context.currentTimestamp,
    });

    if (!forecastResponse.currentObserved || forecastResponse.forecast.length === 0) return null;

    const activeTotalPower = powerSensors.reduce((sum, s) => sum + (s.lastReadingValue ?? 0), 0);
    const observedVal = Math.max(activeTotalPower, forecastResponse.currentObserved.value);

    // Only alert if current usage is under surge threshold but future breaches
    if (observedVal >= surgeThresholdW) return null;

    const effectivePowerPoints = forecastResponse.forecast.map((p) => {
      const loadIncrement = activeTotalPower > 1300 ? (activeTotalPower - 1000) * 1.2 : 0;
      return {
        ...p,
        predicted: Math.round(p.predicted + loadIncrement),
      };
    });

    const surgePoint = effectivePowerPoints.find((p) => p.predicted >= surgeThresholdW);
    if (!surgePoint) return null;

    const standardError = surgePoint.standardError || 30.0;
    const crossingProb = calculateThresholdCrossingProbability(
      surgePoint.predicted,
      surgeThresholdW,
      standardError,
      'UP'
    );

    const crossingMinutes = interpolateCrossingMinute(
      effectivePowerPoints.map((p) => ({ horizonMinutes: p.horizonMinutes, predicted: p.predicted })),
      surgeThresholdW,
      'UP'
    ) ?? surgePoint.horizonMinutes;

    const evidence: PredictiveSensorEvidence[] = [
      {
        sensorId: powerSensor.id,
        sensorType: SensorType.POWER,
        roomName: powerSensor.room?.name || 'Main Panel',
        role: 'PRIMARY_TARGET',
        observedValue: observedVal,
        unit: 'W',
        weight: 0.7,
        satisfied: true,
        explanation: `Current active power is ${observedVal}W, forecasted to surge to ${surgePoint.predicted}W in ~${crossingMinutes} min.`,
      },
    ];

    const confidence = calculatePredictiveConfidence({
      crossingProbability: crossingProb,
      satisfiedWeight: 0.7,
      totalWeight: 0.7,
      trendAligned: true,
      modelReliabilityWeight: 0.95, // High reliability of promoted GBDT
    });

    if (confidence < 0.65 || crossingProb < 0.60) return null;

    return {
      homeId: context.homeId,
      roomId: powerSensor.roomId,
      roomName: powerSensor.room?.name || 'Household',
      type: 'PREDICTED_ENERGY_SURGE',
      target: 'HOUSEHOLD_POWER',
      severity: SeverityLevel.WARNING,
      title: 'Predicted Household Energy Surge',
      summary: `Household active power is projected to surge from ${observedVal}W to ${surgePoint.predicted}W (exceeding ${surgeThresholdW}W threshold) in ~${crossingMinutes} minutes.`,
      explanation:
        `GBDT Energy Peak Forecast:\n` +
        `• Current Load: ${observedVal} W (Nominal)\n` +
        `• Forecasted Peak: ${surgePoint.predicted} W at +${surgePoint.horizonMinutes}m horizon\n` +
        `• 95% Confidence Corridor: ${surgePoint.confidenceInterval95.lower} W to ${surgePoint.confidenceInterval95.upper} W\n` +
        `• Crossing Likelihood: ${(crossingProb * 100).toFixed(0)}%\n` +
        `• Peak Shaving Recommendation: Pre-cool space or defer discretionary EV/laundry loads prior to surge window.`,
      probability: crossingProb,
      confidence,
      horizonMinutes: surgePoint.horizonMinutes,
      currentValue: observedVal,
      predictedValue: surgePoint.predicted,
      thresholdValue: surgeThresholdW,
      baselineValue: 800.0,
      confidenceInterval80: surgePoint.confidenceInterval80,
      confidenceInterval95: surgePoint.confidenceInterval95,
      modelType: forecastResponse.model.type,
      modelName: forecastResponse.model.name,
      expectedCrossingTime: new Date(context.currentTimestamp.getTime() + crossingMinutes * 60 * 1000),
      predictedLeadTimeMin: crossingMinutes,
      contributingEvidence: evidence,
    };
  },
};

/**
 * 4. Predicted Thermal Envelope Breach Rule
 */
export const RulePredictedThermalBreach: PredictiveIncidentRule = {
  id: 'rule-predicted-thermal-breach',
  type: 'PREDICTED_THERMAL_BREACH',
  target: 'ROOM_TEMPERATURE',
  name: 'Anticipated Building Envelope Thermal Compromise',
  description:
    'Correlates window/door contact breach with severe outdoor thermal gradient, predicting steep indoor temperature collapse.',
  severity: SeverityLevel.WARNING,
  defaultHorizonMinutes: 30,

  async evaluate(context: PredictiveIncidentRuleContext): Promise<PredictiveCandidate | null> {
    const minComfortC = 18.0;

    const contactSensors = await prisma.sensor.findMany({
      where: {
        type: SensorType.CONTACT,
        room: { floor: { homeId: context.homeId } },
        ...(context.roomId ? { roomId: context.roomId } : {}),
      },
      include: { room: true },
    });

    const outdoor = getOutdoorConditions(context.currentTimestamp);
    // Severe thermal gradient: cold winter (< 12°C) or hot summer (> 30°C)
    const isThermalGradientSevere = outdoor.temperature < 12.0 || outdoor.temperature > 30.0;

    for (const contactSensor of contactSensors) {
      if (!contactSensor.roomId) continue;

      const isWindowOpen = (contactSensor.lastReadingValue ?? 0) === 1;
      if (!isWindowOpen || !isThermalGradientSevere) continue;

      const tempSensor = await prisma.sensor.findFirst({
        where: { roomId: contactSensor.roomId, type: SensorType.TEMPERATURE },
      });
      if (!tempSensor) continue;

      const currentTemp = tempSensor.lastReadingValue ?? 21.0;
      if (currentTemp <= minComfortC) continue; // Already breached

      // In cold weather with window open, dynamic cooling rate is ~0.15 °C/min
      const dropRatePerMin = 0.12;
      const expectedDropIn30m = dropRatePerMin * 30;
      const predicted30m = Math.max(outdoor.temperature, Number((currentTemp - expectedDropIn30m).toFixed(2)));

      if (predicted30m >= minComfortC) continue;

      const crossingMinutes = Math.max(5, Math.round((currentTemp - minComfortC) / dropRatePerMin));
      const crossingProb = 0.92;

      const evidence: PredictiveSensorEvidence[] = [
        {
          sensorId: contactSensor.id,
          sensorType: SensorType.CONTACT,
          roomName: contactSensor.room.name,
          role: 'CORROBORATING_CONTEXT',
          observedValue: 1,
          unit: 'binary',
          weight: 0.5,
          satisfied: true,
          explanation: `Exterior window contact reports OPEN in ${contactSensor.room.name}.`,
        },
        {
          sensorId: tempSensor.id,
          sensorType: SensorType.TEMPERATURE,
          roomName: contactSensor.room.name,
          role: 'PRIMARY_TARGET',
          observedValue: currentTemp,
          unit: '°C',
          weight: 0.5,
          satisfied: true,
          explanation: `Current indoor temp is ${currentTemp}°C against severe outdoor ambient of ${outdoor.temperature}°C.`,
        },
      ];

      const confidence = calculatePredictiveConfidence({
        crossingProbability: crossingProb,
        satisfiedWeight: 1.0,
        totalWeight: 1.0,
        trendAligned: true,
      });

      return {
        homeId: context.homeId,
        roomId: contactSensor.roomId,
        roomName: contactSensor.room.name,
        type: 'PREDICTED_THERMAL_BREACH',
        target: 'ROOM_TEMPERATURE',
        severity: SeverityLevel.WARNING,
        title: `Predicted Thermal Breach in ${contactSensor.room.name}`,
        summary: `Window open in ${contactSensor.room.name} with outdoor ambient at ${outdoor.temperature}°C; room temperature forecast to plunge below ${minComfortC}°C in ~${crossingMinutes} minutes.`,
        explanation:
          `Thermal Influx Model Analysis:\n` +
          `• Contact State: Exterior window open\n` +
          `• Outdoor Ambient: ${outdoor.temperature} °C (Thermal Gradient: ${Math.abs(currentTemp - outdoor.temperature).toFixed(1)} °C)\n` +
          `• Indoor Temperature: ${currentTemp} °C ──► Forecast: ${predicted30m} °C in 30 min\n` +
          `• Action: Close window immediately to avoid thermal envelope collapse and HVAC over-expenditure.`,
        probability: crossingProb,
        confidence,
        horizonMinutes: 30,
        currentValue: currentTemp,
        predictedValue: predicted30m,
        thresholdValue: minComfortC,
        baselineValue: 21.0,
        modelType: 'STATISTICAL_SEASONAL_DECAY',
        modelName: 'Thermal Decay Influx Model',
        expectedCrossingTime: new Date(context.currentTimestamp.getTime() + crossingMinutes * 60 * 1000),
        predictedLeadTimeMin: crossingMinutes,
        contributingEvidence: evidence,
      };
    }

    return null;
  },
};

export const PREDICTIVE_RULES: PredictiveIncidentRule[] = [
  RulePredictedCO2,
  RulePredictedACFailure,
  RulePredictedEnergySurge,
  RulePredictedThermalBreach,
];
