'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { DoorOpen, Thermometer, Droplets, Zap, Wind, ChevronRight } from 'lucide-react';

export default function RoomsListPage() {
  const [rooms, setRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/rooms');
        if (res.ok) {
          const data = await res.json();
          setRooms(data.rooms);
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
        Loading room catalog...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Household Rooms</h1>
          <p className="text-xs text-slate-600 dark:text-slate-400 font-mono mt-1">
            Spatial breakdown of environmental micro-climates, sensor inventories, and equipment
          </p>
        </div>
        <span className="text-xs font-mono text-slate-500">
          Total Rooms: {rooms.length}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {rooms.map((room) => {
          const temp = room.metrics?.temperature?.value;
          const humidity = room.metrics?.humidity?.value;
          const co2 = room.metrics?.co2?.value;
          const power = room.metrics?.power?.value;
          const occupied = room.metrics?.occupancy?.value === 1;

          return (
            <Link key={room.id} href={`/rooms/${room.id}`}>
              <Card className="hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900/80 transition-all cursor-pointer h-full flex flex-col justify-between border-slate-200 dark:border-slate-800">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <DoorOpen className="w-4 h-4 text-sky-500 dark:text-sky-400" />
                      <span className="text-sm font-bold text-slate-900 dark:text-slate-100">{room.name}</span>
                    </div>
                    <Badge size="sm" variant={occupied ? 'info' : 'outline'}>
                      {occupied ? 'Occupied' : 'Vacant'}
                    </Badge>
                  </div>

                  <div className="text-[11px] font-mono text-slate-500 mb-4">
                    Floor: {room.floor.name} • Target: {room.targetTemp || 21.0}°C
                  </div>

                  {/* Micro Metric Gauges */}
                  <div className="grid grid-cols-2 gap-2 text-xs font-mono mb-4">
                    <div className="bg-slate-50 dark:bg-slate-950 p-2 rounded border border-slate-200 dark:border-slate-800/80">
                      <div className="flex items-center gap-1 text-slate-500 text-[10px]">
                        <Thermometer className="w-3 h-3 text-sky-500 dark:text-sky-400" />
                        <span>TEMP</span>
                      </div>
                      <span className="text-slate-900 dark:text-slate-200 font-semibold text-sm">
                        {temp !== undefined ? `${temp.toFixed(1)}°C` : '—'}
                      </span>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-950 p-2 rounded border border-slate-200 dark:border-slate-800/80">
                      <div className="flex items-center gap-1 text-slate-500 text-[10px]">
                        <Droplets className="w-3 h-3 text-teal-500 dark:text-teal-400" />
                        <span>HUMIDITY</span>
                      </div>
                      <span className="text-slate-900 dark:text-slate-200 font-semibold text-sm">
                        {humidity !== undefined ? `${Math.round(humidity)}%` : '—'}
                      </span>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-950 p-2 rounded border border-slate-200 dark:border-slate-800/80">
                      <div className="flex items-center gap-1 text-slate-500 text-[10px]">
                        <Wind className="w-3 h-3 text-emerald-500 dark:text-emerald-400" />
                        <span>CO₂</span>
                      </div>
                      <span className="text-slate-900 dark:text-slate-200 font-semibold text-sm">
                        {co2 !== undefined ? `${Math.round(co2)} ppm` : '—'}
                      </span>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-950 p-2 rounded border border-slate-200 dark:border-slate-800/80">
                      <div className="flex items-center gap-1 text-slate-500 text-[10px]">
                        <Zap className="w-3 h-3 text-amber-500 dark:text-amber-400" />
                        <span>POWER</span>
                      </div>
                      <span className="text-slate-900 dark:text-slate-200 font-semibold text-sm">
                        {power !== undefined ? `${Math.round(power)} W` : '—'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between text-xs font-mono text-slate-500 dark:text-slate-400">
                  <span>{room.deviceCount} Devices • {room.sensorCount} Sensors</span>
                  <ChevronRight className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
