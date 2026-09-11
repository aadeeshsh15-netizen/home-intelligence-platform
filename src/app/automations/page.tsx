'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatRelativeTime } from '@/lib/formatters';
import {
  Sliders,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Activity,
  Zap,
  RefreshCw,
  Power,
  RotateCcw,
  Check,
  Info,
  ChevronDown,
  ChevronRight,
  Fan,
  Lightbulb,
  Radio,
} from 'lucide-react';

interface AutomationPolicy {
  id: string;
  name: string;
  description: string;
  mode: 'AUTO' | 'MANUAL' | 'DISABLED';
  triggerType: string;
  targetMetric: string;
  minProbability: number;
  minConfidence: number;
  cooldownSec: number;
  maxRuntimeSec: number;
  targetDeviceType: string;
  action: string;
  isEnabled: boolean;
  lastTriggeredAt: string | null;
}

interface AutomationExecution {
  id: string;
  policyId: string;
  policy: AutomationPolicy;
  deviceId: string;
  device: { id: string; name: string; status: string; deviceType: string; room?: { name: string } };
  status: 'TRIGGERED' | 'EXECUTING' | 'VERIFYING' | 'COMPLETED' | 'FAILED' | 'COOLDOWN';
  triggerReason: string;
  triggerEvidence: any;
  decisionExplanation: string;
  safetyEvaluation: any;
  actionTaken: string;
  expectedOutcome: string;
  observedOutcome?: string | null;
  baselineMetricValue: number;
  targetMetricValue: number;
  finalMetricValue?: number | null;
  metricDelta?: number | null;
  verificationStatus: 'PENDING' | 'VERIFIED_EFFECTIVE' | 'VERIFIED_INEFFECTIVE' | 'INCONCLUSIVE' | 'FAILED';
  verificationLatencyMs?: number | null;
  isEffective?: boolean | null;
  manualOverride: boolean;
  startedAt: string;
  verifiedAt?: string | null;
}

interface AutomationMetrics {
  totalDecisions: number;
  successfulInterventions: number;
  failedCommands: number;
  unnecessaryActions: number;
  falseActuationRate: number;
  interventionSuccessRate: number;
  avgCommandLatencyMs: number;
  avgVerificationLatencyMs: number;
  avgEffectivenessDelta: number;
}

export default function AutomationsPage() {
  const [policies, setPolicies] = useState<AutomationPolicy[]>([]);
  const [activeAutomations, setActiveAutomations] = useState<AutomationExecution[]>([]);
  const [history, setHistory] = useState<AutomationExecution[]>([]);
  const [metrics, setMetrics] = useState<AutomationMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingPolicyId, setUpdatingPolicyId] = useState<string | null>(null);
  const [expandedExplanationId, setExpandedExplanationId] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const [resData, resMetrics] = await Promise.all([
        fetch('/api/automations'),
        fetch('/api/automations/metrics'),
      ]);

      if (resData.ok) {
        const json = await resData.json();
        setPolicies(json.policies || []);
        setActiveAutomations(json.activeAutomations || []);
        setHistory(json.history || []);
      }

      if (resMetrics.ok) {
        const mJson = await resMetrics.json();
        setMetrics(mJson);
      }
    } catch (err) {
      console.error('Failed to fetch automations data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleToggleMode = async (policyId: string, currentMode: 'AUTO' | 'MANUAL' | 'DISABLED') => {
    const nextMode: 'AUTO' | 'MANUAL' | 'DISABLED' =
      currentMode === 'AUTO' ? 'MANUAL' : currentMode === 'MANUAL' ? 'DISABLED' : 'AUTO';

    setUpdatingPolicyId(policyId);
    try {
      const res = await fetch(`/api/automations/policies/${policyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: nextMode }),
      });

      if (res.ok) {
        await fetchData();
      }
    } catch (err) {
      console.error('Failed to update policy mode', err);
    } finally {
      setUpdatingPolicyId(null);
    }
  };

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-100 flex items-center gap-2.5">
              <Sliders className="w-6 h-6 text-sky-400" />
              Closed-Loop Intelligent Automation
            </h1>
            <Badge variant="outline" className="font-mono text-xs bg-sky-500/10 text-sky-400 border-sky-500/30">
              Phase 7 Active
            </Badge>
          </div>
          <p className="text-sm text-slate-400 mt-1 font-mono">
            Sense → Detect → Correlate → Predict → Anticipate → Decide → Act → Verify
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchData}
            className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* KPI Overview Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-slate-900/60 border-slate-800/80 p-5">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-mono uppercase tracking-wider">Intervention Success</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100 font-mono">
            {metrics ? `${metrics.interventionSuccessRate}%` : '--'}
          </div>
          <p className="text-xs text-slate-400 mt-1">Empirically verified trajectory improvements</p>
        </Card>

        <Card className="bg-slate-900/60 border-slate-800/80 p-5">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-mono uppercase tracking-wider">False Actuation Rate</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100 font-mono">
            {metrics ? `${metrics.falseActuationRate}%` : '0%'}
          </div>
          <p className="text-xs text-slate-400 mt-1">Unnecessary or ineffective actuations</p>
        </Card>

        <Card className="bg-slate-900/60 border-slate-800/80 p-5">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-mono uppercase tracking-wider">Command Latency</span>
            <Zap className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100 font-mono">
            {metrics ? `${metrics.avgCommandLatencyMs} ms` : '< 50 ms'}
          </div>
          <p className="text-xs text-slate-400 mt-1">Decision to device wire dispatch SLA</p>
        </Card>

        <Card className="bg-slate-900/60 border-slate-800/80 p-5">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-mono uppercase tracking-wider">Total Decisions</span>
            <ShieldCheck className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100 font-mono">
            {metrics ? metrics.totalDecisions : 0}
          </div>
          <p className="text-xs text-slate-400 mt-1">Evaluated across fail-closed safety layer</p>
        </Card>
      </div>

      {/* Active Automations Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-200 flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            Active Automations & Interventions
          </h2>
          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 font-mono text-xs">
            {activeAutomations.length} Running
          </Badge>
        </div>

        {activeAutomations.length === 0 ? (
          <Card className="bg-slate-900/40 border-slate-800/60 p-8 text-center">
            <p className="text-sm text-slate-400">
              No automations currently executing. Systems are operating normally within nominal safety boundaries.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeAutomations.map((item) => (
              <Card key={item.id} className="bg-slate-900/70 border-slate-800 p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-100">{item.policy?.name || 'Automation Action'}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">{item.triggerReason}</p>
                  </div>
                  <Badge className="bg-sky-500/20 text-sky-400 border-sky-500/40 font-mono text-[10px] animate-pulse">
                    {item.status}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs font-mono bg-slate-950/60 p-3 rounded border border-slate-800/60">
                  <div>
                    <span className="text-slate-500 block text-[10px]">ACTUATOR DEVICE</span>
                    <span className="text-slate-200 font-medium">{item.device?.name}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">ROOM LOCATION</span>
                    <span className="text-slate-200">{item.device?.room?.name || 'Household'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">ACTION ISSUED</span>
                    <span className="text-emerald-400 font-bold">{item.actionTaken}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">VERIFICATION STATUS</span>
                    <span className="text-amber-400">{item.verificationStatus}</span>
                  </div>
                </div>

                <p className="text-xs text-slate-400 italic">Expected: {item.expectedOutcome}</p>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Automation Policies & Safety State */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-200 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-sky-400" />
          Automation Policies & Safety Guardrails
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {policies.map((p) => {
            const isAuto = p.mode === 'AUTO';
            const isManual = p.mode === 'MANUAL';
            const isDisabled = p.mode === 'DISABLED';

            return (
              <Card key={p.id} className="bg-slate-900/60 border-slate-800 p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                      {p.name}
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed">{p.description}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-800/60">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-slate-500">MODE:</span>
                    <Badge
                      className={
                        isAuto
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : isManual
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                          : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                      }
                    >
                      {p.mode}
                    </Badge>
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    disabled={updatingPolicyId === p.id}
                    onClick={() => handleToggleMode(p.id, p.mode)}
                    className="h-7 text-xs border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300"
                  >
                    Switch Mode
                  </Button>
                </div>

                <div className="grid grid-cols-3 gap-2 text-[11px] font-mono bg-slate-950/40 p-2.5 rounded border border-slate-800/40 text-slate-400">
                  <div>
                    <span className="text-slate-500 block text-[9px]">MIN PROB</span>
                    <span>{(p.minProbability * 100).toFixed(0)}%</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[9px]">COOLDOWN</span>
                    <span>{Math.round(p.cooldownSec / 60)} min</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[9px]">MAX RUN</span>
                    <span>{Math.round(p.maxRuntimeSec / 60)} min</span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Closed-Loop Verification & Audit Trail */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-200 flex items-center gap-2">
          <Clock className="w-4 h-4 text-sky-400" />
          Closed-Loop Verification & Audit History
        </h2>

        <Card className="bg-slate-900/60 border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="p-3.5">TIME</th>
                  <th className="p-3.5">POLICY / TRIGGER</th>
                  <th className="p-3.5">DEVICE & ACTION</th>
                  <th className="p-3.5">EFFECTIVENESS</th>
                  <th className="p-3.5">STATUS</th>
                  <th className="p-3.5 text-right">EXPLAINABILITY</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {history.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-slate-500 italic">
                      No automation actions recorded in audit log yet.
                    </td>
                  </tr>
                ) : (
                  history.map((exec) => {
                    const isExpanded = expandedExplanationId === exec.id;
                    const isEffective = exec.verificationStatus === 'VERIFIED_EFFECTIVE';

                    return (
                      <React.Fragment key={exec.id}>
                        <tr className="hover:bg-slate-800/30 transition-colors">
                          <td className="p-3.5 text-slate-400 whitespace-nowrap">
                            {formatRelativeTime(exec.startedAt)}
                          </td>
                          <td className="p-3.5">
                            <span className="font-semibold text-slate-200 block">{exec.policy?.name || 'Policy'}</span>
                            <span className="text-[11px] text-slate-500">{exec.triggerReason}</span>
                          </td>
                          <td className="p-3.5 whitespace-nowrap">
                            <span className="text-slate-200">{exec.device?.name}</span>
                            <span className="text-emerald-400 font-bold block">{exec.actionTaken}</span>
                          </td>
                          <td className="p-3.5">
                            {exec.metricDelta != null ? (
                              <span className={isEffective ? 'text-emerald-400 font-bold' : 'text-amber-400'}>
                                Δ {exec.metricDelta > 0 ? `+${exec.metricDelta}` : exec.metricDelta}
                              </span>
                            ) : (
                              <span className="text-slate-500">In flight</span>
                            )}
                          </td>
                          <td className="p-3.5 whitespace-nowrap">
                            <Badge
                              className={
                                isEffective
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[10px]'
                                  : exec.verificationStatus === 'PENDING'
                                  ? 'bg-sky-500/10 text-sky-400 border-sky-500/30 text-[10px]'
                                  : 'bg-amber-500/10 text-amber-400 border-amber-500/30 text-[10px]'
                              }
                            >
                              {exec.verificationStatus}
                            </Badge>
                          </td>
                          <td className="p-3.5 text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs text-sky-400 hover:text-sky-300 gap-1"
                              onClick={() =>
                                setExpandedExplanationId(isExpanded ? null : exec.id)
                              }
                            >
                              {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                              Proof
                            </Button>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr className="bg-slate-950/90">
                            <td colSpan={6} className="p-4 border-t border-slate-800/80">
                              <div className="space-y-2 text-xs font-mono">
                                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">
                                  DETERMINISTIC EXPLAINABILITY AUDIT PROOF (NO LLM)
                                </span>
                                <pre className="bg-slate-900 p-3 rounded text-slate-300 border border-slate-800 whitespace-pre-wrap leading-relaxed">
                                  {exec.decisionExplanation}
                                </pre>
                                {exec.observedOutcome && (
                                  <p className="text-emerald-400 text-xs">
                                    <span className="text-slate-400 font-bold">Observed Verification: </span>
                                    {exec.observedOutcome}
                                  </p>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
