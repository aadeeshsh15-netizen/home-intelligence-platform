'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatMetricValue, formatTimestampIso } from '@/lib/formatters';
import {
  LineChart,
  Line,
  Area,
  ComposedChart,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import {
  Calendar,
  Zap,
  Thermometer,
  Droplets,
  Wind,
  Volume2,
  TrendingUp,
  TrendingDown,
  Activity,
  AlertCircle,
} from 'lucide-react';

const metricOptions = [
  { id: 'POWER', label: 'Active Power', unit: 'W', icon: Zap, color: '#fbbf24' },
  { id: 'TEMPERATURE', label: 'Temperature', unit: '°C', icon: Thermometer, color: '#38bdf8' },
  { id: 'HUMIDITY', label: 'Humidity', unit: '%', icon: Droplets, color: '#2dd4bf' },
  { id: 'CO2', label: 'CO₂ Air Quality', unit: 'ppm', icon: Wind, color: '#34d399' },
  { id: 'NOISE', label: 'Acoustic Noise', unit: 'dB', icon: Volume2, color: '#f43f5e' },
];

const rangeOptions = [
  { id: '24h', label: '24 Hours' },
  { id: '7d', label: '7 Days' },
  { id: '30d', label: '30 Days' },
];

export default function AnalyticsPage() {
  const [metric, setMetric] = useState('POWER');
  const [range, setRange] = useState('24h');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/analytics?metric=${metric}&range=${range}`);
      if (res.ok) {
        setData(await res.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [metric, range]);

  const activeMetricMeta = metricOptions.find((m) => m.id === metric)!;
  const summary = data?.summary;
  const distribution = data?.distribution;
  const series = data?.series || [];

  return (
    <div className="space-y-6">
      {/* Top Header & Range/Metric Selectors */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Historical Telemetry Analytics</h1>
          <p className="text-xs text-slate-400 font-mono mt-1">
            Multi-timeframe statistical distributions, peak extraction, and baseline corridor overlays
          </p>
        </div>

        {/* Timeframe Selector */}
        <div className="flex items-center bg-slate-900 border border-slate-800 rounded p-1 gap-1">
          {rangeOptions.map((r) => (
            <button
              key={r.id}
              onClick={() => setRange(r.id)}
              className={`px-3 py-1.5 rounded text-xs font-mono transition-colors cursor-pointer ${
                range === r.id
                  ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Metric Tabs */}
      <div className="flex flex-wrap gap-2">
        {metricOptions.map((opt) => {
          const Icon = opt.icon;
          const isSelected = opt.id === metric;
          return (
            <button
              key={opt.id}
              onClick={() => setMetric(opt.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded border text-xs font-mono transition-all cursor-pointer ${
                isSelected
                  ? 'bg-slate-800 border-sky-500/60 text-sky-400 shadow-sm'
                  : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              <Icon className="w-3.5 h-3.5" style={{ color: opt.color }} />
              <span>{opt.label}</span>
              <span className="text-[10px] text-slate-500">({opt.unit})</span>
            </button>
          );
        })}
      </div>

      {/* Statistical Summary KPIs */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card className="p-4">
            <span className="text-[10px] font-mono text-slate-500 uppercase block">Current Reading</span>
            <span className="text-2xl font-mono font-bold text-slate-100 mt-1 block">
              {formatMetricValue(summary.current, activeMetricMeta.unit)}
            </span>
            <span className="text-[10px] font-mono text-slate-500">Latest observed sample</span>
          </Card>

          <Card className="p-4">
            <span className="text-[10px] font-mono text-slate-500 uppercase block">Period Mean (Avg)</span>
            <span className="text-2xl font-mono font-bold text-slate-100 mt-1 block">
              {formatMetricValue(summary.avg, activeMetricMeta.unit)}
            </span>
            <div className="flex items-center gap-1 text-[10px] font-mono mt-0.5">
              {summary.deltaPercent >= 0 ? (
                <span className="text-amber-400 flex items-center">
                  <TrendingUp className="w-3 h-3 mr-0.5" />+{summary.deltaPercent}%
                </span>
              ) : (
                <span className="text-emerald-400 flex items-center">
                  <TrendingDown className="w-3 h-3 mr-0.5" />{summary.deltaPercent}%
                </span>
              )}
              <span className="text-slate-500">vs prev {range}</span>
            </div>
          </Card>

          <Card className="p-4">
            <span className="text-[10px] font-mono text-slate-500 uppercase block">Period Min / Max</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-lg font-mono font-semibold text-emerald-400">
                {summary.min}
              </span>
              <span className="text-slate-600 font-mono">/</span>
              <span className="text-lg font-mono font-semibold text-rose-400">
                {summary.max}
              </span>
              <span className="text-xs font-mono text-slate-400">{activeMetricMeta.unit}</span>
            </div>
            <span className="text-[10px] font-mono text-slate-500">Observed extreme range</span>
          </Card>

          <Card className="p-4">
            <span className="text-[10px] font-mono text-slate-500 uppercase block">Peak Period</span>
            <span className="text-lg font-mono font-bold text-amber-400 mt-1 block">
              {formatMetricValue(summary.peakValue, activeMetricMeta.unit)}
            </span>
            <span className="text-[10px] font-mono text-slate-400 truncate block">
              {summary.peakTimestamp ? new Date(summary.peakTimestamp).toLocaleString() : 'N/A'}
            </span>
          </Card>

          <Card className="p-4">
            <span className="text-[10px] font-mono text-slate-500 uppercase block">Standard Dev (σ)</span>
            <span className="text-2xl font-mono font-bold text-sky-400 mt-1 block">
              ±{distribution?.stdDev || 0}
            </span>
            <span className="text-[10px] font-mono text-slate-500">n = {distribution?.count} readings</span>
          </Card>
        </div>
      )}

      {/* Main Historical Time-Series Chart */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>
              {activeMetricMeta.label} ({activeMetricMeta.unit}) — {range.toUpperCase()} Historical Series
            </CardTitle>
            <span className="text-[11px] font-mono text-slate-500">
              Shaded corridor represents ±2σ historical baseline envelope (95.4% confidence interval)
            </span>
          </div>
        </CardHeader>

        <div className="h-80 w-full pt-2">
          {loading ? (
            <div className="flex items-center justify-center h-full font-mono text-xs text-slate-500">
              Aggregating downsampled series...
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={series}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis
                  dataKey="timestamp"
                  stroke="#64748b"
                  fontSize={10}
                  tickFormatter={(val) => {
                    const d = new Date(val);
                    return range === '24h'
                      ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      : `${d.getMonth() + 1}/${d.getDate()}`;
                  }}
                />
                <YAxis stroke="#64748b" fontSize={10} domain={['auto', 'auto']} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0b0f17', borderColor: '#1e293b', fontSize: '11px' }}
                  labelFormatter={(lbl) => formatTimestampIso(lbl)}
                  formatter={(value: any, name: string) => {
                    if (name === 'value') return [`${value} ${activeMetricMeta.unit}`, 'Observed'];
                    if (name === 'baselineMean') return [`${value} ${activeMetricMeta.unit}`, 'Baseline Mean'];
                    if (name === 'baselineUpper') return [`${value} ${activeMetricMeta.unit}`, 'Upper Corridor (+2σ)'];
                    if (name === 'baselineLower') return [`${value} ${activeMetricMeta.unit}`, 'Lower Corridor (-2σ)'];
                    return [value, name];
                  }}
                />

                {/* Shaded Baseline Corridor */}
                <Area
                  type="monotone"
                  dataKey="baselineUpper"
                  stroke="none"
                  fill="#38bdf8"
                  fillOpacity={0.08}
                />
                <Area
                  type="monotone"
                  dataKey="baselineLower"
                  stroke="none"
                  fill="#090d16"
                  fillOpacity={0.9}
                />

                {/* Baseline Mean Dashed Line */}
                <Line
                  type="monotone"
                  dataKey="baselineMean"
                  stroke="#64748b"
                  strokeWidth={1.2}
                  strokeDasharray="4 4"
                  dot={false}
                />

                {/* Observed Telemetry Line */}
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={activeMetricMeta.color}
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-6 pt-4 border-t border-slate-800/80 text-xs font-mono text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-3 h-1 rounded-full" style={{ backgroundColor: activeMetricMeta.color }} />
            <span>Observed Telemetry</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-0.5 bg-slate-500 border-b border-dashed border-slate-400" />
            <span>Historical Baseline (μ)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 bg-sky-500/20 border border-sky-500/40 rounded-xs" />
            <span>±2σ Normal Envelope</span>
          </div>
        </div>
      </Card>

      {/* Percentiles & Distribution Table */}
      {distribution && (
        <Card>
          <CardHeader>
            <CardTitle>Empirical Distribution Statistics</CardTitle>
            <span className="text-[10px] font-mono text-slate-500">
              Parametric & Non-Parametric Quantiles
            </span>
          </CardHeader>

          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-xs font-mono">
            <div className="bg-slate-950 p-3 rounded border border-slate-800">
              <span className="text-slate-500 block text-[10px]">P10 (10th %ile)</span>
              <span className="text-slate-100 font-bold text-sm">{distribution.p10} {activeMetricMeta.unit}</span>
            </div>
            <div className="bg-slate-950 p-3 rounded border border-slate-800">
              <span className="text-slate-500 block text-[10px]">P50 (Median)</span>
              <span className="text-slate-100 font-bold text-sm">{distribution.p50} {activeMetricMeta.unit}</span>
            </div>
            <div className="bg-slate-950 p-3 rounded border border-slate-800">
              <span className="text-slate-500 block text-[10px]">P90 (90th %ile)</span>
              <span className="text-slate-100 font-bold text-sm">{distribution.p90} {activeMetricMeta.unit}</span>
            </div>
            <div className="bg-slate-950 p-3 rounded border border-slate-800">
              <span className="text-slate-500 block text-[10px]">Mean (μ)</span>
              <span className="text-slate-100 font-bold text-sm">{distribution.mean} {activeMetricMeta.unit}</span>
            </div>
            <div className="bg-slate-950 p-3 rounded border border-slate-800">
              <span className="text-slate-500 block text-[10px]">Std Deviation (σ)</span>
              <span className="text-slate-100 font-bold text-sm">{distribution.stdDev} {activeMetricMeta.unit}</span>
            </div>
            <div className="bg-slate-950 p-3 rounded border border-slate-800">
              <span className="text-slate-500 block text-[10px]">Sample Count</span>
              <span className="text-slate-100 font-bold text-sm">{distribution.count} points</span>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
