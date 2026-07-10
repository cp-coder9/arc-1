/**
 * Insurance Register — Policy Compliance Panel
 *
 * Displays compliance status per required policy type with colored indicators:
 * green = compliant, amber = expiring_soon, red = non_compliant.
 * Shows overall compliance status summary.
 *
 * Requirements: 2.2, 2.11
 */

import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle, ShieldCheck } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { InsuranceComplianceSummary, InsuranceComplianceResult, InsurancePolicyType } from '../types';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface PolicyCompliancePanelProps {
  complianceSummary?: InsuranceComplianceSummary;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const POLICY_TYPE_LABELS: Record<InsurancePolicyType, string> = {
  CAR: 'Contractors All Risk',
  PI: 'Professional Indemnity',
  public_liability: 'Public Liability',
  SASRIA: 'SASRIA',
  LDI: 'Latent Defects Insurance',
};

const STATUS_CONFIG = {
  compliant: {
    icon: CheckCircle2,
    color: 'text-green-400',
    bg: 'bg-green-950/40 border-green-700/50',
    label: 'Compliant',
  },
  expiring_soon: {
    icon: AlertTriangle,
    color: 'text-amber-400',
    bg: 'bg-amber-950/40 border-amber-700/50',
    label: 'Expiring Soon',
  },
  non_compliant: {
    icon: XCircle,
    color: 'text-red-400',
    bg: 'bg-red-950/40 border-red-700/50',
    label: 'Non-Compliant',
  },
} as const;

const OVERALL_STATUS_CONFIG = {
  compliant: {
    bg: 'bg-green-950/30 border-green-700/50 text-green-200',
    label: 'All policies compliant',
  },
  partially_compliant: {
    bg: 'bg-amber-950/30 border-amber-700/50 text-amber-200',
    label: 'Partially compliant — action required',
  },
  non_compliant: {
    bg: 'bg-red-950/30 border-red-700/50 text-red-200',
    label: 'Non-compliant — immediate attention required',
  },
} as const;

// ─── Component ────────────────────────────────────────────────────────────────

export function PolicyCompliancePanel({ complianceSummary }: PolicyCompliancePanelProps) {
  if (!complianceSummary) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-blue-400" aria-hidden="true" />
            Policy Compliance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-400">
            No compliance data available. Register policies and run a compliance check to see results.
          </p>
        </CardContent>
      </Card>
    );
  }

  const overallConfig = OVERALL_STATUS_CONFIG[complianceSummary.overallStatus];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4 text-blue-400" aria-hidden="true" />
          Policy Compliance
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overall Status Banner */}
        <div className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${overallConfig.bg}`}>
          <p className="text-sm font-medium">{overallConfig.label}</p>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-3">
          <StatTile label="Active Policies" value={complianceSummary.activePolicies} />
          <StatTile label="Expired" value={complianceSummary.expiredPolicies} />
          <StatTile label="Non-Compliant Types" value={complianceSummary.nonCompliantTypes} />
        </div>

        {/* Per-Type Results */}
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
            Status by Policy Type
          </p>
          {complianceSummary.results.map((result) => (
            <div key={result.policyType}>
              <ComplianceRow result={result} />
            </div>
          ))}
        </div>

        {/* Last Check */}
        <p className="text-xs text-slate-500">
          Last checked: {complianceSummary.lastCheckDate}
        </p>
      </CardContent>
    </Card>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ComplianceRow({ result }: { result: InsuranceComplianceResult }) {
  const config = STATUS_CONFIG[result.status];
  const Icon = config.icon;

  return (
    <div className={`flex items-center justify-between rounded-lg border px-4 py-3 ${config.bg}`}>
      <div className="flex items-center gap-3">
        <Icon className={`h-4 w-4 ${config.color}`} aria-hidden="true" />
        <span className="text-sm text-slate-100">
          {POLICY_TYPE_LABELS[result.policyType]}
        </span>
      </div>
      <Badge
        variant="outline"
        className={`text-[10px] uppercase tracking-wider ${config.color} border-current`}
      >
        {config.label}
      </Badge>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 px-3 py-2 text-center">
      <p className="text-lg font-bold text-slate-100">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-slate-400">{label}</p>
    </div>
  );
}
