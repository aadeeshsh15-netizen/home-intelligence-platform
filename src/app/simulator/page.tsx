'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useRealtimeTelemetry } from '@/lib/useRealtimeTelemetry';
import {
  Play,
  Square,
  RefreshCw,
  FlaskConical,
  Zap,
  Thermometer,
  Wind,
  Droplets,
  AlertOctagon,
  CheckCircle2,
} from 'lucide-react';

export default function SimulatorStudioPage() {
  const { connectionState, lastTick } = useRealtimeTelemetry();
  const [rooms, setRooms] = useState<any[]>([]);
  const [status, setStatus] = useState<any>({ isRunning: false, activeAnomalies: [] });
  const [selectedRoomId, setSelectedRoomId] = useState<string>('');
  const [selectedAnomalyType, setSelectedAnomalyType] = useState<string>('POWER_SURGE');
  const [logMessages, setLogMessages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchRoomsAndStatus = async () => {
    try {
      const [resRooms, resSim] = await Promise.all([
        fetch('/api/rooms'),
        fetch('/api/simulator'),
      ]);
      if (resRooms.ok) {
        const d = await resRooms.json();
        setRooms(d.rooms);
        if (d.rooms.length > 0 && !selectedRoomId) {
          setSelectedRoomId(d.rooms[0].id);
        }
      }
      if (resSim.ok) {
        const d = await resSim.json();
        setStatus(d.status);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchRoomsAndStatus();
    const interval = setInterval(fetchRoomsAndStatus, 6000);
    return () => clearInterval(interval);
  }, []);

  const addLog = (msg: string) => {
    setLogMessages((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 19)]);
  };

  const handleStart = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/simulator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', intervalMs: 4000 }),
      });
      if (res.ok) {
        addLog('Telemetry Simulator started (4000ms loop)');
        fetchRoomsAndStatus();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/simulator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' }),
      });
      if (res.ok) {
        addLog('Telemetry Simulator paused');
        fetchRoomsAndStatus();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleManualTick = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/simulator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'tick' }),
      });
      if (res.ok) {
        addLog('Single simulation tick evaluated and ingested');
        fetchRoomsAndStatus();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleInjectAnomaly = async () => {
    if (!selectedRoomId || !selectedAnomalyType) return;
    try {
      const room = rooms.find((r) => r.id === selectedRoomId);
      const res = await fetch('/api/simulator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'inject_anomaly',
          anomaly: {
            type: selectedAnomalyType,
            roomId: selectedRoomId,
            active: true,
            intensity: 1.5,
          },
        }),
      });
      if (res.ok) {
        addLog(`Injected anomaly "${selectedAnomalyType}" into ${room?.name || selectedRoomId}`);
        fetchRoomsAndStatus();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleClearAnomaly = async (roomId: string, type: string) => {
    try {
      const res = await fetch('/api/simulator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear_anomaly', roomId, type }),
      });
      if (res.ok) {
        addLog(`Cleared anomaly "${type}"`);
        fetchRoomsAndStatus();
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-100">Telemetry Simulator Studio</h1>
            <Badge variant="info">Producer Engine</Badge>
          </div>
          <p className="text-xs text-slate-400 font-mono mt-1">
            Physical thermodynamic simulation controls and intentional anomaly injection
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Badge variant={status.isRunning ? 'success' : 'outline'}>
            {status.isRunning ? 'RUNNING (4s loop)' : 'PAUSED'}
          </Badge>
          <Badge variant={connectionState === 'LIVE' ? 'success' : 'warning'}>
            SSE: {connectionState}
          </Badge>
        </div>
      </div>

      {/* Control Panel Bar */}
      <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-lg flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {status.isRunning ? (
            <Button variant="danger" onClick={handleStop} disabled={loading} className="text-xs font-mono">
              <Square className="w-3.5 h-3.5" />
              <span>Pause Simulator Loop</span>
            </Button>
          ) : (
            <Button variant="primary" onClick={handleStart} disabled={loading} className="text-xs font-mono">
              <Play className="w-3.5 h-3.5" />
              <span>Start Continuous Loop (4s)</span>
            </Button>
          )}

          <Button variant="secondary" onClick={handleManualTick} disabled={loading} className="text-xs font-mono">
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Single Tick Step</span>
          </Button>
        </div>

        {lastTick && (
          <div className="text-xs font-mono text-slate-400 flex items-center gap-2">
            <span className="text-slate-500">LAST TELEMETRY INGEST:</span>
            <span className="text-sky-400 font-semibold">
              {lastTick.roomName} • {lastTick.type}: {lastTick.value} {lastTick.unit}
            </span>
          </div>
        )}
      </div>

      {/* Anomaly Injector Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-amber-400" />
              <CardTitle>Physical Anomaly Injection</CardTitle>
            </div>
          </CardHeader>
          <p className="text-xs text-slate-400 mb-4">
            Select a target room and thermodynamic or electrical disturbance to observe the real-time pipeline and intelligence layer reaction:
          </p>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-slate-400">Target Household Room:</label>
              <select
                value={selectedRoomId}
                onChange={(e) => setSelectedRoomId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs font-mono text-slate-200"
              >
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.roomType})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-mono text-slate-400">Disturbance Phenomenon:</label>
              <select
                value={selectedAnomalyType}
                onChange={(e) => setSelectedAnomalyType(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs font-mono text-slate-200"
              >
                <option value="POWER_SURGE">POWER_SURGE: Auxiliary appliance rogue draw (+2.8 kW)</option>
                <option value="WINDOW_OPEN">WINDOW_OPEN: Thermal envelope leak (rapid drift to outdoors)</option>
                <option value="AC_FAILURE">AC_FAILURE: HVAC compressor trip (temperature climbs uncontrolled)</option>
                <option value="CO2_SPIKE">CO2_SPIKE: High occupancy ventilation deficit (+30 ppm/min)</option>
                <option value="SHOWER_SURGE">SHOWER_SURGE: Humidity spike without exhaust fan (&gt;90% RH)</option>
              </select>
            </div>

            <Button
              variant="primary"
              onClick={handleInjectAnomaly}
              className="w-full text-xs font-mono"
            >
              <AlertOctagon className="w-3.5 h-3.5 mr-1" />
              <span>Inject Anomaly into Live Loop</span>
            </Button>
          </div>
        </Card>

        {/* Active Anomalies & Logs */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Active Injected Disturbances ({status.activeAnomalies?.length || 0})</CardTitle>
            </CardHeader>
            <div className="space-y-2">
              {status.activeAnomalies?.length === 0 ? (
                <p className="text-xs font-mono text-slate-500 py-3 text-center">
                  No active artificial anomalies injected. Physical simulation running normal baselines.
                </p>
              ) : (
                status.activeAnomalies.map((anom: any) => {
                  const room = rooms.find((r) => r.id === anom.roomId);
                  return (
                    <div
                      key={`${anom.roomId}_${anom.type}`}
                      className="flex items-center justify-between p-2.5 rounded bg-slate-950 border border-amber-900/60 text-xs font-mono"
                    >
                      <div>
                        <span className="text-amber-300 font-bold block">{anom.type}</span>
                        <span className="text-[10px] text-slate-400">
                          Target: {room?.name || anom.roomId}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleClearAnomaly(anom.roomId, anom.type)}
                        className="text-[10px] font-mono text-rose-400 hover:text-rose-300"
                      >
                        Clear
                      </Button>
                    </div>
                  );
                })
              )}
            </div>
          </Card>

          {/* Engine Console Output */}
          <Card>
            <CardHeader>
              <CardTitle>Simulator Engine Telemetry Stream Log</CardTitle>
            </CardHeader>
            <div className="bg-slate-950 rounded p-3 font-mono text-[11px] text-slate-400 h-44 overflow-y-auto space-y-1 border border-slate-800">
              {logMessages.length === 0 ? (
                <span className="text-slate-600">Engine events will log here in real time...</span>
              ) : (
                logMessages.map((msg, i) => <div key={i}>{msg}</div>)
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
