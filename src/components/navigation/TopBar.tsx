'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRealtimeTelemetry } from '@/lib/useRealtimeTelemetry';
import { useTheme } from '@/lib/theme';
import { useHome } from '@/lib/home-context';
import { Button } from '../ui/button';
import { RefreshCw, Radio, Sun, Moon, ChevronDown, Search, Edit2, Check, X, Building2, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { clsx } from 'clsx';

export function TopBar() {
  const { connectionState, lastTick, lastHeartbeat } = useRealtimeTelemetry();
  const { theme, setTheme } = useTheme();
  const { homeName, stats, updateHomeName, isSaving } = useHome();
  const [secondsAgo, setSecondsAgo] = useState(0);
  const [isTicking, setIsTicking] = useState(false);
  const [currentTime, setCurrentTime] = useState('');

  const [isEstateOpen, setIsEstateOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const estateRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (estateRef.current && !estateRef.current.contains(event.target as Node)) {
        setIsEstateOpen(false);
        setIsEditing(false);
        setEditError(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleStartEdit = () => {
    setEditName(homeName);
    setIsEditing(true);
    setEditError(null);
  };

  const handleSaveEdit = async () => {
    const res = await updateHomeName(editName);
    if (res.success) {
      setIsEditing(false);
      setEditError(null);
    } else {
      setEditError(res.error || 'Failed to save');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsEditing(false);
      setEditError(null);
    }
  };

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const formatted = now.toLocaleDateString('en-US', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }) + ' ' + now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
      setCurrentTime(formatted);
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

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
    <header className="h-16 border-b border-slate-200 dark:border-slate-800/80 bg-white/90 dark:bg-slate-950/80 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-20 transition-colors">
      {/* Left: Estate Identifier */}
      <div className="flex items-center gap-6">
        <div className="relative" ref={estateRef}>
          <button
            onClick={() => setIsEstateOpen((prev) => !prev)}
            aria-expanded={isEstateOpen}
            className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer group"
          >
            <span>{homeName}</span>
            <ChevronDown className={clsx("w-3.5 h-3.5 text-slate-400 group-hover:text-blue-500 transition-transform", isEstateOpen && "rotate-180")} />
          </button>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
            Model 2 • {stats.totalFloors} Floors • {stats.totalRooms} Rooms • {stats.totalSensors} Sensors
          </p>

          {/* Estate Popover Dropdown */}
          {isEstateOpen && (
            <div className="absolute left-0 top-full mt-2 w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg p-4 z-50 animate-in fade-in zoom-in-95 duration-100">
              <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-100 dark:border-slate-800">
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-blue-500" />
                  Home Identity
                </span>
                {!isEditing && (
                  <button
                    onClick={handleStartEdit}
                    className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Edit2 className="w-3 h-3" />
                    Rename
                  </button>
                )}
              </div>

              {isEditing ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={handleKeyDown}
                    autoFocus
                    maxLength={64}
                    placeholder="Enter home name..."
                    className="w-full text-xs font-medium px-2.5 py-1.5 rounded-lg border border-blue-500 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                  {editError && (
                    <div className="text-[11px] text-rose-500 font-medium">{editError}</div>
                  )}
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setIsEditing(false);
                        setEditError(null);
                      }}
                      className="text-xs h-7 px-2"
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSaveEdit}
                      disabled={isSaving}
                      className="text-xs h-7 px-3 bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      {isSaving ? (
                        <RefreshCw className="w-3 h-3 animate-spin" />
                      ) : (
                        'Save'
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {homeName}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                      Active Cyber-Physical Residence
                    </div>
                  </div>

                  {/* Supporting Stats */}
                  <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-[11px]">
                    <div className="bg-slate-50 dark:bg-slate-800/60 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                      <span className="text-slate-400 block text-[10px]">FLOORS</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{stats.totalFloors} Levels</span>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800/60 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                      <span className="text-slate-400 block text-[10px]">ROOMS</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{stats.totalRooms} Zones</span>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800/60 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                      <span className="text-slate-400 block text-[10px]">SENSORS</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{stats.totalSensors} Monitored</span>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800/60 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                      <span className="text-slate-400 block text-[10px]">DEVICES</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{stats.totalDevices} Hardware</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <Link
                      href="/home-view"
                      onClick={() => setIsEstateOpen(false)}
                      className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                    >
                      <span>Full Home Settings</span>
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Center: Search box */}
        <div className="hidden md:flex items-center gap-2 bg-slate-100/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 w-64 text-slate-400 text-xs">
          <Search className="w-3.5 h-3.5 text-slate-400" />
          <span className="flex-1 text-slate-500 dark:text-slate-400 font-sans">Search anything...</span>
          <kbd className="text-[10px] font-mono bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5 text-slate-400 dark:text-slate-400 shadow-xs">
            Ctrl K
          </kbd>
        </div>
      </div>

      {/* Right: Date, Theme Switch & Controls */}
      <div className="flex items-center gap-3.5">
        {/* Live Date / Time Display */}
        <div suppressHydrationWarning className="hidden lg:flex flex-col text-right font-mono">
          <span suppressHydrationWarning className="text-[10px] text-slate-400 dark:text-slate-500">
            {currentTime.split(' ')[0]} {currentTime.split(' ')[1]} {currentTime.split(' ')[2]} {currentTime.split(' ')[3]}
          </span>
          <span suppressHydrationWarning className="text-xs font-semibold text-slate-800 dark:text-slate-200 font-mono-numeric">
            {currentTime.split(' ').slice(4).join(' ')}
          </span>
        </div>

        {/* Compact Theme Switch (Segmented pill) */}
        <div
          role="radiogroup"
          aria-label="Theme selector"
          className="flex items-center p-0.5 rounded-full border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 text-xs font-mono"
        >
          <button
            type="button"
            role="radio"
            aria-checked={theme === 'light'}
            onClick={() => setTheme('light')}
            aria-label="Light theme"
            className={clsx(
              'flex items-center gap-1 px-2.5 py-1 rounded-full transition-all text-[11px] cursor-pointer',
              theme === 'light'
                ? 'bg-white text-slate-900 shadow-xs font-medium'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            )}
          >
            <Sun className="w-3.5 h-3.5 text-amber-500" />
            <span>Light</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={theme === 'dark'}
            onClick={() => setTheme('dark')}
            aria-label="Dark theme"
            className={clsx(
              'flex items-center gap-1 px-2.5 py-1 rounded-full transition-all text-[11px] cursor-pointer',
              theme === 'dark'
                ? 'bg-slate-800 text-slate-100 shadow-xs font-medium'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            )}
          >
            <Moon className="w-3.5 h-3.5 text-sky-400" />
            <span>Dark</span>
          </button>
        </div>

        {/* Stream Status Pill */}
        <div className="hidden sm:flex items-center gap-2 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1 text-[11px] font-mono">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              connectionState === 'LIVE'
                ? 'bg-emerald-500 animate-pulse'
                : connectionState === 'CONNECTING'
                ? 'bg-amber-500 animate-ping'
                : 'bg-rose-500'
            }`}
          />
          <span className="text-slate-700 dark:text-slate-300 font-medium">{connectionState}</span>
          {lastHeartbeat && (
            <span className="text-slate-400 dark:text-slate-500 hidden xl:inline">
              · {secondsAgo}s ago
            </span>
          )}
        </div>

        {/* Sim Controls */}
        <Button
          size="sm"
          variant="secondary"
          onClick={handleManualTick}
          disabled={isTicking}
          className="text-xs font-mono h-8 px-2.5"
          title="Trigger simulation tick"
        >
          <RefreshCw className={`w-3 h-3 ${isTicking ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Sim Tick</span>
        </Button>

        {/* User Avatar */}
        <div
          className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 flex items-center justify-center text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-default"
          title="Apex Administrator"
        >
          A
        </div>
      </div>
    </header>
  );
}
