'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useRealtimeTelemetry, TelemetryTick } from '@/lib/useRealtimeTelemetry';
import { formatMetricValue, formatRelativeTime } from '@/lib/formatters';
import Link from 'next/link';
import {
  Thermometer,
  Droplets,
  Wind,
  Zap,
  Users,
  ShieldCheck,
  AlertTriangle,
  ArrowUpRight,
  TrendingUp,
  Cpu,
  ChevronRight,
  Lightbulb,
} from 'lucide-react';

export default function DashboardPage() {
  const [overview, setOverview] = useState<any>(null);
  const [rooms, setRooms] = useState<any[]>([]);
  const [recentEvents, setRecentEvents] = useState<any[]>([]);
  const [activeInsights, setActiveInsights] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Live telemetry updates handler
  const handleTick = useCallback((tick: TelemetryTick) => {
    setRooms((prevRooms) =>
      prevRooms.map((room) => {
        if (room.id === tick.roomId) {
          return {
            ...room,
            metrics: {
              ...room.metrics,
              [tick.type.toLowerCase()]: {
                ...room.metrics[tick.type.toLowerCase()],
                value: tick.value,
                lastSeen: tick.timestamp,
              },
            },
          };
        }
        return room;
      })
    );
  }, []);

  useRealtimeTelemetry(handleTick);

  const fetchDashboardData = async () => {
    try {
      const [resHome, resRooms, resEvents, resInsights] = await Promise.all([
        fetch('/api/home'),
        fetch('/api/rooms'),
        fetch('/api/events'),
        fetch('/api/insights'),
      ]);

      if (resHome.ok) setOverview(await resHome.json());
      if (resRooms.ok) {
        const d = await resRooms.json();
        setRooms(d.rooms);
      }
      if (resEvents.ok) {
        const d = await resEvents.json();
        setRecentEvents(d.events.slice(0, 5));
      }
      if (resInsights.ok) {
        const d = await resInsights.json();
        setActiveInsights(d.insights.slice(0, 3));
      }
    } catch (e) {
      console.error('Failed to load dashboard data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 12000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !overview) {
    return (
      <div className="flex items-center justify-center h-64 font-mono text-sm text-slate-500 animate-pulse">
        Initializing telemetry streams and calculating baselines...
      </div>
    );
  }

  const isHomeNormal = (overview?.activeAlertsCount || 0) === 0;

  return (
    <div className="space-y-6">
      {/* 1. System Status Ribbon */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 p-4 rounded-lg">
        <div className="flex items-center gap-3">
          <div
            className={`w-3.5 h-3.5 rounded-full ${
              isHomeNormal ? 'bg-emerald-400' : 'bg-amber-400 animate-ping'
            }`}
          />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold uppercase tracking-wider text-slate-200">
                System Condition:
              </span>
              <Badge variant={isHomeNormal ? 'success' : 'warning'}>
                {isHomeNormal ? 'OPTIMAL' : `${overview.activeAlertsCount} ACTIVE ATTENTIONS`}
              </Badge>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Continuous thermodynamic model running. Telemetry polling actively verified.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 font-mono text-xs text-slate-400">
          <span>Active Fleet: {overview?.fleetHealth?.onlineDevices} / {overview?.fleetHealth?.totalDevices} Devices</span>
          <span>•</span>
          <span>Sensors: {overview?.home?.totalSensors} Monitored</span>
        </div>
      </div>

      {/* 2. Core Environmental & Physical KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {/* Climate */}
        <Card className="col-span-1">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Avg Climate</span>
            <Thermometer className="w-4 h-4 text-sky-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-mono font-bold text-slate-100">
              {overview?.climate?.avgTemperature}°C
            </span>
            <span className="text-xs font-mono text-slate-400">
              {overview?.climate?.avgHumidity}% RH
            </span>
          </div>
          <div className="text-[11px] text-slate-500 font-mono mt-2">
            Comfort target: 21.0°C
          </div>
        </Card>

        {/* Air Quality */}
        <Card className="col-span-1">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Indoor Air Quality</span>
            <Wind className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-mono font-bold text-slate-100">
              {overview?.climate?.avgCO2}
            </span>
            <span className="text-xs font-mono text-slate-400">ppm CO₂</span>
          </div>
          <div className="mt-2">
            <Badge
              size="sm"
              variant={overview?.climate?.airQualityStatus === 'EXCELLENT' ? 'success' : 'warning'}
            >
              {overview?.climate?.airQualityStatus}
            </Badge>
          </div>
        </Card>

        {/* Energy Draw */}
        <Card className="col-span-1">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Active Power</span>
            <Zap className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-mono font-bold text-slate-100">
              {formatMetricValue(overview?.energy?.currentTotalWatts, 'W')}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 font-mono mt-2">
            Peak today: {overview?.energy?.peakWattsToday} W
          </div>
        </Card>

        {/* Occupancy */}
        <Card className="col-span-1">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Occupancy</span>
            <Users className="w-4 h-4 text-violet-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-mono font-bold text-slate-100">
              {overview?.occupancy?.occupiedRoomsCount}
            </span>
            <span className="text-xs font-mono text-slate-400">Rooms Active</span>
          </div>
          <div className="text-[11px] text-slate-500 truncate mt-2 font-mono">
            {overview?.occupancy?.occupiedRoomNames?.join(', ') || 'No presence detected'}
          </div>
        </Card>

        {/* Hardware Fleet */}
        <Card className="col-span-1">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Hardware Fleet</span>
            <Cpu className="w-4 h-4 text-sky-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-mono font-bold text-emerald-400">
              {overview?.fleetHealth?.onlineDevices}
            </span>
            <span className="text-xs font-mono text-slate-400">
              / {overview?.fleetHealth?.totalDevices} Online
            </span>
          </div>
          <div className="text-[11px] text-slate-500 font-mono mt-2">
            Stale sensors: {overview?.fleetHealth?.staleSensors}
          </div>
        </Card>
      </div>

      {/* 3. Rooms Real-Time Telemetry Grid */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Room Telemetry & Micro-Conditions
          </h2>
          <Link
            href="/home-view"
            className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1 font-mono"
          >
            <span>Interactive Floor Plan</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {rooms.map((room) => {
            const temp = room.metrics?.temperature?.value;
            const humidity = room.metrics?.humidity?.value;
            const co2 = room.metrics?.co2?.value;
            const power = room.metrics?.power?.value;
            const occupied = room.metrics?.occupancy?.value === 1;

            return (
              <Link key={room.id} href={`/rooms/${room.id}`}>
                <Card className="hover:border-slate-700 transition-all hover:bg-slate-900/80 cursor-pointer h-full">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-slate-200">{room.name}</span>
                    <Badge size="sm" variant={occupied ? 'info' : 'outline'}>
                      {occupied ? 'Occupied' : 'Clear'}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                    <div className="bg-slate-950/60 p-2 rounded border border-slate-800/60">
                      <span className="text-slate-500 block text-[10px]">TEMP</span>
                      <span className="text-slate-200 font-semibold">
                        {temp !== undefined ? `${temp.toFixed(1)}°C` : '—'}
                      </span>
                    </div>

                    <div className="bg-slate-950/60 p-2 rounded border border-slate-800/60">
                      <span className="text-slate-500 block text-[10px]">HUMIDITY</span>
                      <span className="text-slate-200 font-semibold">
                        {humidity !== undefined ? `${Math.round(humidity)}%` : '—'}
                      </span>
                    </div>

                    <div className="bg-slate-950/60 p-2 rounded border border-slate-800/60">
                      <span className="text-slate-500 block text-[10px]">CO₂</span>
                      <span className={co2 > 1000 ? 'text-amber-400 font-semibold' : 'text-slate-200 font-semibold'}>
                        {co2 !== undefined ? `${Math.round(co2)} ppm` : '—'}
                      </span>
                    </div>

                    <div className="bg-slate-950/60 p-2 rounded border border-slate-800/60">
                      <span className="text-slate-500 block text-[10px]">POWER</span>
                      <span className="text-slate-200 font-semibold">
                        {power !== undefined ? `${Math.round(power)} W` : '—'}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
                    <span>{room.deviceCount} Devices</span>
                    {room.activeAlertCount > 0 && (
                      <span className="text-amber-400 font-mono">
                        {room.activeAlertCount} alert
                      </span>
                    )}
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>

      {/* 4. Bottom Grid: Explainable Insights & Active Events */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Explainable AI Insights */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-amber-400" />
              <CardTitle>Deterministic AI Intelligence & Baselines</CardTitle>
            </div>
            <Link href="/insights" className="text-xs text-sky-400 hover:text-sky-300 font-mono">
              View All ({activeInsights.length})
            </Link>
          </CardHeader>

          <div className="space-y-3">
            {activeInsights.length === 0 ? (
              <p className="text-xs text-slate-500 font-mono py-4 text-center">
                All metrics currently match 14-day historical baseline models.
              </p>
            ) : (
              activeInsights.map((insight) => (
                <div
                  key={insight.id}
                  className="p-3 rounded border border-slate-800 bg-slate-950/60 space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-200">
                      {insight.title}
                    </span>
                    <Badge size="sm" variant={insight.isHeuristic ? 'outline' : 'info'}>
                      {insight.isHeuristic ? 'Heuristic Rule' : `Z-Score Anomaly (${Math.round(insight.confidence * 100)}%)`}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-400">{insight.summary}</p>
                  <p className="text-[11px] font-mono text-slate-500 bg-slate-900/80 p-1.5 rounded border border-slate-800/60">
                    {insight.explanation}
                  </p>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Active Events & Rule Triggers */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-sky-400" />
              <CardTitle>Recent Event Stream</CardTitle>
            </div>
            <Link href="/events" className="text-xs text-sky-400 hover:text-sky-300 font-mono">
              Event Log
            </Link>
          </CardHeader>

          <div className="space-y-2.5">
            {recentEvents.length === 0 ? (
              <p className="text-xs text-slate-500 font-mono py-4 text-center">
                No active threshold violations or hardware alerts.
              </p>
            ) : (
              recentEvents.map((event) => (
                <div
                  key={event.id}
                  className="flex items-start justify-between p-2.5 rounded border border-slate-800 bg-slate-950/60 gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
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
                      <span className="text-xs font-medium text-slate-200">{event.title}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{event.description}</p>
                    <span className="text-[10px] font-mono text-slate-500 mt-1 block">
                      {event.room?.name || 'Home'} • {formatRelativeTime(event.createdAt)}
                    </span>
                  </div>

                  <Badge size="sm" variant={event.status === 'ACTIVE' ? 'warning' : 'outline'}>
                    {event.status}
                  </Badge>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
