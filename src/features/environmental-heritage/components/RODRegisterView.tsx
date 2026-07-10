/**
 * Environmental & Heritage — ROD Register View Component
 *
 * Conditions compliance register showing conditions list with compliance state
 * badges, summary metrics, evidence submission UI, deadline countdown,
 * overdue indicators, and category grouping.
 *
 * Requirements: 14.1–14.7
 */

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileCheck,
  FileText,
  Folders,
  Plus,
  Shield,
  Upload,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { UserProfile } from '@/types';
import type { ConditionCategory, ConditionComplianceState, RODCondition } from '../types';
import { DisclaimerBanner } from './DisclaimerBanner';

// ─── Props ────────────────────────────────────────────────────────────────────

interface RODRegisterViewProps {
  user: UserProfile;
  projectId: string;
  conditions: RODCondition[];
  onTransition?: (conditionId: string, targetState: ConditionComplianceState) => void;
  onRecordEvidence?: (conditionId: string, evidence: { type: string; reference: string }) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const COMPLIANCE_STATES: ConditionComplianceState[] = ['outstanding', 'in_progress', 'evidence_submitted', 'verified_compliant'];

const STATE_CONFIG: Record<ConditionComplianceState, { label: string; className: string; icon: React.ReactNode }> = {
  outstanding: {
    label: 'Outstanding',
    className: 'bg-red-500/20 text-red-400 border-red-500/30',
    icon: <AlertTriangle className="h-3 w-3" />,
  },
  in_progress: {
    label: 'In Progress',
    className: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    icon: <Clock className="h-3 w-3" />,
  },
  evidence_submitted: {
    label: 'Evidence Submitted',
    className: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    icon: <Upload className="h-3 w-3" />,
  },
  verified_compliant: {
    label: 'Verified',
    className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
};

const CATEGORY_LABELS: Record<ConditionCategory, string> = {
  pre_construction: 'Pre-Construction',
  construction: 'Construction',
  operational: 'Operational',
  ongoing: 'Ongoing',
};

const CATEGORY_ORDER: ConditionCategory[] = ['pre_construction', 'construction', 'operational', 'ongoing'];

const EVIDENCE_TYPES = ['inspection_report', 'method_statement', 'monitoring_data', 'certificate', 'photograph', 'correspondence', 'other'];

const ROD_DISCLAIMER =
  'This register is a tracking tool only and does not replace formal compliance reporting to the competent authority. All evidence submissions and compliance verifications must be conducted by qualified professionals in accordance with the Record of Decision requirements.';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calculateDaysUntilDeadline(deadline?: string): number | null {
  if (!deadline) return null;
  const now = new Date();
  const dl = new Date(deadline);
  return Math.ceil((dl.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function isOverdue(condition: RODCondition): boolean {
  if (!condition.complianceDeadline) return false;
  if (condition.state === 'verified_compliant') return false;
  const days = calculateDaysUntilDeadline(condition.complianceDeadline);
  return days !== null && days < 0;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function RODRegisterView({
  user,
  projectId,
  conditions,
  onTransition,
  onRecordEvidence,
}: RODRegisterViewProps) {
  const [evidenceDialogFor, setEvidenceDialogFor] = useState<string | null>(null);
  const [evidenceType, setEvidenceType] = useState('inspection_report');
  const [evidenceReference, setEvidenceReference] = useState('');

  // Computed metrics
  const metrics = useMemo(() => {
    const total = conditions.length;
    const verified = conditions.filter((c) => c.state === 'verified_compliant').length;
    const outstanding = conditions.filter((c) => c.state === 'outstanding').length;
    const overdue = conditions.filter(isOverdue).length;
    const compliancePercentage = total > 0 ? Math.round((verified / total) * 100) : 0;
    return { total, verified, outstanding, overdue, compliancePercentage };
  }, [conditions]);

  // Group by category
  const groupedConditions = useMemo(() => {
    const grouped: Record<ConditionCategory, RODCondition[]> = {
      pre_construction: [],
      construction: [],
      operational: [],
      ongoing: [],
    };
    for (const condition of conditions) {
      grouped[condition.complianceCategory].push(condition);
    }
    return grouped;
  }, [conditions]);

  const handleSubmitEvidence = () => {
    if (!evidenceDialogFor || !onRecordEvidence || !evidenceReference.trim()) return;
    onRecordEvidence(evidenceDialogFor, { type: evidenceType, reference: evidenceReference });
    setEvidenceDialogFor(null);
    setEvidenceType('inspection_report');
    setEvidenceReference('');
  };

  const getNextState = (current: ConditionComplianceState): ConditionComplianceState | null => {
    const idx = COMPLIANCE_STATES.indexOf(current);
    if (idx < 0 || idx >= COMPLIANCE_STATES.length - 1) return null;
    return COMPLIANCE_STATES[idx + 1];
  };

  return (
    <div className="space-y-6">
      {/* Disclaimer */}
      <DisclaimerBanner message={ROD_DISCLAIMER} />

      {/* Compliance Summary Metrics */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Folders className="h-4 w-4 text-blue-400" />
              <span className="text-xs uppercase tracking-wider text-surface-400">Total</span>
            </div>
            <p className="mt-1 text-2xl font-bold text-foreground">{metrics.total}</p>
          </CardContent>
        </Card>

        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span className="text-xs uppercase tracking-wider text-surface-400">Verified</span>
            </div>
            <p className="mt-1 text-2xl font-bold text-foreground">{metrics.verified}</p>
          </CardContent>
        </Card>

        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-400" />
              <span className="text-xs uppercase tracking-wider text-surface-400">Outstanding</span>
            </div>
            <p className="mt-1 text-2xl font-bold text-foreground">{metrics.outstanding}</p>
          </CardContent>
        </Card>

        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-orange-400" />
              <span className="text-xs uppercase tracking-wider text-surface-400">Overdue</span>
            </div>
            <p className="mt-1 text-2xl font-bold text-foreground">{metrics.overdue}</p>
          </CardContent>
        </Card>

        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-emerald-400" />
              <span className="text-xs uppercase tracking-wider text-surface-400">Compliance %</span>
            </div>
            <p className="mt-1 text-2xl font-bold text-foreground">{metrics.compliancePercentage}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Conditions by Category */}
      <Tabs defaultValue="pre_construction" className="space-y-4">
        <TabsList className="bg-surface-800/70 border border-surface-700/50">
          {CATEGORY_ORDER.map((cat) => (
            <TabsTrigger key={cat} value={cat} className="text-xs">
              {CATEGORY_LABELS[cat]} ({groupedConditions[cat].length})
            </TabsTrigger>
          ))}
        </TabsList>

        {CATEGORY_ORDER.map((category) => (
          <TabsContent key={category} value={category} className="space-y-3">
            {groupedConditions[category].length === 0 ? (
              <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
                <CardContent className="py-8 text-center">
                  <p className="text-sm text-surface-400">No conditions in this category.</p>
                </CardContent>
              </Card>
            ) : (
              groupedConditions[category].map((condition) => {
                const daysUntil = calculateDaysUntilDeadline(condition.complianceDeadline);
                const conditionOverdue = isOverdue(condition);
                const stateConfig = STATE_CONFIG[condition.state];
                const nextState = getNextState(condition.state);

                return (
                  <Card
                    key={condition.id}
                    className={`bg-surface-800/70 backdrop-blur border-surface-700/50 ${
                      conditionOverdue ? 'border-l-2 border-l-red-500' : ''
                    }`}
                  >
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-mono text-surface-400">
                              #{condition.conditionNumber}
                            </span>
                            <Badge className={stateConfig.className}>
                              <span className="mr-1">{stateConfig.icon}</span>
                              {stateConfig.label}
                            </Badge>
                            {conditionOverdue && (
                              <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                Overdue
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-foreground">{condition.conditionText}</p>
                          <div className="flex flex-wrap gap-3 mt-2 text-xs text-surface-400">
                            <span>Responsible: {condition.responsibleParty}</span>
                            <span>Method: {condition.verificationMethod.replace(/_/g, ' ')}</span>
                            {condition.complianceDeadline && (
                              <span className={conditionOverdue ? 'text-red-400 font-medium' : ''}>
                                Deadline: {formatDate(condition.complianceDeadline)}
                                {daysUntil !== null && (
                                  <span className="ml-1">
                                    ({daysUntil > 0 ? `${daysUntil}d remaining` : `${Math.abs(daysUntil)}d overdue`})
                                  </span>
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Evidence list */}
                      {condition.evidence.length > 0 && (
                        <div className="space-y-1">
                          <span className="text-xs uppercase tracking-wider text-surface-400">Evidence</span>
                          <div className="flex flex-wrap gap-2">
                            {condition.evidence.map((ev, idx) => (
                              <span
                                key={idx}
                                className="flex items-center gap-1 rounded bg-surface-700/50 px-2 py-0.5 text-xs text-surface-300"
                              >
                                <FileCheck className="h-3 w-3" />
                                {ev}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Evidence submission form (inline) */}
                      {evidenceDialogFor === condition.id && (
                        <div className="rounded-lg border border-surface-700/50 bg-surface-900/50 p-3 space-y-3">
                          <span className="text-xs uppercase tracking-wider text-surface-400 font-medium">
                            Submit Evidence
                          </span>
                          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            <div className="space-y-1">
                              <label className="text-xs text-surface-400">Type</label>
                              <select
                                value={evidenceType}
                                onChange={(e) => setEvidenceType(e.target.value)}
                                className="w-full rounded-md border border-surface-700 bg-surface-800 px-2 py-1.5 text-xs text-foreground"
                              >
                                {EVIDENCE_TYPES.map((t) => (
                                  <option key={t} value={t}>
                                    {t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs text-surface-400">Reference</label>
                              <input
                                type="text"
                                value={evidenceReference}
                                onChange={(e) => setEvidenceReference(e.target.value)}
                                placeholder="Document reference or file name"
                                className="w-full rounded-md border border-surface-700 bg-surface-800 px-2 py-1.5 text-xs text-foreground placeholder:text-surface-500"
                              />
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" onClick={handleSubmitEvidence} disabled={!evidenceReference.trim()}>
                              Submit
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setEvidenceDialogFor(null)}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Actions row */}
                      <div className="flex items-center gap-2 pt-2 border-t border-surface-700/30">
                        {onRecordEvidence && condition.state !== 'verified_compliant' && evidenceDialogFor !== condition.id && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEvidenceDialogFor(condition.id)}
                            className="gap-1 text-xs"
                          >
                            <Upload className="h-3 w-3" />
                            Submit Evidence
                          </Button>
                        )}
                        {onTransition && nextState && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onTransition(condition.id, nextState)}
                            className="gap-1 text-xs"
                          >
                            → {STATE_CONFIG[nextState].label}
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
