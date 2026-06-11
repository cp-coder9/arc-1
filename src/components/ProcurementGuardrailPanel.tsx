import React, { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, ShieldAlert, ShieldCheck, XCircle } from 'lucide-react';
import type { GuardrailCheck, GuardrailReport } from '@/services/procurementGuardrails';

const GUARDRAIL_NAMES: Record<string, string> = {
  'GR-1': 'Equal Information for Addenda',
  'GR-2': 'No Automatic Appointment',
  'GR-3': 'Quote Exclusions Visible',
  'GR-4': 'Conflict of Interest Detection',
  'GR-5': 'Candidate Professional Supervision',
  'GR-6': 'Marketplace Match Advisory',
};

interface GuardrailPanelProps {
  report: GuardrailReport | null;
  isLoading?: boolean;
}

function GuardrailStatusIcon({ status }: { status: GuardrailCheck['status'] }) {
  switch (status) {
    case 'passed':
      return <CheckCircle2 size={18} className="text-emerald-500" />;
    case 'warning':
      return <AlertTriangle size={18} className="text-amber-500" />;
    case 'blocked':
      return <XCircle size={18} className="text-red-500" />;
  }
}

function GuardrailRow({ check }: { check: GuardrailCheck }) {
  const bgClass =
    check.status === 'blocked'
      ? 'bg-red-50 border-red-200'
      : check.status === 'warning'
        ? 'bg-amber-50 border-amber-200'
        : 'bg-emerald-50 border-emerald-200';

  return (
    <div className={`rounded-xl border p-4 ${bgClass}`}>
      <div className="flex items-start gap-3">
        <GuardrailStatusIcon status={check.status} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="font-semibold text-sm">{GUARDRAIL_NAMES[check.id] || check.name}</h4>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              check.status === 'blocked' ? 'bg-red-100 text-red-700' :
              check.status === 'warning' ? 'bg-amber-100 text-amber-700' :
              'bg-emerald-100 text-emerald-700'
            }`}>
              {check.status.toUpperCase()}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">{check.detail}</p>
          {check.evidence.length > 0 && (
            <ul className="mt-2 space-y-1">
              {check.evidence.slice(0, 3).map((e, i) => (
                <li key={i} className="text-xs text-muted-foreground flex items-start gap-1">
                  <span className="mt-0.5">•</span> {e}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ProcurementGuardrailPanel({ report, isLoading }: GuardrailPanelProps) {
  const passedCount = useMemo(
    () => report?.checks.filter((c) => c.status === 'passed').length ?? 0,
    [report],
  );
  const blockedCount = useMemo(
    () => report?.checks.filter((c) => c.status === 'blocked').length ?? 0,
    [report],
  );

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-white p-6 animate-pulse">
        <div className="h-5 bg-secondary rounded w-48 mb-4" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-secondary rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="rounded-2xl border border-border bg-white p-6 text-center">
        <ShieldAlert size={32} className="mx-auto text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">Run guardrail checks to validate procurement compliance.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-white shadow-sm">
      <div className="border-b border-border p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {report.allPassed ? (
              <ShieldCheck size={20} className="text-emerald-500" />
            ) : (
              <ShieldAlert size={20} className="text-red-500" />
            )}
            <h3 className="font-heading font-bold text-lg">Procurement Guardrails</h3>
          </div>
          <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
            report.allPassed ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
          }`}>
            {passedCount}/{report.checks.length} Passed
            {blockedCount > 0 && ` • ${blockedCount} Blocked`}
          </span>
        </div>
        {report.warnings.length > 0 && (
          <p className="text-xs text-amber-600 mt-1">{report.warnings.length} warning(s) require attention</p>
        )}
      </div>
      <div className="p-4 space-y-2">
        {report.checks.map((check) => (
          <div key={check.id}><GuardrailRow check={check} /></div>
        ))}
      </div>
      {report.blockedActions.length > 0 && (
        <div className="border-t border-border p-4 bg-red-50 rounded-b-2xl">
          <p className="text-xs font-semibold text-red-700 mb-1">Blocked Actions:</p>
          <ul className="space-y-0.5">
            {report.blockedActions.map((action, i) => (
              <li key={i} className="text-xs text-red-600">{action}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="border-t border-border p-4">
        <p className="text-xs text-muted-foreground italic">{report.governanceNote}</p>
      </div>
    </div>
  );
}
