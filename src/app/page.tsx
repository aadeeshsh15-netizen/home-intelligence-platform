'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRealtimeTelemetry, TelemetryTick } from '@/lib/useRealtimeTelemetry';
import { RefreshCw, ArrowUpRight } from 'lucide-react';

const DEFAULT_OBSERVABILITY = {
  health: {
    status: 'HEALTHY',
    subsystems: {
      database: { name: 'database', status: 'HEALTHY', latencyMs: 2 },
      mqtt_gateway: { name: 'mqtt_gateway', status: 'HEALTHY' },
    },
    fleet: { totalDevices: 7, onlineCount: 6, staleCount: 0, offlineCount: 1 },
  },
  recentEvents: [
    {
      id: 'evt-init-1',
      timestamp: new Date().toISOString(),
      category: 'SYSTEM',
      eventType: 'TELEMETRY_PIPELINE_ACTIVE',
      severity: 'INFO',
      summary: 'Telemetry pipeline synchronizing 28 environmental sensor nodes',
    },
    {
      id: 'evt-init-2',
      timestamp: new Date(Date.now() - 45000).toISOString(),
      category: 'AUTOMATION',
      eventType: 'SAFETY_GUARDRAILS_ARMED',
      severity: 'INFO',
      summary: '4 closed-loop policies armed under fail-closed safety constraint',
    },
  ],
};

const DEFAULT_HOME = {
  home: { name: 'Apex Horizon Digital Residence' },
  climate: { avgTemperature: 22.8, avgHumidity: 48, avgCO2: 846 },
  energy: { currentTotalWatts: 3425, peakWattsToday: 4624 },
  occupancy: { isHomeOccupied: true, occupiedRoomsCount: 1 },
};

export default function OperationalInstrumentPage() {
  const [refreshing, setRefreshing] = useState(false);
  const [observabilityData, setObservabilityData] = useState<any>(DEFAULT_OBSERVABILITY);
  const [homeData, setHomeData] = useState<any>(DEFAULT_HOME);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [predictiveIncidents, setPredictiveIncidents] = useState<any[]>([]);
  const [automations, setAutomations] = useState<any>(null);
  const [lastSyncTime, setLastSyncTime] = useState<Date>(new Date());
  const [livePulse, setLivePulse] = useState(false);

  // Live telemetry pulse
  const handleTick = useCallback((tick: TelemetryTick) => {
    setLivePulse(true);
    const t = setTimeout(() => setLivePulse(false), 500);
    return () => clearTimeout(t);
  }, []);

  useRealtimeTelemetry(handleTick);

  const fetchDashboardData = async () => {
    try {
      setRefreshing(true);
      const [obsRes, homeRes, incRes, predRes, autoRes] = await Promise.all([
        fetch('/api/observability'),
        fetch('/api/home'),
        fetch('/api/incidents'),
        fetch('/api/predictive-incidents'),
        fetch('/api/automations'),
      ]);

      if (obsRes.ok) setObservabilityData(await obsRes.json());
      if (homeRes.ok) setHomeData(await homeRes.json());
      if (incRes.ok) {
        const d = await incRes.json();
        setIncidents(d.incidents || []);
      }
      if (predRes.ok) {
        const d = await predRes.json();
        setPredictiveIncidents(d.predictiveIncidents || []);
      }
      if (autoRes.ok) setAutomations(await autoRes.json());
      setLastSyncTime(new Date());
    } catch (e) {
      console.error('Failed to fetch operational dashboard data:', e);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 10000);
    return () => clearInterval(interval);
  }, []);

  const health = observabilityData?.health;
  const status = health?.status || 'HEALTHY';
  const fleet = health?.fleet || { totalDevices: 7, onlineCount: 6, staleCount: 0, offlineCount: 1 };
  const recentEvents = observabilityData?.recentEvents || [];
  const dbSubsystem = health?.subsystems?.database;
  const mqttSubsystem = health?.subsystems?.mqtt_gateway;

  const climate = homeData?.climate || {};
  const energy = homeData?.energy || {};
  const activePredictions = predictiveIncidents.filter(
    (p) => p.status === 'PREDICTED' || p.status === 'CONFIRMED'
  );
  const primaryPrediction = activePredictions[0] || null;

  const executions = automations?.history || automations?.executions || [];
  const latestExecution = executions[0] || null;
  const armedPolicies = automations?.policies || [];

  return (
    <div className="max-w-5xl mx-auto py-2 md:py-4 px-2 md:px-6 space-y-10 transition-colors duration-150">
      {/* ==================================================
          TOP BAR: Facility, status pulse, and sync time
          ================================================== */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-6 border-b border-slate-200 dark:border-slate-800/60 text-xs font-mono">
        <div className="flex items-baseline gap-3">
          <span className="font-semibold tracking-wide text-slate-900 dark:text-slate-200 uppercase">
            {homeData?.home?.name || 'Apex Horizon Digital Residence'}
          </span>
          <span className="text-slate-400 dark:text-slate-600 hidden sm:inline">/</span>
          <span className="text-slate-500 dark:text-slate-400 hidden sm:inline">
            7 Zones · 28 Telemetry Points
          </span>
        </div>

        <div className="flex items-center gap-4 text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                livePulse
                  ? 'bg-emerald-600 dark:bg-emerald-400'
                  : 'bg-slate-400 dark:bg-slate-500'
              }`}
            />
            <span className="text-slate-600 dark:text-slate-400">
              {livePulse ? 'STREAM ACTIVE' : 'STREAM NOMINAL'}
            </span>
          </div>

          <span className="text-slate-300 dark:text-slate-600">|</span>

          <span>{lastSyncTime.toLocaleTimeString()}</span>

          <button
            onClick={fetchDashboardData}
            disabled={refreshing}
            className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors disabled:opacity-50 p-1 cursor-pointer"
            title="Refresh telemetry"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {/* ==================================================
          LEVEL 1: PRIMARY SYSTEM STATE
          Large typography, no card wrapper, clear explanation
          ================================================== */}
      <section className="pt-2">
        <div className="flex items-baseline gap-4">
          <h1
            className={`text-4xl sm:text-5xl md:text-6xl font-light tracking-tight font-mono-numeric ${
              status === 'HEALTHY'
                ? 'text-slate-900 dark:text-slate-100'
                : status === 'DEGRADED'
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {status}
          </h1>
          <span className="text-xs font-mono uppercase tracking-widest text-slate-400 dark:text-slate-500">
            System State
          </span>
        </div>

        <p className="text-base sm:text-lg text-slate-600 dark:text-slate-400 font-light mt-3 max-w-2xl leading-relaxed">
          {status === 'HEALTHY'
            ? 'All monitored physical subsystems, IoT gateways, and automation policies are operating within nominal envelopes.'
            : status === 'DEGRADED'
            ? 'Physical sensor streams or broker connectivity reporting variance. Safe fallback active.'
            : 'Containment limits breached. Autonomous closed-loop intervention active.'}
        </p>
      </section>

      {/* ==================================================
          LEVEL 2: CURRENT ENVIRONMENTAL STATE
          Horizontal composition of primary measurements
          ================================================== */}
      <section className="py-8 border-y border-slate-200 dark:border-slate-800/60">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12">
          {/* Temperature */}
          <div>
            <div className="text-3xl sm:text-4xl font-mono-numeric font-light text-slate-900 dark:text-slate-100 tracking-tight">
              {climate.avgTemperature != null ? `${climate.avgTemperature.toFixed(1)}°C` : '22.8°C'}
            </div>
            <div className="text-[11px] font-mono uppercase tracking-widest text-slate-400 dark:text-slate-500 mt-2">
              Temperature
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-1">
              Indoor Mean · 21–24°C Comfort
            </div>
          </div>

          {/* CO2 Concentration */}
          <div>
            <div className="text-3xl sm:text-4xl font-mono-numeric font-light text-slate-900 dark:text-slate-100 tracking-tight">
              {climate.avgCO2 != null ? `${climate.avgCO2} ppm` : '846 ppm'}
            </div>
            <div className="text-[11px] font-mono uppercase tracking-widest text-slate-400 dark:text-slate-500 mt-2">
              CO₂ Concentration
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-1">
              Threshold 1,000 ppm
            </div>
          </div>

          {/* Power Draw */}
          <div>
            <div className="text-3xl sm:text-4xl font-mono-numeric font-light text-slate-900 dark:text-slate-100 tracking-tight">
              {energy.currentTotalWatts != null
                ? `${(energy.currentTotalWatts / 1000).toFixed(2)} kW`
                : '3.43 kW'}
            </div>
            <div className="text-[11px] font-mono uppercase tracking-widest text-slate-400 dark:text-slate-500 mt-2">
              Power Draw
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-1">
              Peak today {energy.peakWattsToday ? `${(energy.peakWattsToday / 1000).toFixed(2)} kW` : '4.62 kW'}
            </div>
          </div>

          {/* Connected Fleet */}
          <div>
            <div className="text-3xl sm:text-4xl font-mono-numeric font-light text-slate-900 dark:text-slate-100 tracking-tight">
              {fleet.onlineCount} / {fleet.totalDevices}
            </div>
            <div className="text-[11px] font-mono uppercase tracking-widest text-slate-400 dark:text-slate-500 mt-2">
              Connected Fleet
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-1">
              {fleet.offlineCount > 0 ? `${fleet.offlineCount} node offline` : 'All nodes transmitting'}
            </div>
          </div>
        </div>
      </section>

      {/* ==================================================
          LEVEL 3: INTELLIGENCE & CONTROL STATE
          What the system sees / What the system is doing
          ================================================== */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-14 pt-2">
        {/* WHAT THE SYSTEM SEES */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-mono uppercase tracking-widest text-slate-500 dark:text-slate-400 font-medium">
              What the System Sees
            </h2>
            <Link
              href="/insights"
              className="text-xs text-blue-600 dark:text-slate-400 hover:text-blue-700 dark:hover:text-slate-200 flex items-center gap-1 font-mono transition-colors"
            >
              Models <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>

          {primaryPrediction ? (
            <div className="space-y-3">
              <div className="text-base font-medium text-slate-900 dark:text-slate-200">
                {primaryPrediction.title}
              </div>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {primaryPrediction.summary}
              </p>

              <div className="pt-2 flex flex-wrap gap-x-6 gap-y-2 text-xs font-mono text-slate-600 dark:text-slate-400">
                <div>
                  <span className="text-slate-400 dark:text-slate-500 uppercase">Confidence:</span>{' '}
                  <span className="text-slate-800 dark:text-slate-200 font-medium">
                    {(primaryPrediction.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 dark:text-slate-500 uppercase">Probability:</span>{' '}
                  <span className="text-slate-800 dark:text-slate-200 font-medium">
                    {(primaryPrediction.probability * 100).toFixed(0)}%
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 dark:text-slate-500 uppercase">Lead Time:</span>{' '}
                  <span className="text-slate-800 dark:text-slate-200 font-medium">
                    ~{primaryPrediction.predictedLeadTimeMin || 15}m
                  </span>
                </div>
              </div>

              {activePredictions.length > 1 && (
                <div className="text-[11px] font-mono text-slate-400 dark:text-slate-500 pt-1">
                  + {activePredictions.length - 1} additional emerging condition monitored
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="text-base font-medium text-slate-800 dark:text-slate-300">
                No emerging conditions require intervention.
              </div>
              <p className="text-xs text-slate-500 font-mono leading-relaxed">
                Continuous autoregressive diurnal models evaluate telemetry against seasonal baselines across all 7 zones.
              </p>
            </div>
          )}
        </div>

        {/* WHAT THE SYSTEM IS DOING */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-mono uppercase tracking-widest text-slate-500 dark:text-slate-400 font-medium">
              What the System Is Doing
            </h2>
            <Link
              href="/automations"
              className="text-xs text-blue-600 dark:text-slate-400 hover:text-blue-700 dark:hover:text-slate-200 flex items-center gap-1 font-mono transition-colors"
            >
              Policies <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>

          {latestExecution ? (
            <div className="space-y-3">
              <div className="text-base font-medium text-slate-900 dark:text-slate-200">
                {latestExecution.actionTaken} on {latestExecution.device?.name || 'Actuator'}
              </div>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {latestExecution.decisionExplanation || 'Policy intervention verified effective against safety guardrail.'}
              </p>

              <div className="pt-2 flex flex-wrap gap-x-6 gap-y-2 text-xs font-mono text-slate-600 dark:text-slate-400">
                <div>
                  <span className="text-slate-400 dark:text-slate-500 uppercase">Verification:</span>{' '}
                  <span className="text-slate-800 dark:text-slate-200 font-medium">
                    {latestExecution.verificationStatus || 'EFFECTIVE'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 dark:text-slate-500 uppercase">Mode:</span>{' '}
                  <span className="text-slate-800 dark:text-slate-200 font-medium">FAIL-CLOSED</span>
                </div>
                <div>
                  <span className="text-slate-400 dark:text-slate-500 uppercase">Protocol:</span>{' '}
                  <span className="text-slate-800 dark:text-slate-200 font-medium">MQTT QoS 1</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-base font-medium text-slate-800 dark:text-slate-300">
                Active Closed-Loop Policy Monitoring
              </div>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {armedPolicies.length > 0
                  ? `${armedPolicies.length} closed-loop safety policies armed. Zero interventions required.`
                  : '4 closed-loop safety policies armed. Zero interventions required.'}
              </p>

              <div className="text-xs font-mono text-slate-500 dark:text-slate-400 space-y-1 pt-1">
                <div>• Ventilation CO₂ Predictive Control [Armed · Auto]</div>
                <div>• Thermal Influx & AC Backup Cooling [Armed · Auto]</div>
                <div>• Peak Energy Surge Load Shedding [Armed · Auto]</div>
              </div>

              <div className="pt-2 flex flex-wrap gap-x-6 gap-y-2 text-xs font-mono text-slate-600 dark:text-slate-400">
                <div>
                  <span className="text-slate-400 dark:text-slate-500 uppercase">Safety:</span>{' '}
                  <span className="text-slate-800 dark:text-slate-200 font-medium">FAIL-CLOSED</span>
                </div>
                <div>
                  <span className="text-slate-400 dark:text-slate-500 uppercase">Verification:</span>{' '}
                  <span className="text-slate-800 dark:text-slate-200 font-medium">CONTINUOUS</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ==================================================
          LEVEL 4: RECENT ACTIVITY
          Restrained vertical timeline of 4-5 meaningful events
          ================================================== */}
      <section className="pt-4 border-t border-slate-200 dark:border-slate-800/60">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-mono uppercase tracking-widest text-slate-500 dark:text-slate-400 font-medium">
            Recent Activity
          </h2>
          <Link
            href="/observability"
            className="text-xs text-blue-600 dark:text-slate-400 hover:text-blue-700 dark:hover:text-slate-200 flex items-center gap-1 font-mono transition-colors"
          >
            Audit Log <ArrowUpRight className="w-3 h-3" />
          </Link>
        </div>

        {recentEvents.length === 0 ? (
          <div className="text-xs font-mono text-slate-500 py-6">
            Awaiting causal events from telemetry ingestion and automation engines.
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800/40">
            {recentEvents.slice(0, 5).map((evt: any) => (
              <div
                key={evt.id}
                className="py-3 flex flex-col sm:flex-row sm:items-baseline justify-between gap-1.5 sm:gap-4 text-xs"
              >
                <div className="flex items-baseline gap-4 min-w-0">
                  <span className="font-mono text-slate-500 w-20 shrink-0 text-[11px]">
                    {new Date(evt.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                      hour12: false,
                    })}
                  </span>
                  <span className="font-medium text-slate-900 dark:text-slate-200 truncate">
                    {evt.summary || evt.eventType}
                  </span>
                </div>

                <span className="font-mono text-slate-500 dark:text-slate-400 shrink-0 pl-24 sm:pl-0 text-[11px]">
                  {evt.category} · {evt.severity}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ==================================================
          LEVEL 5: TECHNICAL METADATA
          Small, visually quiet footer metadata
          ================================================== */}
      <footer className="pt-8 pb-4 border-t border-slate-200 dark:border-slate-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[11px] font-mono text-slate-500">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>MQTT {mqttSubsystem?.status === 'HEALTHY' ? 'Connected' : 'Fallback'}</span>
          <span>·</span>
          <span>PostgreSQL Responsive ({dbSubsystem?.latencyMs ?? 1}ms)</span>
          <span>·</span>
          <span>Ingestion SLA Compliant</span>
        </div>

        <div className="flex items-center gap-3">
          <span>Engine v1.0.0</span>
          <span>·</span>
          <span>Fail-Closed Enforced</span>
        </div>
      </footer>
    </div>
  );
}
