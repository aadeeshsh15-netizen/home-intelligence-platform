'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatRelativeTime, formatTimestampIso } from '@/lib/formatters';
import {
  BellRing,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Filter,
  ShieldAlert,
  Radio,
} from 'lucide-react';

export default function EventsPage() {
  const [events, setEvents] = useState<any[]>([]);
  const [counts, setCounts] = useState<any>({ total: 0, active: 0, critical: 0, warning: 0 });
  const [statusFilter, setStatusFilter] = useState<string>('ACTIVE');
  const [severityFilter, setSeverityFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      let url = `/api/events?`;
      if (statusFilter && statusFilter !== 'ALL') url += `status=${statusFilter}&`;
      if (severityFilter) url += `severity=${severityFilter}&`;

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events);
        setCounts(data.counts);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [statusFilter, severityFilter]);

  const updateEventStatus = async (id: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/events/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        // Optimistic local state update
        setEvents((prev) =>
          prev.map((e) => (e.id === id ? { ...e, status: newStatus } : e))
        );
        fetchEvents();
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Event Stream & Audit Log</h1>
          <p className="text-xs text-slate-400 font-mono mt-1">
            Structured rule breaches, device state transitions, and environmental alerts
          </p>
        </div>

        {/* Counter Summary */}
        <div className="flex items-center gap-3 text-xs font-mono">
          <Badge variant="warning">{counts.active} Active</Badge>
          {counts.critical > 0 && <Badge variant="critical">{counts.critical} Critical</Badge>}
          <span className="text-slate-500">Total Logged: {counts.total}</span>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900/60 border border-slate-800 p-3 rounded-lg">
        {/* Status Filter */}
        <div className="flex items-center gap-1.5 text-xs font-mono">
          <span className="text-slate-500 uppercase mr-1">Status:</span>
          {['ACTIVE', 'ACKNOWLEDGED', 'RESOLVED', 'ALL'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
                statusFilter === st
                  ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        {/* Severity Filter */}
        <div className="flex items-center gap-1.5 text-xs font-mono">
          <span className="text-slate-500 uppercase mr-1">Severity:</span>
          {['', 'CRITICAL', 'ERROR', 'WARNING', 'INFO'].map((sev) => (
            <button
              key={sev || 'ANY'}
              onClick={() => setSeverityFilter(sev)}
              className={`px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
                severityFilter === sev
                  ? 'bg-slate-700 text-slate-100 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {sev || 'ALL'}
            </button>
          ))}
        </div>
      </div>

      {/* Events List */}
      <div className="space-y-3">
        {loading ? (
          <div className="flex items-center justify-center h-48 font-mono text-xs text-slate-500">
            Querying event ledger...
          </div>
        ) : events.length === 0 ? (
          <Card className="text-center py-12 text-slate-500 font-mono text-xs">
            No events match the selected filter criteria.
          </Card>
        ) : (
          events.map((event) => {
            const isCritical = event.severity === 'CRITICAL';
            const isResolved = event.status === 'RESOLVED';

            return (
              <Card
                key={event.id}
                className={`transition-colors ${
                  isCritical && !isResolved
                    ? 'border-red-800/80 bg-red-950/20'
                    : 'bg-slate-950/80'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  {/* Event Details */}
                  <div className="space-y-1.5 max-w-3xl">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        size="sm"
                        variant={
                          event.severity === 'CRITICAL'
                            ? 'critical'
                            : event.severity === 'ERROR'
                            ? 'error'
                            : event.severity === 'WARNING'
                            ? 'warning'
                            : 'info'
                        }
                      >
                        {event.severity}
                      </Badge>
                      <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] font-mono text-slate-400 uppercase">
                        {event.category}
                      </span>
                      <h3 className="text-sm font-bold text-slate-200">{event.title}</h3>
                    </div>

                    <p className="text-xs text-slate-300">{event.description}</p>

                    {/* Context Data Metadata */}
                    {event.contextData && (
                      <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-slate-400 bg-slate-900/60 px-2.5 py-1 rounded border border-slate-800/60 w-fit">
                        {event.contextData.value !== undefined && (
                          <span>Observed: {event.contextData.value} {event.contextData.unit}</span>
                        )}
                        {event.contextData.threshold !== undefined && (
                          <span>Limit: {event.contextData.threshold} {event.contextData.unit}</span>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-3 text-[11px] font-mono text-slate-500">
                      <span>Room: {event.room?.name || 'Whole Home'}</span>
                      {event.device && <span>Device: {event.device.name}</span>}
                      <span>Logged: {formatRelativeTime(event.createdAt)} ({formatTimestampIso(event.createdAt)})</span>
                    </div>
                  </div>

                  {/* Status & Resolution Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge
                      variant={
                        event.status === 'ACTIVE'
                          ? 'warning'
                          : event.status === 'ACKNOWLEDGED'
                          ? 'info'
                          : 'default'
                      }
                    >
                      {event.status}
                    </Badge>

                    {event.status === 'ACTIVE' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => updateEventStatus(event.id, 'ACKNOWLEDGED')}
                        className="text-xs font-mono"
                      >
                        Acknowledge
                      </Button>
                    )}

                    {event.status !== 'RESOLVED' && (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => updateEventStatus(event.id, 'RESOLVED')}
                        className="text-xs font-mono"
                      >
                        Resolve
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
