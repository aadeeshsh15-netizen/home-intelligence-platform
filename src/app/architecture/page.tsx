'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Cpu,
  Database,
  FileCode,
  Gauge,
  GitBranch,
  Network,
  Radio,
  Scale,
  ShieldCheck,
  Sliders,
  TrendingUp,
  Workflow,
  Zap,
} from 'lucide-react';

interface PipelineStage {
  id: number;
  name: string;
  tagline: string;
  subsystem: string;
  icon: any;
  color: string;
  inputs: string;
  outputs: string;
  algorithm: string;
  invariants: string[];
  keyFile: string;
}

const PIPELINE_STAGES: PipelineStage[] = [
  {
    id: 1,
    name: 'Physical & Simulated Sensors',
    tagline: 'Multi-modal telemetry generation and hardware sampling',
    subsystem: 'ESP32 DevKit C++ Firmware / Physics Simulator',
    icon: Cpu,
    color: 'border-sky-500/30 text-sky-400 bg-sky-500/10',
    inputs: 'DHT22 / BME280 (Temp, Humidity), MQ-135 (CO2), CT Clamp / Current (Power), Reed Contact, Simulator Physics',
    outputs: 'Raw timestamped sensor observations with UUID and physical units',
    algorithm: 'Deterministic continuous physical drift equations + Hardware interrupt polling (1Hz - 0.033Hz)',
    invariants: [
      'Zero microcontroller intelligence (edge generates telemetry only)',
      'Hardware NTP time-synchronization before telemetry dispatch',
    ],
    keyFile: 'firmware/src/main.cpp',
  },
  {
    id: 2,
    name: 'MQTT Wire Transport',
    tagline: 'Bidirectional asynchronous message broker',
    subsystem: 'Eclipse Mosquitto v2.0 (QoS 1)',
    icon: Radio,
    color: 'border-indigo-500/30 text-indigo-400 bg-indigo-500/10',
    inputs: 'MQTT Packets on home/{homeId}/device/{deviceId}/telemetry, status, ack',
    outputs: 'Verified MQTT payloads routed into MqttGatewayService',
    algorithm: 'QoS 1 publish/subscribe with Last Will & Testament (LWT) disconnect detection',
    invariants: [
      'Enforces strictly isolated tenant topic hierarchy home/{homeId}/...',
      'Automatic reconnect loop with exponential backoff and watchdog timers',
    ],
    keyFile: 'src/server/iot/mqtt-gateway.ts',
  },
  {
    id: 3,
    name: 'Telemetry Ingestion Gateway',
    tagline: 'Single authoritative consumer and routing pipeline',
    subsystem: 'MqttGatewayService + processTelemetryIngest()',
    icon: Network,
    color: 'border-blue-500/30 text-blue-400 bg-blue-500/10',
    inputs: 'IngestTelemetryPayload (Batch of single sensor readings with ISO timestamp)',
    outputs: 'IngestionSummary with validated counts, rejected counts, and latencies',
    algorithm: 'Atomic database transaction staging and downstream engine fanout',
    invariants: [
      'Unified ingestion gateway: simulated and physical hardware follow exact same contracts',
      'Out-of-order timestamp protection prevents historical ticks from clobbering live state',
    ],
    keyFile: 'src/server/telemetry/pipeline.ts',
  },
  {
    id: 4,
    name: 'Bounds & Consistency Validation',
    tagline: 'Physical boundary filtering and unit mismatch protection',
    subsystem: 'Validation Layer (validatePhysicalBounds / validateSensorUnit)',
    icon: Scale,
    color: 'border-cyan-500/30 text-cyan-400 bg-cyan-500/10',
    inputs: 'SingleReading { sensorId, value, unit, timestamp }',
    outputs: 'Validated reading array or rejection reason logged to audit store',
    algorithm: 'Thermodynamic bounds checking (e.g. Temp: -40°C to 75°C, CO2: 300 to 5000 ppm)',
    invariants: [
      'Physically impossible readings are rejected before touching analytics or database',
      'Duplicate readings at exact same (sensorId, timestamp) suppressed via skipDuplicates',
    ],
    keyFile: 'src/domain/telemetry.schema.ts',
  },
  {
    id: 5,
    name: 'Single-Sensor Anomaly Detection',
    tagline: 'Gaussian z-score and cyclical baseline divergence detection',
    subsystem: 'Phase 1 Anomaly Engine (evaluateTelemetryAnomaly)',
    icon: Activity,
    color: 'border-teal-500/30 text-teal-400 bg-teal-500/10',
    inputs: 'Validated single reading + Historical TelemetryBaseline { mean, stdDev }',
    outputs: 'Statistical anomaly insight with calculated zScore and deviation %',
    algorithm: 'z = (x - mu) / sigma against 168-hour (day-of-week, hour-of-day) rolling baselines',
    invariants: [
      'Zero static heuristic thresholds when baseline samples >= 10',
      'Statistical insights auto-deduplicated if existing active insight present',
    ],
    keyFile: 'src/server/intelligence/anomaly.ts',
  },
  {
    id: 6,
    name: 'Cross-Sensor Incident Correlation',
    tagline: 'Multi-modal spatio-temporal rule evaluation and confidence scoring',
    subsystem: 'Phase 2 CrossSensorCorrelationEngine',
    icon: AlertTriangle,
    color: 'border-amber-500/30 text-amber-400 bg-amber-500/10',
    inputs: 'Concurrent sensor telemetry across rooms within sliding window (60s - 900s)',
    outputs: 'Durable Incident record (COOKING_EVENT, WATER_LEAK, AC_FAILURE, etc.)',
    algorithm: 'Deterministic confidence = (sum satisfied weights / total weights) * distinctSensorFactor',
    invariants: [
      'Eliminates hallucinations: confidence strictly bound between 0.0 and 0.99 by mathematical formula',
      'Auto-resolves active incidents after 180s absence of sustaining evidence',
    ],
    keyFile: 'src/server/intelligence/correlation/engine.ts',
  },
  {
    id: 7,
    name: 'Multi-Horizon Learned Prediction',
    tagline: 'Multi-target forecasting using GBDT and statistical baselines',
    subsystem: 'Phase 3 & Phase 4 PredictionEngine (GBDT + Random Forest + Persistence)',
    icon: TrendingUp,
    color: 'border-purple-500/30 text-purple-400 bg-purple-500/10',
    inputs: '24-dimensional feature vector (lags, rolling stats, cyclical time encodings)',
    outputs: 'Forecast point estimate + 80% and 95% conformalized prediction intervals across 15m, 1h, 4h, 24h',
    algorithm: 'Decision Tree Ensemble Gradient Boosting Trees (GBDT) + Conformal Residual Quantiles',
    invariants: [
      'Strict chronological rolling-origin validation: zero temporal data leakage',
      'GBDT delivers 28.1% RMSE reduction over best seasonal statistical baseline on household power',
    ],
    keyFile: 'src/server/intelligence/prediction/providers/gradient-boosting.ts',
  },
  {
    id: 8,
    name: 'Anticipatory Incident Reasoning',
    tagline: 'Analytical normal CDF threshold crossing probability derivation',
    subsystem: 'Phase 5 PredictiveIncidentEngine',
    icon: Brain,
    color: 'border-pink-500/30 text-pink-400 bg-pink-500/10',
    inputs: 'Point forecast y_hat, predicted variance sigma, and target critical threshold T',
    outputs: 'PredictiveIncident record with analytical crossing probability P and lead time min',
    algorithm: 'P(Y >= T) = 1 - Phi((T - y_hat) / sigma) via Abramowitz & Stegun error function approximation',
    invariants: [
      'Evaluates only when probability >= minProbability and model confidence >= minConfidence',
      'Tracks ground-truth resolution: auto-evaluates TRUE_POSITIVE or FALSE_POSITIVE post-horizon',
    ],
    keyFile: 'src/server/intelligence/predictive-incidents/engine.ts',
  },
  {
    id: 9,
    name: 'Automation Decision Engine',
    tagline: 'Fail-closed policy evaluation and multi-tier safety constraints',
    subsystem: 'Phase 7 AutomationDecisionEngine + SafetyEvaluator',
    icon: Sliders,
    color: 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10',
    inputs: 'Active PredictiveIncident warnings + AutomationPolicy rules (AUTO / MANUAL / DISABLED)',
    outputs: 'CandidateAction approved or rejected with deterministic explanation proof',
    algorithm: 'Multi-tier safety checklist (device connectivity, low-voltage limits, cooldown timer, flapping damping)',
    invariants: [
      'Fail-closed: if any safety check fails, command dispatch is blocked and rejection audit logged',
      'Deterministic explainable text formulated without non-deterministic LLM generation',
    ],
    keyFile: 'src/server/automation/engine.ts',
  },
  {
    id: 10,
    name: 'Command Dispatcher',
    tagline: 'Idempotent actuator command delivery across protocols',
    subsystem: 'Phase 7 CommandDispatcher',
    icon: Zap,
    color: 'border-yellow-500/30 text-yellow-400 bg-yellow-500/10',
    inputs: 'Approved CandidateAction { deviceId, action, parameters, expiresInSec }',
    outputs: 'Durable DeviceCommand record with per-dispatch unique commandId',
    algorithm: 'MQTT QoS 1 command publication with fallback to virtual actuator physics in simulator',
    invariants: [
      'Commands expire deterministically if unacknowledged after timeout window',
      'In-flight command idempotency check prevents concurrent conflicting commands on same device',
    ],
    keyFile: 'src/server/automation/dispatcher.ts',
  },
  {
    id: 11,
    name: 'Physical / Simulated Actuation',
    tagline: 'Low-voltage GPIO triggering and thermodynamic state mutation',
    subsystem: 'ESP32 Firmware GPIO Relays / Simulator Thermodynamic Physics',
    icon: CheckCircle2,
    color: 'border-rose-500/30 text-rose-400 bg-rose-500/10',
    inputs: 'DeviceCommand wire payload (TURN_ON, TURN_OFF, SET_SPEED, SHED_LOAD)',
    outputs: 'Physical relay latch / virtual ventilation rate change + DeviceAckPayload',
    algorithm: 'GPIO digitalWrite() or virtual differential heat/CO2 transfer equation adjustment',
    invariants: [
      'Hardware responds with signed acknowledgement payload (COMPLETED / REJECTED / FAILED)',
      'Actuator state persisted in database with audit timestamp',
    ],
    keyFile: 'firmware/src/mqtt_manager.cpp',
  },
  {
    id: 12,
    name: 'Closed-Loop Verification & Observability',
    tagline: 'Empirical post-actuation verification and causal audit logging',
    subsystem: 'Phase 7 AutomationVerificationEngine + Phase 8 Observability',
    icon: Gauge,
    color: 'border-emerald-400 text-emerald-400 bg-emerald-500/10',
    inputs: 'Post-actuation telemetry readings over verification observation window',
    outputs: 'Terminal state: VERIFIED_EFFECTIVE / VERIFIED_INEFFECTIVE / INCONCLUSIVE + SystemEvent audit',
    algorithm: 'Delta M = M(t) - M(baseline) compared against required physical delta thresholds',
    invariants: [
      'Every automated action must prove its empirical effect on physical telemetry',
      'Complete unbroken causal chain logged from telemetry tick to closed-loop verification',
    ],
    keyFile: 'src/server/automation/verification.ts',
  },
];

export default function ArchitectureVisualizationPage() {
  const [selectedStageId, setSelectedStageId] = useState<number>(1);
  const selectedStage = PIPELINE_STAGES.find((s) => s.id === selectedStageId) || PIPELINE_STAGES[0];

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Workflow className="w-6 h-6 text-sky-400" />
            12-Stage System Architecture & Closed-Loop Control Flow
          </h1>
          <p className="text-xs text-slate-400 mt-1 font-mono">
            Sense → Detect → Correlate → Predict → Anticipate → Decide → Act → Verify → Audit
          </p>
        </div>

        <Link
          href="/observability"
          className="text-xs font-mono text-sky-400 hover:underline flex items-center gap-1"
        >
          View System Observability <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {/* Interactive Pipeline Track */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-4">
        <div className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-3">
          Pipeline Flow (Click stage to inspect contract details):
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {PIPELINE_STAGES.map((stage) => {
            const isSelected = stage.id === selectedStageId;
            const Icon = stage.icon;

            return (
              <button
                key={stage.id}
                onClick={() => setSelectedStageId(stage.id)}
                className={`p-2.5 rounded text-left transition-all border flex flex-col justify-between ${
                  isSelected
                    ? 'border-sky-500 bg-sky-500/15 shadow-lg shadow-sky-500/10'
                    : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 hover:bg-slate-900/60'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-[10px] font-mono text-slate-500 font-bold">STAGE {stage.id}</span>
                  <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-sky-400' : 'text-slate-400'}`} />
                </div>
                <div className="text-xs font-semibold text-slate-200 mt-1 line-clamp-1">
                  {stage.name}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Stage Detail Card */}
      <Card className="bg-slate-900/80 border-slate-800">
        <CardHeader className="pb-3 border-b border-slate-800">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <span className={`p-2 rounded border font-mono text-xs font-bold ${selectedStage.color}`}>
                STAGE {selectedStage.id}
              </span>
              <div>
                <CardTitle className="text-lg font-bold text-white">
                  {selectedStage.name}
                </CardTitle>
                <p className="text-xs text-slate-400 mt-0.5">{selectedStage.tagline}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge className="font-mono text-[10px] bg-slate-950 text-slate-300 border-slate-800">
                {selectedStage.subsystem}
              </Badge>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5 bg-slate-950/60 p-3 rounded border border-slate-800">
              <div className="text-[11px] font-mono uppercase text-slate-400 font-bold flex items-center gap-1.5">
                <ArrowRight className="w-3 h-3 text-sky-400" /> Inputs & Wire Contract
              </div>
              <p className="text-xs text-slate-300 leading-relaxed font-mono">
                {selectedStage.inputs}
              </p>
            </div>

            <div className="space-y-1.5 bg-slate-950/60 p-3 rounded border border-slate-800">
              <div className="text-[11px] font-mono uppercase text-slate-400 font-bold flex items-center gap-1.5">
                <ArrowRight className="w-3 h-3 text-emerald-400" /> Outputs & Downstream Handshake
              </div>
              <p className="text-xs text-slate-300 leading-relaxed font-mono">
                {selectedStage.outputs}
              </p>
            </div>
          </div>

          <div className="space-y-1.5 bg-slate-950/60 p-3 rounded border border-slate-800">
            <div className="text-[11px] font-mono uppercase text-slate-400 font-bold flex items-center gap-1.5">
              <Brain className="w-3 h-3 text-purple-400" /> Algorithmic Methodology
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              {selectedStage.algorithm}
            </p>
          </div>

          <div className="space-y-2 bg-slate-950/60 p-3 rounded border border-slate-800">
            <div className="text-[11px] font-mono uppercase text-slate-400 font-bold flex items-center gap-1.5">
              <ShieldCheck className="w-3 h-3 text-emerald-400" /> Architectural Invariants & Guarantees
            </div>
            <ul className="space-y-1 text-xs text-slate-300">
              {selectedStage.invariants.map((inv, i) => (
                <li key={i} className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span>{inv}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-center justify-between text-xs font-mono text-slate-500 pt-2 border-t border-slate-800">
            <span>Primary Code Implementation:</span>
            <span className="text-sky-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
              {selectedStage.keyFile}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
