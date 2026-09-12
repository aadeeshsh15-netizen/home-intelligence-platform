'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useRealtimeTelemetry, TelemetryTick } from '@/lib/useRealtimeTelemetry';
import { formatMetricValue, formatRelativeTime } from '@/lib/formatters';
import Link from 'next/link';
import { useTheme } from '@/lib/theme';
import { useHome } from '@/lib/home-context';
import {
  Layers,
  Thermometer,
  Droplets,
  Zap,
  Users,
  AlertTriangle,
  ArrowRight,
  Cpu,
  Radio,
  Building2,
  Edit2,
  Check,
  RefreshCw,
} from 'lucide-react';

export default function HomeViewPage() {
  const { homeName, stats, updateHomeName, isSaving } = useHome();
  const [isEditing, setIsEditing] = useState(false);
  const [inputName, setInputName] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [floors, setFloors] = useState<any[]>([]);
  const [selectedFloorIndex, setSelectedFloorIndex] = useState(0);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { isDark } = useTheme();

  const handleSave = async () => {
    const res = await updateHomeName(inputName);
    if (res.success) {
      setIsEditing(false);
      setEditError(null);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } else {
      setEditError(res.error || 'Failed to save');
    }
  };

  // Live telemetry updates handler
  const handleTick = useCallback((tick: TelemetryTick) => {
    setFloors((prevFloors) =>
      prevFloors.map((floor) => ({
        ...floor,
        rooms: floor.rooms.map((room: any) => {
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
        }),
      }))
    );
  }, []);

  useRealtimeTelemetry(handleTick);

  useEffect(() => {
    async function loadFloors() {
      try {
        const res = await fetch('/api/floors');
        if (res.ok) {
          const data = await res.json();
          setFloors(data.floors);
          if (data.floors.length > 0 && data.floors[0].rooms.length > 0) {
            setSelectedRoomId(data.floors[0].rooms[0].id);
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    loadFloors();
  }, []);

  const activeFloor = floors[selectedFloorIndex];
  const selectedRoom = activeFloor?.rooms?.find((r: any) => r.id === selectedRoomId) || activeFloor?.rooms?.[0];

  return (
    <div className="space-y-6">
      {/* HOME IDENTITY & SETTINGS CARD */}
      <div id="identity" className="bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                Home Identity
              </span>
              {saveSuccess && (
                <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 flex items-center gap-1 animate-in fade-in duration-200">
                  <Check className="w-3 h-3" /> Saved
                </span>
              )}
            </div>

            {isEditing ? (
              <div className="pt-1 space-y-2 max-w-md">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={inputName}
                    onChange={(e) => setInputName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSave();
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        setIsEditing(false);
                        setEditError(null);
                      }
                    }}
                    autoFocus
                    maxLength={64}
                    placeholder="Enter home name (e.g. Sharma Residence)..."
                    className="text-sm font-medium px-3 py-1.5 rounded-lg border border-blue-500 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 w-full"
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setIsEditing(false);
                      setEditError(null);
                    }}
                    className="text-xs h-8 px-2.5"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={isSaving}
                    className="text-xs h-8 px-3.5 bg-blue-600 hover:bg-blue-700 text-white font-medium"
                  >
                    {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'Save'}
                  </Button>
                </div>
                {editError && (
                  <p className="text-[11px] font-mono text-rose-500 font-medium">
                    {editError}
                  </p>
                )}
                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                  Press Enter to save • Escape to cancel • 1-64 characters
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-3 pt-0.5">
                <span className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                  {homeName}
                </span>
                <button
                  onClick={() => {
                    setInputName(homeName);
                    setIsEditing(true);
                    setEditError(null);
                  }}
                  className="text-xs font-mono text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium flex items-center gap-1 cursor-pointer hover:underline"
                >
                  <Edit2 className="w-3 h-3" />
                  Edit
                </button>
              </div>
            )}
          </div>

          {/* Supporting Information (2 Floors · 7 Rooms · 28 Sensors) */}
          <div className="flex items-center gap-2 sm:gap-3 text-xs font-mono text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800/80 rounded-lg px-3 py-2 shrink-0">
            <span className="font-semibold text-slate-800 dark:text-slate-200">{stats.totalFloors} Floors</span>
            <span className="text-slate-300 dark:text-slate-700">·</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">{stats.totalRooms} Rooms</span>
            <span className="text-slate-300 dark:text-slate-700">·</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">{stats.totalSensors} Sensors</span>
          </div>
        </div>
      </div>

      {loading || floors.length === 0 ? (
        <div className="flex items-center justify-center h-64 font-mono text-sm text-slate-500 animate-pulse bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-xl">
          Rendering architectural floor-plan schematic...
        </div>
      ) : (
        <>
          {/* Header & Floor Switcher */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Interactive Home View</h1>
            <Badge variant="info">Digital Twin</Badge>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-1">
            Spatial 2D schematic with continuous sensor mapping and occupancy states
          </p>
        </div>

        {/* Floor Level Switcher */}
        <div className="flex items-center bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded p-1 gap-1">
          {floors.map((floor, idx) => (
            <button
              key={floor.id}
              onClick={() => {
                setSelectedFloorIndex(idx);
                if (floor.rooms.length > 0) setSelectedRoomId(floor.rooms[0].id);
              }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-mono transition-colors cursor-pointer ${
                selectedFloorIndex === idx
                  ? 'bg-sky-500/20 text-sky-600 dark:text-sky-400 border border-sky-500/40 font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{floor.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Floor-Plan Canvas & Room Inspector Split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 2D Floor Plan Canvas */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-6 relative overflow-hidden min-h-[500px]">
          {/* Floor Plan Header */}
          <div className="flex items-center justify-between mb-4 text-xs font-mono text-slate-500 dark:text-slate-400">
            <span>LEVEL {activeFloor.level} // {activeFloor.name.toUpperCase()}</span>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Occupied
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-700" /> Vacant
              </span>
            </div>
          </div>

          {/* SVG Floor Plan Schematic */}
          <div className="relative w-full aspect-4/3 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800/80 rounded-md p-4">
            <svg
              viewBox="0 0 100 100"
              className="w-full h-full"
              preserveAspectRatio="xMidYMid meet"
            >
              <defs>
                <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
                  <path
                    d="M 10 0 L 0 0 0 10"
                    fill="none"
                    stroke={isDark ? '#1e293b' : '#e2e8f0'}
                    strokeWidth="0.4"
                  />
                </pattern>
              </defs>
              <rect width="100" height="100" fill="url(#grid)" />

              {/* Exterior wall boundary */}
              <rect
                x="2"
                y="3"
                width="96"
                height="94"
                fill="none"
                stroke={isDark ? '#334155' : '#cbd5e1'}
                strokeWidth="1"
                strokeDasharray="2 1"
              />

              {/* Interactive Rooms */}
              {activeFloor.rooms.map((room: any) => {
                const isSelected = room.id === selectedRoomId;
                const isOccupied = room.metrics?.occupancy?.value === 1;
                const temp = room.metrics?.temperature?.value;
                const power = room.metrics?.power?.value;

                return (
                  <g
                    key={room.id}
                    onClick={() => setSelectedRoomId(room.id)}
                    className="cursor-pointer transition-all duration-200"
                  >
                    {/* Room Rectangle */}
                    <rect
                      x={room.layout.x}
                      y={room.layout.y}
                      width={room.layout.w}
                      height={room.layout.h}
                      rx="1"
                      className={`transition-colors ${
                        isSelected
                          ? 'fill-sky-100 dark:fill-sky-950/70 stroke-sky-500 dark:stroke-sky-400 stroke-[1.2]'
                          : isOccupied
                          ? 'fill-emerald-50 dark:fill-emerald-950/30 hover:fill-emerald-100 dark:hover:fill-slate-800/60 stroke-emerald-500 dark:stroke-emerald-800/80 stroke-[0.8]'
                          : 'fill-slate-100 dark:fill-slate-900/80 hover:fill-slate-200 dark:hover:fill-slate-800/60 stroke-slate-300 dark:stroke-slate-700 stroke-[0.6]'
                      }`}
                    />

                    {/* Room Label */}
                    <text
                      x={room.layout.x + 3}
                      y={room.layout.y + 6}
                      fill={isSelected ? (isDark ? '#38bdf8' : '#0284c7') : (isDark ? '#e2e8f0' : '#0f172a')}
                      fontSize="3.2"
                      fontWeight="600"
                      fontFamily="system-ui"
                    >
                      {room.name}
                    </text>

                    {/* Live Metric Badges inside Room */}
                    {temp !== undefined && (
                      <text
                        x={room.layout.x + 3}
                        y={room.layout.y + 12}
                        fill={isDark ? '#94a3b8' : '#475569'}
                        fontSize="2.8"
                        fontFamily="monospace"
                      >
                        {temp.toFixed(1)}°C
                      </text>
                    )}

                    {power !== undefined && (
                      <text
                        x={room.layout.x + 3}
                        y={room.layout.y + 17}
                        fill={isDark ? '#cbd5e1' : '#64748b'}
                        fontSize="2.8"
                        fontFamily="monospace"
                      >
                        {Math.round(power)}W
                      </text>
                    )}

                    {/* Occupancy Indicator Dot */}
                    {isOccupied && (
                      <circle
                        cx={room.layout.x + room.layout.w - 4}
                        cy={room.layout.y + 5}
                        r="1.8"
                        fill={isDark ? '#34d399' : '#059669'}
                        className="animate-pulse"
                      />
                    )}

                    {/* Alert Flag */}
                    {room.activeAlertCount > 0 && (
                      <circle
                        cx={room.layout.x + room.layout.w - 9}
                        cy={room.layout.y + 5}
                        r="1.8"
                        fill="#f59e0b"
                      />
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* Selected Room Telemetry & Hardware Inspector */}
        <div className="space-y-4">
          {selectedRoom ? (
            <Card>
              <CardHeader>
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-slate-100 font-bold text-sm">
                      {selectedRoom.name}
                    </CardTitle>
                    <Badge size="sm" variant={selectedRoom.metrics?.occupancy?.value === 1 ? 'info' : 'outline'}>
                      {selectedRoom.metrics?.occupancy?.value === 1 ? 'Occupied' : 'Vacant'}
                    </Badge>
                  </div>
                  <span className="text-[11px] font-mono text-slate-500 block mt-0.5">
                    Type: {selectedRoom.roomType} • Target: {selectedRoom.targetTemp || 21.0}°C
                  </span>
                </div>
              </CardHeader>

              {/* Live Environmental Matrix */}
              <div className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Realtime Sensor Telemetry
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div className="bg-slate-50 dark:bg-slate-950 p-2.5 rounded border border-slate-200 dark:border-slate-800">
                    <span className="text-slate-500 block text-[10px]">TEMPERATURE</span>
                    <span className="text-slate-900 dark:text-slate-100 font-bold text-base">
                      {selectedRoom.metrics?.temperature?.value !== undefined
                        ? `${selectedRoom.metrics.temperature.value.toFixed(1)}°C`
                        : '—'}
                    </span>
                    <span className="text-[10px] text-slate-500 block">
                      Target: {selectedRoom.targetTemp || 21.0}°C
                    </span>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-950 p-2.5 rounded border border-slate-200 dark:border-slate-800">
                    <span className="text-slate-500 block text-[10px]">HUMIDITY</span>
                    <span className="text-slate-900 dark:text-slate-100 font-bold text-base">
                      {selectedRoom.metrics?.humidity?.value !== undefined
                        ? `${Math.round(selectedRoom.metrics.humidity.value)}%`
                        : '—'}
                    </span>
                    <span className="text-[10px] text-slate-500 block">
                      RH psychrometric
                    </span>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-950 p-2.5 rounded border border-slate-200 dark:border-slate-800">
                    <span className="text-slate-500 block text-[10px]">CO₂ / AIR</span>
                    <span className="text-slate-900 dark:text-slate-100 font-bold text-base">
                      {selectedRoom.metrics?.co2?.value !== undefined
                        ? `${Math.round(selectedRoom.metrics.co2.value)} ppm`
                        : '—'}
                    </span>
                    <span className="text-[10px] text-slate-500 block">
                      Base: 415 ppm
                    </span>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-950 p-2.5 rounded border border-slate-200 dark:border-slate-800">
                    <span className="text-slate-500 block text-[10px]">POWER LOAD</span>
                    <span className="text-slate-900 dark:text-slate-100 font-bold text-base">
                      {selectedRoom.metrics?.power?.value !== undefined
                        ? `${Math.round(selectedRoom.metrics.power.value)} W`
                        : '—'}
                    </span>
                    <span className="text-[10px] text-slate-500 block">
                      Active draw
                    </span>
                  </div>
                </div>

                {/* Connected Hardware Devices */}
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Connected Devices ({selectedRoom.devices?.length || 0})
                    </span>
                  </div>
                  <div className="space-y-2">
                    {selectedRoom.devices?.map((dev: any) => (
                      <div
                        key={dev.id}
                        className="flex items-center justify-between p-2 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono"
                      >
                        <div>
                          <span className="text-slate-900 dark:text-slate-200 font-medium block">{dev.name}</span>
                          <span className="text-[10px] text-slate-500">
                            {dev.identifier} • {dev.protocol}
                          </span>
                        </div>
                        <Badge size="sm" variant={dev.status === 'ONLINE' ? 'success' : 'error'}>
                          {dev.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Action Deep-Dive */}
                <div className="pt-3">
                  <Link href={`/rooms/${selectedRoom.id}`}>
                    <Button className="w-full text-xs font-mono" variant="primary">
                      <span>Full Room Telemetry & History</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  </Link>
                </div>
              </div>
            </Card>
          ) : (
            <Card className="text-center py-12 text-slate-500 font-mono text-xs">
              Select a room on the floor plan to inspect telemetry
            </Card>
          )}
        </div>
      </div>
      </>
      )}
    </div>
  );
}
