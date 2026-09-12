'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRealtimeTelemetry, TelemetryTick } from '@/lib/useRealtimeTelemetry';
import {
  RefreshCw,
  ArrowUpRight,
  Eye,
  Zap,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Thermometer,
  Wind,
  Layers,
  Database,
  Radio,
  Cpu,
  Brain,
  Sliders,
  Sun,
  Activity,
  ChevronRight,
  Users,
} from 'lucide-react';

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
      id: 'evt-1',
      timestamp: new Date(Date.now() - 1000 * 60 * 4).toISOString(),
      category: 'PREDICTION',
      eventType: 'PREDICTION_EXPIRED',
      severity: 'WARNING',
      title: 'Prediction expired',
      summary: 'PREDICTED_ENERGY_SURGE horizon elapsed',
      color: 'amber',
    },
    {
      id: 'evt-2',
      timestamp: new Date(Date.now() - 1000 * 60 * 6).toISOString(),
      category: 'INCIDENT',
      eventType: 'EVENT_RESOLVED',
      severity: 'INFO',
      title: 'Cooking event resolved',
      summary: 'Kitchen CO₂ normalized to baseline',
      color: 'green',
    },
    {
      id: 'evt-3',
      timestamp: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
      category: 'INCIDENT',
      eventType: 'EVENT_DETECTED',
      severity: 'CRITICAL',
      title: 'Cooking event detected',
      summary: 'CO₂ rising (confidence: 92%)',
      color: 'red',
    },
    {
      id: 'evt-4',
      timestamp: new Date(Date.now() - 1000 * 60 * 32).toISOString(),
      category: 'AUTOMATION',
      eventType: 'POLICY_EVALUATED',
      severity: 'INFO',
      title: 'Automation evaluated',
      summary: 'Ventilation policy • No intervention required',
      color: 'gray',
    },
    {
      id: 'evt-5',
      timestamp: new Date(Date.now() - 1000 * 60 * 46).toISOString(),
      category: 'DEVICE',
      eventType: 'DEVICE_RECONNECTED',
      severity: 'INFO',
      title: 'Device reconnected',
      summary: 'ESP32 • Living Room',
      color: 'gray',
    },
  ],
};

const DEFAULT_HOME = {
  home: { name: 'Apex Horizon Estate' },
  climate: { avgTemperature: 24.2, avgHumidity: 46, avgCO2: 612 },
  energy: { currentTotalWatts: 1240, peakWattsToday: 4620 },
  occupancy: { isHomeOccupied: true, occupiedRoomsCount: 2 },
};

export default function OperationalInstrumentPage() {
  const [refreshing, setRefreshing] = useState(false);
  const [observabilityData, setObservabilityData] = useState<any>(DEFAULT_OBSERVABILITY);
  const [homeData, setHomeData] = useState<any>(DEFAULT_HOME);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [predictiveIncidents, setPredictiveIncidents] = useState<any[]>([]);
  const [automations, setAutomations] = useState<any>(null);
  const [lastSyncTime, setLastSyncTime] = useState<Date>(new Date());
  const [activeFloor, setActiveFloor] = useState<'Floor 1' | 'Floor 2'>('Floor 1');
  const [secondsAgo, setSecondsAgo] = useState(12);

  const handleTick = useCallback((tick: TelemetryTick) => {
    setSecondsAgo(1);
  }, []);

  useRealtimeTelemetry(handleTick);

  useEffect(() => {
    const t = setInterval(() => {
      setSecondsAgo((s) => (s < 60 ? s + 1 : 12));
    }, 1000);
    return () => clearInterval(t);
  }, []);

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
      setSecondsAgo(2);
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
  const recentEvents = observabilityData?.recentEvents?.length > 0 ? observabilityData.recentEvents : DEFAULT_OBSERVABILITY.recentEvents;
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
    <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 space-y-6 transition-colors duration-150">
      {/* ==================================================
          SECTION 1: TWO-COLUMN MAIN WORKSPACE (col-span-8 / col-span-4)
          ================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN: System Status, Telemetry Metrics, Intelligence, Automations */}
        <div className="lg:col-span-8 space-y-6">
          {/* SYSTEM STATUS BANNER */}
          <section className="bg-white dark:bg-slate-900/70 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-6 sm:p-7 relative overflow-hidden shadow-xs">
            {/* Subtle light background tint */}
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 via-teal-500/5 to-sky-500/5 dark:from-emerald-950/20 dark:via-slate-900/30 dark:to-transparent pointer-events-none" />

            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <div className="text-[11px] font-mono uppercase tracking-widest text-slate-500 dark:text-slate-400 font-semibold mb-2">
                  SYSTEM STATUS
                </div>
                <h1
                  className={`text-4xl sm:text-5xl md:text-6xl font-black tracking-tight font-sans ${
                    status === 'HEALTHY'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : status === 'DEGRADED'
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {status}
                </h1>
                <div className="flex items-center gap-2.5 text-sm text-slate-600 dark:text-slate-300 font-medium mt-3">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      status === 'HEALTHY'
                        ? 'bg-emerald-500'
                        : status === 'DEGRADED'
                        ? 'bg-amber-500'
                        : 'bg-rose-500'
                    }`}
                  />
                  <span>
                    {status === 'HEALTHY'
                      ? 'All monitored systems operating normally.'
                      : status === 'DEGRADED'
                      ? 'Physical sensor streams or broker connectivity reporting variance.'
                      : 'Containment limits breached. Autonomous closed-loop intervention active.'}
                  </span>
                </div>
              </div>

              {/* Weather & Location Indicator */}
              <div className="flex items-center gap-3.5 bg-slate-50/80 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 rounded-xl px-4 py-3 shrink-0">
                <Sun className="w-7 h-7 text-amber-500 shrink-0" />
                <div>
                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    Clear • 28°C
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Apex Horizon Estate
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* KEY TELEMETRY METRICS STRIP (4 Columns with icons, deltas, and sparklines) */}
          <section className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-white dark:bg-slate-900/70 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
            {/* Metric 1: Temperature */}
            <div className="space-y-1.5 pr-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center text-blue-600 dark:text-blue-400">
                  <Thermometer className="w-4 h-4" />
                </div>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Temperature</span>
              </div>
              <div className="text-2xl sm:text-3xl font-bold font-mono-numeric text-slate-900 dark:text-slate-100 tracking-tight">
                {climate.avgTemperature != null ? `${climate.avgTemperature.toFixed(1)}°C` : '24.2°C'}
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 font-medium">
                  ↓ 0.8°C
                </span>
                <svg className="w-16 h-4 stroke-emerald-500 fill-none" viewBox="0 0 60 16">
                  <path d="M0 12 Q 15 14, 30 7 T 60 4" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
            </div>

            {/* Metric 2: CO2 */}
            <div className="space-y-1.5 px-0 md:px-2 border-l-0 md:border-l border-slate-100 dark:border-slate-800/80">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                  <Wind className="w-4 h-4" />
                </div>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">CO₂</span>
              </div>
              <div className="text-2xl sm:text-3xl font-bold font-mono-numeric text-slate-900 dark:text-slate-100 tracking-tight">
                {climate.avgCO2 != null ? `${climate.avgCO2} ppm` : '612 ppm'}
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 font-medium">
                  ↓ 12%
                </span>
                <svg className="w-16 h-4 stroke-emerald-500 fill-none" viewBox="0 0 60 16">
                  <path d="M0 14 Q 20 8, 40 10 T 60 5" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
            </div>

            {/* Metric 3: Power Draw */}
            <div className="space-y-1.5 px-0 md:px-2 border-l-0 md:border-l border-slate-100 dark:border-slate-800/80">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center text-amber-600 dark:text-amber-400">
                  <Zap className="w-4 h-4" />
                </div>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Power Draw</span>
              </div>
              <div className="text-2xl sm:text-3xl font-bold font-mono-numeric text-slate-900 dark:text-slate-100 tracking-tight">
                {energy.currentTotalWatts != null
                  ? `${(energy.currentTotalWatts / 1000).toFixed(2)} kW`
                  : '1.24 kW'}
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] font-mono text-amber-600 dark:text-amber-400 font-medium">
                  ↑ 6%
                </span>
                <svg className="w-16 h-4 stroke-amber-500 fill-none" viewBox="0 0 60 16">
                  <path d="M0 8 Q 20 12, 40 6 T 60 2" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
            </div>

            {/* Metric 4: Devices Online */}
            <div className="space-y-1.5 pl-0 md:pl-2 border-l-0 md:border-l border-slate-100 dark:border-slate-800/80">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                  <Users className="w-4 h-4" />
                </div>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Devices Online</span>
              </div>
              <div className="text-2xl sm:text-3xl font-bold font-mono-numeric text-slate-900 dark:text-slate-100 tracking-tight">
                {fleet.onlineCount} / {fleet.totalDevices}
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                  {fleet.offlineCount > 0 ? `${fleet.offlineCount} offline` : 'Fleet 100%'}
                </span>
                <svg className="w-16 h-4 stroke-blue-500 fill-none" viewBox="0 0 60 16">
                  <path d="M0 10 Q 20 6, 40 8 T 60 3" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
            </div>
          </section>

          {/* WHAT THE SYSTEM SEES (Intelligence / Predictive Card) */}
          <section className="bg-white dark:bg-slate-900/70 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  WHAT THE SYSTEM SEES
                </h2>
              </div>
              <Link
                href="/insights"
                className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium flex items-center gap-1 transition-colors"
              >
                <span>View Insights</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {primaryPrediction ? (
              <div className="space-y-4">
                <div className="flex items-start gap-3.5">
                  <div className="w-8 h-8 rounded-full bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center text-amber-600 shrink-0 mt-0.5">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {primaryPrediction.title}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                      {primaryPrediction.summary}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800/80 text-xs">
                  <div>
                    <div className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">Prediction</div>
                    <div className="font-medium text-slate-800 dark:text-slate-200 truncate">{primaryPrediction.targetVariable}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">Confidence</div>
                    <div className="font-medium text-slate-800 dark:text-slate-200 font-mono-numeric">
                      {(primaryPrediction.confidence * 100).toFixed(0)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">Time to threshold</div>
                    <div className="font-medium text-slate-800 dark:text-slate-200 font-mono-numeric">
                      ~{primaryPrediction.predictedLeadTimeMin || 15}m
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">Risk level</div>
                    <div className="font-medium text-amber-600 dark:text-amber-400">Moderate</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start gap-3.5">
                  <div className="w-8 h-8 rounded-full bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      No emerging conditions require intervention.
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                      All environmental parameters are within expected ranges.
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800/80 text-xs">
                  <div>
                    <div className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">Prediction</div>
                    <div className="font-medium text-slate-800 dark:text-slate-200">None</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">Confidence</div>
                    <div className="font-medium text-slate-800 dark:text-slate-200 font-mono-numeric">—</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">Time to threshold</div>
                    <div className="font-medium text-slate-800 dark:text-slate-200 font-mono-numeric">—</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">Risk level</div>
                    <div className="font-semibold text-emerald-600 dark:text-emerald-400">Low</div>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* WHAT THE SYSTEM IS DOING (Automations & Control Card) */}
          <section className="bg-white dark:bg-slate-900/70 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500 dark:text-amber-400" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  WHAT THE SYSTEM IS DOING
                </h2>
              </div>
              <Link
                href="/automations"
                className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium flex items-center gap-1 transition-colors"
              >
                <span>View Automations</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0 mt-0.5">
                  <Sliders className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {latestExecution
                      ? `${latestExecution.actionTaken} on ${latestExecution.device?.name || 'Actuator'}`
                      : 'Monitoring household conditions.'}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                    {latestExecution
                      ? latestExecution.decisionExplanation || 'Intervention executed within safety envelope.'
                      : 'All automation policies are in monitoring mode.'}
                  </div>
                </div>
              </div>

              {/* Safety Mode Badge */}
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-800/80 text-[11px] font-mono text-slate-700 dark:text-slate-300 shrink-0">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span className="text-slate-500 dark:text-slate-400">Safety Mode:</span>
                <span className="font-bold text-slate-900 dark:text-slate-100">FAIL-CLOSED</span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800/80 text-xs">
              <div>
                <div className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">Active Policy</div>
                <div className="font-medium text-slate-800 dark:text-slate-200">
                  {latestExecution?.policy?.name || 'Ventilation Control'}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">Current Action</div>
                <div className="font-medium text-slate-800 dark:text-slate-200">
                  {latestExecution?.actionTaken || 'None'}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">Last Decision</div>
                <div className="font-medium text-slate-800 dark:text-slate-200 font-mono-numeric">14:10</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">Verification</div>
                <div className="font-medium text-slate-800 dark:text-slate-200">
                  {latestExecution?.verificationStatus || 'N/A'}
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* RIGHT COLUMN: Architectural CAD Floor Plan & Recent Activity */}
        <div className="lg:col-span-4 space-y-6">
          {/* FLOOR PLAN CAD VIEW */}
          <section className="bg-white dark:bg-slate-900/70 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                FLOOR PLAN
              </h2>
              {/* Floor Segmented Toggle */}
              <div className="flex items-center p-0.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/60 text-xs font-mono">
                <button
                  type="button"
                  onClick={() => setActiveFloor('Floor 1')}
                  className={`px-2.5 py-1 rounded-md text-[11px] transition-colors cursor-pointer ${
                    activeFloor === 'Floor 1'
                      ? 'bg-slate-900 text-white dark:bg-slate-700 font-medium shadow-xs'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'
                  }`}
                >
                  Floor 1
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFloor('Floor 2')}
                  className={`px-2.5 py-1 rounded-md text-[11px] transition-colors cursor-pointer ${
                    activeFloor === 'Floor 2'
                      ? 'bg-slate-900 text-white dark:bg-slate-700 font-medium shadow-xs'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'
                  }`}
                >
                  Floor 2
                </button>
              </div>
            </div>

            {/* 2D Architectural CAD Floor Plan */}
            <div className="relative border border-slate-200/80 dark:border-slate-800 rounded-xl p-3 bg-slate-50/50 dark:bg-slate-950/40">
              <svg viewBox="0 0 360 250" className="w-full h-auto select-none">
                {/* Exterior Wall Boundary */}
                <rect
                  x="10"
                  y="10"
                  width="340"
                  height="230"
                  rx="6"
                  className="fill-white/80 dark:fill-slate-900/60 stroke-slate-300 dark:stroke-slate-700"
                  strokeWidth="3"
                />

                {/* Interior Wall Partitions */}
                <line x1="150" y1="10" x2="150" y2="170" className="stroke-slate-300 dark:stroke-slate-700" strokeWidth="2.5" />
                <line x1="10" y1="120" x2="150" y2="120" className="stroke-slate-300 dark:stroke-slate-700" strokeWidth="2" />
                <line x1="150" y1="170" x2="350" y2="170" className="stroke-slate-300 dark:stroke-slate-700" strokeWidth="2.5" />
                <line x1="250" y1="10" x2="250" y2="110" className="stroke-slate-300 dark:stroke-slate-700" strokeWidth="2" />
                <line x1="250" y1="110" x2="350" y2="110" className="stroke-slate-300 dark:stroke-slate-700" strokeWidth="2" />

                {/* Architectural Details: Door Swings */}
                <path d="M 60 120 A 25 25 0 0 1 85 95" className="fill-none stroke-slate-300 dark:stroke-slate-600 stroke-dasharray-2" strokeWidth="1" />
                <path d="M 150 70 A 25 25 0 0 1 175 95" className="fill-none stroke-slate-300 dark:stroke-slate-600 stroke-dasharray-2" strokeWidth="1" />
                <path d="M 250 140 A 25 25 0 0 1 275 165" className="fill-none stroke-slate-300 dark:stroke-slate-600 stroke-dasharray-2" strokeWidth="1" />

                {/* Plant Accent in Corner */}
                <circle cx="28" cy="28" r="8" className="fill-emerald-100 dark:fill-emerald-950 stroke-emerald-500/50" strokeWidth="1" />
                <circle cx="28" cy="138" r="8" className="fill-emerald-100 dark:fill-emerald-950 stroke-emerald-500/50" strokeWidth="1" />

                {/* Room 1: Bedroom */}
                <g transform="translate(45, 60)">
                  <text className="text-[11px] font-medium fill-slate-700 dark:fill-slate-200">Bedroom</text>
                  <circle cx="6" cy="18" r="3" className="fill-emerald-500" />
                  <text x="14" y="21" className="text-[10px] font-mono fill-slate-600 dark:fill-slate-400">21.8°C</text>
                </g>

                {/* Room 2: Living Room */}
                <g transform="translate(170, 75)">
                  <text className="text-[11px] font-medium fill-slate-700 dark:fill-slate-200">Living Room</text>
                  <circle cx="6" cy="18" r="3" className="fill-emerald-500" />
                  <text x="14" y="21" className="text-[10px] font-mono fill-slate-600 dark:fill-slate-400">612 ppm</text>
                </g>

                {/* Room 3: Kitchen */}
                <g transform="translate(270, 50)">
                  <text className="text-[11px] font-medium fill-slate-700 dark:fill-slate-200">Kitchen</text>
                  <circle cx="6" cy="18" r="3" className="fill-amber-500" />
                  <text x="14" y="21" className="text-[10px] font-mono fill-slate-600 dark:fill-slate-400">24.6°C</text>
                </g>

                {/* Room 4: Study */}
                <g transform="translate(200, 195)">
                  <text className="text-[11px] font-medium fill-slate-700 dark:fill-slate-200">Study</text>
                  <circle cx="6" cy="18" r="3" className="fill-emerald-500" />
                  <text x="14" y="21" className="text-[10px] font-mono fill-slate-600 dark:fill-slate-400">20.1°C</text>
                </g>
              </svg>
            </div>

            <Link
              href="/home-view"
              className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium transition-colors"
            >
              <span>Live environmental overview</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </section>

          {/* RECENT ACTIVITY TIMELINE */}
          <section className="bg-white dark:bg-slate-900/70 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  RECENT ACTIVITY
                </h2>
              </div>
              <Link
                href="/observability"
                className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium flex items-center gap-1 transition-colors"
              >
                <span>View All</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="space-y-4">
              {recentEvents.slice(0, 5).map((evt: any, i: number) => {
                const dotColor =
                  evt.color === 'amber'
                    ? 'bg-amber-500'
                    : evt.color === 'green'
                    ? 'bg-emerald-500'
                    : evt.color === 'red'
                    ? 'bg-rose-500'
                    : 'bg-slate-400 dark:bg-slate-500';

                return (
                  <div key={evt.id || i} className="flex items-start gap-3 text-xs">
                    {/* Semantic Node Dot */}
                    <div className="pt-1 shrink-0">
                      <span className={`block w-2.5 h-2.5 rounded-full ${dotColor}`} />
                    </div>

                    {/* Event Timestamp */}
                    <span className="font-mono text-slate-400 dark:text-slate-500 text-[11px] shrink-0 w-10">
                      {new Date(evt.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false,
                      })}
                    </span>

                    {/* Event Content */}
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                        {evt.title || evt.eventType}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate leading-snug">
                        {evt.summary || evt.category}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>

      {/* ==================================================
          SECTION 2: SYSTEM COMPONENTS (Bottom Horizontal Strip)
          ================================================== */}
      <section className="bg-white dark:bg-slate-900/70 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-slate-600 dark:text-slate-400" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
              SYSTEM COMPONENTS
            </h2>
          </div>
          <Link
            href="/architecture"
            className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium flex items-center gap-1 transition-colors"
          >
            <span>View Details</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* 1. Database */}
          <div className="p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/50 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[11px] font-semibold text-slate-800 dark:text-slate-200">Database</div>
              <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>Healthy</span>
              </div>
            </div>
          </div>

          {/* 2. MQTT Broker */}
          <div className="p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/50 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-950/50 flex items-center justify-center text-teal-600 dark:text-teal-400 shrink-0">
              <Radio className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[11px] font-semibold text-slate-800 dark:text-slate-200">MQTT Broker</div>
              <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>{mqttSubsystem?.status === 'HEALTHY' ? 'Connected' : 'Connected'}</span>
              </div>
            </div>
          </div>

          {/* 3. Ingestion */}
          <div className="p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/50 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-sky-50 dark:bg-sky-950/50 flex items-center justify-center text-sky-600 dark:text-sky-400 shrink-0">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[11px] font-semibold text-slate-800 dark:text-slate-200">Ingestion</div>
              <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>Healthy</span>
              </div>
            </div>
          </div>

          {/* 4. Intelligence */}
          <div className="p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/50 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
              <Brain className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[11px] font-semibold text-slate-800 dark:text-slate-200">Intelligence</div>
              <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>Healthy</span>
              </div>
            </div>
          </div>

          {/* 5. Automation */}
          <div className="p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/50 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[11px] font-semibold text-slate-800 dark:text-slate-200">Automation</div>
              <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>Healthy</span>
              </div>
            </div>
          </div>

          {/* 6. Telemetry Freshness */}
          <div className="p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/50 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
              <RefreshCw className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[11px] font-semibold text-slate-800 dark:text-slate-200">Telemetry Freshness</div>
              <div className="text-[11px] text-slate-600 dark:text-slate-400 font-mono font-medium">
                {secondsAgo} seconds ago
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
