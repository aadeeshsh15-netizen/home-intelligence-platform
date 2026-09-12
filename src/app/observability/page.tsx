'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatRelativeTime } from '@/lib/formatters';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Cpu,
  Database,
  Eye,
  Filter,
  Gauge,
  Layers,
  Network,
  Radio,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  Wifi,
  WifiOff,
  Zap,
} from 'lucide-react';

export default function ObservabilityDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Timeline filters
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [page, setPage] = useState(0);
  const [timelineData, setTimelineData] = useState<any>({ events: [], totalCount: 0 });
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  // Device fleet
  const [devices, setDevices] = useState<any[]>([]);

  const fetchObservabilityOverview = async () => {
    try {
      setRefreshing(true);
      const [obsRes, devRes] = await Promise.all([
        fetch('/api/observability'),
        fetch('/api/devices'),
      ]);

      if (obsRes.ok) setData(await obsRes.json());
      if (devRes.ok) {
        const d = await devRes.json();
        setDevices(d.devices || []);
      }
    } catch (e) {
      console.error('Failed to load observability data:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchTimeline = async () => {
    try {
      const params = new URLSearchParams();
      params.set('limit', '20');
      params.set('offset', String(page * 20));
      if (categoryFilter !== 'ALL') params.set('category', categoryFilter);
      if (severityFilter !== 'ALL') params.set('severity', severityFilter);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());

      const res = await fetch(`/api/observability/timeline?${params.toString()}`);
      if (res.ok) {
        setTimelineData(await res.json());
      }
    } catch (e) {
      console.error('Failed to query timeline:', e);
    }
  };

  useEffect(() => {
    fetchObservabilityOverview();
    const interval = setInterval(fetchObservabilityOverview, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    fetchTimeline();
  }, [categoryFilter, severityFilter, searchQuery, page]);

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4 font-mono text-sm text-slate-400">
        <Activity className="w-8 h-8 text-sky-400 animate-spin" />
        <p>Initializing Subsystem Telemetry & Performance Counters...</p>
      </div>
    );
  }

  const health = data?.health;
  const metrics = data?.metrics;
  const subsystems = health?.subsystems || {};

  const categories = [
    'ALL',
    'TELEMETRY',
    'ANOMALY',
    'INCIDENT',
    'PREDICTION',
    'AUTOMATION',
    'COMMAND',
    'SECURITY',
    'SYSTEM',
  ];

  const severities = ['ALL', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'];

  return (
    <div className="space-y-6 pb-12">
      {/* Header with status badge and actions */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              <Gauge className="w-6 h-6 text-sky-500 dark:text-sky-400" />
              System Observability & Auditing
            </h1>
            <Badge
              className={`px-2.5 py-0.5 font-mono text-xs border ${
                health?.status === 'HEALTHY'
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                  : health?.status === 'DEGRADED'
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
                  : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30'
              }`}
            >
              ● {health?.status || 'HEALTHY'}
            </Badge>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono">
            Structured Causal Timeline · Subsystem Health Bounds · Performance Percentiles
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              fetchObservabilityOverview();
              fetchTimeline();
            }}
            disabled={refreshing}
            className="border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh Telemetry
          </Button>
        </div>
      </div>

      {/* SUBSYSTEM HEALTH STATUS CARDS */}
      <div>
        <h2 className="text-xs font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-2">
          <Server className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400" /> Deterministic Subsystem Health Checks
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {Object.entries(subsystems).map(([key, check]: [string, any]) => {
            const isHealthy = check.status === 'HEALTHY';
            const isDegraded = check.status === 'DEGRADED';

            return (
              <Card key={key} className="p-3">
                <div className="flex items-center justify-between text-xs font-mono uppercase text-slate-500 dark:text-slate-400">
                  <span className="truncate">{check.name?.replace('_', ' ')}</span>
                  {isHealthy ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
                  ) : isDegraded ? (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
                  ) : (
                    <AlertOctagon className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400" />
                  )}
                </div>
                <div className="mt-2 text-sm font-bold text-slate-900 dark:text-white font-mono flex items-center justify-between">
                  <span>{check.status}</span>
                  {check.latencyMs !== undefined && (
                    <span className="text-[11px] font-normal text-slate-500">{check.latencyMs}ms</span>
                  )}
                </div>
                <p className="text-[10px] text-slate-600 dark:text-slate-400 mt-1 leading-tight line-clamp-2">
                  {check.message}
                </p>
              </Card>
            );
          })}
        </div>
      </div>

      {/* PERFORMANCE LATENCY RIBBON */}
      <div>
        <h2 className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-amber-400" /> Pipeline Processing Latencies (p50 / p95)
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Ingestion', metric: metrics?.latencies?.ingestion },
            { label: 'Correlation', metric: metrics?.latencies?.incidentDetection },
            { label: 'Prediction', metric: metrics?.latencies?.predictionGeneration },
            { label: 'Automation', metric: metrics?.latencies?.automationDecision },
            { label: 'Command ACK', metric: metrics?.latencies?.commandAck },
            { label: 'Verification', metric: metrics?.latencies?.verification },
          ].map((item, idx) => (
            <Card key={idx} className="bg-slate-900/70 border-slate-800 p-3">
              <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                {item.label}
              </div>
              <div className="mt-1 text-base font-bold text-white font-mono flex items-baseline gap-1">
                <span>{item.metric?.p50 ?? 0}</span>
                <span className="text-[10px] font-normal text-slate-500">ms (p50)</span>
              </div>
              <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                p95: <span className="text-sky-400">{item.metric?.p95 ?? 0}ms</span> · n={item.metric?.count ?? 0}
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* EVENT / AUDIT TIMELINE WITH MULTI-ATTRIBUTE FILTERING */}
      <Card className="bg-slate-900/80 border-slate-800">
        <CardHeader className="pb-3 border-b border-slate-800">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" />
                Causal Audit & Event Timeline
              </CardTitle>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Total recorded audit events: {timelineData.totalCount}
              </p>
            </div>

            {/* Search Input */}
            <div className="relative w-full md:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Search event or summary..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(0);
                }}
                className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded pl-8 pr-3 py-1 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-sky-500 font-mono"
              />
            </div>
          </div>

          {/* Category & Severity Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5 pt-3">
            <span className="text-[10px] font-mono text-slate-500 mr-1 uppercase">Category:</span>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => {
                  setCategoryFilter(cat);
                  setPage(0);
                }}
                className={`text-[10px] font-mono px-2 py-0.5 rounded transition-colors ${
                  categoryFilter === cat
                    ? 'bg-sky-500 text-white font-bold'
                    : 'bg-slate-100 dark:bg-slate-950 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-800'
                }`}
              >
                {cat}
              </button>
            ))}

            <span className="text-[10px] font-mono text-slate-500 ml-3 mr-1 uppercase">Severity:</span>
            {severities.map((sev) => (
              <button
                key={sev}
                onClick={() => {
                  setSeverityFilter(sev);
                  setPage(0);
                }}
                className={`text-[10px] font-mono px-2 py-0.5 rounded transition-colors ${
                  severityFilter === sev
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'bg-slate-100 dark:bg-slate-950 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-800'
                }`}
              >
                {sev}
              </button>
            ))}
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {timelineData.events.length === 0 ? (
            <div className="p-8 text-center font-mono text-xs text-slate-500">
              No audit events matched the selected filter criteria.
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800/80">
              {timelineData.events.map((evt: any) => {
                const isExpanded = expandedEventId === evt.id;
                const sevColor =
                  evt.severity === 'CRITICAL'
                    ? 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30'
                    : evt.severity === 'WARNING'
                    ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30'
                    : 'text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-500/10 border-sky-200 dark:border-sky-500/30';

                return (
                  <div key={evt.id} className="p-3 hover:bg-slate-50 dark:hover:bg-slate-950/40 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono border ${sevColor}`}>
                            {evt.category}
                          </span>
                          <span className="font-semibold text-xs text-slate-900 dark:text-slate-200">{evt.eventType}</span>
                          <span className="text-[10px] font-mono text-slate-500">src: {evt.source}</span>
                          {evt.entityId && (
                            <span className="text-[10px] font-mono text-slate-600 dark:text-slate-500 bg-slate-100 dark:bg-slate-950 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-800">
                              id: {evt.entityId.slice(0, 12)}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-700 dark:text-slate-300 font-sans">{evt.summary}</p>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-[10px] font-mono text-slate-500">
                          {new Date(evt.timestamp).toLocaleTimeString()}
                        </span>
                        {evt.metadata && (
                          <button
                            onClick={() => setExpandedEventId(isExpanded ? null : evt.id)}
                            className="text-[11px] font-mono text-sky-600 dark:text-sky-400 hover:text-sky-500 dark:hover:text-sky-300 flex items-center gap-0.5"
                          >
                            JSON {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                          </button>
                        )}
                      </div>
                    </div>

                    {isExpanded && evt.metadata && (
                      <div className="mt-2.5 p-2 bg-slate-100 dark:bg-slate-950 rounded border border-slate-300 dark:border-slate-800">
                        <div className="text-[10px] font-mono text-slate-500 mb-1">AUDIT METADATA:</div>
                        <pre className="text-[10px] font-mono text-slate-800 dark:text-slate-300 overflow-x-auto">
                          {JSON.stringify(evt.metadata, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination Controls */}
          <div className="flex items-center justify-between p-3 border-t border-slate-200 dark:border-slate-800 font-mono text-xs text-slate-600 dark:text-slate-400">
            <div>
              Showing {timelineData.offset + 1} - {Math.min(timelineData.offset + 20, timelineData.totalCount)} of{' '}
              {timelineData.totalCount} events
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
                className="text-xs border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300"
              >
                Previous
              </Button>
              <span>Page {page + 1}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={!timelineData.hasMore}
                onClick={() => setPage(page + 1)}
                className="text-xs border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300"
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* DEVICE FLEET CONNECTIVITY TABLE */}
      <Card className="border-slate-200 dark:border-slate-800">
        <CardHeader className="pb-3 border-b border-slate-200 dark:border-slate-800">
          <CardTitle className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Cpu className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
            Device Fleet Connectivity & Watchdog Health
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-100 dark:bg-slate-950/80 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase">
              <tr>
                <th className="p-3">Device Name</th>
                <th className="p-3">Identifier / MAC</th>
                <th className="p-3">Protocol</th>
                <th className="p-3">Role</th>
                <th className="p-3">Status</th>
                <th className="p-3">Last Seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {devices.map((device) => {
                const isOnline = device.status === 'ONLINE';
                const isStale = device.status === 'STALE';

                return (
                  <tr key={device.id} className="hover:bg-slate-50 dark:hover:bg-slate-950/40">
                    <td className="p-3 font-semibold text-slate-900 dark:text-slate-200">{device.name}</td>
                    <td className="p-3 text-slate-600 dark:text-slate-400">{device.identifier}</td>
                    <td className="p-3">
                      <Badge className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 text-[10px]">{device.protocol}</Badge>
                    </td>
                    <td className="p-3 text-slate-400">
                      {device.isActuator ? (
                        <span className="text-emerald-400">ACTUATOR ({device.actuatorType})</span>
                      ) : (
                        'SENSOR HUB'
                      )}
                    </td>
                    <td className="p-3">
                      <Badge
                        className={`text-[10px] ${
                          isOnline
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : isStale
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                            : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                        }`}
                      >
                        {device.status}
                      </Badge>
                    </td>
                    <td className="p-3 text-slate-500">
                      {device.lastSeenAt ? formatRelativeTime(new Date(device.lastSeenAt)) : 'Never'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
