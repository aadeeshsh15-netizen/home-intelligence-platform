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
  Sparkles,
  Cpu,
  Clock,
  ShieldCheck,
  CheckCircle2,
  BarChart2,
} from 'lucide-react';

const metricOptions = [
  { id: 'POWER', label: 'Active Power', unit: 'W', icon: Zap, color: '#fbbf24', target: 'HOUSEHOLD_POWER' },
  { id: 'TEMPERATURE', label: 'Temperature', unit: '°C', icon: Thermometer, color: '#38bdf8', target: 'ROOM_TEMPERATURE' },
  { id: 'HUMIDITY', label: 'Humidity', unit: '%', icon: Droplets, color: '#2dd4bf', target: null },
  { id: 'CO2', label: 'CO₂ Air Quality', unit: 'ppm', icon: Wind, color: '#34d399', target: 'ROOM_CO2' },
  { id: 'NOISE', label: 'Acoustic Noise', unit: 'dB', icon: Volume2, color: '#f43f5e', target: null },
];

const rangeOptions = [
  { id: '24h', label: '24 Hours' },
  { id: '7d', label: '7 Days' },
  { id: '30d', label: '30 Days' },
];

const forecastHorizons = [
  { id: '1h', label: '+1 Hour' },
  { id: '4h', label: '+4 Hours' },
  { id: '24h', label: '+24 Hours' },
];

export default function AnalyticsPage() {
  const [metric, setMetric] = useState('POWER');
  const [range, setRange] = useState('24h');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Predictive Intelligence state (Phase 3)
  const [showForecast, setShowForecast] = useState(true);
  const [forecastHorizon, setForecastHorizon] = useState('24h');
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [availableModels, setAvailableModels] = useState<any[]>([]);
  const [forecastData, setForecastData] = useState<any>(null);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [evaluationReport, setEvaluationReport] = useState<any>(null);

  const activeMetricMeta = metricOptions.find((m) => m.id === metric)!;
  const isPredictiveSupported = !!activeMetricMeta.target;

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

  const fetchModels = async () => {
    if (!activeMetricMeta.target) return;
    try {
      const res = await fetch(`/api/predictions/models?target=${activeMetricMeta.target}`);
      if (res.ok) {
        const json = await res.json();
        setAvailableModels(json.models || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchForecast = async () => {
    if (!activeMetricMeta.target || !showForecast) return;
    try {
      setForecastLoading(true);
      let url = `/api/predictions?target=${activeMetricMeta.target}&horizon=${forecastHorizon}`;
      if (selectedModel) {
        url += `&modelType=${selectedModel}`;
      }
      const res = await fetch(url);
      if (res.ok) {
        setForecastData(await res.json());
      } else {
        setForecastData(null);
      }
    } catch (e) {
      console.error(e);
      setForecastData(null);
    } finally {
      setForecastLoading(false);
    }
  };

  const runBacktest = async () => {
    if (!activeMetricMeta.target) return;
    try {
      setEvaluating(true);
      const res = await fetch('/api/predictions/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: activeMetricMeta.target,
          modelType: selectedModel || undefined,
          days: 7,
        }),
      });
      if (res.ok) {
        setEvaluationReport(await res.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setEvaluating(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [metric, range]);

  useEffect(() => {
    fetchModels();
    setEvaluationReport(null);
  }, [metric]);

  useEffect(() => {
    if (showForecast && isPredictiveSupported) {
      fetchForecast();
    }
  }, [metric, showForecast, forecastHorizon, selectedModel]);

  const summary = data?.summary;
  const distribution = data?.distribution;
  const series = data?.series || [];

  // Combine historical series with forecast points for unified visualization
  const combinedChartData = React.useMemo(() => {
    if (!showForecast || !forecastData || !forecastData.forecast) {
      return series.map((s: any) => ({
        ...s,
        predicted: undefined,
        ci80Lower: undefined,
        ci80Upper: undefined,
        ci95Lower: undefined,
        ci95Upper: undefined,
      }));
    }

    // Historical points with null forecast values
    const historicalMapped = series.map((s: any) => ({
      ...s,
      predicted: undefined,
      ci80Lower: undefined,
      ci80Upper: undefined,
      ci95Lower: undefined,
      ci95Upper: undefined,
    }));

    // Prediction points with null observed values
    const forecastMapped = forecastData.forecast.map((p: any) => ({
      timestamp: p.timestamp,
      value: undefined,
      baselineMean: undefined,
      baselineUpper: undefined,
      baselineLower: undefined,
      predicted: p.predicted,
      ci80Lower: p.confidenceInterval80.lower,
      ci80Upper: p.confidenceInterval80.upper,
      ci95Lower: p.confidenceInterval95.lower,
      ci95Upper: p.confidenceInterval95.upper,
      standardError: p.standardError,
    }));

    // Bridge the latest historical point to prediction
    if (historicalMapped.length > 0 && forecastMapped.length > 0) {
      const lastObs = historicalMapped[historicalMapped.length - 1];
      lastObs.predicted = lastObs.value;
      lastObs.ci80Lower = lastObs.value;
      lastObs.ci80Upper = lastObs.value;
    }

    return [...historicalMapped, ...forecastMapped];
  }, [series, forecastData, showForecast]);

  return (
    <div className="space-y-6">
      {/* Top Header & Range/Metric Selectors */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-100">Telemetry & Predictive Intelligence</h1>
            <Badge variant="outline" className="text-xs bg-indigo-950/40 border-indigo-500/40 text-indigo-400">
              Phase 3 Predictive
            </Badge>
          </div>
          <p className="text-xs text-slate-400 font-mono mt-1">
            Deterministic baselines, autoregressive residual decay, and multi-horizon forecasts
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
              {opt.target && (
                <span className="text-[9px] px-1 bg-indigo-950/60 text-indigo-300 border border-indigo-800/60 rounded">
                  Predict
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Forecast Controls Bar (When Predictive Target Supported) */}
      {isPredictiveSupported && (
        <div className="bg-slate-900/80 border border-indigo-900/40 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <span className="text-xs font-mono font-semibold text-slate-200">
                Predictive Forecast Overlay
              </span>
            </div>

            <button
              onClick={() => setShowForecast(!showForecast)}
              className={`text-xs font-mono px-2.5 py-1 rounded border transition-colors cursor-pointer ${
                showForecast
                  ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
                  : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}
            >
              {showForecast ? 'Forecast ON' : 'Forecast OFF'}
            </button>

            {showForecast && (
              <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded p-0.5">
                {forecastHorizons.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => setForecastHorizon(h.id)}
                    className={`text-[11px] font-mono px-2 py-0.5 rounded cursor-pointer ${
                      forecastHorizon === h.id
                        ? 'bg-indigo-600 text-white font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {h.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Model Selector Dropdown */}
            {availableModels.length > 0 && (
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-slate-300 text-xs font-mono rounded px-2.5 py-1.5 focus:outline-none focus:border-indigo-500"
              >
                <option value="">Auto (Default Provider)</option>
                {availableModels.map((m) => (
                  <option key={m.id} value={m.type}>
                    {m.name} ({m.type})
                  </option>
                ))}
              </select>
            )}

            {/* Backtest Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={runBacktest}
              disabled={evaluating}
              className="text-xs font-mono border-indigo-800/60 text-indigo-300 hover:bg-indigo-950/40"
            >
              <BarChart2 className="w-3.5 h-3.5 mr-1" />
              {evaluating ? 'Running 7d Backtest...' : 'Run Backtest'}
            </Button>
          </div>
        </div>
      )}

      {/* Model Quality & Active Provider Banner */}
      {showForecast && forecastData && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs font-mono">
          <div className="bg-slate-900/60 border border-slate-800 p-2.5 rounded flex items-center justify-between">
            <span className="text-slate-500">Active Model:</span>
            <span className="text-indigo-400 font-semibold truncate max-w-[180px]">
              {forecastData.model.name}
            </span>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 p-2.5 rounded flex items-center justify-between">
            <span className="text-slate-500">Data Quality:</span>
            <Badge
              variant={
                forecastData.dataQuality.status === 'HEALTHY'
                  ? 'success'
                  : forecastData.dataQuality.status === 'DEGRADED'
                  ? 'warning'
                  : 'critical'
              }
              className="text-[10px]"
            >
              {forecastData.dataQuality.status}
            </Badge>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 p-2.5 rounded flex items-center justify-between">
            <span className="text-slate-500">History Span:</span>
            <span className="text-slate-200">
              {forecastData.dataQuality.historicalHours} hrs
            </span>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 p-2.5 rounded flex items-center justify-between">
            <span className="text-slate-500">Missing Telemetry:</span>
            <span
              className={
                forecastData.dataQuality.missingDataPercent > 10
                  ? 'text-amber-400'
                  : 'text-emerald-400'
              }
            >
              {forecastData.dataQuality.missingDataPercent}%
            </span>
          </div>
        </div>
      )}

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

      {/* Main Time-Series & Predictive Forecast Chart */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
            <div>
              <CardTitle>
                {activeMetricMeta.label} ({activeMetricMeta.unit}) — Time Series & Future Trajectory
              </CardTitle>
              <span className="text-[11px] font-mono text-slate-500">
                Corridor represents empirical baseline & forecast confidence intervals (80% / 95%)
              </span>
            </div>

            {forecastLoading && (
              <span className="text-xs font-mono text-indigo-400 animate-pulse">
                Computing multi-horizon forecast...
              </span>
            )}
          </div>
        </CardHeader>

        <div className="h-88 w-full pt-2">
          {loading ? (
            <div className="flex items-center justify-center h-full font-mono text-xs text-slate-500">
              Aggregating downsampled series...
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={combinedChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis
                  dataKey="timestamp"
                  stroke="#64748b"
                  fontSize={10}
                  tickFormatter={(val) => {
                    const d = new Date(val);
                    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  }}
                />
                <YAxis stroke="#64748b" fontSize={10} domain={['auto', 'auto']} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0b0f17', borderColor: '#1e293b', fontSize: '11px' }}
                  labelFormatter={(lbl) => formatTimestampIso(lbl)}
                  formatter={(value: any, name: string) => {
                    if (name === 'value') return [`${value} ${activeMetricMeta.unit}`, 'Observed'];
                    if (name === 'baselineMean') return [`${value} ${activeMetricMeta.unit}`, 'Baseline Mean'];
                    if (name === 'predicted') return [`${value} ${activeMetricMeta.unit}`, 'Predicted Forecast'];
                    if (name === 'ci80Upper') return [`${value} ${activeMetricMeta.unit}`, 'Upper 80% CI'];
                    if (name === 'ci80Lower') return [`${value} ${activeMetricMeta.unit}`, 'Lower 80% CI'];
                    return [value, name];
                  }}
                />

                {/* Shaded Historical Baseline Corridor */}
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

                {/* Forecast Confidence Envelope (80% CI) */}
                <Area
                  type="monotone"
                  dataKey="ci80Upper"
                  stroke="none"
                  fill="#818cf8"
                  fillOpacity={0.15}
                />
                <Area
                  type="monotone"
                  dataKey="ci80Lower"
                  stroke="none"
                  fill="#090d16"
                  fillOpacity={0.9}
                />

                {/* Historical Baseline Mean Dashed Line */}
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

                {/* Predicted Future Line */}
                <Line
                  type="monotone"
                  dataKey="predicted"
                  stroke="#a855f7"
                  strokeWidth={2.5}
                  strokeDasharray="5 5"
                  dot={{ r: 2.5, fill: '#c084fc' }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center justify-center gap-6 pt-4 border-t border-slate-800/80 text-xs font-mono text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-3 h-1 rounded-full" style={{ backgroundColor: activeMetricMeta.color }} />
            <span>Observed Telemetry</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-0.5 bg-slate-500 border-b border-dashed border-slate-400" />
            <span>Historical Baseline (μ)</span>
          </div>
          {showForecast && (
            <>
              <div className="flex items-center gap-2">
                <span className="w-3 h-0.5 bg-purple-500 border-b border-dashed border-purple-400" />
                <span className="text-purple-400 font-semibold">Predicted Trajectory (ŷ)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 bg-indigo-500/30 border border-indigo-500/50 rounded-xs" />
                <span>Forecast Confidence Band (80%)</span>
              </div>
            </>
          )}
        </div>
      </Card>

      {/* Continuous Evaluation / Backtest Results Modal/Panel */}
      {evaluationReport && (
        <Card className="border-indigo-900/60 bg-slate-900/40">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-indigo-300 flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-indigo-400" />
                  Rolling-Origin Walk-Forward Backtest Report
                </CardTitle>
                <span className="text-xs font-mono text-slate-400">
                  Model: {evaluationReport.modelName} ({evaluationReport.modelType})
                </span>
              </div>
              <Badge variant="outline" className="text-xs text-indigo-300 border-indigo-800">
                Latency: {evaluationReport.inferenceLatencyMs}ms
              </Badge>
            </div>
          </CardHeader>

          <div className="p-4 pt-0 space-y-4">
            {/* Overall Accuracy KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-mono text-xs">
              <div className="bg-slate-950 p-3 rounded border border-slate-800">
                <span className="text-slate-500 block text-[10px]">Overall MAE</span>
                <span className="text-emerald-400 font-bold text-base">
                  {evaluationReport.overallMae} {activeMetricMeta.unit}
                </span>
              </div>
              <div className="bg-slate-950 p-3 rounded border border-slate-800">
                <span className="text-slate-500 block text-[10px]">Overall RMSE</span>
                <span className="text-sky-400 font-bold text-base">
                  {evaluationReport.overallRmse} {activeMetricMeta.unit}
                </span>
              </div>
              <div className="bg-slate-950 p-3 rounded border border-slate-800">
                <span className="text-slate-500 block text-[10px]">Overall MAPE</span>
                <span className="text-amber-400 font-bold text-base">
                  {evaluationReport.overallMape ? `${evaluationReport.overallMape}%` : 'N/A'}
                </span>
              </div>
              <div className="bg-slate-950 p-3 rounded border border-slate-800">
                <span className="text-slate-500 block text-[10px]">Inference SLA</span>
                <span className="text-indigo-400 font-bold text-base">
                  {evaluationReport.inferenceLatencyMs} ms (&lt; 10ms target)
                </span>
              </div>
            </div>

            {/* Horizon Degradation Table */}
            <div>
              <span className="text-xs font-mono text-slate-400 block mb-2 font-semibold">
                Accuracy Degradation Across Forecast Horizons:
              </span>
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono text-left border border-slate-800">
                  <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="p-2">Horizon</th>
                      <th className="p-2">MAE ({activeMetricMeta.unit})</th>
                      <th className="p-2">RMSE ({activeMetricMeta.unit})</th>
                      <th className="p-2">MAPE (%)</th>
                      <th className="p-2">Sample Count</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-900/60">
                    {evaluationReport.horizonMetrics.map((hm: any) => (
                      <tr key={hm.horizonMinutes} className="hover:bg-slate-800/40">
                        <td className="p-2 font-bold text-slate-200">{hm.horizonLabel}</td>
                        <td className="p-2 text-emerald-400">{hm.mae}</td>
                        <td className="p-2 text-sky-400">{hm.rmse}</td>
                        <td className="p-2 text-amber-400">{hm.mape ? `${hm.mape}%` : '—'}</td>
                        <td className="p-2 text-slate-400">{hm.sampleCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </Card>
      )}

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
