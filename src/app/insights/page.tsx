'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatRelativeTime } from '@/lib/formatters';
import { useRealtimeTelemetry } from '@/lib/useRealtimeTelemetry';
import {
  Lightbulb,
  CheckCircle2,
  TrendingUp,
  FlaskConical,
  Zap,
  Wind,
  Thermometer,
  ShieldCheck,
  ChevronDown,
  Info,
  Droplets,
  Flame,
  Snowflake,
  DoorClosed,
  AlertTriangle,
  RefreshCw,
  Layers,
  Activity,
  Check,
  X,
  Clock,
  Radar,
  Target,
  ArrowRight,
  AlertCircle,
  Cpu,
} from 'lucide-react';

export default function InsightsPage() {
  const { connectionState } = useRealtimeTelemetry();
  const [activeTab, setActiveTab] = useState<'predictive' | 'incidents' | 'baselines'>('predictive');
  
  // Predictive Incidents State (Phase 5)
  const [predictiveIncidents, setPredictiveIncidents] = useState<any[]>([]);
  const [predictiveMetrics, setPredictiveMetrics] = useState<any>(null);
  const [activePredictiveCount, setActivePredictiveCount] = useState<number>(0);
  const [predictiveFilter, setPredictiveFilter] = useState<'PREDICTED' | 'ALL' | 'CONFIRMED' | 'EXPIRED' | 'DISMISSED'>('PREDICTED');
  const [predictiveLoading, setPredictiveLoading] = useState(false);

  // Phase 2 Incidents State
  const [incidents, setIncidents] = useState<any[]>([]);
  const [activeIncidentCount, setActiveIncidentCount] = useState<number>(0);
  const [incidentFilter, setIncidentFilter] = useState<'ALL' | 'ACTIVE' | 'RESOLVED' | 'DISMISSED'>('ACTIVE');

  // Single-Sensor Baselines State (Phase 1)
  const [insights, setInsights] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [injectionStatus, setInjectionStatus] = useState<string | null>(null);

  const fetchPredictiveIncidents = async () => {
    try {
      setPredictiveLoading(true);
      const url = predictiveFilter === 'ALL' 
        ? '/api/predictive-incidents' 
        : `/api/predictive-incidents?status=${predictiveFilter}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setPredictiveIncidents(data.predictiveIncidents || []);
        setActivePredictiveCount(data.counts?.predicted || 0);
      }

      const metricsRes = await fetch('/api/predictive-incidents/metrics');
      if (metricsRes.ok) {
        const metricsData = await metricsRes.json();
        setPredictiveMetrics(metricsData.metrics);
      }
    } catch (e) {
      console.error('Failed to fetch predictive incidents', e);
    } finally {
      setPredictiveLoading(false);
    }
  };

  const fetchIncidents = async () => {
    try {
      const url = incidentFilter === 'ALL' ? '/api/incidents' : `/api/incidents?status=${incidentFilter}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setIncidents(data.incidents || []);
        setActiveIncidentCount(data.activeCount || 0);
      }
    } catch (e) {
      console.error('Failed to fetch incidents', e);
    }
  };

  const fetchInsights = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/insights');
      if (res.ok) {
        const data = await res.json();
        setInsights(data.insights || []);
      }
    } catch (e) {
      console.error('Failed to fetch baseline insights', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPredictiveIncidents();
    fetchIncidents();
    fetchInsights();
  }, [predictiveFilter, incidentFilter]);

  // Periodic poll
  useEffect(() => {
    const interval = setInterval(() => {
      fetchPredictiveIncidents();
      fetchIncidents();
    }, 5000);
    return () => clearInterval(interval);
  }, [predictiveFilter, incidentFilter]);

  const handlePredictiveStatus = async (id: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/predictive-incidents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        fetchPredictiveIncidents();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleTriggerPredictiveEvaluation = async () => {
    try {
      setInjectionStatus('Triggering anticipatory evaluation across all horizons...');
      const res = await fetch('/api/predictive-incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'evaluate' }),
      });
      if (res.ok) {
        const data = await res.json();
        setInjectionStatus(`Evaluation complete: ${data.candidatesGenerated || 0} early warnings generated, ${data.confirmedCount || 0} confirmed.`);
        fetchPredictiveIncidents();
        setTimeout(() => setInjectionStatus(null), 3000);
      }
    } catch (err) {
      console.error(err);
      setInjectionStatus('Failed to evaluate predictive engine');
    }
  };

  const handleIncidentStatus = async (id: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/incidents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        fetchIncidents();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleBaselineInsightStatus = async (id: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/insights/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        fetchInsights();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleInjectQuickScenario = async (type: string, roomTypePreference: string) => {
    try {
      setInjectionStatus(`Injecting ${type}...`);
      const roomsRes = await fetch('/api/rooms');
      let targetRoomId = '';
      if (roomsRes.ok) {
        const d = await roomsRes.json();
        const found = d.rooms.find((r: any) => r.roomType === roomTypePreference) || d.rooms[0];
        targetRoomId = found?.id;
      }

      const res = await fetch('/api/simulator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'inject_anomaly',
          anomaly: {
            type,
            roomId: targetRoomId,
            active: true,
            intensity: 1.5,
          },
        }),
      });

      if (res.ok) {
        setInjectionStatus(`Injected ${type}. Evaluating multi-sensor correlation and anticipatory engines...`);
        await fetch('/api/incidents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'evaluate' }),
        });
        await fetch('/api/predictive-incidents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'evaluate' }),
        });

        setTimeout(() => {
          fetchPredictiveIncidents();
          fetchIncidents();
          fetchInsights();
          setInjectionStatus(null);
        }, 1200);
      }
    } catch (e) {
      console.error(e);
      setInjectionStatus('Failed to inject scenario');
    }
  };

  const handleInjectQuickAnomaly = async (type: string, roomId: string) => {
    try {
      setInjectionStatus(`Injecting ${type}...`);
      const res = await fetch('/api/simulator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'inject_anomaly',
          anomaly: {
            type,
            roomId,
            active: true,
            intensity: 1.5,
          },
        }),
      });
      if (res.ok) {
        setInjectionStatus(`Injected ${type}. Advancing physics pipeline...`);
        setTimeout(() => {
          fetchInsights();
          fetchPredictiveIncidents();
          setInjectionStatus(null);
        }, 1200);
      }
    } catch (e) {
      console.error(e);
      setInjectionStatus('Failed to inject anomaly');
    }
  };

  const getPredictiveIcon = (type: string) => {
    switch (type) {
      case 'PREDICTED_CO2_VENTILATION':
        return <Wind className="w-4 h-4 text-emerald-400" />;
      case 'PREDICTED_AC_FAILURE':
        return <Snowflake className="w-4 h-4 text-orange-400" />;
      case 'PREDICTED_ENERGY_SURGE':
        return <Zap className="w-4 h-4 text-amber-400" />;
      case 'PREDICTED_THERMAL_BREACH':
        return <DoorClosed className="w-4 h-4 text-sky-400" />;
      default:
        return <Radar className="w-4 h-4 text-purple-400" />;
    }
  };

  const getIncidentIcon = (type: string) => {
    switch (type) {
      case 'COOKING_EVENT':
        return <Flame className="w-4 h-4 text-amber-400" />;
      case 'WATER_LEAK':
        return <Droplets className="w-4 h-4 text-rose-400" />;
      case 'AC_FAILURE':
        return <Snowflake className="w-4 h-4 text-orange-400" />;
      case 'WINDOW_THERMAL_EVENT':
        return <DoorClosed className="w-4 h-4 text-sky-400" />;
      default:
        return <AlertTriangle className="w-4 h-4 text-yellow-400" />;
    }
  };

  const getSeverityBadgeVariant = (severity: string): any => {
    switch (severity) {
      case 'CRITICAL':
        return 'critical';
      case 'HIGH':
      case 'ERROR':
        return 'error';
      case 'MEDIUM':
      case 'WARNING':
        return 'warning';
      default:
        return 'info';
    }
  };

  const getPredictiveStatusBadge = (status: string, outcome: string) => {
    if (status === 'PREDICTED') {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-amber-950/70 border border-amber-600 text-amber-300 animate-pulse flex items-center gap-1">
          <Clock className="w-3 h-3" />
          EARLY WARNING (PENDING)
        </span>
      );
    }
    if (status === 'CONFIRMED' || outcome === 'TRUE_POSITIVE') {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-emerald-950/70 border border-emerald-600 text-emerald-300 flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" />
          CONFIRMED (TRUE POSITIVE)
        </span>
      );
    }
    if (status === 'EXPIRED' || outcome === 'FALSE_POSITIVE') {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 flex items-center gap-1">
          <Check className="w-3 h-3" />
          EXPIRED (FALSE ALARM)
        </span>
      );
    }
    return (
      <Badge variant="outline">
        {status}
      </Badge>
    );
  };

  const getStatusBadgeVariant = (status: string): any => {
    switch (status) {
      case 'ACTIVE':
        return 'success';
      case 'DETECTED':
        return 'warning';
      case 'RESOLVED':
        return 'outline';
      case 'DISMISSED':
        return 'default';
      default:
        return 'outline';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Household Intelligence Engine</h1>
            <Badge variant="info">Phase 5: Anticipatory Intelligence</Badge>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 font-mono mt-1">
            Observe → Detect → Correlate → Predict → <strong>Anticipate</strong>: Detect potential incidents before they occur
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Badge variant={activePredictiveCount > 0 ? 'warning' : 'outline'}>
            <Radar className="w-3.5 h-3.5 mr-1" />
            {activePredictiveCount} Early {activePredictiveCount === 1 ? 'Warning' : 'Warnings'}
          </Badge>
          <Badge variant={activeIncidentCount > 0 ? 'critical' : 'success'}>
            {activeIncidentCount} Active {activeIncidentCount === 1 ? 'Incident' : 'Incidents'}
          </Badge>
          <Badge variant="outline">
            SSE: {connectionState}
          </Badge>
        </div>
      </div>

      {/* Anticipatory Intelligence Architecture Banner */}
      <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-lg p-4 grid grid-cols-1 md:grid-cols-4 gap-4 text-xs font-mono">
        <div className="space-y-1">
          <span className="text-slate-500 uppercase block text-[10px]">Threshold Crossing Probability</span>
          <span className="text-sky-600 dark:text-sky-400 font-semibold block">Normal CDF: Φ((ŷ - T) / s)</span>
          <p className="text-slate-600 dark:text-slate-400 text-[11px]">
            No fabricated heuristics; analytical CDF integration over model uncertainty.
          </p>
        </div>

        <div className="space-y-1">
          <span className="text-slate-500 uppercase block text-[10px]">Multimodal Evidence Confidence</span>
          <span className="text-emerald-600 dark:text-emerald-400 font-semibold block">C = 0.50·P + 0.30·W + 0.20·R</span>
          <p className="text-slate-600 dark:text-slate-400 text-[11px]">
            Synthesizes forecast probability, sensor evidence weights, and model reliability.
          </p>
        </div>

        <div className="space-y-1">
          <span className="text-slate-500 uppercase block text-[10px]">Predicted Lead Time</span>
          <span className="text-amber-600 dark:text-amber-400 font-semibold block">Linear Interpolation min(Crossing)</span>
          <p className="text-slate-600 dark:text-slate-400 text-[11px]">
            Calculates exact minutes remaining until threshold breach.
          </p>
        </div>

        <div className="space-y-1">
          <span className="text-slate-500 uppercase block text-[10px]">Predictive Lifecycle</span>
          <span className="text-purple-600 dark:text-purple-400 font-semibold block">PREDICTED → CONFIRMED / EXPIRED</span>
          <p className="text-slate-600 dark:text-slate-400 text-[11px]">
            Tracks actual lead-time against Phase 2 incidents; auto-expires false positives.
          </p>
        </div>
      </div>

      {/* Live Incident & Disturbance Injection Sandbox */}
      <Card className="border-sky-200 dark:border-sky-900/50 bg-sky-50/50 dark:bg-sky-950/20">
        <CardHeader>
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-sky-500 dark:text-sky-400" />
              <CardTitle className="text-sky-900 dark:text-sky-300">Live Incident &amp; Disturbance Injection Sandbox</CardTitle>
            </div>
            {injectionStatus && (
              <span className="text-xs font-mono text-sky-600 dark:text-sky-400 animate-pulse">{injectionStatus}</span>
            )}
          </div>
        </CardHeader>
        <p className="text-xs text-slate-600 dark:text-slate-400 mb-3">
          Inject multi-sensor physical disturbances into the physics pipeline to verify real-time cross-sensor correlation and anticipatory early warnings:
        </p>

        <div className="space-y-3">
          {/* Phase 5 Anticipatory Early Warning Triggers */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-mono text-purple-400 uppercase tracking-wider font-semibold flex items-center gap-1.5">
              <Radar className="w-3.5 h-3.5" />
              <span>Phase 5 Anticipatory Warning Scenarios:</span>
            </div>
            <div className="flex flex-wrap gap-2.5">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleInjectQuickScenario('CO2_SPIKE', 'LIVING_ROOM')}
                className="text-xs font-mono border-emerald-900/60 hover:bg-emerald-950/40 text-emerald-300"
              >
                <Wind className="w-3.5 h-3.5 mr-1" />
                <span>Simulate Impending CO₂ Hazard (&gt; 1,000 ppm)</span>
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={() => handleInjectQuickScenario('AC_FAILURE', 'LIVING_ROOM')}
                className="text-xs font-mono border-orange-900/60 hover:bg-orange-950/40 text-orange-300"
              >
                <Snowflake className="w-3.5 h-3.5 mr-1" />
                <span>Simulate Impending AC Failure (&gt; 24°C Under Active Load)</span>
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={() => handleInjectQuickScenario('POWER_SURGE', 'LIVING_ROOM')}
                className="text-xs font-mono border-amber-900/60 hover:bg-amber-950/40 text-amber-300"
              >
                <Zap className="w-3.5 h-3.5 mr-1" />
                <span>Simulate Impending Peak Energy Surge (&gt; 2,000W)</span>
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={() => handleInjectQuickScenario('WINDOW_OPEN', 'LIVING_ROOM')}
                className="text-xs font-mono border-sky-900/60 hover:bg-sky-950/40 text-sky-300"
              >
                <DoorClosed className="w-3.5 h-3.5 mr-1" />
                <span>Simulate Impending Thermal Envelope Breach</span>
              </Button>
            </div>
          </div>

          {/* Phase 2 Household Incidents */}
          <div className="space-y-1.5 pt-2 border-t border-slate-800/60">
            <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider font-semibold">
              Cross-Sensor Household Incidents (Phase 2):
            </div>
            <div className="flex flex-wrap gap-2.5">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleInjectQuickScenario('COOKING_EVENT', 'KITCHEN')}
                className="text-xs font-mono border-amber-900/60 hover:bg-amber-950/40 text-amber-300"
              >
                <Flame className="w-3.5 h-3.5 mr-1" />
                <span>Simulate Kitchen Cooking Event</span>
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={() => handleInjectQuickScenario('WATER_LEAK', 'BATHROOM')}
                className="text-xs font-mono border-rose-900/60 hover:bg-rose-950/40 text-rose-300"
              >
                <Droplets className="w-3.5 h-3.5 mr-1" />
                <span>Simulate Bathroom Water Leak</span>
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Tabs Switcher: 3 Layers of Platform Intelligence */}
      <div className="flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-2">
          {/* TAB 1: Early Warnings (Phase 5) */}
          <button
            onClick={() => setActiveTab('predictive')}
            className={`px-4 py-2.5 text-xs font-mono font-semibold transition-colors border-b-2 flex items-center gap-2 ${
              activeTab === 'predictive'
                ? 'border-purple-500 text-purple-300 bg-purple-950/20'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Radar className="w-3.5 h-3.5 text-purple-400" />
            <span>Early Warnings (Anticipate) ({predictiveIncidents.length})</span>
            {activePredictiveCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 bg-purple-500/30 text-purple-300 border border-purple-500/40 rounded-full text-[10px] animate-pulse">
                {activePredictiveCount}
              </span>
            )}
          </button>

          {/* TAB 2: Correlated Incidents (Phase 2) */}
          <button
            onClick={() => setActiveTab('incidents')}
            className={`px-4 py-2.5 text-xs font-mono font-semibold transition-colors border-b-2 flex items-center gap-2 ${
              activeTab === 'incidents'
                ? 'border-sky-500 text-sky-400 bg-sky-950/20'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Unified Incidents (Correlate) ({incidents.length})</span>
            {activeIncidentCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 bg-rose-500/20 text-rose-400 rounded-full text-[10px]">
                {activeIncidentCount}
              </span>
            )}
          </button>

          {/* TAB 3: Single-Sensor Baselines (Phase 1) */}
          <button
            onClick={() => setActiveTab('baselines')}
            className={`px-4 py-2.5 text-xs font-mono font-semibold transition-colors border-b-2 flex items-center gap-2 ${
              activeTab === 'baselines'
                ? 'border-sky-500 text-sky-400 bg-sky-950/20'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Single-Sensor Baselines (Detect) ({insights.length})</span>
          </button>
        </div>

        {/* Tab-Specific Filters & Triggers */}
        {activeTab === 'predictive' && (
          <div className="flex items-center gap-1.5 pb-1">
            {(['PREDICTED', 'ALL', 'CONFIRMED', 'EXPIRED', 'DISMISSED'] as const).map((filterVal) => (
              <Button
                key={filterVal}
                size="sm"
                variant={predictiveFilter === filterVal ? 'primary' : 'ghost'}
                onClick={() => setPredictiveFilter(filterVal)}
                className="text-[11px] font-mono h-7 px-2.5"
              >
                {filterVal}
              </Button>
            ))}
            <Button
              size="sm"
              variant="outline"
              onClick={handleTriggerPredictiveEvaluation}
              className="text-[11px] font-mono h-7 px-2 border-purple-800 text-purple-300 hover:bg-purple-950/30"
              title="Run Predictive Sweep Now"
            >
              <Radar className="w-3 h-3 mr-1" />
              <span>Evaluate</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => fetchPredictiveIncidents()}
              className="text-[11px] font-mono h-7 px-2"
              title="Refresh Predictive Warnings"
            >
              <RefreshCw className="w-3 h-3" />
            </Button>
          </div>
        )}

        {activeTab === 'incidents' && (
          <div className="flex items-center gap-1.5 pb-1">
            {(['ACTIVE', 'ALL', 'RESOLVED', 'DISMISSED'] as const).map((filterVal) => (
              <Button
                key={filterVal}
                size="sm"
                variant={incidentFilter === filterVal ? 'primary' : 'ghost'}
                onClick={() => setIncidentFilter(filterVal)}
                className="text-[11px] font-mono h-7 px-2.5"
              >
                {filterVal}
              </Button>
            ))}
            <Button
              size="sm"
              variant="outline"
              onClick={() => fetchIncidents()}
              className="text-[11px] font-mono h-7 px-2"
              title="Refresh Incidents"
            >
              <RefreshCw className="w-3 h-3" />
            </Button>
          </div>
        )}
      </div>

      {/* TAB 1: Predictive Incidents (Phase 5: Anticipate) */}
      {activeTab === 'predictive' && (
        <div className="space-y-4">
          {/* Performance Metrics Summary Ribbon */}
          {predictiveMetrics && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 p-3 rounded-lg font-mono">
                <span className="text-[10px] text-slate-500 uppercase block">Total Early Warnings</span>
                <span className="text-lg font-bold text-slate-900 dark:text-slate-100">{predictiveMetrics.totalWarnings}</span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">Historical warnings evaluated</span>
              </div>

              <div className="bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 p-3 rounded-lg font-mono">
                <span className="text-[10px] text-slate-500 uppercase block">Empirical Precision</span>
                <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{predictiveMetrics.precisionPercent}%</span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">{predictiveMetrics.confirmedTruePositives} Confirmed True Positives</span>
              </div>

              <div className="bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 p-3 rounded-lg font-mono">
                <span className="text-[10px] text-slate-500 uppercase block">False Positive Rate</span>
                <span className="text-lg font-bold text-amber-600 dark:text-amber-400">{predictiveMetrics.falsePositiveRatePercent}%</span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">{predictiveMetrics.expiredFalsePositives} Expired / False Alarms</span>
              </div>

              <div className="bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 p-3 rounded-lg font-mono">
                <span className="text-[10px] text-slate-500 uppercase block">Average Warning Lead Time</span>
                <span className="text-lg font-bold text-sky-600 dark:text-sky-400">+{predictiveMetrics.averageLeadTimeMinutes} min</span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">Advance notice prior to breach</span>
              </div>

              <div className="bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 p-3 rounded-lg font-mono">
                <span className="text-[10px] text-slate-500 uppercase block">Active In Flight</span>
                <span className="text-lg font-bold text-purple-600 dark:text-purple-400">{predictiveMetrics.unresolvedPending}</span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">Monitoring verification window</span>
              </div>
            </div>
          )}

          {predictiveIncidents.length === 0 ? (
            <Card className="text-center py-12 text-slate-500 font-mono text-xs border-slate-200 dark:border-slate-800">
              No predictive early warnings matching filter &quot;{predictiveFilter}&quot;. Use the sandbox buttons above or click &quot;Evaluate&quot; to test anticipatory reasoning.
            </Card>
          ) : (
            predictiveIncidents.map((pred) => {
              const evidenceList: any[] = Array.isArray(pred.contributingEvidence) ? pred.contributingEvidence : [];
              const probPct = Math.round((pred.probability || 0) * 100);
              const confPct = Math.round((pred.confidence || 0) * 100);
              const ci80 = pred.confidenceInterval80 as [number, number] | null;
              const ci95 = pred.confidenceInterval95 as [number, number] | null;

              return (
                <Card key={pred.id} className="space-y-4 border-slate-200 dark:border-purple-950/60 shadow-sm">
                  {/* Warning Header */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800/80 pb-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {getPredictiveIcon(pred.type)}
                        <span className="text-sm font-bold text-slate-900 dark:text-slate-100">{pred.title}</span>
                        <Badge variant={getSeverityBadgeVariant(pred.severity)}>
                          {pred.severity}
                        </Badge>
                        {getPredictiveStatusBadge(pred.status, pred.outcome)}

                        <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-purple-100 dark:bg-purple-950/70 border border-purple-300 dark:border-purple-800 text-purple-800 dark:text-purple-300">
                          {probPct}% Probability of Crossing
                        </span>

                        <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-sky-100 dark:bg-sky-950/70 border border-sky-300 dark:border-sky-800 text-sky-800 dark:text-sky-300">
                          {confPct}% Multimodal Confidence
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-600 dark:text-slate-400">
                        <span>Target: <strong className="text-slate-800 dark:text-slate-200">{pred.target}</strong></span>
                        <span>•</span>
                        <span>Room: <strong className="text-slate-800 dark:text-slate-200">{pred.room?.name || 'Household Wide'}</strong></span>
                        <span>•</span>
                        <span>Model: <strong className="text-purple-600 dark:text-purple-300">{pred.modelName}</strong></span>
                        <span>•</span>
                        <span>Horizon: <strong className="text-slate-800 dark:text-slate-200">{pred.horizonMinutes}m</strong></span>
                        <span>•</span>
                        <span className="text-amber-600 dark:text-amber-400 font-bold">
                          Predicted Lead Time: +{pred.predictedLeadTimeMin} min
                        </span>
                        <span>•</span>
                        <span>Generated: {formatRelativeTime(pred.createdAt)}</span>
                      </div>
                    </div>

                    {/* Action Controls */}
                    <div className="flex items-center gap-2 shrink-0">
                      {pred.status === 'PREDICTED' && (
                        <>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handlePredictiveStatus(pred.id, 'CONFIRMED')}
                            className="text-xs font-mono"
                          >
                            <Check className="w-3.5 h-3.5 mr-1 text-emerald-500 dark:text-emerald-400" />
                            Confirm True Positive
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handlePredictiveStatus(pred.id, 'DISMISSED')}
                            className="text-xs font-mono text-slate-400 hover:text-slate-200"
                          >
                            <X className="w-3.5 h-3.5 mr-1" />
                            Dismiss
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Summary & Explainability Statement */}
                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-sans">
                    {pred.summary}
                  </p>

                  {/* Verifiable Mathematical Derivation & Forecast Bounds */}
                  <div className="rounded bg-slate-50 dark:bg-slate-900/80 p-3.5 border border-slate-200 dark:border-slate-800 text-xs font-mono space-y-3">
                    <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 pb-2">
                      <span className="flex items-center gap-1.5 text-purple-600 dark:text-purple-400 font-semibold">
                        <Target className="w-3.5 h-3.5" />
                        <span>Predictive Derivation &amp; Forecast Uncertainty Bounds</span>
                      </span>
                      <span className="text-slate-500">
                        Normal CDF Error Integral: Φ((ŷ - T) / s)
                      </span>
                    </div>

                    <p className="text-xs font-mono text-slate-700 dark:text-slate-300 leading-relaxed">
                      {pred.explanation}
                    </p>

                    {/* Parametric Breakdown Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2 pt-1">
                      <div className="bg-white dark:bg-slate-950 p-2.5 rounded border border-slate-200 dark:border-slate-800/80">
                        <span className="text-[10px] text-slate-500 block uppercase">CURRENT VALUE (y_t)</span>
                        <span className="text-slate-800 dark:text-slate-200 font-mono text-xs block mt-0.5">
                          {pred.currentValue}
                        </span>
                      </div>

                      <div className="bg-white dark:bg-slate-950 p-2.5 rounded border border-slate-200 dark:border-slate-800/80">
                        <span className="text-[10px] text-slate-500 block uppercase">PREDICTED (ŷ_t+h)</span>
                        <span className="text-purple-600 dark:text-purple-300 font-mono text-xs font-bold block mt-0.5">
                          {pred.predictedValue}
                        </span>
                      </div>

                      <div className="bg-white dark:bg-slate-950 p-2.5 rounded border border-slate-200 dark:border-slate-800/80">
                        <span className="text-[10px] text-slate-500 block uppercase">HAZARD THRESHOLD (T)</span>
                        <span className="text-rose-600 dark:text-rose-400 font-mono text-xs font-bold block mt-0.5">
                          {pred.thresholdValue}
                        </span>
                      </div>

                      <div className="bg-white dark:bg-slate-950 p-2.5 rounded border border-slate-200 dark:border-slate-800/80">
                        <span className="text-[10px] text-slate-500 block uppercase">80% UNCERTAINTY [L, U]</span>
                        <span className="text-sky-600 dark:text-sky-300 font-mono text-xs block mt-0.5">
                          {ci80 ? `[${ci80[0]}, ${ci80[1]}]` : 'N/A'}
                        </span>
                      </div>

                      <div className="bg-white dark:bg-slate-950 p-2.5 rounded border border-slate-200 dark:border-slate-800/80">
                        <span className="text-[10px] text-slate-500 block uppercase">95% UNCERTAINTY [L, U]</span>
                        <span className="text-slate-800 dark:text-slate-300 font-mono text-xs block mt-0.5">
                          {ci95 ? `[${ci95[0]}, ${ci95[1]}]` : 'N/A'}
                        </span>
                      </div>
                    </div>

                    {/* Ground-Truth Confirmation Trace (If Confirmed) */}
                    {pred.status === 'CONFIRMED' && (
                      <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 rounded text-xs space-y-1.5">
                        <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-semibold">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          <span>Incident Materialization Corroborated: True Positive Anticipation</span>
                        </div>
                        <p className="text-slate-700 dark:text-slate-300">
                          {pred.confirmedIncident ? (
                            <>
                              Linked to Phase 2 Incident: <strong className="text-emerald-700 dark:text-emerald-300">{pred.confirmedIncident.title}</strong>.
                            </>
                          ) : (
                            <>
                              Sensor crossed hazard threshold {pred.thresholdValue} as anticipated.
                            </>
                          )}
                          {' '}Advance notice provided: <strong className="text-amber-700 dark:text-amber-300">+{pred.actualLeadTimeMin} minutes lead time</strong> before materialization.
                        </p>
                      </div>
                    )}

                    {/* Expired / False Alarm Note */}
                    {pred.status === 'EXPIRED' && (
                      <div className="p-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded text-xs text-slate-600 dark:text-slate-400">
                        <span>Prediction horizon expired without threshold crossing. Marked as False Alarm / Successfully Mitigated.</span>
                      </div>
                    )}
                  </div>

                  {/* Contributing Multi-Modal Evidence Matrix */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-mono text-slate-600 dark:text-slate-400 font-semibold block">
                      Contributing Anticipatory Signals &amp; Evidence Matrix:
                    </span>
                    <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded bg-white dark:bg-slate-950">
                      <table className="w-full text-left text-xs font-mono">
                        <thead className="bg-slate-100 dark:bg-slate-900/90 text-[10px] text-slate-600 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                          <tr>
                            <th className="p-2.5">Evidence Channel</th>
                            <th className="p-2.5">Signal Type</th>
                            <th className="p-2.5">Weight (w)</th>
                            <th className="p-2.5">Evaluated Condition</th>
                            <th className="p-2.5">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {evidenceList.map((e: any, idx: number) => (
                            <tr key={idx} className={e.satisfied ? 'bg-purple-950/10' : 'bg-transparent text-slate-500'}>
                              <td className="p-2.5 font-semibold text-slate-200">
                                <Badge variant={e.satisfied ? 'info' : 'outline'} size="sm">
                                  {e.sensorType || 'MODEL_FORECAST'}
                                </Badge>
                              </td>
                              <td className="p-2.5 text-slate-300">
                                {e.signalType}
                              </td>
                              <td className="p-2.5 text-slate-400 font-mono">
                                {e.weight ? Number(e.weight).toFixed(2) : '-'}
                              </td>
                              <td className="p-2.5 text-slate-300">
                                {e.explanation || (e.observedValue !== undefined ? `Observed ${e.observedValue}` : 'Condition met')}
                              </td>
                              <td className="p-2.5">
                                {e.satisfied ? (
                                  <Badge variant="success" size="sm">
                                    <Check className="w-2.5 h-2.5 mr-0.5" /> Satisfied
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" size="sm">
                                    Unmet
                                  </Badge>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* TAB 2: Unified Incidents (Phase 2) */}
      {activeTab === 'incidents' && (
        <div className="space-y-4">
          {incidents.length === 0 ? (
            <Card className="text-center py-12 text-slate-500 font-mono text-xs border-slate-200 dark:border-slate-800">
              No incidents matching filter &quot;{incidentFilter}&quot;. Trigger a scenario above to observe real-time cross-sensor correlation.
            </Card>
          ) : (
            incidents.map((incident) => {
              const evidenceList: any[] = Array.isArray(incident.evidence) ? incident.evidence : [];
              const audit = incident.auditPayload || {};
              const distinctCount = audit.distinctSensorCount || new Set(evidenceList.filter((e) => e.satisfied).map((e) => e.sensorId)).size;
              const confidencePct = Math.round((incident.confidence || 0) * 100);

              return (
                <Card key={incident.id} className="space-y-4 border-slate-200 dark:border-slate-800">
                  {/* Header */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800/80 pb-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {getIncidentIcon(incident.incidentType)}
                        <span className="text-sm font-bold text-slate-900 dark:text-slate-100">{incident.title}</span>
                        <Badge variant={getSeverityBadgeVariant(incident.severity)}>
                          {incident.severity}
                        </Badge>
                        <Badge variant={getStatusBadgeVariant(incident.status)}>
                          {incident.status}
                        </Badge>
                        <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-sky-100 dark:bg-sky-950/70 border border-sky-300 dark:border-sky-800 text-sky-800 dark:text-sky-300">
                          {confidencePct}% Mathematical Confidence
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-600 dark:text-slate-400">
                        <span>Room: <strong className="text-slate-800 dark:text-slate-200">{incident.room?.name || 'Home'}</strong></span>
                        <span>•</span>
                        <span>First Detected: {formatRelativeTime(incident.firstDetectedAt)}</span>
                        <span>•</span>
                        <span>Last Corroborated: {formatRelativeTime(incident.lastEvidenceAt)}</span>
                        {incident.resolvedAt && (
                          <>
                            <span>•</span>
                            <span className="text-emerald-600 dark:text-emerald-400">Resolved: {formatRelativeTime(incident.resolvedAt)}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Action Controls */}
                    <div className="flex items-center gap-2 shrink-0">
                      {incident.status !== 'RESOLVED' && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleIncidentStatus(incident.id, 'RESOLVED')}
                          className="text-xs font-mono"
                        >
                          <Check className="w-3.5 h-3.5 mr-1 text-emerald-500 dark:text-emerald-400" />
                          Resolve
                        </Button>
                      )}
                      {incident.status !== 'DISMISSED' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleIncidentStatus(incident.id, 'DISMISSED')}
                          className="text-xs font-mono text-slate-400 hover:text-slate-200"
                        >
                          <X className="w-3.5 h-3.5 mr-1" />
                          Dismiss
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Summary & Explainability Statement */}
                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-sans">
                    {incident.summary}
                  </p>

                  {/* Verifiable Mathematical Derivation Box */}
                  <div className="rounded bg-slate-50 dark:bg-slate-900/80 p-3 border border-slate-200 dark:border-slate-800 text-xs font-mono space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 pb-1.5">
                      <span className="flex items-center gap-1.5 text-sky-600 dark:text-sky-400 font-semibold">
                        <Info className="w-3.5 h-3.5" />
                        <span>Confidence Formula &amp; Audit Trace</span>
                      </span>
                      <span className="text-slate-500">
                        Deterministic Correlation Matrix
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1 text-[11px]">
                      <div className="bg-white dark:bg-slate-950 p-2.5 rounded border border-slate-200 dark:border-slate-800/80">
                        <span className="text-[10px] text-slate-500 block uppercase">Formula</span>
                        <span className="text-slate-800 dark:text-slate-300 font-mono text-xs block mt-0.5">
                          Conf = min(0.99, RawConf × Corroboration)
                        </span>
                      </div>

                      <div className="bg-white dark:bg-slate-950 p-2.5 rounded border border-slate-200 dark:border-slate-800/80">
                        <span className="text-[10px] text-slate-500 block uppercase">Signal Weights (Raw Confidence)</span>
                        <span className="text-sky-600 dark:text-sky-300 font-mono text-xs block mt-0.5">
                          Raw = {audit.rawConfidence !== undefined ? audit.rawConfidence : (incident.confidence / (audit.corroborationFactor || 1.0)).toFixed(2)}
                        </span>
                      </div>

                      <div className="bg-white dark:bg-slate-950 p-2.5 rounded border border-slate-200 dark:border-slate-800/80">
                        <span className="text-[10px] text-slate-500 block uppercase">Sensor Corroboration</span>
                        <span className="text-emerald-600 dark:text-emerald-300 font-mono text-xs block mt-0.5">
                          {distinctCount} distinct physical {distinctCount === 1 ? 'channel' : 'channels'} (factor: {audit.corroborationFactor || (0.7 + 0.1 * Math.max(0, distinctCount - 1)).toFixed(2)})
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Multi-Sensor Evidence Matrix Table */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-mono text-slate-600 dark:text-slate-400 font-semibold block">
                      Contributing Multi-Sensor Evidence Matrix ({evidenceList.length} signals evaluated):
                    </span>
                    <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded bg-white dark:bg-slate-950">
                      <table className="w-full text-left text-xs font-mono">
                        <thead className="bg-slate-100 dark:bg-slate-900/90 text-[10px] text-slate-600 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                          <tr>
                            <th className="p-2.5">Sensor Channel</th>
                            <th className="p-2.5">Observed Value</th>
                            <th className="p-2.5">Condition Evaluated</th>
                            <th className="p-2.5">Weight (w)</th>
                            <th className="p-2.5">Status</th>
                            <th className="p-2.5">Observed At</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
                          {evidenceList.map((e: any, idx: number) => (
                            <tr key={idx} className={e.satisfied ? 'bg-sky-950/10' : 'bg-transparent text-slate-500'}>
                              <td className="p-2.5 font-semibold text-slate-200 flex items-center gap-1.5">
                                <Badge variant={e.satisfied ? 'info' : 'outline'} size="sm">
                                  {e.sensorType}
                                </Badge>
                                <span className="text-[11px] text-slate-400">{e.sensorId}</span>
                              </td>
                              <td className="p-2.5 font-semibold text-slate-100">
                                {e.observedValue} {e.unit}
                              </td>
                              <td className="p-2.5 text-slate-300">
                                {e.explanation || `${e.signalType}`}
                              </td>
                              <td className="p-2.5 text-slate-400">
                                {e.weight ? e.weight.toFixed(2) : '-'}
                              </td>
                              <td className="p-2.5">
                                {e.satisfied ? (
                                  <Badge variant="success" size="sm">
                                    <Check className="w-2.5 h-2.5 mr-0.5" /> Satisfied
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" size="sm">
                                    Unmet
                                  </Badge>
                                )}
                              </td>
                              <td className="p-2.5 text-[10px] text-slate-400 whitespace-nowrap">
                                {e.timestamp ? formatRelativeTime(e.timestamp) : '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* TAB 3: Statistical Baselines & Single-Sensor Anomalies (Phase 1) */}
      {activeTab === 'baselines' && (
        <div className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center h-48 font-mono text-xs text-slate-500">
              Evaluating historical baselines and current deviations...
            </div>
          ) : insights.length === 0 ? (
            <Card className="text-center py-12 text-slate-500 font-mono text-xs">
              No active anomalies detected. All sensors are operating within their established ±2.5σ baseline bounds.
            </Card>
          ) : (
            insights.map((insight) => {
              const evidence = insight.evidenceData || {};
              const isHeuristic = insight.isHeuristic;

              return (
                <Card key={insight.id} className="space-y-3">
                  {/* Header */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-slate-100">{insight.title}</span>
                        <Badge
                          size="sm"
                          variant={isHeuristic ? 'outline' : 'info'}
                        >
                          {isHeuristic ? 'Heuristic Rule' : `Z-Score Anomaly (${Math.round(insight.confidence * 100)}%)`}
                        </Badge>
                        <span className="text-[11px] font-mono text-slate-500">
                          {insight.room?.name || 'Home'} • {formatRelativeTime(insight.createdAt)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 mt-1">{insight.summary}</p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleBaselineInsightStatus(insight.id, 'ACKNOWLEDGED')}
                        className="text-xs font-mono"
                      >
                        Acknowledge
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleBaselineInsightStatus(insight.id, 'DISMISSED')}
                        className="text-xs font-mono text-slate-500 hover:text-slate-300"
                      >
                        Dismiss
                      </Button>
                    </div>
                  </div>

                  {/* Verifiable Mathematical Derivation Box */}
                  <div className="rounded bg-slate-50 dark:bg-slate-950 p-3.5 border border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-mono text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800/80 pb-1.5">
                      <span className="flex items-center gap-1 text-sky-600 dark:text-sky-400">
                        <Info className="w-3.5 h-3.5" />
                        <span>Mathematical Derivation &amp; Audit Evidence</span>
                      </span>
                      <span className="text-slate-500">
                        {isHeuristic ? 'Deterministic Rule Formula' : 'Gaussian Standard Score'}
                      </span>
                    </div>

                    <p className="text-xs font-mono text-slate-700 dark:text-slate-300 leading-relaxed">
                      {insight.explanation}
                    </p>

                    {/* Parametric Breakdown Grid */}
                    {!isHeuristic && evidence.baselineMean !== undefined && (
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 pt-2 border-t border-slate-200 dark:border-slate-800/60 text-xs font-mono">
                        <div className="bg-white dark:bg-slate-900/60 p-2 rounded border border-slate-200 dark:border-transparent">
                          <span className="text-[10px] text-slate-500 block">OBSERVED (x)</span>
                          <span className="text-slate-900 dark:text-slate-200 font-semibold">
                            {evidence.value || evidence.currentValue} {evidence.unit || ''}
                          </span>
                        </div>

                        <div className="bg-white dark:bg-slate-900/60 p-2 rounded border border-slate-200 dark:border-transparent">
                          <span className="text-[10px] text-slate-500 block">BASELINE MEAN (μ)</span>
                          <span className="text-slate-900 dark:text-slate-200 font-semibold">
                            {evidence.baselineMean} {evidence.unit || ''}
                          </span>
                        </div>

                        <div className="bg-white dark:bg-slate-900/60 p-2 rounded border border-slate-200 dark:border-transparent">
                          <span className="text-[10px] text-slate-500 block">STD DEV (σ)</span>
                          <span className="text-slate-900 dark:text-slate-200 font-semibold">
                            ±{evidence.baselineStdDev} {evidence.unit || ''}
                          </span>
                        </div>

                        <div className="bg-white dark:bg-slate-900/60 p-2 rounded border border-slate-200 dark:border-transparent">
                          <span className="text-[10px] text-slate-500 block">Z-SCORE</span>
                          <span className="text-amber-600 dark:text-amber-400 font-semibold font-mono">
                            {evidence.zScore > 0 ? `+${evidence.zScore}` : evidence.zScore}
                          </span>
                        </div>

                        <div className="bg-white dark:bg-slate-900/60 p-2 rounded border border-slate-200 dark:border-transparent">
                          <span className="text-[10px] text-slate-500 block">DEVIATION (Δ)</span>
                          <span className="text-rose-600 dark:text-rose-400 font-semibold">
                            {evidence.deviationPercent > 0 ? `+${evidence.deviationPercent}%` : `${evidence.deviationPercent}%`}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </Card>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
