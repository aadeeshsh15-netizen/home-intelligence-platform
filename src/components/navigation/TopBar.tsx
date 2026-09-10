'use client';

import React, { useState, useEffect } from 'react';
import { useRealtimeTelemetry } from '@/lib/useRealtimeTelemetry';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Play, Square, RefreshCw, AlertTriangle, Radio } from 'lucide-react';
import Link from 'next/link';

export function TopBar() {
  const { connectionState, lastTick, lastHeartbeat } = useRealtimeTelemetry();
  const [secondsAgo, setSecondsAgo] = useState(0);
  const [isTicking, setIsTicking] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      if (lastHeartbeat) {
        const diff = Math.floor((Date.now() - lastHeartbeat.getTime()) / 1000);
        setSecondsAgo(diff);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [lastHeartbeat]);

  const handleManualTick = async () => {
    try {
      setIsTicking(true);
      await fetch('/api/simulator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'tick' }),
      });
    } catch (e) {
      console.error(e);
    } finally {
      setTimeout(() => setIsTicking(false), 500);
    }
  };

  return (
    <header className="h-16 border-b border-slate-800/80 bg-slate-950/70 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-20">
      <div className="flex items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-100">Apex Horizon Estate</h2>
            <span className="text-[10px] text-slate-500 font-mono">EST (UTC-5)</span>
          </div>
          <p className="text-[11px] text-slate-400 font-mono">
            Model: 2 Floors • 7 Rooms • 28 Sensors
          </p>
        </div>
      </div>

      {/* Realtime Stream Status & Controls */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 bg-slate-900/80 border border-slate-800 rounded px-3 py-1.5 text-xs font-mono">
          <span
            className={`w-2 h-2 rounded-full ${
              connectionState === 'LIVE'
                ? 'bg-emerald-400 animate-pulse'
                : connectionState === 'CONNECTING'
                ? 'bg-amber-400 animate-ping'
                : 'bg-rose-500'
            }`}
          />
          <span className="text-slate-300 uppercase tracking-wider">{connectionState}</span>
          <span className="text-slate-500">|</span>
          <span className="text-slate-400">
            {lastHeartbeat ? `${secondsAgo}s ago` : 'Syncing...'}
          </span>
          {lastTick && (
            <>
              <span className="text-slate-500">|</span>
              <span className="text-sky-400 truncate max-w-[140px]">
                {lastTick.roomName}: {lastTick.value} {lastTick.unit}
              </span>
            </>
          )}
        </div>

        <Button
          size="sm"
          variant="secondary"
          onClick={handleManualTick}
          disabled={isTicking}
          className="text-xs font-mono"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isTicking ? 'animate-spin' : ''}`} />
          <span>Sim Tick</span>
        </Button>

        <Link href="/simulator">
          <Button size="sm" variant="outline" className="text-xs font-mono text-sky-400 border-sky-900/60 hover:bg-sky-950/30">
            <Radio className="w-3.5 h-3.5 text-sky-400" />
            <span>Simulator Studio</span>
          </Button>
        </Link>
      </div>
    </header>
  );
}
