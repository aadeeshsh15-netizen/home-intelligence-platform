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
} from 'lucide-react';

export default function DevicesPage() {
  const [devices, setDevices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/devices');
        if (res.ok) {
          const data = await res.json();
          setDevices(data.devices);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 font-mono text-sm text-slate-500 animate-pulse">
        Querying hardware registry and device network...
      </div>
    );
  }

  const onlineCount = devices.filter((d) => d.status === 'ONLINE').length;
  const offlineCount = devices.filter((d) => d.status === 'OFFLINE').length;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Hardware Fleet Inventory</h1>
          <p className="text-xs text-slate-400 font-mono mt-1">
            Abstracted device profiles ready for MQTT broker and physical ESP32/ESP8266 integration
          </p>
        </div>

        <div className="flex items-center gap-3 font-mono text-xs">
          <Badge variant="success">{onlineCount} Online</Badge>
          {offlineCount > 0 && <Badge variant="error">{offlineCount} Offline</Badge>}
          <span className="text-slate-500">Total: {devices.length} Devices</span>
        </div>
      </div>

      {/* Device Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {devices.map((device) => {
          return (
            <Card key={device.id} className="flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-100">{device.name}</h3>
                    <span className="text-[11px] font-mono text-slate-500 block mt-0.5">
                      {device.room?.name} • Floor {device.room?.floor?.name}
                    </span>
                  </div>
                  <Badge size="sm" variant={device.status === 'ONLINE' ? 'success' : 'error'}>
                    {device.status}
                  </Badge>
                </div>

                {/* Identity & Protocol Attributes */}
                <div className="bg-slate-950 p-3 rounded border border-slate-800 space-y-2 text-xs font-mono mb-4">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-slate-500">IDENTIFIER</span>
                    <span className="text-sky-400 font-semibold">{device.identifier}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-slate-500">TYPE</span>
                    <span className="text-slate-300">{device.deviceType}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-slate-500">PROTOCOL</span>
                    <span className="text-emerald-400">{device.protocol}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-slate-500">FIRMWARE</span>
                    <span className="text-slate-300">{device.firmwareVersion || 'v1.0.0-prod'}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-slate-500">LAST SEEN</span>
                    <span className="text-slate-300">{formatRelativeTime(device.lastSeenAt)}</span>
                  </div>
                </div>

                {/* Attached Telemetry Sensors */}
                <div>
                  <span className="text-[10px] font-mono font-semibold uppercase text-slate-500 block mb-2">
                    Equipped Telemetry Sensors ({device.sensors?.length || 0})
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {device.sensors?.length === 0 ? (
                      <span className="text-xs font-mono text-slate-600">No attached telemetry sensors</span>
                    ) : (
                      device.sensors.map((s: any) => (
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

              {/* Footer MQTT Topic Indicator */}
              <div className="pt-3 mt-4 border-t border-slate-800 flex items-center justify-between text-[11px] font-mono text-slate-500">
                <span className="truncate max-w-[220px]">
                  topic: home/{device.room?.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}/{device.identifier.toLowerCase()}
                </span>
                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
