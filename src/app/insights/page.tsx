'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatRelativeTime } from '@/lib/formatters';
import Link from 'next/link';
import {
  Lightbulb,
  CheckCircle2,
  TrendingUp,
  FlaskConical,
  Zap,
  Wind,
  Thermometer,
  ShieldCheck,
  ChevronDown,
  Info,
} from 'lucide-react';

export default function InsightsPage() {
  const [insights, setInsights] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [injectionStatus, setInjectionStatus] = useState<string | null>(null);

  const fetchInsights = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/insights');
      if (res.ok) {
        const data = await res.json();
        setInsights(data.insights);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInsights();
  }, []);

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/insights/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        fetchInsights();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleInjectQuickAnomaly = async (type: string, roomId: string) => {
    try {
      setInjectionStatus(`Injecting ${type}...`);
      const res = await fetch('/api/simulator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'inject_anomaly',
          anomaly: {
            type,
            roomId,
            active: true,
            intensity: 1.5,
          },
        }),
      });
      if (res.ok) {
        setInjectionStatus(`Injected ${type}. Advancing physics pipeline...`);
        setTimeout(() => {
          fetchInsights();
          setInjectionStatus(null);
        }, 1200);
      }
    } catch (e) {
      console.error(e);
      setInjectionStatus('Failed to inject anomaly');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-100">Deterministic AI & Intelligence Layer</h1>
            <Badge variant="info">Statistical Baselines</Badge>
          </div>
          <p className="text-xs text-slate-400 font-mono mt-1">
            Explainable anomaly detection backed by parametric and non-parametric Gaussian baselines
          </p>
        </div>

        <span className="text-xs font-mono text-slate-500">
          Active Insights: {insights.length}
        </span>
      </div>

      {/* Intelligence Architecture Rationale Banner */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
        <div className="space-y-1">
          <span className="text-slate-500 uppercase block text-[10px]">Methodology</span>
          <span className="text-slate-200 font-semibold block">168-Hour Empirical Matrix</span>
          <p className="text-slate-400 text-[11px]">
            Sensor data is bucketed by day-of-week and hour-of-day over a rolling 14-day window.
          </p>
        </div>

        <div className="space-y-1">
          <span className="text-slate-500 uppercase block text-[10px]">Anomaly Criterion</span>
          <span className="text-sky-400 font-semibold block">Z-Score &gt; 2.50 (p &lt; 0.012)</span>
          <p className="text-slate-400 text-[11px]">
            Statistical deviations exceeding 2.5 standard deviations from normal operating envelopes.
          </p>
        </div>

        <div className="space-y-1">
          <span className="text-slate-500 uppercase block text-[10px]">Explainability</span>
          <span className="text-emerald-400 font-semibold block">No Hallucinations</span>
          <p className="text-slate-400 text-[11px]">
            Every insight provides explicit verifiable math (μ, σ, Z, sample count) in the UI.
          </p>
        </div>
      </div>

      {/* Anomaly Testing Sandbox */}
      <Card className="border-sky-900/50 bg-sky-950/20">
        <CardHeader>
          <div className="flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-sky-400" />
            <CardTitle className="text-sky-300">Live Anomaly Injection Sandbox</CardTitle>
          </div>
          {injectionStatus && (
            <span className="text-xs font-mono text-sky-400 animate-pulse">{injectionStatus}</span>
          )}
        </CardHeader>
        <p className="text-xs text-slate-400 mb-3">
          Inject anomalous thermodynamic or electrical events into the physics simulator to verify immediate intelligence layer detection:
        </p>

        <div className="flex flex-wrap gap-2.5">
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleInjectQuickAnomaly('POWER_SURGE', insights[0]?.roomId || '')}
            className="text-xs font-mono border-amber-900/60 hover:bg-amber-950/40 text-amber-300"
          >
            <Zap className="w-3.5 h-3.5 mr-1" />
            <span>Simulate Living Room Power Surge (+2.8 kW)</span>
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => handleInjectQuickAnomaly('WINDOW_OPEN', insights[0]?.roomId || '')}
            className="text-xs font-mono border-sky-900/60 hover:bg-sky-950/40 text-sky-300"
          >
            <Thermometer className="w-3.5 h-3.5 mr-1" />
            <span>Simulate Open Window Thermal Shock</span>
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => handleInjectQuickAnomaly('CO2_SPIKE', insights[0]?.roomId || '')}
            className="text-xs font-mono border-emerald-900/60 hover:bg-emerald-950/40 text-emerald-300"
          >
            <Wind className="w-3.5 h-3.5 mr-1" />
            <span>Simulate Bedroom CO₂ Accumulation Spike</span>
          </Button>
        </div>
      </Card>

      {/* Active Insights Feed */}
      <div className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center h-48 font-mono text-xs text-slate-500">
            Evaluating historical baselines and current deviations...
          </div>
        ) : insights.length === 0 ? (
          <Card className="text-center py-12 text-slate-500 font-mono text-xs">
            No active anomalies detected. All sensors are operating within their established ±2.5σ baseline bounds.
          </Card>
        ) : (
          insights.map((insight) => {
            const evidence = insight.evidenceData || {};
            const isHeuristic = insight.isHeuristic;

            return (
              <Card key={insight.id} className="space-y-3">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-slate-100">{insight.title}</span>
                      <Badge
                        size="sm"
                        variant={isHeuristic ? 'outline' : 'info'}
                      >
                        {isHeuristic ? 'Heuristic Rule' : `Z-Score Anomaly (${Math.round(insight.confidence * 100)}%)`}
                      </Badge>
                      <span className="text-[11px] font-mono text-slate-500">
                        {insight.room?.name || 'Home'} • {formatRelativeTime(insight.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 mt-1">{insight.summary}</p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleStatusChange(insight.id, 'ACKNOWLEDGED')}
                      className="text-xs font-mono"
                    >
                      Acknowledge
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleStatusChange(insight.id, 'DISMISSED')}
                      className="text-xs font-mono text-slate-500 hover:text-slate-300"
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>

                {/* Verifiable Mathematical Derivation Box */}
                <div className="rounded bg-slate-950 p-3.5 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 border-b border-slate-800/80 pb-1.5">
                    <span className="flex items-center gap-1 text-sky-400">
                      <Info className="w-3.5 h-3.5" />
                      <span>Mathematical Derivation & Audit Evidence</span>
                    </span>
                    <span className="text-slate-500">
                      {isHeuristic ? 'Deterministic Rule Formula' : 'Gaussian Standard Score'}
                    </span>
                  </div>

                  <p className="text-xs font-mono text-slate-300 leading-relaxed">
                    {insight.explanation}
                  </p>

                  {/* Parametric Breakdown Grid */}
                  {!isHeuristic && evidence.baselineMean !== undefined && (
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2 pt-2 border-t border-slate-800/60 text-xs font-mono">
                      <div className="bg-slate-900/60 p-2 rounded">
                        <span className="text-[10px] text-slate-500 block">OBSERVED (x)</span>
                        <span className="text-slate-200 font-semibold">
                          {evidence.value || evidence.currentValue} {evidence.unit || ''}
                        </span>
                      </div>

                      <div className="bg-slate-900/60 p-2 rounded">
                        <span className="text-[10px] text-slate-500 block">BASELINE MEAN (μ)</span>
                        <span className="text-slate-200 font-semibold">
                          {evidence.baselineMean} {evidence.unit || ''}
                        </span>
                      </div>

                      <div className="bg-slate-900/60 p-2 rounded">
                        <span className="text-[10px] text-slate-500 block">STD DEV (σ)</span>
                        <span className="text-slate-200 font-semibold">
                          ±{evidence.baselineStdDev} {evidence.unit || ''}
                        </span>
                      </div>

                      <div className="bg-slate-900/60 p-2 rounded">
                        <span className="text-[10px] text-slate-500 block">Z-SCORE</span>
                        <span className="text-amber-400 font-semibold font-mono">
                          {evidence.zScore > 0 ? `+${evidence.zScore}` : evidence.zScore}
                        </span>
                      </div>

                      <div className="bg-slate-900/60 p-2 rounded">
                        <span className="text-[10px] text-slate-500 block">DEVIATION (Δ)</span>
                        <span className="text-rose-400 font-semibold">
                          {evidence.deviationPercent > 0 ? `+${evidence.deviationPercent}%` : `${evidence.deviationPercent}%`}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
