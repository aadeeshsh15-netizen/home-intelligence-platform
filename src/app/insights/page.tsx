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
} from 'lucide-react';

export default function InsightsPage() {
  const { connectionState } = useRealtimeTelemetry();
  const [activeTab, setActiveTab] = useState<'incidents' | 'baselines'>('incidents');
  const [incidents, setIncidents] = useState<any[]>([]);
  const [activeIncidentCount, setActiveIncidentCount] = useState<number>(0);
  const [incidentFilter, setIncidentFilter] = useState<'ALL' | 'ACTIVE' | 'RESOLVED' | 'DISMISSED'>('ACTIVE');
  const [insights, setInsights] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [injectionStatus, setInjectionStatus] = useState<string | null>(null);

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
    fetchIncidents();
    fetchInsights();
  }, [incidentFilter]);

  // Poll incidents every 5 seconds if live
  useEffect(() => {
    const interval = setInterval(() => {
      fetchIncidents();
    }, 5000);
    return () => clearInterval(interval);
  }, [incidentFilter]);

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
      // Find room of matching type
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
        setInjectionStatus(`Injected ${type}. Evaluating multi-sensor correlation...`);
        // Trigger explicit correlation evaluation
        await fetch('/api/incidents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'evaluate' }),
        });

        setTimeout(() => {
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
          setInjectionStatus(null);
        }, 1200);
      }
    } catch (e) {
      console.error(e);
      setInjectionStatus('Failed to inject anomaly');
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-100">Household Intelligence Engine</h1>
            <Badge variant="info">Phase 2 Cross-Sensor Correlation</Badge>
          </div>
          <p className="text-xs text-slate-400 font-mono mt-1">
            Deterministic multi-sensor correlation engine producing unified, explainable household incidents
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Badge variant={activeIncidentCount > 0 ? 'critical' : 'success'}>
            {activeIncidentCount} Active {activeIncidentCount === 1 ? 'Incident' : 'Incidents'}
          </Badge>
          <Badge variant="outline">
            SSE: {connectionState}
          </Badge>
        </div>
      </div>

      {/* Intelligence Architecture Rationale Banner */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-4 grid grid-cols-1 md:grid-cols-4 gap-4 text-xs font-mono">
        <div className="space-y-1">
          <span className="text-slate-500 uppercase block text-[10px]">Correlation Window</span>
          <span className="text-slate-200 font-semibold block">Sliding 10–15 Min Envelopes</span>
          <p className="text-slate-400 text-[11px]">
            Aggregates synchronous readings across independent physical channels.
          </p>
        </div>

        <div className="space-y-1">
          <span className="text-slate-500 uppercase block text-[10px]">Evidence Formulation</span>
          <span className="text-sky-400 font-semibold block">Weighted Signal Matrix</span>
          <p className="text-slate-400 text-[11px]">
            Signal weights (Σw) determine baseline candidate confidence.
          </p>
        </div>

        <div className="space-y-1">
          <span className="text-slate-500 uppercase block text-[10px]">Corroboration Factor</span>
          <span className="text-emerald-400 font-semibold block">0.70 + 0.10 × (N - 1)</span>
          <p className="text-slate-400 text-[11px]">
            Rewards independent sensor channels; caps at 0.99 max.
          </p>
        </div>

        <div className="space-y-1">
          <span className="text-slate-500 uppercase block text-[10px]">Lifecycle Management</span>
          <span className="text-amber-400 font-semibold block">Deduplicated &amp; Auto-Cooldown</span>
          <p className="text-slate-400 text-[11px]">
            Suppresses duplicates; auto-resolves after 180s absence of evidence.
          </p>
        </div>
      </div>

      {/* Live Incident Injection Sandbox */}
      <Card className="border-sky-900/50 bg-sky-950/20">
        <CardHeader>
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-sky-400" />
              <CardTitle className="text-sky-300">Live Incident &amp; Disturbance Injection Sandbox</CardTitle>
            </div>
            {injectionStatus && (
              <span className="text-xs font-mono text-sky-400 animate-pulse">{injectionStatus}</span>
            )}
          </div>
        </CardHeader>
        <p className="text-xs text-slate-400 mb-3">
          Inject multi-sensor phenomena into the physics pipeline to verify real-time cross-sensor correlation and explainable incident synthesis:
        </p>

        <div className="space-y-3">
          <div className="space-y-1.5">
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

              <Button
                size="sm"
                variant="outline"
                onClick={() => handleInjectQuickScenario('AC_FAILURE', 'LIVING_ROOM')}
                className="text-xs font-mono border-orange-900/60 hover:bg-orange-950/40 text-orange-300"
              >
                <Snowflake className="w-3.5 h-3.5 mr-1" />
                <span>Simulate AC Inefficiency / Failure</span>
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={() => handleInjectQuickScenario('WINDOW_OPEN', 'LIVING_ROOM')}
                className="text-xs font-mono border-sky-900/60 hover:bg-sky-950/40 text-sky-300"
              >
                <DoorClosed className="w-3.5 h-3.5 mr-1" />
                <span>Simulate Window Thermal Breach</span>
              </Button>
            </div>
          </div>

          <div className="space-y-1.5 pt-2 border-t border-slate-800/60">
            <div className="text-[11px] font-mono text-slate-500 uppercase tracking-wider font-semibold">
              Single-Sensor Physical Deviations:
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleInjectQuickAnomaly('POWER_SURGE', insights[0]?.roomId || '')}
                className="text-xs font-mono border-slate-800 hover:bg-slate-900 text-slate-300"
              >
                <Zap className="w-3.5 h-3.5 mr-1 text-amber-400" />
                <span>Living Room Power Surge (+2.8 kW)</span>
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={() => handleInjectQuickAnomaly('CO2_SPIKE', insights[0]?.roomId || '')}
                className="text-xs font-mono border-slate-800 hover:bg-slate-900 text-slate-300"
              >
                <Wind className="w-3.5 h-3.5 mr-1 text-emerald-400" />
                <span>CO₂ Ventilation Deficit Spike</span>
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Tabs Switcher */}
      <div className="flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('incidents')}
            className={`px-4 py-2.5 text-xs font-mono font-semibold transition-colors border-b-2 flex items-center gap-2 ${
              activeTab === 'incidents'
                ? 'border-sky-500 text-sky-400 bg-sky-950/20'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Unified Incidents ({incidents.length})</span>
            {activeIncidentCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 bg-rose-500/20 text-rose-400 rounded-full text-[10px]">
                {activeIncidentCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('baselines')}
            className={`px-4 py-2.5 text-xs font-mono font-semibold transition-colors border-b-2 flex items-center gap-2 ${
              activeTab === 'baselines'
                ? 'border-sky-500 text-sky-400 bg-sky-950/20'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Single-Sensor Baselines ({insights.length})</span>
          </button>
        </div>

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

      {/* TAB 1: Unified Incidents */}
      {activeTab === 'incidents' && (
        <div className="space-y-4">
          {incidents.length === 0 ? (
            <Card className="text-center py-12 text-slate-500 font-mono text-xs">
              No incidents matching filter &quot;{incidentFilter}&quot;. Trigger a scenario above to observe real-time cross-sensor correlation.
            </Card>
          ) : (
            incidents.map((incident) => {
              const evidenceList: any[] = Array.isArray(incident.evidence) ? incident.evidence : [];
              const audit = incident.auditPayload || {};
              const distinctCount = audit.distinctSensorCount || new Set(evidenceList.filter((e) => e.satisfied).map((e) => e.sensorId)).size;
              const confidencePct = Math.round((incident.confidence || 0) * 100);

              return (
                <Card key={incident.id} className="space-y-4 border-slate-800 bg-slate-950/60">
                  {/* Header */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {getIncidentIcon(incident.incidentType)}
                        <span className="text-sm font-bold text-slate-100">{incident.title}</span>
                        <Badge variant={getSeverityBadgeVariant(incident.severity)}>
                          {incident.severity}
                        </Badge>
                        <Badge variant={getStatusBadgeVariant(incident.status)}>
                          {incident.status}
                        </Badge>
                        <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-sky-950/70 border border-sky-800 text-sky-300">
                          {confidencePct}% Mathematical Confidence
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-400">
                        <span>Room: <strong className="text-slate-200">{incident.room?.name || 'Home'}</strong></span>
                        <span>•</span>
                        <span>First Detected: {formatRelativeTime(incident.firstDetectedAt)}</span>
                        <span>•</span>
                        <span>Last Corroborated: {formatRelativeTime(incident.lastEvidenceAt)}</span>
                        {incident.resolvedAt && (
                          <>
                            <span>•</span>
                            <span className="text-emerald-400">Resolved: {formatRelativeTime(incident.resolvedAt)}</span>
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
                          <Check className="w-3.5 h-3.5 mr-1 text-emerald-400" />
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
                  <p className="text-xs text-slate-300 leading-relaxed font-sans">
                    {incident.summary}
                  </p>

                  {/* Verifiable Mathematical Derivation Box */}
                  <div className="rounded bg-slate-900/80 p-3 border border-slate-800 text-xs font-mono space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-800 pb-1.5">
                      <span className="flex items-center gap-1.5 text-sky-400 font-semibold">
                        <Info className="w-3.5 h-3.5" />
                        <span>Confidence Formula &amp; Audit Trace</span>
                      </span>
                      <span className="text-slate-500">
                        Deterministic Correlation Matrix
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1 text-[11px]">
                      <div className="bg-slate-950 p-2.5 rounded border border-slate-800/80">
                        <span className="text-[10px] text-slate-500 block uppercase">Formula</span>
                        <span className="text-slate-300 font-mono text-xs block mt-0.5">
                          Conf = min(0.99, RawConf × Corroboration)
                        </span>
                      </div>

                      <div className="bg-slate-950 p-2.5 rounded border border-slate-800/80">
                        <span className="text-[10px] text-slate-500 block uppercase">Signal Weights (Raw Confidence)</span>
                        <span className="text-sky-300 font-mono text-xs block mt-0.5">
                          Raw = {audit.rawConfidence !== undefined ? audit.rawConfidence : (incident.confidence / (audit.corroborationFactor || 1.0)).toFixed(2)}
                        </span>
                      </div>

                      <div className="bg-slate-950 p-2.5 rounded border border-slate-800/80">
                        <span className="text-[10px] text-slate-500 block uppercase">Sensor Corroboration</span>
                        <span className="text-emerald-300 font-mono text-xs block mt-0.5">
                          {distinctCount} distinct physical {distinctCount === 1 ? 'channel' : 'channels'} (factor: {audit.corroborationFactor || (0.7 + 0.1 * Math.max(0, distinctCount - 1)).toFixed(2)})
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Multi-Sensor Evidence Matrix Table */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-mono text-slate-400 font-semibold block">
                      Contributing Multi-Sensor Evidence Matrix ({evidenceList.length} signals evaluated):
                    </span>
                    <div className="overflow-x-auto border border-slate-800 rounded bg-slate-950">
                      <table className="w-full text-left text-xs font-mono">
                        <thead className="bg-slate-900/90 text-[10px] text-slate-400 uppercase tracking-wider border-b border-slate-800">
                          <tr>
                            <th className="p-2.5">Sensor Channel</th>
                            <th className="p-2.5">Observed Value</th>
                            <th className="p-2.5">Condition Evaluated</th>
                            <th className="p-2.5">Weight (w)</th>
                            <th className="p-2.5">Status</th>
                            <th className="p-2.5">Observed At</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
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

      {/* TAB 2: Statistical Baselines & Single-Sensor Anomalies */}
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
                  <div className="rounded bg-slate-950 p-3.5 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 border-b border-slate-800/80 pb-1.5">
                      <span className="flex items-center gap-1 text-sky-400">
                        <Info className="w-3.5 h-3.5" />
                        <span>Mathematical Derivation &amp; Audit Evidence</span>
                      </span>
                      <span className="text-slate-500">
                        {isHeuristic ? 'Deterministic Rule Formula' : 'Gaussian Standard Score'}
                      </span>
                    </div>

                    <p className="text-xs font-mono text-slate-300 leading-relaxed">
                      {insight.explanation}
                    </p>

                    {/* Parametric Breakdown Grid */}
                    {!isHeuristic && evidence.baselineMean !== undefined && (
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 pt-2 border-t border-slate-800/60 text-xs font-mono">
                        <div className="bg-slate-900/60 p-2 rounded">
                          <span className="text-[10px] text-slate-500 block">OBSERVED (x)</span>
                          <span className="text-slate-200 font-semibold">
                            {evidence.value || evidence.currentValue} {evidence.unit || ''}
                          </span>
                        </div>

                        <div className="bg-slate-900/60 p-2 rounded">
                          <span className="text-[10px] text-slate-500 block">BASELINE MEAN (μ)</span>
                          <span className="text-slate-200 font-semibold">
                            {evidence.baselineMean} {evidence.unit || ''}
                          </span>
                        </div>

                        <div className="bg-slate-900/60 p-2 rounded">
                          <span className="text-[10px] text-slate-500 block">STD DEV (σ)</span>
                          <span className="text-slate-200 font-semibold">
                            ±{evidence.baselineStdDev} {evidence.unit || ''}
                          </span>
                        </div>

                        <div className="bg-slate-900/60 p-2 rounded">
                          <span className="text-[10px] text-slate-500 block">Z-SCORE</span>
                          <span className="text-amber-400 font-semibold font-mono">
                            {evidence.zScore > 0 ? `+${evidence.zScore}` : evidence.zScore}
                          </span>
                        </div>

                        <div className="bg-slate-900/60 p-2 rounded">
                          <span className="text-[10px] text-slate-500 block">DEVIATION (Δ)</span>
                          <span className="text-rose-400 font-semibold">
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
