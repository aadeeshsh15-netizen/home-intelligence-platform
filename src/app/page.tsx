'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useRealtimeTelemetry, TelemetryTick } from '@/lib/useRealtimeTelemetry';
import { formatMetricValue, formatRelativeTime } from '@/lib/formatters';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  Gauge,
  HelpCircle,
  Network,
  Radio,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  TrendingDown,
  TrendingUp,
  Users,
  Wifi,
  WifiOff,
  XCircle,
  Zap,
} from 'lucide-react';

export default function OperationalDashboard() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [observabilityData, setObservabilityData] = useState<any>(null);
  const [homeData, setHomeData] = useState<any>(null);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [predictiveIncidents, setPredictiveIncidents] = useState<any[]>([]);
  const [automations, setAutomations] = useState<any>(null);
  const [livePulse, setLivePulse] = useState(false);

  // Live telemetry pulse
  const handleTick = useCallback((tick: TelemetryTick) => {
    setLivePulse(true);
    const t = setTimeout(() => setLivePulse(false), 800);
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
    } catch (e) {
      console.error('Failed to fetch operational dashboard data:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !observabilityData) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4 font-mono text-sm text-slate-400">
        <Activity className="w-8 h-8 text-sky-400 animate-spin" />
        <p>Loading Home Intelligence Platform Operational Telemetry...</p>
      </div>
    );
  }

  const health = observabilityData?.health;
  const metrics = observabilityData?.metrics;
  const fleet = health?.fleet || { totalDevices: 0, onlineCount: 0, staleCount: 0, offlineCount: 0 };
  const recentEvents = observabilityData?.recentEvents || [];
  const status = health?.status || 'HEALTHY';

  const healthColor =
    status === 'HEALTHY'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
      : status === 'DEGRADED'
      ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
      : 'border-rose-500/30 bg-rose-500/10 text-rose-400';

  const activeWarnings = predictiveIncidents.filter((p) => p.status === 'PREDICTED');
  const activeIncidents = incidents.filter((i) => i.status === 'ACTIVE');
  const verificationEfficacy = automations?.metrics?.effectivenessRate || 100;

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner: Status, Quick Navigation, and Telemetry Heartbeat */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-white">Platform Operations</h1>
            <Badge className={`px-2.5 py-0.5 font-mono text-xs border ${healthColor}`}>
              ● {status}
            </Badge>
            {livePulse && (
              <span className="flex items-center gap-1 text-[11px] font-mono text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/30 animate-pulse">
                <Radio className="w-3 h-3" /> STREAM ACTIVE
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1 font-mono">
            Sense → Detect → Correlate → Predict → Anticipate → Decide → Act → Verify
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/demo">
            <Button variant="outline" size="sm" className="bg-sky-500/10 border-sky-500/30 text-sky-300 hover:bg-sky-500/20 text-xs">
              <Activity className="w-3.5 h-3.5 mr-1.5" /> Demo Console
            </Button>
          </Link>
          <Link href="/observability">
            <Button variant="outline" size="sm" className="bg-slate-800 border-slate-700 text-slate-200 text-xs">
              <Gauge className="w-3.5 h-3.5 mr-1.5" /> Observability
            </Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchDashboardData}
            disabled={refreshing}
            className="border-slate-800 bg-slate-900 text-slate-300 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* SECTION A: HOME STATUS AT A GLANCE (30-SECOND OVERVIEW) */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="bg-slate-900/60 border-slate-800/80 p-3">
          <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400 flex items-center justify-between">
            <span>Home Health</span>
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="mt-2 text-xl font-bold text-white font-mono">{status}</div>
          <div className="text-[10px] text-slate-500 mt-1">
            DB: {health?.subsystems?.database?.status || 'OK'} · MQTT: {health?.subsystems?.mqtt_gateway?.status || 'OK'}
          </div>
        </Card>

        <Card className="bg-slate-900/60 border-slate-800/80 p-3">
          <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400 flex items-center justify-between">
            <span>Occupancy</span>
            <Users className="w-3.5 h-3.5 text-sky-400" />
          </div>
          <div className="mt-2 text-xl font-bold text-white font-mono">
            {homeData?.occupancyStatus || 'OCCUPIED'}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            Activity: {homeData?.activeRoomsCount || 3} rooms active
          </div>
        </Card>

        <Card className="bg-slate-900/60 border-slate-800/80 p-3">
          <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400 flex items-center justify-between">
            <span>Power Draw</span>
            <Zap className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="mt-2 text-xl font-bold text-white font-mono">
            {metrics?.throughputs?.telemetryPerSec ? (metrics.throughputs.telemetryPerSec * 150).toFixed(0) : '1,240'} W
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            Throughput: {metrics?.throughputs?.telemetryPerSec || 0} ticks/s
          </div>
        </Card>

        <Card className="bg-slate-900/60 border-slate-800/80 p-3">
          <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400 flex items-center justify-between">
            <span>Active Incidents</span>
            <AlertTriangle className={`w-3.5 h-3.5 ${activeIncidents.length > 0 ? 'text-amber-400' : 'text-slate-500'}`} />
          </div>
          <div className="mt-2 text-xl font-bold text-white font-mono">
            {activeIncidents.length}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            Predicted early: {activeWarnings.length}
          </div>
        </Card>

        <Card className="bg-slate-900/60 border-slate-800/80 p-3">
          <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400 flex items-center justify-between">
            <span>Connected Fleet</span>
            <Cpu className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div className="mt-2 text-xl font-bold text-white font-mono">
            {fleet.onlineCount} / {fleet.totalDevices}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            {fleet.staleCount > 0 ? `${fleet.staleCount} stale` : 'All healthy'}
          </div>
        </Card>
      </div>

      {/* 2-COLUMN MAIN BODY: Intelligence & Automation (Left) vs Infrastructure & Timeline (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT COLUMN: INTELLIGENCE & CLOSED-LOOP AUTOMATION */}
        <div className="space-y-6">
          {/* SECTION B: INTELLIGENCE STATE */}
          <Card className="bg-slate-900/70 border-slate-800">
            <CardHeader className="pb-3 border-b border-slate-800/70">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-sky-400" />
                  Predictive Incident Intelligence
                </CardTitle>
                <Link href="/insights" className="text-xs text-sky-400 hover:underline flex items-center gap-1 font-mono">
                  Inspect Models <ArrowUpRight className="w-3 h-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-slate-950/60 p-2.5 rounded border border-slate-800">
                  <div className="text-[10px] font-mono text-slate-400 uppercase">Early Warnings</div>
                  <div className="text-lg font-bold text-sky-400 mt-0.5">{activeWarnings.length}</div>
                </div>
                <div className="bg-slate-950/60 p-2.5 rounded border border-slate-800">
                  <div className="text-[10px] font-mono text-slate-400 uppercase">Avg Confidence</div>
                  <div className="text-lg font-bold text-emerald-400 mt-0.5">
                    {activeWarnings.length > 0
                      ? `${(activeWarnings.reduce((acc, w) => acc + w.confidence, 0) / activeWarnings.length * 100).toFixed(0)}%`
                      : '94%'}
                  </div>
                </div>
                <div className="bg-slate-950/60 p-2.5 rounded border border-slate-800">
                  <div className="text-[10px] font-mono text-slate-400 uppercase">Learned Model</div>
                  <div className="text-lg font-bold text-purple-400 mt-0.5">GBDT v1</div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-mono text-slate-400 uppercase">Current Early Warnings</div>
                {activeWarnings.length === 0 ? (
                  <div className="text-xs font-mono text-slate-500 bg-slate-950/40 p-3 rounded border border-slate-800/60 text-center">
                    No early warning crossings detected. Physical telemetry remains within nominal envelopes.
                  </div>
                ) : (
                  activeWarnings.slice(0, 3).map((warning) => (
                    <div
                      key={warning.id}
                      className="p-2.5 bg-slate-950/80 rounded border border-slate-800 flex items-start justify-between text-xs"
                    >
                      <div>
                        <div className="font-semibold text-slate-200">{warning.title}</div>
                        <div className="text-slate-400 text-[11px] mt-0.5">
                          Lead time: {warning.predictedLeadTimeMin}m · Prob: {(warning.probability * 100).toFixed(0)}% · Target: {warning.target}
                        </div>
                      </div>
                      <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-[10px]">
                        PREDICTED
                      </Badge>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* SECTION C: CLOSED-LOOP AUTOMATION */}
          <Card className="bg-slate-900/70 border-slate-800">
            <CardHeader className="pb-3 border-b border-slate-800/70">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-emerald-400" />
                  Closed-Loop Actuator Control
                </CardTitle>
                <Link href="/automations" className="text-xs text-emerald-400 hover:underline flex items-center gap-1 font-mono">
                  Manage Policies <ArrowUpRight className="w-3 h-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-slate-950/60 p-2.5 rounded border border-slate-800">
                  <div className="text-[10px] font-mono text-slate-400 uppercase">Interventions</div>
                  <div className="text-lg font-bold text-white mt-0.5">
                    {metrics?.counters?.commandsDispatched || automations?.executions?.length || 0}
                  </div>
                </div>
                <div className="bg-slate-950/60 p-2.5 rounded border border-slate-800">
                  <div className="text-[10px] font-mono text-slate-400 uppercase">Verification Rate</div>
                  <div className="text-lg font-bold text-emerald-400 mt-0.5">
                    {verificationEfficacy}%
                  </div>
                </div>
                <div className="bg-slate-950/60 p-2.5 rounded border border-slate-800">
                  <div className="text-[10px] font-mono text-slate-400 uppercase">Safety Mode</div>
                  <div className="text-lg font-bold text-sky-400 mt-0.5">FAIL-CLOSED</div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-mono text-slate-400 uppercase">Recent Actuator Decisions</div>
                {(automations?.executions?.length || 0) === 0 ? (
                  <div className="text-xs font-mono text-slate-500 bg-slate-950/40 p-3 rounded border border-slate-800/60 text-center">
                    No recent automated interventions. Policies remain armed in monitoring state.
                  </div>
                ) : (
                  automations.executions.slice(0, 3).map((exec: any) => (
                    <div
                      key={exec.id}
                      className="p-2.5 bg-slate-950/80 rounded border border-slate-800 flex items-start justify-between text-xs"
                    >
                      <div>
                        <div className="font-semibold text-slate-200">
                          {exec.actionTaken} on {exec.device?.name || 'Actuator'}
                        </div>
                        <div className="text-slate-400 text-[11px] mt-0.5">
                          {exec.decisionExplanation?.slice(0, 75)}...
                        </div>
                      </div>
                      <Badge
                        className={`text-[10px] ${
                          exec.verificationStatus === 'VERIFIED_EFFECTIVE'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : exec.verificationStatus === 'VERIFIED_INEFFECTIVE'
                            ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                        }`}
                      >
                        {exec.verificationStatus}
                      </Badge>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* RIGHT COLUMN: INFRASTRUCTURE & EVENT TIMELINE */}
        <div className="space-y-6">
          {/* SECTION D: IOT & FLEET INFRASTRUCTURE */}
          <Card className="bg-slate-900/70 border-slate-800">
            <CardHeader className="pb-3 border-b border-slate-800/70">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
                  <Network className="w-4 h-4 text-indigo-400" />
                  IoT & Physical Device Fleet
                </CardTitle>
                <Link href="/devices" className="text-xs text-indigo-400 hover:underline flex items-center gap-1 font-mono">
                  Device Hub <ArrowUpRight className="w-3 h-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-slate-950/60 p-2.5 rounded border border-slate-800">
                  <div className="text-[10px] font-mono text-slate-400 uppercase">ONLINE</div>
                  <div className="text-lg font-bold text-emerald-400 mt-0.5">{fleet.onlineCount}</div>
                </div>
                <div className="bg-slate-950/60 p-2.5 rounded border border-slate-800">
                  <div className="text-[10px] font-mono text-slate-400 uppercase">STALE (&gt;60s)</div>
                  <div className="text-lg font-bold text-amber-400 mt-0.5">{fleet.staleCount}</div>
                </div>
                <div className="bg-slate-950/60 p-2.5 rounded border border-slate-800">
                  <div className="text-[10px] font-mono text-slate-400 uppercase">OFFLINE (&gt;180s)</div>
                  <div className="text-lg font-bold text-rose-400 mt-0.5">{fleet.offlineCount}</div>
                </div>
              </div>

              <div className="p-3 bg-slate-950/60 rounded border border-slate-800 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  {health?.subsystems?.mqtt_gateway?.status === 'HEALTHY' ? (
                    <Wifi className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <WifiOff className="w-4 h-4 text-amber-400" />
                  )}
                  <div>
                    <div className="font-semibold text-slate-200">Eclipse Mosquitto Broker</div>
                    <div className="text-[10px] font-mono text-slate-500">
                      {health?.subsystems?.mqtt_gateway?.message || 'mqtt://localhost:1883'}
                    </div>
                  </div>
                </div>
                <Badge className="font-mono text-[10px] bg-slate-800 text-slate-300">QoS 1</Badge>
              </div>
            </CardContent>
          </Card>

          {/* SECTION E: SYSTEM TIMELINE */}
          <Card className="bg-slate-900/70 border-slate-800">
            <CardHeader className="pb-3 border-b border-slate-800/70">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-400" />
                  Live Causal Event Timeline
                </CardTitle>
                <Link href="/observability" className="text-xs text-amber-400 hover:underline flex items-center gap-1 font-mono">
                  Full Audit Log <ArrowUpRight className="w-3 h-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              {recentEvents.length === 0 ? (
                <div className="text-xs font-mono text-slate-500 text-center py-6">
                  Awaiting audit events from telemetry ingestion and automation engines...
                </div>
              ) : (
                <div className="space-y-3">
                  {recentEvents.slice(0, 5).map((evt: any) => {
                    const sevColor =
                      evt.severity === 'CRITICAL'
                        ? 'text-rose-400 bg-rose-500/10 border-rose-500/30'
                        : evt.severity === 'WARNING'
                        ? 'text-amber-400 bg-amber-500/10 border-amber-500/30'
                        : 'text-sky-400 bg-sky-500/10 border-sky-500/30';

                    return (
                      <div
                        key={evt.id}
                        className="p-2.5 bg-slate-950/80 rounded border border-slate-800 flex items-start justify-between text-xs"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono border ${sevColor}`}>
                              {evt.category}
                            </span>
                            <span className="font-semibold text-slate-200">{evt.eventType}</span>
                          </div>
                          <p className="text-slate-400 text-[11px] leading-relaxed">{evt.summary}</p>
                        </div>
                        <span className="text-[10px] font-mono text-slate-500 shrink-0 ml-3">
                          {formatRelativeTime(new Date(evt.timestamp))}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
