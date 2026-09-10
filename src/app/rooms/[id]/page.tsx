'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import {
  ArrowLeft,
  Thermometer,
  Droplets,
  Wind,
  Zap,
  Volume2,
  Users,
  AlertTriangle,
  Cpu,
  Radio,
  Clock,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { formatMetricValue, formatRelativeTime } from '@/lib/formatters';

export default function RoomDetailPage() {
  const params = useParams();
  const roomId = params?.id as string;

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/rooms/${roomId}`);
        if (res.ok) {
          setData(await res.json());
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    if (roomId) load();
  }, [roomId]);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-64 font-mono text-sm text-slate-500 animate-pulse">
        Retrieving room telemetry and sensor history...
      </div>
    );
  }

  const { room, sparklines } = data;

  const tempSensor = room.sensors.find((s: any) => s.type === 'TEMPERATURE');
  const humiditySensor = room.sensors.find((s: any) => s.type === 'HUMIDITY');
  const co2Sensor = room.sensors.find((s: any) => s.type === 'CO2');
  const powerSensor = room.sensors.find((s: any) => s.type === 'POWER');
  const occupancySensor = room.sensors.find((s: any) => s.type === 'OCCUPANCY');
  const noiseSensor = room.sensors.find((s: any) => s.type === 'NOISE');

  const isOccupied = occupancySensor?.lastReadingValue === 1;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <Link
            href="/rooms"
            className="inline-flex items-center gap-1.5 text-xs font-mono text-slate-400 hover:text-slate-200 mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Rooms</span>
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-slate-100">{room.name}</h1>
            <Badge variant={isOccupied ? 'info' : 'outline'}>
              {isOccupied ? 'Occupied' : 'Vacant'}
            </Badge>
            <span className="text-xs font-mono text-slate-500">
              Level {room.floor?.level} ({room.floor?.name})
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 font-mono text-xs text-slate-400">
          <span>Target: {room.targetTemp || 21.0}°C</span>
          <span>•</span>
          <span>{room.sensors.length} Sensors</span>
          <span>•</span>
          <span>{room.devices.length} Devices</span>
        </div>
      </div>

      {/* Live Conditions Metric Matrix */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Temperature */}
        <Card className="p-3.5">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[10px] font-mono font-semibold uppercase">Temperature</span>
            <Thermometer className="w-3.5 h-3.5 text-sky-400" />
          </div>
          <span className="text-xl font-mono font-bold text-slate-100 block">
            {formatMetricValue(tempSensor?.lastReadingValue, '°C')}
          </span>
          <span className="text-[10px] font-mono text-slate-500">
            Health: {tempSensor?.health || 'HEALTHY'}
          </span>
        </Card>

        {/* Humidity */}
        <Card className="p-3.5">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[10px] font-mono font-semibold uppercase">Humidity</span>
            <Droplets className="w-3.5 h-3.5 text-teal-400" />
          </div>
          <span className="text-xl font-mono font-bold text-slate-100 block">
            {formatMetricValue(humiditySensor?.lastReadingValue, '%')}
          </span>
          <span className="text-[10px] font-mono text-slate-500">
            Health: {humiditySensor?.health || 'HEALTHY'}
          </span>
        </Card>

        {/* CO2 */}
        <Card className="p-3.5">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[10px] font-mono font-semibold uppercase">CO₂</span>
            <Wind className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <span className="text-xl font-mono font-bold text-slate-100 block">
            {formatMetricValue(co2Sensor?.lastReadingValue, 'ppm')}
          </span>
          <span className="text-[10px] font-mono text-slate-500">
            Health: {co2Sensor?.health || 'HEALTHY'}
          </span>
        </Card>

        {/* Power */}
        <Card className="p-3.5">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[10px] font-mono font-semibold uppercase">Power</span>
            <Zap className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <span className="text-xl font-mono font-bold text-slate-100 block">
            {formatMetricValue(powerSensor?.lastReadingValue, 'W')}
          </span>
          <span className="text-[10px] font-mono text-slate-500">
            Health: {powerSensor?.health || 'HEALTHY'}
          </span>
        </Card>

        {/* Occupancy */}
        <Card className="p-3.5">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[10px] font-mono font-semibold uppercase">Occupancy</span>
            <Users className="w-3.5 h-3.5 text-violet-400" />
          </div>
          <span className="text-xl font-mono font-bold text-slate-100 block">
            {isOccupied ? 'Occupied' : 'Vacant'}
          </span>
          <span className="text-[10px] font-mono text-slate-500">
            Passive Infrared (PIR)
          </span>
        </Card>

        {/* Noise */}
        <Card className="p-3.5">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[10px] font-mono font-semibold uppercase">Noise</span>
            <Volume2 className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <span className="text-xl font-mono font-bold text-slate-100 block">
            {formatMetricValue(noiseSensor?.lastReadingValue, 'dB')}
          </span>
          <span className="text-[10px] font-mono text-slate-500">
            Health: {noiseSensor?.health || 'HEALTHY'}
          </span>
        </Card>
      </div>

      {/* 24-Hour Historical Trends */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Temperature Trend */}
        <Card>
          <CardHeader>
            <CardTitle>24-Hour Temperature (°C)</CardTitle>
            <span className="text-[10px] font-mono text-slate-500">
              Downsampled 30m resolution
            </span>
          </CardHeader>
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparklines?.TEMPERATURE || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis
                  dataKey="timestamp"
                  stroke="#64748b"
                  fontSize={10}
                  tickFormatter={(val) => new Date(val).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                />
                <YAxis stroke="#64748b" fontSize={10} domain={['dataMin - 1', 'dataMax + 1']} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0b0f17', borderColor: '#1e293b', fontSize: '11px' }}
                  formatter={(value: any) => [`${value}°C`, 'Temp']}
                  labelFormatter={(lbl) => new Date(lbl).toLocaleString()}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#38bdf8"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Power Draw Trend */}
        <Card>
          <CardHeader>
            <CardTitle>24-Hour Active Power (W)</CardTitle>
            <span className="text-[10px] font-mono text-slate-500">
              Downsampled 30m resolution
            </span>
          </CardHeader>
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparklines?.POWER || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis
                  dataKey="timestamp"
                  stroke="#64748b"
                  fontSize={10}
                  tickFormatter={(val) => new Date(val).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                />
                <YAxis stroke="#64748b" fontSize={10} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0b0f17', borderColor: '#1e293b', fontSize: '11px' }}
                  formatter={(value: any) => [`${value} W`, 'Power']}
                  labelFormatter={(lbl) => new Date(lbl).toLocaleString()}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#fbbf24"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Connected Hardware & Active Room Events */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Connected Hardware */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-sky-400" />
              <CardTitle>Connected Equipment ({room.devices.length})</CardTitle>
            </div>
          </CardHeader>
          <div className="space-y-3">
            {room.devices.length === 0 ? (
              <p className="text-xs text-slate-500 font-mono py-4 text-center">
                No physical devices bound to this room.
              </p>
            ) : (
              room.devices.map((device: any) => (
                <div
                  key={device.id}
                  className="flex items-center justify-between p-3 rounded bg-slate-950 border border-slate-800"
                >
                  <div>
                    <span className="text-xs font-semibold text-slate-200 block">
                      {device.name}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">
                      ID: {device.identifier} • Protocol: {device.protocol} • FW: {device.firmwareVersion || 'N/A'}
                    </span>
                  </div>
                  <Badge size="sm" variant={device.status === 'ONLINE' ? 'success' : 'error'}>
                    {device.status}
                  </Badge>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Room Events & Intelligence */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <CardTitle>Recent Room Events</CardTitle>
            </div>
          </CardHeader>
          <div className="space-y-3">
            {room.events.length === 0 ? (
              <p className="text-xs text-slate-500 font-mono py-4 text-center">
                No active threshold alerts or recent state changes for this room.
              </p>
            ) : (
              room.events.map((event: any) => (
                <div
                  key={event.id}
                  className="p-3 rounded bg-slate-950 border border-slate-800 space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-200">{event.title}</span>
                    <Badge size="sm" variant={event.severity === 'CRITICAL' ? 'critical' : 'warning'}>
                      {event.severity}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-400">{event.description}</p>
                  <span className="text-[10px] font-mono text-slate-500 block">
                    {formatRelativeTime(event.createdAt)}
                  </span>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
