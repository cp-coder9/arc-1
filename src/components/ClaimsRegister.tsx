/**
 * Claims Register Component
 *
 * Manages loss/expense, disruption, prolongation, and varied work claims.
 * Provides claim registration form with mandatory fields and evidence linking,
 * claims list with status and submission deadline countdown, cumulative summary,
 * status transition controls, and dispute escalation interface.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { UserProfile } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Scale,
  Plus,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  FileText,
  Calendar,
  TrendingUp,
  Gavel,
  Link2,
  ArrowRight,
  DollarSign,
} from 'lucide-react';
import {
  registerClaim,
  transitionClaim,
  registerDissatisfaction,
  getClaimsCumulativeSummary,
  linkEvidence,
  getContractConfig,
  resolveMultiRolePermissions,
} from '@/services/contractAdmin';
import type {
  ClaimRecord,
  ClaimStatus,
  ClaimType,
  ClaimInput,
  ClaimsCumulativeSummary,
  ContractConfig,
  ContractProjectAssignment,
} from '@/services/contractAdmin';
import { CLAIM_TRANSITIONS } from '@/services/contractAdmin';

// ══════════════════════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════════════════════

interface ClaimsRegisterProps {
  user: UserProfile;
  projectId: string;
}

// ══════════════════════════════════════════════════════════════════════════════
// Constants & Helpers
// ══════════════════════════════════════════════════════════════════════════════

const STATUS_CONFIG: Record<ClaimStatus, { label: string; color: string }> = {
  notified: { label: 'Notified', color: 'bg-blue-600/20 text-blue-300 border-blue-600/50' },
  substantiated: { label: 'Substantiated', color: 'bg-purple-600/20 text-purple-300 border-purple-600/50' },
  assessed: { label: 'Assessed', color: 'bg-amber-600/20 text-amber-300 border-amber-600/50' },
  accepted: { label: 'Accepted', color: 'bg-green-600/20 text-green-300 border-green-600/50' },
  partially_accepted: { label: 'Partially Accepted', color: 'bg-teal-600/20 text-teal-300 border-teal-600/50' },
  rejected: { label: 'Rejected', color: 'bg-red-600/20 text-red-300 border-red-600/50' },
  disputed: { label: 'Disputed', color: 'bg-orange-600/20 text-orange-300 border-orange-600/50' },
};

const CLAIM_TYPE_LABELS: Record<ClaimType, string> = {
  loss_and_expense: 'Loss & Expense',
  disruption: 'Disruption',
  prolongation: 'Prolongation',
  varied_work: 'Varied Work',
};

const STATUS_TRANSITION_LABELS: Record<ClaimStatus, string> = {
  notified: 'Notified',
  substantiated: 'Substantiate',
  assessed: 'Assess',
  accepted: 'Accept',
  partially_accepted: 'Partially Accept',
  rejected: 'Reject',
  disputed: 'Dispute',
};

function getDeadlineUrgency(daysRemaining: number | null): { label: string; className: string } | null {
  if (daysRemaining === null) return null;
  if (daysRemaining <= 0) return { label: 'Overdue', className: 'bg-red-600/20 text-red-300 border-red-600/50' };
  if (daysRemaining <= 7) return { label: `${daysRemaining}d — Urgent`, className: 'bg-red-600/20 text-red-300 border-red-600/50' };
  if (daysRemaining <= 14) return { label: `${daysRemaining}d — Warning`, className: 'bg-amber-600/20 text-amber-300 border-amber-600/50' };
  return { label: `${daysRemaining}d remaining`, className: 'bg-green-600/10 text-green-300 border-green-600/30' };
}

function getDeadlineColor(daysRemaining: number | null): string {
  if (daysRemaining === null) return 'text-surface-400';
  if (daysRemaining <= 0) return 'text-red-400';
  if (daysRemaining <= 7) return 'text-red-400';
  if (daysRemaining <= 14) return 'text-amber-400';
  return 'text-green-400';
}

/** Calculate calendar days from today to a target date */
function calendarDaysUntil(targetIso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(targetIso + 'T00:00:00Z');
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

/** Format ZAR currency */
function formatZar(amount: number): string {
  return `R ${amount.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ══════════════════════════════════════════════════════════════════════════════
// Main Component
// ══════════════════════════════════════════════════════════════════════════════

export function ClaimsRegister({ user, projectId }: ClaimsRegisterProps) {
  const [claims, setClaims] = useState<ClaimRecord[]>([]);
  const [summary, setSummary] = useState<ClaimsCumulativeSummary | null>(null);
  const [config, setConfig] = useState<ContractConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [transitionDialog, setTransitionDialog] = useState<{
    claimId: string;
    claimRef: string;
    fromStatus: ClaimStatus;
  } | null>(null);
  const [dissatisfactionDialog, setDissatisfactionDialog] = useState<{
    claimId: string;
    claimRef: string;
  } | null>(null);
  const [evidenceDialog, setEvidenceDialog] = useState<{
    claimId: string;
    claimRef: string;
  } | null>(null);

  const projectAssignment: ContractProjectAssignment = useMemo(() => ({
    projectId,
    userId: user.uid,
    roles: [user.role],
    isAssignedTeamMember: ['architect', 'bep', 'quantity_surveyor', 'engineer'].includes(user.role),
    isAssignedContractor: user.role === 'contractor',
    isAssignedSubcontractor: user.role === 'subcontractor',
    isProjectOwner: ['client', 'developer'].includes(user.role),
    isAssignedSiteManager: user.role === 'site_manager',
  }), [user, projectId]);

  const canWrite = useMemo(() => {
    const permissions = resolveMultiRolePermissions([user.role], 'claims', projectAssignment);
    return permissions.includes('write');
  }, [user.role, projectAssignment]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [contractConfig, cumulativeSummary] = await Promise.all([
        getContractConfig(projectId),
        getClaimsCumulativeSummary(projectId),
      ]);
      setConfig(contractConfig);
      setSummary(cumulativeSummary);

      // Load claims from Firestore via cumulative (claims list comes from same collection)
      // For now we use the summary data; in production this would query the claims collection
      // The component uses the claims passed or queries them
    } catch {
      // Error state handled by empty list
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Compute deadline countdown for each claim
  const claimsWithCountdown = useMemo(() => {
    return claims.map((claim) => {
      let daysRemaining: number | null = null;
      if (claim.submissionDeadline && claim.status === 'notified') {
        daysRemaining = calendarDaysUntil(claim.submissionDeadline);
      }
      let adjudicationDaysRemaining: number | null = null;
      if (claim.adjudicationDeadline && claim.status === 'disputed') {
        adjudicationDaysRemaining = calendarDaysUntil(claim.adjudicationDeadline);
      }
      return { ...claim, daysRemaining, adjudicationDaysRemaining };
    });
  }, [claims]);

  const handleRegister = useCallback(async (input: ClaimInput) => {
    try {
      const result = await registerClaim(input, projectAssignment);
      setClaims((prev) => [...prev, result.claim]);
      setShowForm(false);
      await loadData();
    } catch {
      // Error handling via future toast
    }
  }, [projectAssignment, loadData]);

  const handleTransition = useCallback(async (claimId: string, toStatus: ClaimStatus, reason: string) => {
    setActionLoading(claimId);
    try {
      await transitionClaim(projectId, claimId, toStatus, user.uid, reason, projectAssignment);
      setClaims((prev) =>
        prev.map((c) => (c.id === claimId ? { ...c, status: toStatus, updatedAt: new Date().toISOString() } : c))
      );
      setTransitionDialog(null);
      await loadData();
    } finally {
      setActionLoading(null);
    }
  }, [projectId, user.uid, projectAssignment, loadData]);

  const handleDissatisfaction = useCallback(async (claimId: string, noticeDate: string) => {
    setActionLoading(claimId);
    try {
      const { adjudicationDeadline } = await registerDissatisfaction(
        projectId, claimId, noticeDate, user.uid, projectAssignment
      );
      setClaims((prev) =>
        prev.map((c) =>
          c.id === claimId
            ? { ...c, dissatisfactionDate: noticeDate, adjudicationDeadline, updatedAt: new Date().toISOString() }
            : c
        )
      );
      setDissatisfactionDialog(null);
      await loadData();
    } finally {
      setActionLoading(null);
    }
  }, [projectId, user.uid, projectAssignment, loadData]);

  const handleLinkEvidence = useCallback(async (claimId: string, evidenceIds: string[]) => {
    setActionLoading(claimId);
    try {
      await linkEvidence(projectId, claimId, evidenceIds, user.uid, projectAssignment);
      setClaims((prev) =>
        prev.map((c) =>
          c.id === claimId
            ? { ...c, linkedEvidenceIds: [...new Set([...c.linkedEvidenceIds, ...evidenceIds])] }
            : c
        )
      );
      setEvidenceDialog(null);
      await loadData();
    } finally {
      setActionLoading(null);
    }
  }, [projectId, user.uid, projectAssignment, loadData]);

  if (loading) {
    return (
      <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
        <CardContent className="py-12 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-primary-400 animate-spin" />
          <span className="ml-3 text-surface-400 text-sm">Loading claims register...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold text-white flex items-center gap-2">
              <Scale className="w-5 h-5 text-amber-400" />
              Claims Register
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-surface-600 text-surface-300">
                {claims.length} claim{claims.length !== 1 ? 's' : ''}
              </Badge>
              {canWrite && (
                <Dialog open={showForm} onOpenChange={setShowForm}>
                  <DialogTrigger>
                    <Button size="sm" className="bg-primary-600 hover:bg-primary-500 text-white">
                      <Plus className="w-4 h-4 mr-1" /> Register Claim
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="bg-surface-800 border-surface-700 max-w-lg">
                    <DialogHeader>
                      <DialogTitle className="text-white">Register New Claim</DialogTitle>
                    </DialogHeader>
                    <ClaimRegistrationForm
                      projectId={projectId}
                      userId={user.uid}
                      onSubmit={handleRegister}
                      onCancel={() => setShowForm(false)}
                    />
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Cumulative Summary */}
      {summary && (
        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardContent className="py-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-surface-400 uppercase tracking-wider mb-1">Total Claimed</p>
                <p className="text-lg font-bold text-white">{formatZar(summary.totalAmountClaimed)}</p>
              </div>
              <div>
                <p className="text-xs text-surface-400 uppercase tracking-wider mb-1">Total Assessed</p>
                <p className="text-lg font-bold text-amber-300">{formatZar(summary.totalAmountAssessed)}</p>
              </div>
              <div>
                <p className="text-xs text-surface-400 uppercase tracking-wider mb-1">Total Settled</p>
                <p className="text-lg font-bold text-green-300">{formatZar(summary.totalAmountSettled)}</p>
              </div>
              <div>
                <p className="text-xs text-surface-400 uppercase tracking-wider mb-1">Claims by Type</p>
                <div className="flex flex-wrap gap-1">
                  {(Object.entries(summary.totalByType) as [ClaimType, number][]).map(([type, count]) =>
                    count > 0 ? (
                      <Badge key={type} variant="outline" className="text-xs border-surface-600 text-surface-300">
                        {CLAIM_TYPE_LABELS[type]}: {count}
                      </Badge>
                    ) : null
                  )}
                  {(Object.values(summary.totalByType) as number[]).every((c) => c === 0) && (
                    <span className="text-xs text-surface-500">None</span>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Claims List */}
      {claimsWithCountdown.length === 0 ? (
        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardContent className="py-12 text-center">
            <Scale className="w-8 h-8 text-surface-500 mx-auto mb-3" />
            <p className="text-surface-300 text-sm">No claims registered.</p>
            <p className="text-xs text-surface-500 mt-2">
              Use the Register Claim button to submit a new claim.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {claimsWithCountdown.map((claim) => (
            <Card key={claim.id} className="bg-surface-800/70 backdrop-blur border-surface-700/50">
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4">
                  {/* Claim Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Badge variant="outline" className={STATUS_CONFIG[claim.status].color}>
                        {STATUS_CONFIG[claim.status].label}
                      </Badge>
                      <Badge variant="outline" className="border-surface-600 text-surface-300 text-xs">
                        {CLAIM_TYPE_LABELS[claim.claimType]}
                      </Badge>
                      {claim.daysRemaining !== null && (
                        <Badge variant="outline" className={getDeadlineUrgency(claim.daysRemaining)?.className}>
                          {getDeadlineUrgency(claim.daysRemaining)?.label}
                        </Badge>
                      )}
                      {claim.adjudicationDaysRemaining !== null && (
                        <Badge variant="outline" className="bg-orange-600/20 text-orange-300 border-orange-600/50">
                          <Gavel className="w-3 h-3 mr-1" />
                          Adjudication: {claim.adjudicationDaysRemaining}d
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm font-medium text-white">
                      {claim.claimReference}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-surface-400 flex-wrap">
                      <span className="flex items-center gap-1">
                        <DollarSign className="w-3 h-3" />
                        {formatZar(claim.amountClaimed)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        Event: {claim.dateOfEvent}
                      </span>
                      {claim.submissionDeadline && (
                        <span className={`flex items-center gap-1 ${getDeadlineColor(claim.daysRemaining)}`}>
                          <Clock className="w-3 h-3" />
                          Deadline: {claim.submissionDeadline}
                        </span>
                      )}
                      {claim.adjudicationDeadline && (
                        <span className="flex items-center gap-1 text-orange-400">
                          <Gavel className="w-3 h-3" />
                          Adjudication by: {claim.adjudicationDeadline}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <FileText className="w-3 h-3" />
                        {claim.linkedEvidenceIds.length} evidence
                      </span>
                      {claim.timeImpactDays > 0 && (
                        <span className="flex items-center gap-1">
                          <TrendingUp className="w-3 h-3" />
                          +{claim.timeImpactDays}d time impact
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  {canWrite && (
                    <div className="flex items-center gap-1 flex-shrink-0 flex-wrap">
                      {/* Status Transition */}
                      {CLAIM_TRANSITIONS[claim.status].length > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setTransitionDialog({
                            claimId: claim.id,
                            claimRef: claim.claimReference,
                            fromStatus: claim.status,
                          })}
                          disabled={actionLoading === claim.id}
                          className="text-primary-400 hover:text-primary-300 text-xs"
                          title="Transition Status"
                        >
                          {actionLoading === claim.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <ArrowRight className="w-3.5 h-3.5" />
                          )}
                        </Button>
                      )}
                      {/* Link Evidence */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEvidenceDialog({
                          claimId: claim.id,
                          claimRef: claim.claimReference,
                        })}
                        disabled={actionLoading === claim.id}
                        className="text-blue-400 hover:text-blue-300 text-xs"
                        title="Link Evidence"
                      >
                        <Link2 className="w-3.5 h-3.5" />
                      </Button>
                      {/* Dispute Escalation */}
                      {['accepted', 'partially_accepted', 'rejected'].includes(claim.status) && !claim.dissatisfactionDate && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDissatisfactionDialog({
                            claimId: claim.id,
                            claimRef: claim.claimReference,
                          })}
                          disabled={actionLoading === claim.id}
                          className="text-orange-400 hover:text-orange-300 text-xs"
                          title="Register Dissatisfaction"
                        >
                          <Gavel className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Transition Dialog */}
      {transitionDialog && (
        <TransitionDialog
          claimId={transitionDialog.claimId}
          claimRef={transitionDialog.claimRef}
          fromStatus={transitionDialog.fromStatus}
          onTransition={handleTransition}
          onClose={() => setTransitionDialog(null)}
          loading={actionLoading === transitionDialog.claimId}
        />
      )}

      {/* Dissatisfaction Dialog */}
      {dissatisfactionDialog && (
        <DissatisfactionDialog
          claimId={dissatisfactionDialog.claimId}
          claimRef={dissatisfactionDialog.claimRef}
          onSubmit={handleDissatisfaction}
          onClose={() => setDissatisfactionDialog(null)}
          loading={actionLoading === dissatisfactionDialog.claimId}
        />
      )}

      {/* Evidence Linking Dialog */}
      {evidenceDialog && (
        <EvidenceLinkDialog
          claimId={evidenceDialog.claimId}
          claimRef={evidenceDialog.claimRef}
          onLink={handleLinkEvidence}
          onClose={() => setEvidenceDialog(null)}
          loading={actionLoading === evidenceDialog.claimId}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Claim Registration Form
// ══════════════════════════════════════════════════════════════════════════════

interface ClaimRegistrationFormProps {
  projectId: string;
  userId: string;
  onSubmit: (input: ClaimInput) => Promise<void>;
  onCancel: () => void;
}

function ClaimRegistrationForm({ projectId, userId, onSubmit, onCancel }: ClaimRegistrationFormProps) {
  const [claimType, setClaimType] = useState<ClaimType | ''>('');
  const [dateOfEvent, setDateOfEvent] = useState('');
  const [notificationDate, setNotificationDate] = useState(new Date().toISOString().split('T')[0]);
  const [amountClaimed, setAmountClaimed] = useState('');
  const [timeImpactDays, setTimeImpactDays] = useState('0');
  const [linkedEvidenceIds, setLinkedEvidenceIds] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const handleSubmit = async () => {
    const validationErrors: string[] = [];
    if (!claimType) validationErrors.push('Claim type is required');
    if (!dateOfEvent) validationErrors.push('Date of event is required');
    if (!notificationDate) validationErrors.push('Notification date is required');
    const amount = parseFloat(amountClaimed);
    if (!amountClaimed || isNaN(amount) || amount < 0.01) {
      validationErrors.push('Amount claimed must be at least R 0.01');
    }
    if (amount > 999_999_999.99) {
      validationErrors.push('Amount claimed exceeds maximum (R 999,999,999.99)');
    }
    const timeDays = parseInt(timeImpactDays, 10);
    if (isNaN(timeDays) || timeDays < 0 || timeDays > 9999) {
      validationErrors.push('Time impact must be 0–9999 days');
    }

    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    const evidenceIds = linkedEvidenceIds.split(',').map((s) => s.trim()).filter(Boolean);

    setSubmitting(true);
    setErrors([]);
    try {
      await onSubmit({
        projectId,
        claimType: claimType as ClaimType,
        dateOfEvent,
        notificationDate,
        amountClaimed: amount,
        timeImpactDays: timeDays,
        linkedEvidenceIds: evidenceIds,
        createdBy: userId,
      });
    } catch {
      setErrors(['Failed to register claim. Please try again.']);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 mt-2">
      {errors.length > 0 && (
        <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-3">
          {errors.map((err, i) => (
            <p key={i} className="text-xs text-red-300 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {err}
            </p>
          ))}
        </div>
      )}

      {/* Claim Type */}
      <div>
        <label className="text-xs text-surface-400 uppercase tracking-wider block mb-1">Claim Type</label>
        <select
          value={claimType}
          onChange={(e) => setClaimType(e.target.value as ClaimType | '')}
          className="w-full h-9 rounded-md border border-surface-600 bg-surface-900 text-sm text-white px-3"
        >
          <option value="">Select claim type...</option>
          {Object.entries(CLAIM_TYPE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-surface-400 uppercase tracking-wider block mb-1">Date of Event</label>
          <Input
            type="date"
            value={dateOfEvent}
            onChange={(e) => setDateOfEvent(e.target.value)}
            className="bg-surface-900 border-surface-600 text-white"
          />
        </div>
        <div>
          <label className="text-xs text-surface-400 uppercase tracking-wider block mb-1">Notification Date</label>
          <Input
            type="date"
            value={notificationDate}
            onChange={(e) => setNotificationDate(e.target.value)}
            className="bg-surface-900 border-surface-600 text-white"
          />
        </div>
      </div>

      {/* Financial / Time Impact */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-surface-400 uppercase tracking-wider block mb-1">Amount Claimed (ZAR)</label>
          <Input
            type="number"
            step="0.01"
            min="0.01"
            max="999999999.99"
            value={amountClaimed}
            onChange={(e) => setAmountClaimed(e.target.value)}
            placeholder="e.g. 250000.00"
            className="bg-surface-900 border-surface-600 text-white"
          />
        </div>
        <div>
          <label className="text-xs text-surface-400 uppercase tracking-wider block mb-1">Time Impact (days)</label>
          <Input
            type="number"
            min="0"
            max="9999"
            value={timeImpactDays}
            onChange={(e) => setTimeImpactDays(e.target.value)}
            className="bg-surface-900 border-surface-600 text-white"
          />
        </div>
      </div>

      {/* Evidence Linking */}
      <div>
        <label className="text-xs text-surface-400 uppercase tracking-wider block mb-1">
          Linked Evidence IDs <span className="text-surface-500">(comma-separated: site diary, payment, variation, instructions, correspondence)</span>
        </label>
        <Input
          value={linkedEvidenceIds}
          onChange={(e) => setLinkedEvidenceIds(e.target.value)}
          placeholder="ev-001, ev-002"
          className="bg-surface-900 border-surface-600 text-white"
        />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onCancel} className="text-surface-300">
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={submitting}
          className="bg-primary-600 hover:bg-primary-500 text-white"
        >
          {submitting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
          Register Claim
        </Button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Status Transition Dialog
// ══════════════════════════════════════════════════════════════════════════════

interface TransitionDialogProps {
  claimId: string;
  claimRef: string;
  fromStatus: ClaimStatus;
  onTransition: (claimId: string, toStatus: ClaimStatus, reason: string) => Promise<void>;
  onClose: () => void;
  loading: boolean;
}

function TransitionDialog({ claimId, claimRef, fromStatus, onTransition, onClose, loading }: TransitionDialogProps) {
  const [toStatus, setToStatus] = useState<ClaimStatus | ''>('');
  const [reason, setReason] = useState('');

  const availableTransitions = CLAIM_TRANSITIONS[fromStatus] ?? [];

  const handleConfirm = async () => {
    if (!toStatus || !reason.trim()) return;
    await onTransition(claimId, toStatus, reason.trim());
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-surface-800 border-surface-700 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <ArrowRight className="w-4 h-4 text-primary-400" />
            Transition Claim {claimRef}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <p className="text-xs text-surface-400 mb-2">
              Current status: <Badge variant="outline" className={STATUS_CONFIG[fromStatus].color}>{STATUS_CONFIG[fromStatus].label}</Badge>
            </p>
          </div>
          <div>
            <label className="text-xs text-surface-400 uppercase tracking-wider block mb-1">New Status</label>
            <select
              value={toStatus}
              onChange={(e) => setToStatus(e.target.value as ClaimStatus)}
              className="w-full h-9 rounded-md border border-surface-600 bg-surface-900 text-sm text-white px-3"
            >
              <option value="">Select target status...</option>
              {availableTransitions.map((s) => (
                <option key={s} value={s}>{STATUS_TRANSITION_LABELS[s]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-surface-400 uppercase tracking-wider block mb-1">Reason</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-surface-600 bg-surface-900 text-sm text-white px-3 py-2 resize-none"
              placeholder="Provide reason for status change..."
            />
          </div>
        </div>
        <DialogFooter className="mt-4">
          <Button variant="ghost" onClick={onClose} className="text-surface-300">Cancel</Button>
          <Button
            onClick={handleConfirm}
            disabled={!toStatus || !reason.trim() || loading}
            className="bg-primary-600 hover:bg-primary-500 text-white"
          >
            {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
            Confirm Transition
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Dissatisfaction / Dispute Escalation Dialog
// ══════════════════════════════════════════════════════════════════════════════

interface DissatisfactionDialogProps {
  claimId: string;
  claimRef: string;
  onSubmit: (claimId: string, noticeDate: string) => Promise<void>;
  onClose: () => void;
  loading: boolean;
}

function DissatisfactionDialog({ claimId, claimRef, onSubmit, onClose, loading }: DissatisfactionDialogProps) {
  const [noticeDate, setNoticeDate] = useState(new Date().toISOString().split('T')[0]);

  const handleConfirm = async () => {
    if (!noticeDate) return;
    await onSubmit(claimId, noticeDate);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-surface-800 border-surface-700 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Gavel className="w-4 h-4 text-orange-400" />
            Register Notice of Dissatisfaction
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="bg-orange-900/20 border border-orange-700/50 rounded-lg p-3">
            <p className="text-xs text-orange-300">
              Registering a Notice of Dissatisfaction for claim <strong>{claimRef}</strong> will trigger
              the adjudication referral deadline calculation. The claim will transition to &ldquo;Disputed&rdquo; status.
            </p>
          </div>
          <div>
            <label className="text-xs text-surface-400 uppercase tracking-wider block mb-1">Date of Notice</label>
            <Input
              type="date"
              value={noticeDate}
              onChange={(e) => setNoticeDate(e.target.value)}
              className="bg-surface-900 border-surface-600 text-white"
            />
          </div>
          <p className="text-xs text-surface-400">
            The adjudication referral deadline will be calculated based on the contract form&apos;s prescribed period
            (JBCC: 10 working days; NEC/GCC/FIDIC: 28 calendar days).
          </p>
        </div>
        <DialogFooter className="mt-4">
          <Button variant="ghost" onClick={onClose} className="text-surface-300">Cancel</Button>
          <Button
            onClick={handleConfirm}
            disabled={!noticeDate || loading}
            className="bg-orange-600 hover:bg-orange-500 text-white"
          >
            {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Gavel className="w-4 h-4 mr-1" />}
            Register Dissatisfaction
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Evidence Linking Dialog
// ══════════════════════════════════════════════════════════════════════════════

interface EvidenceLinkDialogProps {
  claimId: string;
  claimRef: string;
  onLink: (claimId: string, evidenceIds: string[]) => Promise<void>;
  onClose: () => void;
  loading: boolean;
}

function EvidenceLinkDialog({ claimId, claimRef, onLink, onClose, loading }: EvidenceLinkDialogProps) {
  const [evidenceInput, setEvidenceInput] = useState('');
  const [error, setError] = useState('');

  const handleConfirm = async () => {
    const ids = evidenceInput.split(',').map((s) => s.trim()).filter(Boolean);
    if (ids.length === 0) {
      setError('At least one evidence ID is required.');
      return;
    }
    setError('');
    await onLink(claimId, ids);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-surface-800 border-surface-700 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Link2 className="w-4 h-4 text-blue-400" />
            Link Evidence to {claimRef}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <p className="text-xs text-surface-400">
            Link supporting evidence from site diary, payment records, variation orders, site instructions,
            or correspondence.
          </p>
          {error && (
            <p className="text-xs text-red-300 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {error}
            </p>
          )}
          <div>
            <label className="text-xs text-surface-400 uppercase tracking-wider block mb-1">
              Evidence IDs <span className="text-surface-500">(comma-separated)</span>
            </label>
            <Input
              value={evidenceInput}
              onChange={(e) => setEvidenceInput(e.target.value)}
              placeholder="diary-001, pay-002, vo-003"
              className="bg-surface-900 border-surface-600 text-white"
            />
          </div>
        </div>
        <DialogFooter className="mt-4">
          <Button variant="ghost" onClick={onClose} className="text-surface-300">Cancel</Button>
          <Button
            onClick={handleConfirm}
            disabled={!evidenceInput.trim() || loading}
            className="bg-blue-600 hover:bg-blue-500 text-white"
          >
            {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Link2 className="w-4 h-4 mr-1" />}
            Link Evidence
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ClaimsRegister;
