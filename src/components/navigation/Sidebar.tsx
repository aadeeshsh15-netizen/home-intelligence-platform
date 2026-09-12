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

const navSections = [
  {
    title: 'Overview',
    items: [
      { name: 'Dashboard', href: '/', icon: LayoutDashboard, exact: true },
      { name: 'Home', href: '/home-view', icon: Home },
    ],
  },
  {
    title: 'Intelligence',
    items: [
      { name: 'Insights', href: '/insights', icon: Lightbulb },
      { name: 'Observability', href: '/observability', icon: Gauge },
    ],
  },
  {
    title: 'Control',
    items: [
      { name: 'Automations', href: '/automations', icon: Sliders },
      { name: 'Devices', href: '/devices', icon: Cpu },
    ],
  },
  {
    title: 'System',
    items: [
      { name: 'Architecture', href: '/architecture', icon: Network },
      { name: 'Demo', href: '/demo', icon: PlayCircle },
    ],
  },
  {
    title: 'Instruments',
    items: [
      { name: 'Rooms', href: '/rooms', icon: DoorOpen },
      { name: 'Analytics', href: '/analytics', icon: LineChart },
      { name: 'Event Stream', href: '/events', icon: BellRing },
      { name: 'Simulator', href: '/simulator', icon: FlaskConical },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 border-r border-slate-200 dark:border-slate-800/60 bg-white dark:bg-slate-950 flex flex-col justify-between shrink-0 h-screen sticky top-0 select-none transition-colors duration-150">
      <div className="overflow-y-auto">
        {/* Brand Header */}
        <div className="h-14 flex items-center px-5 border-b border-slate-200 dark:border-slate-800/60 gap-2.5">
          <div className="w-5 h-5 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-300">
            <Activity className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="text-xs font-semibold tracking-wide text-slate-900 dark:text-slate-200 uppercase font-mono">
              Home Intelligence
            </div>
            <div className="text-[10px] font-mono text-slate-500">
              Cyber-Physical Platform
            </div>
          </div>
        </div>

        {/* Grouped Navigation */}
        <nav className="p-3 space-y-4">
          {navSections.map((section) => (
            <div key={section.title} className="space-y-0.5">
              <div className="text-[10px] font-mono uppercase tracking-widest text-slate-400 dark:text-slate-500 px-2 py-1 font-medium">
                {section.title}
              </div>
              {section.items.map((item) => {
                const isActive = item.exact
                  ? pathname === item.href
                  : pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));

                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={clsx(
                      'flex items-center gap-2.5 px-2.5 py-1.5 rounded text-xs transition-colors',
                      isActive
                        ? 'bg-slate-100 text-slate-900 dark:bg-slate-900 dark:text-slate-100 font-medium'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-900/40'
                    )}
                  >
                    <Icon className={clsx('w-3.5 h-3.5', isActive ? 'text-slate-900 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500')} />
                    <span>{item.name}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </div>

      {/* Visually quiet engineering status footer */}
      <div className="p-3 border-t border-slate-200 dark:border-slate-800/60 bg-white dark:bg-slate-950 text-[10px] font-mono text-slate-500 flex items-center justify-between transition-colors duration-150">
        <span>MQTT · PGSQL · NOMINAL</span>
        <span className="text-slate-400 dark:text-slate-500">v1.0</span>
      </div>
    </aside>
  );
}
