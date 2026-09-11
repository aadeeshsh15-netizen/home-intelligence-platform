'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatRelativeTime, formatMetricValue } from '@/lib/formatters';
import {
  Cpu,
  Radio,
  CheckCircle2,
  AlertCircle,
  Clock,
  Wifi,
  Terminal,
  Activity,
  PlusCircle,
  Copy,
  Check,
  Trash2,
  Server,
  Layers,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';

interface DeviceItem {
  id: string;
  name: string;
  deviceType: string;
  hardwareType?: string | null;
  protocol: 'SIMULATED' | 'MQTT' | 'ZIGBEE' | 'MATTER' | 'HTTP';
  identifier: string;
  status: 'ONLINE' | 'STALE' | 'DEGRADED' | 'OFFLINE' | 'ERROR';
  provisioningStatus?: 'UNPROVISIONED' | 'PENDING_PAIRING' | 'PROVISIONED' | 'REVOKED';
  macAddress?: string | null;
  firmwareVersion?: string | null;
  lastSeenAt: string;
  room?: {
    id: string;
    name: string;
    floor?: { id: string; name: string };
  };
  sensors: Array<{
    id: string;
    type: string;
    unit: string;
    lastReadingValue?: number | null;
    lastReadingTime?: string | null;
    health: string;
  }>;
}

interface RoomOption {
  id: string;
  name: string;
  floorName?: string;
}

export default function DevicesPage() {
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [homeId, setHomeId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'ALL' | 'MQTT' | 'SIMULATED'>('ALL');

  // Provisioning Modal State
  const [showModal, setShowModal] = useState(false);
  const [provName, setProvName] = useState('');
  const [provRoomId, setProvRoomId] = useState('');
  const [provHardware, setProvHardware] = useState('ESP32_WROOM_32');
  const [provMac, setProvMac] = useState('');
  const [provSensors, setProvSensors] = useState<string[]>([
    'TEMPERATURE',
    'HUMIDITY',
    'CO2',
    'OCCUPANCY',
    'CONTACT',
  ]);
  const [provisioningLoading, setProvisioningLoading] = useState(false);
  const [provisionResult, setProvisionResult] = useState<any | null>(null);
  const [copied, setCopied] = useState(false);

  async function loadData() {
    try {
      setLoading(true);
      const [devRes, roomsRes, homeRes] = await Promise.all([
        fetch('/api/devices'),
        fetch('/api/rooms'),
        fetch('/api/home'),
      ]);

      if (devRes.ok) {
        const data = await devRes.json();
        setDevices(data.devices || []);
      }

      if (roomsRes.ok) {
        const rData = await roomsRes.json();
        setRooms(rData.rooms || []);
        if (rData.rooms && rData.rooms.length > 0 && !provRoomId) {
          setProvRoomId(rData.rooms[0].id);
        }
      }

      if (homeRes.ok) {
        const hData = await homeRes.json();
        if (hData.home?.id) setHomeId(hData.home.id);
      }
    } catch (e) {
      console.error('Failed to load device network:', e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const handleRegisterDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!provRoomId || !provName.trim()) return;

    try {
      setProvisioningLoading(true);
      const res = await fetch('/api/devices/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          homeId,
          roomId: provRoomId,
          name: provName.trim(),
          deviceType: 'ENVIRONMENTAL_HUB',
          hardwareType: provHardware,
          macAddress: provMac.trim() || undefined,
          sensorTypes: provSensors,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setProvisionResult(data);
        await loadData();
      } else {
        const err = await res.json();
        alert(`Provisioning failed: ${err.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      alert(`Provisioning failed: ${err.message}`);
    } finally {
      setProvisioningLoading(false);
    }
  };

  const handleRevokeDevice = async (deviceId: string, name: string) => {
    if (!confirm(`Are you sure you want to revoke credentials for ${name}? The physical device will be disconnected.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/devices/${deviceId}/revoke`, { method: 'POST' });
      if (res.ok) {
        await loadData();
      } else {
        alert('Failed to revoke device');
      }
    } catch (err) {
      console.error(err);
      alert('Error revoking device');
    }
  };

  const toggleSensor = (sType: string) => {
    setProvSensors((prev) =>
      prev.includes(sType) ? prev.filter((s) => s !== sType) : [...prev, sType]
    );
  };

  const copyConfig = () => {
    if (!provisionResult?.configSnippet) return;
    navigator.clipboard.writeText(provisionResult.configSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const filteredDevices = devices.filter((d) => {
    if (activeTab === 'ALL') return true;
    if (activeTab === 'MQTT') return d.protocol === 'MQTT';
    if (activeTab === 'SIMULATED') return d.protocol === 'SIMULATED';
    return true;
  });

  const physicalCount = devices.filter((d) => d.protocol === 'MQTT').length;
  const simulatedCount = devices.filter((d) => d.protocol === 'SIMULATED').length;
  const onlineCount = devices.filter((d) => d.status === 'ONLINE').length;
  const staleCount = devices.filter((d) => d.status === 'STALE').length;
  const offlineCount = devices.filter((d) => d.status === 'OFFLINE').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 font-mono text-sm text-slate-500 animate-pulse">
        Querying hardware registry and device network...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-100">Hardware Fleet Inventory</h1>
            <Badge variant="outline" className="text-[10px] font-mono border-sky-800 text-sky-400">
              Phase 6 IoT Ready
            </Badge>
          </div>
          <p className="text-xs text-slate-400 font-mono mt-1">
            Physical ESP32 microcontrollers over MQTT & simulated digital twin telemetry producers
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={() => {
              setProvisionResult(null);
              setProvName('');
              setProvMac('');
              setShowModal(true);
            }}
            className="flex items-center gap-1.5 text-xs font-mono bg-sky-600 hover:bg-sky-500 text-white"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            Provision ESP32 Node
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            className="text-slate-400 hover:text-slate-200"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Metrics & Filter Ribbon */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900/60 p-3 rounded-lg border border-slate-800">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('ALL')}
            className={`px-3 py-1.5 rounded text-xs font-mono transition-colors ${
              activeTab === 'ALL'
                ? 'bg-slate-800 text-slate-100 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All Fleet ({devices.length})
          </button>
          <button
            onClick={() => setActiveTab('MQTT')}
            className={`px-3 py-1.5 rounded text-xs font-mono transition-colors flex items-center gap-1.5 ${
              activeTab === 'MQTT'
                ? 'bg-sky-950/70 border border-sky-800 text-sky-300 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Radio className="w-3 h-3 text-sky-400" />
            Physical Hardware ({physicalCount})
          </button>
          <button
            onClick={() => setActiveTab('SIMULATED')}
            className={`px-3 py-1.5 rounded text-xs font-mono transition-colors flex items-center gap-1.5 ${
              activeTab === 'SIMULATED'
                ? 'bg-slate-800 border border-slate-700 text-slate-200 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Cpu className="w-3 h-3 text-emerald-400" />
            Simulated ({simulatedCount})
          </button>
        </div>

        <div className="flex items-center gap-3 font-mono text-xs">
          <span className="flex items-center gap-1 text-emerald-400 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            {onlineCount} Online
          </span>
          {staleCount > 0 && (
            <span className="flex items-center gap-1 text-amber-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              {staleCount} Stale
            </span>
          )}
          {offlineCount > 0 && (
            <span className="flex items-center gap-1 text-rose-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-rose-500"></span>
              {offlineCount} Offline
            </span>
          )}
        </div>
      </div>

      {/* Device Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredDevices.map((device) => {
          const isPhysical = device.protocol === 'MQTT';
          const isRevoked = device.provisioningStatus === 'REVOKED';

          let statusBadgeVariant: 'success' | 'warning' | 'error' = 'error';
          if (device.status === 'ONLINE') statusBadgeVariant = 'success';
          else if (device.status === 'STALE') statusBadgeVariant = 'warning';

          return (
            <Card key={device.id} className="flex flex-col justify-between border-slate-800 bg-slate-950">
              <div>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-slate-100">{device.name}</h3>
                      {isPhysical ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-sky-950 border border-sky-800 text-sky-300 font-semibold flex items-center gap-1">
                          <Radio className="w-2.5 h-2.5 text-sky-400" />
                          ESP32
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-900 border border-slate-800 text-slate-400">
                          SIMULATED
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-mono text-slate-500 block mt-0.5">
                      {device.room?.name || 'Unassigned'} • Floor {device.room?.floor?.name || '1'}
                    </span>
                  </div>

                  <Badge size="sm" variant={statusBadgeVariant}>
                    {device.status}
                  </Badge>
                </div>

                {/* Identity & Protocol Attributes */}
                <div className="bg-slate-900/80 p-3 rounded border border-slate-800/80 space-y-1.5 text-xs font-mono mb-4">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-slate-500">IDENTIFIER</span>
                    <span className="text-sky-400 font-semibold truncate max-w-[170px]" title={device.identifier}>
                      {device.identifier}
                    </span>
                  </div>
                  {device.macAddress && (
                    <div className="flex items-center justify-between text-slate-400">
                      <span className="text-slate-500">MAC ADDR</span>
                      <span className="text-slate-300">{device.macAddress}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-slate-500">HARDWARE</span>
                    <span className="text-slate-300">{device.hardwareType || device.deviceType}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-slate-500">PROTOCOL</span>
                    <span className={isPhysical ? 'text-sky-400 font-semibold' : 'text-emerald-400'}>
                      {device.protocol}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-slate-500">FIRMWARE</span>
                    <span className="text-slate-300">{device.firmwareVersion || 'v1.0.0-esp32'}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-slate-500">LAST SEEN</span>
                    <span className="text-slate-300">{formatRelativeTime(device.lastSeenAt)}</span>
                  </div>
                </div>

                {/* Attached Telemetry Sensors */}
                <div>
                  <span className="text-[10px] font-mono font-semibold uppercase text-slate-500 block mb-2">
                    Equipped Telemetry Channels ({device.sensors?.length || 0})
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {device.sensors?.length === 0 ? (
                      <span className="text-xs font-mono text-slate-600">No attached telemetry sensors</span>
                    ) : (
                      device.sensors.map((s) => (
                        <span
                          key={s.id}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[11px] font-mono text-slate-300"
                        >
                          <span className="text-slate-500">{s.type}:</span>
                          <span className="text-slate-100 font-semibold">
                            {formatMetricValue(s.lastReadingValue, s.unit)}
                          </span>
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Footer MQTT Topic & Revocation */}
              <div className="pt-3 mt-4 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-slate-500">
                <span className="truncate max-w-[210px]" title={`home/${homeId}/device/${device.identifier}/telemetry`}>
                  {isPhysical
                    ? `topic: home/.../${device.identifier}/telemetry`
                    : `sim: internal-event-bus`}
                </span>

                <div className="flex items-center gap-2">
                  {isPhysical && (
                    <button
                      onClick={() => handleRevokeDevice(device.id, device.name)}
                      className="text-slate-500 hover:text-rose-400 transition-colors p-1"
                      title="Revoke device credentials"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {isPhysical ? (
                    <Wifi className="w-3.5 h-3.5 text-sky-400" />
                  ) : (
                    <Activity className="w-3.5 h-3.5 text-emerald-400" />
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Register Physical Device Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-950 border border-slate-800 rounded-lg max-w-xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl">
            {!provisionResult ? (
              <div>
                <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                  <div className="flex items-center gap-2">
                    <Radio className="w-4 h-4 text-sky-400" />
                    <h2 className="text-base font-bold text-slate-100">Provision ESP32 Physical Node</h2>
                  </div>
                  <button
                    onClick={() => setShowModal(false)}
                    className="text-slate-500 hover:text-slate-300 text-sm font-mono"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleRegisterDevice} className="space-y-4 text-xs font-mono">
                  <div>
                    <label className="block text-slate-400 mb-1">DEVICE NAME</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Living Room Environmental Node"
                      value={provName}
                      onChange={(e) => setProvName(e.target.value)}
                      className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-800 text-slate-100 focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-400 mb-1">TARGET ROOM</label>
                      <select
                        value={provRoomId}
                        onChange={(e) => setProvRoomId(e.target.value)}
                        className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-800 text-slate-100 focus:outline-none focus:border-sky-500"
                      >
                        {rooms.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-400 mb-1">HARDWARE MODEL</label>
                      <select
                        value={provHardware}
                        onChange={(e) => setProvHardware(e.target.value)}
                        className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-800 text-slate-100 focus:outline-none focus:border-sky-500"
                      >
                        <option value="ESP32_WROOM_32">ESP32 DevKit v1 (WROOM-32)</option>
                        <option value="ESP8266">ESP8266 (NodeMCU)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">MAC ADDRESS (OPTIONAL)</label>
                    <input
                      type="text"
                      placeholder="e.g. 24:6F:28:AB:CD:EF"
                      value={provMac}
                      onChange={(e) => setProvMac(e.target.value)}
                      className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-800 text-slate-100 focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-2">EQUIPPED SENSORS</label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { type: 'TEMPERATURE', label: 'Temperature (DHT22 / BME280)' },
                        { type: 'HUMIDITY', label: 'Humidity (DHT22 / BME280)' },
                        { type: 'CO2', label: 'CO2 Air Quality (MQ-135 / SGP30)' },
                        { type: 'OCCUPANCY', label: 'Motion (PIR / mmWave)' },
                        { type: 'CONTACT', label: 'Window / Door (Reed Switch)' },
                        { type: 'POWER', label: 'Current / Power Proxy (Isolated)' },
                      ].map((s) => (
                        <label
                          key={s.type}
                          className="flex items-center gap-2 p-2 rounded bg-slate-900/60 border border-slate-800 cursor-pointer hover:bg-slate-900 text-slate-300"
                        >
                          <input
                            type="checkbox"
                            checked={provSensors.includes(s.type)}
                            onChange={() => toggleSensor(s.type)}
                            className="rounded border-slate-700 text-sky-600 focus:ring-0"
                          />
                          <span>{s.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowModal(false)}
                      className="text-xs font-mono"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={provisioningLoading || !provName.trim()}
                      className="text-xs font-mono bg-sky-600 hover:bg-sky-500 text-white"
                    >
                      {provisioningLoading ? 'Registering...' : 'Complete Registration'}
                    </Button>
                  </div>
                </form>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                  <div className="flex items-center gap-2 text-emerald-400">
                    <CheckCircle2 className="w-5 h-5" />
                    <h2 className="text-base font-bold text-slate-100">ESP32 Node Provisioned!</h2>
                  </div>
                  <button
                    onClick={() => setShowModal(false)}
                    className="text-slate-500 hover:text-slate-300 text-sm font-mono"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-4 text-xs font-mono">
                  <div className="bg-amber-950/40 border border-amber-800/80 p-3 rounded text-amber-200 space-y-1">
                    <span className="font-bold flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-amber-400" />
                      One-Time Device Secret
                    </span>
                    <p className="text-[11px] text-amber-300">
                      Copy the generated credentials now. The raw authentication token is never stored in plaintext and cannot be recovered.
                    </p>
                  </div>

                  <div className="bg-slate-900 p-3 rounded border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">DEVICE ID:</span>
                      <span className="text-sky-400 font-semibold">{provisionResult.credentials.deviceId}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">TELEMETRY TOPIC:</span>
                      <span className="text-slate-300 truncate max-w-[280px]">
                        {provisionResult.credentials.telemetryTopic}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">AUTH TOKEN:</span>
                      <span className="text-emerald-400 font-semibold truncate max-w-[280px]">
                        {provisionResult.credentials.authToken}
                      </span>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-slate-400">FIRMWARE CONFIG (config.h):</span>
                      <button
                        onClick={copyConfig}
                        className="flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300"
                      >
                        {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        {copied ? 'Copied!' : 'Copy Code'}
                      </button>
                    </div>
                    <pre className="bg-slate-950 p-3 rounded border border-slate-800 text-[10px] text-slate-300 overflow-x-auto max-h-44">
                      {provisionResult.configSnippet}
                    </pre>
                  </div>

                  <div className="pt-3 border-t border-slate-800 flex justify-end">
                    <Button
                      onClick={() => setShowModal(false)}
                      className="text-xs font-mono bg-slate-800 hover:bg-slate-700 text-slate-200"
                    >
                      Done
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
