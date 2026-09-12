'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRealtimeTelemetry, TelemetryTick } from '@/lib/useRealtimeTelemetry';
import { useHome } from '@/lib/home-context';
import { useTheme } from '@/lib/theme';
import {
  RefreshCw,
  Eye,
  Zap,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Thermometer,
  Wind,
  Layers,
  Database,
  Radio,
  Cpu,
  Brain,
  Sliders,
  Sun,
  Activity,
  ChevronRight,
  DoorOpen,
  LineChart as LineChartIcon,
  Maximize2,
  Compass,
  ZoomIn,
  ZoomOut,
  Droplets,
  ExternalLink,
  Laptop,
  UtensilsCrossed,
  Armchair,
  BedDouble,
  Check,
  Users,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

const DEFAULT_OBSERVABILITY = {
  health: {
    status: 'HEALTHY',
    subsystems: {
      database: { name: 'database', status: 'HEALTHY', latencyMs: 2 },
      mqtt_gateway: { name: 'mqtt_gateway', status: 'HEALTHY' },
    },
    fleet: { totalDevices: 7, onlineCount: 6, staleCount: 0, offlineCount: 1 },
  },
  recentEvents: [
    {
      id: 'evt-1',
      timestamp: '2026-09-12T10:15:00.000Z',
      category: 'PREDICTION',
      eventType: 'PREDICTION_EXPIRED',
      severity: 'WARNING',
      title: 'Prediction expired',
      summary: 'PREDICTED_ENERGY_SURGE horizon elapsed',
      color: 'amber',
    },
    {
      id: 'evt-2',
      timestamp: '2026-09-12T10:13:00.000Z',
      category: 'INCIDENT',
      eventType: 'EVENT_RESOLVED',
      severity: 'INFO',
      title: 'Cooking event resolved',
      summary: 'Kitchen CO₂ normalized to baseline',
      color: 'green',
    },
    {
      id: 'evt-3',
      timestamp: '2026-09-12T10:01:00.000Z',
      category: 'INCIDENT',
      eventType: 'EVENT_DETECTED',
      severity: 'CRITICAL',
      title: 'Cooking event detected',
      summary: 'CO₂ rising (confidence: 92%)',
      color: 'red',
    },
    {
      id: 'evt-4',
      timestamp: '2026-09-12T09:47:00.000Z',
      category: 'AUTOMATION',
      eventType: 'POLICY_EVALUATED',
      severity: 'INFO',
      title: 'Automation evaluated',
      summary: 'Ventilation policy • No intervention required',
      color: 'blue',
    },
    {
      id: 'evt-5',
      timestamp: '2026-09-12T09:33:00.000Z',
      category: 'DEVICE',
      eventType: 'DEVICE_RECONNECTED',
      severity: 'INFO',
      title: 'Device reconnected',
      summary: 'ESP32 • Living Room',
      color: 'gray',
    },
  ],
};

const DEFAULT_HOME = {
  home: { name: 'Apex Horizon Estate' },
  climate: { avgTemperature: 24.2, avgHumidity: 46, avgCO2: 612 },
  energy: { currentTotalWatts: 1240, peakWattsToday: 4620 },
  occupancy: { isHomeOccupied: true, occupiedRoomsCount: 2 },
};

// Historical trends baseline points
const TRENDS_DATA_24H = [
  { time: '00:00', temp: 21.8, co2: 510, humidity: 48, power: 0.82 },
  { time: '04:00', temp: 21.2, co2: 490, humidity: 52, power: 0.74 },
  { time: '08:00', temp: 22.6, co2: 580, humidity: 46, power: 1.65 },
  { time: '12:00', temp: 24.5, co2: 630, humidity: 44, power: 1.42 },
  { time: '16:00', temp: 25.1, co2: 605, humidity: 45, power: 1.35 },
  { time: '20:00', temp: 24.2, co2: 612, humidity: 46, power: 1.24 },
];

const TRENDS_DATA_7D = [
  { time: 'Mon', temp: 23.4, co2: 540, humidity: 47, power: 1.15 },
  { time: 'Tue', temp: 23.8, co2: 580, humidity: 49, power: 1.22 },
  { time: 'Wed', temp: 24.1, co2: 610, humidity: 45, power: 1.30 },
  { time: 'Thu', temp: 24.2, co2: 612, humidity: 46, power: 1.24 },
  { time: 'Fri', temp: 24.6, co2: 625, humidity: 44, power: 1.41 },
  { time: 'Sat', temp: 24.9, co2: 640, humidity: 43, power: 1.55 },
  { time: 'Sun', temp: 24.0, co2: 590, humidity: 46, power: 1.28 },
];

const TRENDS_DATA_30D = [
  { time: 'W1', temp: 23.2, co2: 530, humidity: 48, power: 1.18 },
  { time: 'W2', temp: 23.7, co2: 565, humidity: 47, power: 1.25 },
  { time: 'W3', temp: 24.0, co2: 595, humidity: 46, power: 1.28 },
  { time: 'W4', temp: 24.2, co2: 612, humidity: 46, power: 1.24 },
];

export default function OperationalInstrumentPage() {
  const { homeName, stats } = useHome();
  const { isDark } = useTheme();

  const [refreshing, setRefreshing] = useState(false);
  const [observabilityData, setObservabilityData] = useState<any>(DEFAULT_OBSERVABILITY);
  const [homeData, setHomeData] = useState<any>(DEFAULT_HOME);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [predictiveIncidents, setPredictiveIncidents] = useState<any[]>([]);
  const [automations, setAutomations] = useState<any>(null);
  const [secondsAgo, setSecondsAgo] = useState(12);
  const [mounted, setMounted] = useState(false);

  // Digital Twin Floor Plan Interactive Controls
  const [activeFloor, setActiveFloor] = useState<'Ground Floor' | 'First Floor'>('Ground Floor');
  const [activeLayer, setActiveLayer] = useState<'Temperature' | 'CO₂' | 'Occupancy' | 'Power'>('Temperature');
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [selectedRoom, setSelectedRoom] = useState<string | null>('Living Room');
  const [trendsRange, setTrendsRange] = useState<'24H' | '7D' | '30D'>('24H');
  const [currentTime, setCurrentTime] = useState({ date: '', time: '', greeting: 'Good Day' });

  useEffect(() => {
    setMounted(true);

    const updateClock = () => {
      const now = new Date();
      const hour = now.getHours();
      let greeting = 'Good Day';
      if (hour >= 5 && hour < 12) greeting = 'Good Morning';
      else if (hour >= 12 && hour < 18) greeting = 'Good Afternoon';
      else greeting = 'Good Evening';

      const dateStr = now.toLocaleDateString('en-US', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });

      const timeStr = now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });

      setCurrentTime({ date: dateStr, time: timeStr, greeting });
    };

    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleTick = useCallback((tick: TelemetryTick) => {
    setSecondsAgo(1);
  }, []);

  useRealtimeTelemetry(handleTick);

  useEffect(() => {
    const t = setInterval(() => {
      setSecondsAgo((s) => (s < 60 ? s + 1 : 12));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const fetchDashboardData = async () => {
    try {
      setRefreshing(true);
      const [obsRes, homeRes, incRes, predRes, autoRes] = await Promise.all([
        fetch('/api/observability'),
        fetch('/api/home'),
        fetch('/api/incidents'),
        fetch('/api/predictive-incidents'),
        fetch('/api/automations'),
      ]);

      if (obsRes.ok) setObservabilityData(await obsRes.json());
      if (homeRes.ok) setHomeData(await homeRes.json());
      if (incRes.ok) {
        const d = await incRes.json();
        setIncidents(d.incidents || []);
      }
      if (predRes.ok) {
        const d = await predRes.json();
        setPredictiveIncidents(d.predictiveIncidents || []);
      }
      if (autoRes.ok) setAutomations(await autoRes.json());
      setSecondsAgo(2);
    } catch (e) {
      console.error('Failed to fetch operational dashboard data:', e);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 5000);
    return () => clearInterval(interval);
  }, []);

  const health = observabilityData?.health || DEFAULT_OBSERVABILITY.health;
  const status = health?.status || 'HEALTHY';
  const climate = homeData?.climate || DEFAULT_HOME.climate;
  const energy = homeData?.energy || DEFAULT_HOME.energy;
  const fleet = health?.fleet || DEFAULT_OBSERVABILITY.health.fleet;
  const recentEvents = observabilityData?.recentEvents?.length > 0
    ? observabilityData.recentEvents
    : DEFAULT_OBSERVABILITY.recentEvents;

  // Active prediction status
  const activePred = predictiveIncidents.find((p) => p.status === 'PREDICTED') || null;

  // Active automation status
  const activeExec = automations?.recentExecutions?.[0] || null;
  const activePolicies = automations?.policies || [];

  // Hotspots definitions mapped to 3D floor plan layout
  const roomHotspots = useMemo(() => [
    {
      id: 'bedroom',
      name: 'Bedroom',
      top: '26%',
      left: '42%',
      temp: '22.1°C',
      co2: '480 ppm',
      occupancy: 'Occupied',
      power: '85 W',
      status: 'normal',
      icon: BedDouble,
    },
    {
      id: 'living-room',
      name: 'Living Room',
      top: '46%',
      left: '44%',
      temp: `${climate.avgTemperature ?? 24.2}°C`,
      co2: `${climate.avgCO2 ?? 612} ppm`,
      occupancy: 'Occupied',
      power: `${((energy.currentTotalWatts ?? 1240) * 0.45).toFixed(0)} W`,
      status: 'active',
      icon: Armchair,
    },
    {
      id: 'kitchen',
      name: 'Kitchen',
      top: '36%',
      left: '74%',
      temp: '24.6°C',
      co2: '580 ppm',
      occupancy: 'Vacant',
      power: '420 W',
      status: 'warm',
      icon: UtensilsCrossed,
    },
    {
      id: 'study',
      name: 'Study',
      top: '68%',
      left: '58%',
      temp: '20.1°C',
      co2: '440 ppm',
      occupancy: 'Vacant',
      power: '120 W',
      status: 'cool',
      icon: Laptop,
    },
  ], [climate, energy]);

  const trendsChartData = useMemo(() => {
    if (trendsRange === '7D') return TRENDS_DATA_7D;
    if (trendsRange === '30D') return TRENDS_DATA_30D;
    return TRENDS_DATA_24H;
  }, [trendsRange]);

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-12">
      {/* ==================================================
          SECTION A: ATMOSPHERIC HERO HEADER BANNER
          ================================================== */}
      <section className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm min-h-[190px] flex items-center bg-slate-900">
        {/* Architectural Dusk Villa Photograph */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url('/images/hero-villa.jpg')` }}
        />

        {/* Cinematic Deep Dusk Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/85 to-slate-950/20" />

        {/* Content */}
        <div className="relative z-10 w-full p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          {/* Left: Greeting, Title & Estate Badges */}
          <div className="space-y-2.5 max-w-xl">
            <div className="text-xs font-medium text-slate-300 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
              <span>{currentTime.greeting}, Aadeesh</span>
            </div>

            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white font-sans">
              {homeName || 'Apex Horizon Estate'}
            </h1>

            <p className="text-xs text-slate-300/90 font-mono">
              A smarter, safer home.
            </p>

            {/* Estate Metadata Pill Badges */}
            <div className="flex flex-wrap items-center gap-2 pt-1 font-mono text-[11px]">
              <span className="bg-slate-900/80 border border-slate-700/70 text-slate-200 px-2.5 py-1 rounded-lg flex items-center gap-1.5 backdrop-blur-md">
                <Layers className="w-3.5 h-3.5 text-slate-400" />
                <span>{stats.totalFloors} Floors</span>
              </span>
              <span className="bg-slate-900/80 border border-slate-700/70 text-slate-200 px-2.5 py-1 rounded-lg flex items-center gap-1.5 backdrop-blur-md">
                <DoorOpen className="w-3.5 h-3.5 text-slate-400" />
                <span>{stats.totalRooms} Rooms</span>
              </span>
              <span className="bg-slate-900/80 border border-slate-700/70 text-slate-200 px-2.5 py-1 rounded-lg flex items-center gap-1.5 backdrop-blur-md">
                <Radio className="w-3.5 h-3.5 text-slate-400" />
                <span>{stats.totalSensors} Sensors</span>
              </span>
              <span className="bg-slate-900/80 border border-slate-700/70 text-emerald-400 px-2.5 py-1 rounded-lg flex items-center gap-1.5 backdrop-blur-md">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>{fleet.onlineCount} Devices Online</span>
              </span>
            </div>
          </div>

          {/* Right: Architectural Quote & Formatted Live Clock */}
          <div className="flex flex-col lg:items-end justify-between self-stretch lg:text-right space-y-4">
            <p className="text-xs italic text-slate-300 max-w-xs leading-relaxed hidden sm:block">
              &ldquo;Technology should fade into the background, and make life better.&rdquo;
            </p>

            <div suppressHydrationWarning className="space-y-0.5">
              <div suppressHydrationWarning className="text-xs font-mono text-slate-300">
                {currentTime.date || 'Thu, 11 Sep 2026'}
              </div>
              <div suppressHydrationWarning className="text-2xl sm:text-3xl font-bold font-mono text-white tracking-tight">
                {currentTime.time || '02:14 PM'}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ==================================================
          SECTION B: CENTERPIECE WORKSPACE (7 Cols / 5 Cols)
          ================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT: THE DIGITAL-TWIN 3D FLOOR PLAN CENTERPIECE (7 Cols) */}
        <section className="lg:col-span-7 bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs relative overflow-hidden flex flex-col justify-between min-h-[580px]">
          {/* Top Overlays: Floor Level Switcher + Live Badge */}
          <div className="flex items-center justify-between z-10 mb-3">
            <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/80 rounded-xl text-xs font-medium gap-1">
              <button
                onClick={() => setActiveFloor('Ground Floor')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  activeFloor === 'Ground Floor'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs font-semibold'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                Ground Floor
              </button>
              <button
                onClick={() => setActiveFloor('First Floor')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  activeFloor === 'First Floor'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs font-semibold'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                First Floor
              </button>
            </div>

            <div className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-800/80 px-2.5 py-1 rounded-full text-[11px] font-mono font-medium text-emerald-700 dark:text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Live Telemetry</span>
            </div>
          </div>

          {/* Center 3D Isometric Visualization Canvas */}
          <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden bg-slate-950/90 border border-slate-200/60 dark:border-slate-800 flex items-center justify-center select-none group">
            {/* 3D Isometric Model Render */}
            <div
              className="absolute inset-0 bg-cover bg-center transition-transform duration-300 ease-out"
              style={{
                backgroundImage: `url('/images/floorplan-3d.jpg')`,
                transform: `scale(${zoomLevel})`,
              }}
            />

            {/* Subtle Isometric Lighting Vignette */}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/50 via-transparent to-transparent pointer-events-none" />

            {/* Left Floating Tool Controls */}
            <div className="absolute left-3 top-3 z-10 flex flex-col gap-1.5">
              <button
                title="Toggle Layers"
                className="w-8 h-8 rounded-lg bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shadow-sm cursor-pointer"
              >
                <Layers className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </button>
              <button
                title="Zoom In"
                onClick={() => setZoomLevel((z) => Math.min(z + 0.15, 1.45))}
                className="w-8 h-8 rounded-lg bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shadow-sm cursor-pointer"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                title="Zoom Out"
                onClick={() => setZoomLevel((z) => Math.max(z - 0.15, 0.9))}
                className="w-8 h-8 rounded-lg bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shadow-sm cursor-pointer"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
            </div>

            {/* Interactive Room Telemetry Hotspot Badges */}
            {roomHotspots.map((spot) => {
              const Icon = spot.icon;
              const isSelected = selectedRoom === spot.name;

              // Determine metric value based on active layer tab
              let metricVal = spot.temp;
              if (activeLayer === 'CO₂') metricVal = spot.co2;
              else if (activeLayer === 'Occupancy') metricVal = spot.occupancy;
              else if (activeLayer === 'Power') metricVal = spot.power;

              return (
                <div
                  key={spot.id}
                  onClick={() => setSelectedRoom(spot.name)}
                  className={`absolute z-20 transition-all duration-200 cursor-pointer -translate-x-1/2 -translate-y-1/2 ${
                    isSelected ? 'scale-105 ring-2 ring-blue-500' : 'hover:scale-105'
                  }`}
                  style={{ top: spot.top, left: spot.left }}
                >
                  <div className="bg-slate-950/90 hover:bg-slate-900 text-white backdrop-blur-md border border-slate-700/80 rounded-xl px-2.5 py-1.5 shadow-xl flex items-center gap-2 font-mono text-[11px]">
                    <div className="w-5 h-5 rounded-md bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
                      <Icon className="w-3 h-3" />
                    </div>
                    <div className="leading-tight">
                      <div className="font-semibold text-slate-200 flex items-center gap-1">
                        <span>{spot.name}</span>
                        {isSelected && <Check className="w-2.5 h-2.5 text-blue-400" />}
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-emerald-400 font-bold">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                        <span>{metricVal}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom Overlays: Telemetry Filter Tabs & 3D View Link */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 mt-1 border-t border-slate-100 dark:border-slate-800/80">
            {/* Filter Tabs */}
            <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/80 rounded-xl text-xs font-medium gap-1">
              {(['Temperature', 'CO₂', 'Occupancy', 'Power'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveLayer(tab)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                    activeLayer === tab
                      ? 'bg-blue-600 text-white shadow-xs font-semibold'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {tab === 'Temperature' && <Thermometer className="w-3.5 h-3.5" />}
                  {tab === 'CO₂' && <Wind className="w-3.5 h-3.5" />}
                  {tab === 'Occupancy' && <Users className="w-3.5 h-3.5" />}
                  {tab === 'Power' && <Zap className="w-3.5 h-3.5" />}
                  <span>{tab}</span>
                </button>
              ))}
            </div>

            {/* Right: 3D View Modal Link & Compass Rose */}
            <div className="flex items-center gap-2">
              <Link href="/home-view">
                <button
                  title="Full Interactive Home View"
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-mono text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:border-blue-500 transition-colors cursor-pointer"
                >
                  <span>3D View</span>
                  <ExternalLink className="w-3 h-3 ml-0.5" />
                </button>
              </Link>
              <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center font-mono font-bold text-[10px] text-slate-500 dark:text-slate-400">
                <Compass className="w-4 h-4 text-slate-400 dark:text-slate-500" />
              </div>
            </div>
          </div>
        </section>

        {/* RIGHT: INTELLIGENCE & CONTROL STACK (5 Cols) */}
        <div className="lg:col-span-5 space-y-4">
          {/* CARD 1: SYSTEM STATUS */}
          <section className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
                <div className="w-6 h-6 rounded-lg bg-blue-50 dark:bg-blue-950/60 flex items-center justify-center text-blue-600 dark:text-blue-400">
                  <Activity className="w-3.5 h-3.5" />
                </div>
                <span>System Status</span>
              </div>
              <Link
                href="/observability"
                className="text-[11px] font-mono text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5"
              >
                <span>View Details</span>
                <ChevronRight className="w-3 h-3" />
              </Link>
            </div>

            {/* Status Hero with Donut Progress Ring */}
            <div className="flex items-center gap-4 pt-1">
              {/* Circular SVG Donut Progress Indicator */}
              <div className="relative w-14 h-14 shrink-0 flex items-center justify-center">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                  <path
                    className="stroke-slate-100 dark:stroke-slate-800"
                    strokeWidth="3.5"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    className={status === 'HEALTHY' ? 'stroke-emerald-500' : 'stroke-amber-500'}
                    strokeDasharray="85, 100"
                    strokeLinecap="round"
                    strokeWidth="3.5"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className={`w-2.5 h-2.5 rounded-full ${status === 'HEALTHY' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-xl sm:text-2xl font-black tracking-tight font-sans ${
                    status === 'HEALTHY' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
                  }`}>
                    ● {status}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {status === 'HEALTHY'
                    ? 'All monitored systems operating normally.'
                    : 'Sensor variance detected. Closed-loop loop active.'}
                </p>
              </div>
            </div>

            {/* 4-Metric Telemetry Horizontal Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
              {/* Temp */}
              <div className="p-2 rounded-xl bg-slate-50/70 dark:bg-slate-800/50">
                <div className="text-base font-bold font-mono text-slate-900 dark:text-slate-100">
                  {climate.avgTemperature ?? 24.2}°C
                </div>
                <div className="text-[10px] text-slate-400">Temperature</div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[9px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold">↓ 0.8°C</span>
                  <svg className="w-8 h-2.5 stroke-emerald-500 fill-none" viewBox="0 0 30 10">
                    <path d="M0 8 Q 8 9, 15 4 T 30 2" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
              </div>

              {/* CO2 */}
              <div className="p-2 rounded-xl bg-slate-50/70 dark:bg-slate-800/50">
                <div className="text-base font-bold font-mono text-slate-900 dark:text-slate-100">
                  {climate.avgCO2 ?? 612} ppm
                </div>
                <div className="text-[10px] text-slate-400">CO₂</div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[9px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold">↓ 12%</span>
                  <svg className="w-8 h-2.5 stroke-emerald-500 fill-none" viewBox="0 0 30 10">
                    <path d="M0 8 Q 10 3, 20 6 T 30 2" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
              </div>

              {/* Power */}
              <div className="p-2 rounded-xl bg-slate-50/70 dark:bg-slate-800/50">
                <div className="text-base font-bold font-mono text-slate-900 dark:text-slate-100">
                  {((energy.currentTotalWatts ?? 1240) / 1000).toFixed(2)} kW
                </div>
                <div className="text-[10px] text-slate-400">Power Draw</div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[9px] font-mono text-amber-600 dark:text-amber-400 font-semibold">↑ 6%</span>
                  <svg className="w-8 h-2.5 stroke-amber-500 fill-none" viewBox="0 0 30 10">
                    <path d="M0 6 Q 10 8, 20 3 T 30 1" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
              </div>

              {/* Devices */}
              <div className="p-2 rounded-xl bg-slate-50/70 dark:bg-slate-800/50">
                <div className="text-base font-bold font-mono text-slate-900 dark:text-slate-100">
                  {fleet.onlineCount} / {fleet.totalDevices}
                </div>
                <div className="text-[10px] text-slate-400">Devices Online</div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[9px] font-mono text-slate-400">{fleet.offlineCount} offline</span>
                  <svg className="w-8 h-2.5 stroke-blue-500 fill-none" viewBox="0 0 30 10">
                    <path d="M0 5 L 30 5" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
              </div>
            </div>
          </section>

          {/* CARD 2: WHAT THE SYSTEM SEES (PREDICTIVE INTELLIGENCE) */}
          <section className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                  <Brain className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    {activePred ? activePred.title : 'No emerging conditions require intervention.'}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {activePred ? activePred.summary : 'All environmental parameters are within expected ranges.'}
                  </p>
                </div>
              </div>
              <Link
                href="/insights"
                className="text-[11px] font-mono text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-0.5 shrink-0"
              >
                <span>View Insights</span>
                <ChevronRight className="w-3 h-3" />
              </Link>
            </div>

            {/* 4 Metadata Columns */}
            <div className="grid grid-cols-4 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80 font-mono text-[11px]">
              <div>
                <div className="text-slate-400 text-[10px]">Prediction</div>
                <div className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                  {activePred ? activePred.predictedType : 'None'}
                </div>
              </div>
              <div>
                <div className="text-slate-400 text-[10px]">Confidence</div>
                <div className="font-semibold text-slate-800 dark:text-slate-200">
                  {activePred ? `${(activePred.confidence * 100).toFixed(0)}%` : '—'}
                </div>
              </div>
              <div>
                <div className="text-slate-400 text-[10px]">Time to threshold</div>
                <div className="font-semibold text-slate-800 dark:text-slate-200">
                  {activePred ? `${activePred.minutesToBreach} min` : '—'}
                </div>
              </div>
              <div>
                <div className="text-slate-400 text-[10px]">Risk level</div>
                <div className={`font-semibold ${activePred?.severity === 'CRITICAL' ? 'text-rose-500' : 'text-emerald-500'}`}>
                  {activePred?.severity || 'Low'}
                </div>
              </div>
            </div>
          </section>

          {/* CARD 3: WHAT THE SYSTEM IS DOING (CLOSED-LOOP CONTROL) */}
          <section className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/60 flex items-center justify-center text-blue-600 dark:text-blue-400">
                  <Sliders className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    What the System Is Doing
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Monitoring household conditions. All automation policies are in monitoring mode.
                  </p>
                </div>
              </div>
              <Link
                href="/automations"
                className="text-[11px] font-mono text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5 shrink-0"
              >
                <span>View Automations</span>
                <ChevronRight className="w-3 h-3" />
              </Link>
            </div>

            {/* 5 Metadata Columns */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80 font-mono text-[11px]">
              <div>
                <div className="text-slate-400 text-[10px]">Active Policy</div>
                <div className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                  {activePolicies[0]?.name || 'Ventilation Control'}
                </div>
              </div>
              <div>
                <div className="text-slate-400 text-[10px]">Current Action</div>
                <div className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                  {activeExec?.action || 'None'}
                </div>
              </div>
              <div>
                <div className="text-slate-400 text-[10px]">Last Decision</div>
                <div className="font-semibold text-slate-800 dark:text-slate-200">14:10</div>
              </div>
              <div>
                <div className="text-slate-400 text-[10px]">Safety Mode</div>
                <div className="font-semibold text-emerald-600 dark:text-emerald-400">FAIL-CLOSED</div>
              </div>
              <div>
                <div className="text-slate-400 text-[10px]">Verification</div>
                <div className="font-semibold text-slate-800 dark:text-slate-200">N/A</div>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* ==================================================
          SECTION C: 3-COLUMN BALANCED FOUNDATION ROW
          ================================================== */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-6">
        {/* COLUMN 1: ENVIRONMENTAL TRENDS (4 Cols) */}
        <section className="lg:col-span-4 bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
              <LineChartIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Environmental Trends</span>
            </div>
            {/* Range Toggle */}
            <div className="flex items-center p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-[10px] font-mono">
              {(['24H', '7D', '30D'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setTrendsRange(r)}
                  className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                    trendsRange === r
                      ? 'bg-blue-600 text-white font-semibold'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Multi-metric Line Chart */}
          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendsChartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1e293b' : '#f1f5f9'} />
                <XAxis dataKey="time" stroke="#64748b" fontSize={10} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={10} tickLine={false} domain={['auto', 'auto']} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: isDark ? '#0f172a' : '#ffffff',
                    borderColor: isDark ? '#334155' : '#e2e8f0',
                    fontSize: '11px',
                    fontFamily: 'monospace',
                    borderRadius: '8px',
                  }}
                />
                <Line type="monotone" dataKey="temp" stroke="#38bdf8" strokeWidth={2} dot={false} name="Temperature (°C)" />
                <Line type="monotone" dataKey="co2" stroke="#22c55e" strokeWidth={1.5} dot={false} name="CO₂ (ppm / 10)" />
                <Line type="monotone" dataKey="humidity" stroke="#a855f7" strokeWidth={1.5} dot={false} name="Humidity (%)" />
                <Line type="monotone" dataKey="power" stroke="#f59e0b" strokeWidth={1.5} dot={false} name="Power (kW)" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Chart Legend with Live Values */}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80 text-[10px] font-mono">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 text-slate-500">
                <span className="w-2 h-2 rounded-full bg-sky-400" /> Temperature
              </span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">{climate.avgTemperature ?? 24.2}°C</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 text-slate-500">
                <span className="w-2 h-2 rounded-full bg-emerald-500" /> CO₂
              </span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">{climate.avgCO2 ?? 612} ppm</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 text-slate-500">
                <span className="w-2 h-2 rounded-full bg-purple-500" /> Humidity
              </span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">{climate.avgHumidity ?? 46}%</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 text-slate-500">
                <span className="w-2 h-2 rounded-full bg-amber-500" /> Power
              </span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">{((energy.currentTotalWatts ?? 1240) / 1000).toFixed(2)} kW</span>
            </div>
          </div>
        </section>

        {/* COLUMN 2: RECENT ACTIVITY (4 Cols) */}
        <section className="lg:col-span-4 bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
              <Activity className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Recent Activity</span>
            </div>
            <Link
              href="/events"
              className="text-[11px] font-mono text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5"
            >
              <span>View All</span>
              <ChevronRight className="w-3 h-3" />
            </Link>
          </div>

          {/* Activity Timeline List */}
          <div className="space-y-3">
            {recentEvents.slice(0, 5).map((evt: any, i: number) => {
              const dotColor =
                evt.color === 'amber'
                  ? 'bg-amber-500'
                  : evt.color === 'green'
                  ? 'bg-emerald-500'
                  : evt.color === 'red'
                  ? 'bg-rose-500'
                  : evt.color === 'blue'
                  ? 'bg-blue-500'
                  : 'bg-slate-400 dark:bg-slate-500';

              return (
                <div key={evt.id || i} className="flex items-start gap-2.5 text-xs">
                  {/* Formatted Timestamp */}
                  <span
                    suppressHydrationWarning
                    className="font-mono text-slate-400 text-[11px] shrink-0 w-11 pt-0.5"
                  >
                    {mounted
                      ? new Date(evt.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: false,
                        })
                      : '--:--'}
                  </span>

                  {/* Semantic Colored Node Dot */}
                  <div className="pt-1.5 shrink-0">
                    <span className={`block w-2 h-2 rounded-full ${dotColor}`} />
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-slate-800 dark:text-slate-200 truncate leading-tight">
                      {evt.title || evt.eventType}
                    </div>
                    <div className="text-[10px] text-slate-400 dark:text-slate-500 truncate leading-snug">
                      {evt.summary || evt.category}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* COLUMN 3: SYSTEM COMPONENTS (4 Cols) */}
        <section className="lg:col-span-4 bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
                <Layers className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>System Components</span>
              </div>
              <div className="text-[10px] text-slate-400 font-mono mt-0.5">All systems nominal</div>
            </div>
            <Link
              href="/observability"
              className="text-[11px] font-mono text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5"
            >
              <span>View Details</span>
              <ChevronRight className="w-3 h-3" />
            </Link>
          </div>

          {/* 2x3 Micro-Card Component Grid */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            {/* Database */}
            <div className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                <Database className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="text-[11px] font-semibold text-slate-800 dark:text-slate-200">Database</div>
                <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono font-medium">● Healthy</div>
              </div>
            </div>

            {/* MQTT Broker */}
            <div className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-teal-50 dark:bg-teal-950/60 flex items-center justify-center text-teal-600 dark:text-teal-400 shrink-0">
                <Radio className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="text-[11px] font-semibold text-slate-800 dark:text-slate-200">MQTT Broker</div>
                <div className="text-[10px] text-teal-600 dark:text-teal-400 font-mono font-medium">● Connected</div>
              </div>
            </div>

            {/* Ingestion */}
            <div className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                <CheckCircle2 className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="text-[11px] font-semibold text-slate-800 dark:text-slate-200">Ingestion</div>
                <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono font-medium">● Healthy</div>
              </div>
            </div>

            {/* Intelligence */}
            <div className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-purple-50 dark:bg-purple-950/60 flex items-center justify-center text-purple-600 dark:text-purple-400 shrink-0">
                <Brain className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="text-[11px] font-semibold text-slate-800 dark:text-slate-200">Intelligence</div>
                <div className="text-[10px] text-purple-600 dark:text-purple-400 font-mono font-medium">● Healthy</div>
              </div>
            </div>

            {/* Automation */}
            <div className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/60 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                <Sliders className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="text-[11px] font-semibold text-slate-800 dark:text-slate-200">Automation</div>
                <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono font-medium">● Healthy</div>
              </div>
            </div>

            {/* Telemetry Freshness */}
            <div className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-sky-50 dark:bg-sky-950/60 flex items-center justify-center text-sky-600 dark:text-sky-400 shrink-0">
                <RefreshCw className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="text-[11px] font-semibold text-slate-800 dark:text-slate-200">Freshness</div>
                <div suppressHydrationWarning className="text-[10px] text-slate-600 dark:text-slate-400 font-mono font-medium">
                  {secondsAgo}s ago
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ==================================================
          SECTION D: AMBIENT FOOTER BANNER
          ================================================== */}
      <footer className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 py-6 px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono select-none bg-slate-950 text-slate-400 shadow-xs">
        {/* Subtle Background Scenic Mist */}
        <div
          className="absolute inset-0 bg-cover bg-bottom opacity-20 pointer-events-none"
          style={{ backgroundImage: `url('/images/footer-mountains.jpg')` }}
        />
        <div className="absolute inset-0 bg-slate-950/70 pointer-events-none" />

        <div className="relative z-10 tracking-widest text-[11px] text-slate-400 uppercase font-semibold">
          INTELLIGENCE FOR A MORE HUMAN TOMORROW
        </div>

        <div className="relative z-10 text-[11px] text-slate-400 font-mono">
          Home Intelligence v1.0.0
        </div>
      </footer>
    </div>
  );
}
