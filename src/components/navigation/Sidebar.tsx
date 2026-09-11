'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Home,
  DoorOpen,
  Cpu,
  LineChart,
  BellRing,
  Lightbulb,
  FlaskConical,
  Activity,
  Sliders,
  Gauge,
  Network,
  PlayCircle,
} from 'lucide-react';
import { clsx } from 'clsx';

const navItems = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard, exact: true },
  { name: 'Observability', href: '/observability', icon: Gauge },
  { name: 'Automations', href: '/automations', icon: Sliders },
  { name: 'Architecture', href: '/architecture', icon: Network },
  { name: 'Demo Console', href: '/demo', icon: PlayCircle },
  { name: 'Devices', href: '/devices', icon: Cpu },
  { name: 'Home View', href: '/home-view', icon: Home },
  { name: 'Rooms', href: '/rooms', icon: DoorOpen },
  { name: 'Historical Analytics', href: '/analytics', icon: LineChart },
  { name: 'Event Stream', href: '/events', icon: BellRing },
  { name: 'AI Insights', href: '/insights', icon: Lightbulb },
  { name: 'Telemetry Simulator', href: '/simulator', icon: FlaskConical },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 border-r border-slate-800/80 bg-slate-950 flex flex-col justify-between shrink-0 h-screen sticky top-0">
      <div>
        {/* Brand Header */}
        <div className="h-16 flex items-center px-6 border-b border-slate-800/80 gap-3">
          <div className="w-8 h-8 rounded bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-tight text-slate-100">
              Home Intelligence
            </h1>
            <p className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">
              Engineering Telemetry
            </p>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="p-3 space-y-1">
          {navItems.map((item) => {
            const isActive = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);

            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  'flex items-center gap-3 px-3 py-2 rounded text-xs font-medium transition-colors',
                  isActive
                    ? 'bg-slate-800/90 text-sky-400 border border-slate-700/80 shadow-xs'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                )}
              >
                <Icon className={clsx('w-4 h-4', isActive ? 'text-sky-400' : 'text-slate-500')} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Hardware / Engine Status Footer */}
      <div className="p-4 border-t border-slate-800/80 bg-slate-950/80">
        <div className="rounded border border-slate-800/90 bg-slate-900/60 p-2.5 text-[11px] font-mono">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span>PIPELINE</span>
            <span className="text-emerald-400">NORMAL</span>
          </div>
          <div className="flex items-center justify-between text-slate-500">
            <span>INGEST</span>
            <span className="text-slate-300">HTTP/REST</span>
          </div>
          <div className="flex items-center justify-between text-slate-500">
            <span>BROKER</span>
            <span className="text-sky-400">READY (MQTT)</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
