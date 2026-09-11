'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Clock,
  Cpu,
  Gauge,
  HelpCircle,
  Play,
  PlayCircle,
  Radio,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sliders,
  StepForward,
  TrendingUp,
  Zap,
} from 'lucide-react';

export default function DemoConsolePage() {
  const [scenarios, setScenarios] = useState<any[]>([]);
  const [runnerStatus, setRunnerStatus] = useState<any>(null);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('CO2_VENTILATION');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [stepResult, setStepResult] = useState<any>(null);

  const fetchDemoState = async () => {
    try {
      const res = await fetch('/api/demo');
      if (res.ok) {
        const data = await res.json();
        setScenarios(data.scenarios || []);
        setRunnerStatus(data.status || null);
        if (data.status?.scenarioId) {
          setSelectedScenarioId(data.status.scenarioId);
        }
      }
    } catch (e) {
      console.error('Failed to fetch demo state:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDemoState();
    const interval = setInterval(fetchDemoState, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleStart = async (scenarioId: string) => {
    try {
      setActionLoading(true);
      const res = await fetch('/api/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', scenarioId }),
      });
      if (res.ok) {
        const data = await res.json();
        setRunnerStatus(data.status);
        setStepResult(null);
      }
    } catch (e) {
      console.error('Failed to start scenario:', e);
    } finally {
      setActionLoading(false);
    }
  };

  const handleStep = async () => {
    try {
      setActionLoading(true);
      const res = await fetch('/api/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'step' }),
      });
      if (res.ok) {
        const data = await res.json();
        setRunnerStatus(data.status);
        setStepResult(data);
      }
    } catch (e) {
      console.error('Failed to step scenario:', e);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAutoRun = async (scenarioId: string) => {
    try {
      setActionLoading(true);
      const res = await fetch('/api/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'autorun', scenarioId, stepDelayMs: 1200 }),
      });
      if (res.ok) {
        const data = await res.json();
        setRunnerStatus(data.status);
      }
    } catch (e) {
      console.error('Failed to autorun scenario:', e);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReset = async () => {
    try {
      setActionLoading(true);
      const res = await fetch('/api/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset' }),
      });
      if (res.ok) {
        const data = await res.json();
        setRunnerStatus(data.status);
        setStepResult(null);
      }
    } catch (e) {
      console.error('Failed to reset demo runner:', e);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading && scenarios.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4 font-mono text-sm text-slate-400">
        <PlayCircle className="w-8 h-8 text-sky-400 animate-spin" />
        <p>Loading Deterministic Presentation Scenarios...</p>
      </div>
    );
  }

  const activeScenario =
    scenarios.find((s) => s.id === (runnerStatus?.scenarioId || selectedScenarioId)) || scenarios[0];

  const currentStepNum = runnerStatus?.currentStep || 0;
  const totalSteps = activeScenario?.steps?.length || 0;
  const isRunning = runnerStatus?.status === 'RUNNING' || runnerStatus?.status === 'STEP_COMPLETE';
  const isCompleted = runnerStatus?.status === 'COMPLETED';

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <PlayCircle className="w-6 h-6 text-sky-400" />
            Deterministic Demo & Presentation Console
          </h1>
          <p className="text-xs text-slate-400 mt-1 font-mono">
            Full-Pipeline Demonstration · Real Intelligence Execution · Zero Hallucination
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/observability">
            <Button variant="outline" size="sm" className="bg-slate-900 border-slate-800 text-slate-300 text-xs">
              <Gauge className="w-3.5 h-3.5 mr-1.5" /> View in Observability
            </Button>
          </Link>
          <Link href="/">
            <Button variant="outline" size="sm" className="bg-slate-900 border-slate-800 text-slate-300 text-xs">
              <Activity className="w-3.5 h-3.5 mr-1.5" /> Live Dashboard
            </Button>
          </Link>
        </div>
      </div>

      {/* SCENARIO SELECTION GRID */}
      <div>
        <h2 className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-3">
          Controlled Presentation Scenarios:
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {scenarios.map((sc) => {
            const isSelected = sc.id === activeScenario?.id;
            return (
              <button
                key={sc.id}
                onClick={() => {
                  setSelectedScenarioId(sc.id);
                  if (runnerStatus?.status === 'IDLE' || runnerStatus?.status === 'COMPLETED') {
                    handleStart(sc.id);
                  }
                }}
                className={`p-3 rounded text-left transition-all border flex flex-col justify-between ${
                  isSelected
                    ? 'border-sky-500 bg-sky-500/15 shadow-lg shadow-sky-500/10'
                    : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                }`}
              >
                <div>
                  <Badge className="font-mono text-[9px] bg-slate-950 text-slate-400 border-slate-800 mb-1.5">
                    {sc.category}
                  </Badge>
                  <div className="text-xs font-bold text-white leading-snug">{sc.title}</div>
                </div>
                <div className="text-[10px] font-mono text-slate-500 mt-2 flex items-center justify-between">
                  <span>{sc.steps.length} steps</span>
                  <span>~{sc.estimatedDurationSec}s</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ACTIVE SCENARIO RUNNER & CONTROLS */}
      <Card className="bg-slate-900/80 border-slate-800">
        <CardHeader className="pb-4 border-b border-slate-800">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <CardTitle className="text-base font-bold text-white">
                  {activeScenario?.title}
                </CardTitle>
                <Badge
                  className={`font-mono text-[10px] ${
                    isCompleted
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : isRunning
                      ? 'bg-sky-500/10 text-sky-400 border-sky-500/30 animate-pulse'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {runnerStatus?.status || 'IDLE'}
                </Badge>
              </div>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                {activeScenario?.description}
              </p>
            </div>

            {/* Runner Control Actions */}
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleStart(activeScenario.id)}
                disabled={actionLoading}
                className="bg-slate-950 border-slate-700 text-slate-200 text-xs"
              >
                <Play className="w-3.5 h-3.5 mr-1" /> Start
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleStep}
                disabled={actionLoading || isCompleted || !runnerStatus?.active}
                className="bg-sky-600 hover:bg-sky-500 text-white text-xs font-mono"
              >
                <StepForward className="w-3.5 h-3.5 mr-1" /> Next Step ({currentStepNum}/{totalSteps})
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAutoRun(activeScenario.id)}
                disabled={actionLoading}
                className="bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 text-xs"
              >
                <PlayCircle className="w-3.5 h-3.5 mr-1" /> Auto-Play All
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleReset}
                disabled={actionLoading}
                className="border-slate-800 bg-slate-950 text-slate-400 text-xs"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-5 space-y-6">
          {/* STEP PROGRESS TRACK */}
          <div className="space-y-3">
            <div className="text-xs font-mono uppercase tracking-wider text-slate-400">
              Deterministic Step Execution Progression:
            </div>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              {activeScenario?.steps?.map((st: any) => {
                const isStepCompleted = currentStepNum > st.stepIndex;
                const isStepActive = currentStepNum === st.stepIndex;

                return (
                  <div
                    key={st.stepIndex}
                    className={`p-3 rounded border text-xs flex flex-col justify-between transition-all ${
                      isStepCompleted
                        ? 'border-emerald-500/30 bg-emerald-500/5 text-slate-300'
                        : isStepActive
                        ? 'border-sky-500 bg-sky-500/10 text-white ring-1 ring-sky-500/50 shadow-md'
                        : 'border-slate-800 bg-slate-950/40 text-slate-500'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between font-mono text-[10px] mb-1">
                        <span>STEP {st.stepIndex}</span>
                        {isStepCompleted ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        ) : isStepActive ? (
                          <Activity className="w-3.5 h-3.5 text-sky-400 animate-pulse" />
                        ) : (
                          <Clock className="w-3.5 h-3.5 text-slate-600" />
                        )}
                      </div>
                      <div className="font-semibold text-slate-200">{st.title}</div>
                      <div className="text-[11px] text-slate-400 mt-1 line-clamp-2">
                        {st.description}
                      </div>
                    </div>

                    <div className="mt-2.5 pt-2 border-t border-slate-800/60 text-[10px] font-mono text-slate-400">
                      Outcome: <span className="text-sky-300">{st.expectedOutcome}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* STEP RESULT & REALTIME TELEMETRY INSPECTOR */}
          {stepResult && (
            <div className="bg-slate-950/80 rounded border border-slate-800 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-mono text-sky-400 font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Step Execution Real-Time Ingestion Summary
                </div>
                <Badge className="bg-slate-900 text-slate-300 font-mono text-[10px]">
                  Processed {stepResult.ingestionSummary?.processedCount || 0} readings
                </Badge>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono">
                <div className="bg-slate-900 p-2 rounded border border-slate-800">
                  <span className="text-slate-500">Telemetry Injected:</span>
                  <div className="text-slate-200 mt-1">
                    {stepResult.stepDetails?.telemetry?.map((t: any, i: number) => (
                      <div key={i}>
                        {t.sensorType}: <span className="text-sky-400">{t.value} {t.unit}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-slate-900 p-2 rounded border border-slate-800">
                  <span className="text-slate-500">Pipeline Ingestion:</span>
                  <div className="text-slate-200 mt-1">
                    Anomalies: {stepResult.ingestionSummary?.anomaliesDetected || 0} · Events: {stepResult.ingestionSummary?.eventsTriggered || 0}
                  </div>
                </div>

                <div className="bg-slate-900 p-2 rounded border border-slate-800">
                  <span className="text-slate-500">Expected Effect:</span>
                  <div className="text-emerald-400 mt-1">
                    {stepResult.stepDetails?.expectedOutcome}
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
