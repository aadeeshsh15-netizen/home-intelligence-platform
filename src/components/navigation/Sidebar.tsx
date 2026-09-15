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
import { BRAND } from '@/lib/brand';

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

import { useHome } from '@/lib/home-context';

export function Sidebar() {
  const pathname = usePathname();
  const { homeName } = useHome();

  return (
    <aside className="w-60 border-r border-slate-200 dark:border-slate-800/60 bg-white dark:bg-slate-950 flex flex-col justify-between shrink-0 h-screen sticky top-0 select-none transition-colors duration-150">
      <div className="overflow-y-auto">
        {/* Brand Header */}
        <div className="h-16 flex items-center px-4 border-b border-slate-200 dark:border-slate-800/60 gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-600 dark:bg-blue-500 flex items-center justify-center text-white shadow-xs font-bold text-xs tracking-tighter shrink-0">
            IoT
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-bold tracking-tight text-slate-900 dark:text-slate-100 uppercase font-sans leading-tight" title={BRAND.name}>
              {BRAND.name}
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 font-sans truncate">
              {BRAND.tagline}
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
                      'flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition-colors',
                      isActive
                        ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400 font-medium'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-900/40'
                    )}
                  >
                    <Icon className={clsx('w-4 h-4', isActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500')} />
                    <span>{item.name}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </div>

      {/* Reference bottom card with estate thumbnail */}
      <div className="p-3 border-t border-slate-200 dark:border-slate-800/60 bg-white dark:bg-slate-950 transition-colors">
        <div className="p-2.5 rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/50 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-md overflow-hidden bg-slate-200 dark:bg-slate-800 shrink-0 border border-slate-300 dark:border-slate-700">
            <img src="/images/estate-thumbnail.jpg" alt="Estate" className="w-full h-full object-cover" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
              {homeName}
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Online</span>
              <span className="text-slate-400 dark:text-slate-500 text-[9px]">· Operational</span>
            </div>
          </div>
        </div>
        <div className="pt-2 text-[10px] font-mono text-slate-400 dark:text-slate-500 px-1 leading-tight flex items-center justify-between">
          <span className="italic truncate mr-2">"A safer home a brighter tomorrow."</span>
          <span className="shrink-0">v1.0.0</span>
        </div>
      </div>
    </aside>
  );
}
