/**
 * EoT Claim Manager Component
 *
 * Manages Extension of Time claims with structured evidence linking,
 * notification deadline countdown, submission validation, and review
 * interface for Principal Agent / Employer Agent.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9
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
} from '@/components/ui/dialog';
import {
  Clock,
  Plus,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Send,
  Loader2,
  FileText,
  Calendar,
  CloudRain,
  Camera,
  ClipboardList,
  ShieldAlert,
  CalendarClock,
} from 'lucide-react';
import {
  getSouthAfricanHolidays,
  addWorkingDays,
  resolveMultiRolePermissions,
  getEoTNotificationRule,
  getRemainingWorkingDays,
} from '@/services/contractAdmin/client';
import { apiFetch } from '@/lib/apiClient';
import type {
  EoTClaimRecord,
  EoTStatus,
  DelayCause,
  EvidenceAttachment,
  EoTClaimInput,
  ContractConfig,
  ContractProjectAssignment,
} from '@/services/contractAdmin/client';

// TODO: wire to real API endpoint
async function createEoTClaimViaApi(input: EoTClaimInput) {
  const res = await apiFetch('/api/contract-admin/eot/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`EoT claim creation failed: ${res.statusText}`);
  return res.json();
}

// TODO: wire to real API endpoint
async function submitEoTClaimViaApi(projectId: string, claimId: string, userId: string) {
  const res = await apiFetch('/api/contract-admin/eot/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, claimId, userId }),
  });
  if (!res.ok) throw new Error(`Submit failed: ${res.statusText}`);
  return res.json();
}

// TODO: wire to real API endpoint
async function reviewEoTClaimViaApi(projectId: string, claimId: string, decision: string, userId: string, reason?: string) {
  const res = await apiFetch('/api/contract-admin/eot/review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, claimId, decision, userId, reason }),
  });
  if (!res.ok) throw new Error(`Review failed: ${res.statusText}`);
  return res.json();
}

// TODO: wire to real API endpoint
async function calculateNotificationDeadlineViaApi(projectId: string, eventDate: string): Promise<string> {
  const res = await apiFetch('/api/contract-admin/eot/notification-deadline', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, eventDate }),
  });
  if (!res.ok) throw new Error(`Deadline calculation failed: ${res.statusText}`);
  const data = await res.json();
  return data.deadline;
}

// TODO: wire to real API endpoint
async function getContractConfigViaApi(projectId: string): Promise<ContractConfig | null> {
  const res = await apiFetch(`/api/contract-admin/config?projectId=${encodeURIComponent(projectId)}`);
  if (!res.ok) return null;
  return res.json();
}

// ══════════════════════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════════════════════

interface EoTClaimManagerProps {
  user: UserProfile;
  projectId: string;
}

// ══════════════════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════════════════

const STATUS_CONFIG: Record<EoTStatus, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'bg-surface-600/20 text-surface-300 border-surface-600/50' },
  submitted: { label: 'Submitted', color: 'bg-blue-600/20 text-blue-300 border-blue-600/50' },
  under_review: { label: 'Under Review', color: 'bg-purple-600/20 text-purple-300 border-purple-600/50' },
  granted: { label: 'Granted', color: 'bg-green-600/20 text-green-300 border-green-600/50' },
  partially_granted: { label: 'Partially Granted', color: 'bg-amber-600/20 text-amber-300 border-amber-600/50' },
  rejected: { label: 'Rejected', color: 'bg-red-600/20 text-red-300 border-red-600/50' },
  withdrawn: { label: 'Withdrawn', color: 'bg-surface-600/20 text-surface-400 border-surface-600/50' },
};

const CAUSE_LABELS: Record<DelayCause, string> = {
  weather: 'Inclement Weather',
  materials: 'Material Shortage / Delivery Delay',
  labour: 'Labour Disruption',
  client: 'Client Instruction / Change',
  professional: 'Professional Team Delay',
  contractor: 'Contractor Delay',
  unforeseen_ground_conditions: 'Unforeseen Ground Conditions',
  force_majeure: 'Force Majeure',
};

const EVIDENCE_TYPE_LABELS: Record<EvidenceAttachment['type'], { label: string; icon: typeof FileText }> = {
  site_diary: { label: 'Site Diary', icon: ClipboardList },
  weather_record: { label: 'Weather Record', icon: CloudRain },
  site_instruction: { label: 'Site Instruction', icon: FileText },
  delay_early_warning: { label: 'Delay Early Warning', icon: ShieldAlert },
  photo: { label: 'Photo Evidence', icon: Camera },
};

function getDeadlineUrgency(remainingDays: number | null): { label: string; className: string } | null {
  if (remainingDays === null) return null;
  if (remainingDays <= 0) return { label: 'Overdue', className: 'bg-red-600/20 text-red-300 border-red-600/50' };
  if (remainingDays <= 1) return { label: `${remainingDays}d — Critical`, className: 'bg-red-600/20 text-red-300 border-red-600/50' };
  if (remainingDays <= 3) return { label: `${remainingDays}d — Urgent`, className: 'bg-amber-600/20 text-amber-300 border-amber-600/50' };
  if (remainingDays <= 7) return { label: `${remainingDays}d — Warning`, className: 'bg-amber-600/10 text-amber-200 border-amber-600/30' };
  return { label: `${remainingDays}d remaining`, className: 'bg-green-600/10 text-green-300 border-green-600/30' };
}

function getDeadlineColor(remainingDays: number | null): string {
  if (remainingDays === null) return 'text-surface-400';
  if (remainingDays <= 0) return 'text-red-400';
  if (remainingDays <= 1) return 'text-red-400';
  if (remainingDays <= 3) return 'text-amber-400';
  if (remainingDays <= 7) return 'text-amber-300';
  return 'text-green-400';
}

// ══════════════════════════════════════════════════════════════════════════════
// Main Component
// ══════════════════════════════════════════════════════════════════════════════

export function EoTClaimManager({ user, projectId }: EoTClaimManagerProps) {
  const [claims, setClaims] = useState<EoTClaimRecord[]>([]);
  const [config, setConfig] = useState<ContractConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showReviewDialog, setShowReviewDialog] = useState<EoTClaimRecord | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

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
    const permissions = resolveMultiRolePermissions([user.role], 'eot', projectAssignment);
    return permissions.includes('write');
  }, [user.role, projectAssignment]);

  const canReview = useMemo(() => {
    const permissions = resolveMultiRolePermissions([user.role], 'eot', projectAssignment);
    return permissions.includes('approve');
  }, [user.role, projectAssignment]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const contractConfig = await getContractConfigViaApi(projectId);
      setConfig(contractConfig);
      // Load claims from Firestore via adminDb (simulated here via config pattern)
      // In production, this would call a service function to list all EoT claims
      setClaims([]);
    } catch {
      // Error state handled by empty list
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreate = useCallback(async (input: EoTClaimInput) => {
    try {
      const { claim } = await createEoTClaimViaApi(input);
      setClaims((prev) => [claim, ...prev]);
      setShowForm(false);
    } catch {
      // Error handling via future toast
    }
  }, []);

  const handleSubmit = useCallback(async (claimId: string) => {
    setActionLoading(claimId);
    try {
      await submitEoTClaimViaApi(projectId, claimId, user.uid);
      await loadData();
    } finally {
      setActionLoading(null);
    }
  }, [projectId, user.uid, loadData]);

  const handleReview = useCallback(async (
    claimId: string,
    decision: 'granted' | 'partially_granted' | 'rejected',
    approvedDays?: number
  ) => {
    setActionLoading(claimId);
    try {
      await reviewEoTClaimViaApi(projectId, claimId, decision, user.uid, approvedDays ? String(approvedDays) : undefined);
      setShowReviewDialog(null);
      await loadData();
    } finally {
      setActionLoading(null);
    }
  }, [projectId, user.uid, loadData]);

  // Compute notification deadline countdown for each claim
  const claimsWithDeadline = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const year = new Date().getFullYear();
    const holidays = getSouthAfricanHolidays(year);

    return claims.map((claim) => {
      let deadlineRemaining: number | null = null;
      if (
        claim.notificationDeadline &&
        ['draft', 'submitted'].includes(claim.status)
      ) {
        const deadline = claim.notificationDeadline;
        // Count remaining days from today
        if (today > deadline) {
          deadlineRemaining = 0;
        } else {
          // Simple calendar diff for display (working days would require full calc)
          const todayDate = new Date(today);
          const deadlineDate = new Date(deadline);
          const diffMs = deadlineDate.getTime() - todayDate.getTime();
          deadlineRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        }
      }
      return { ...claim, deadlineRemaining };
    });
  }, [claims]);

  if (loading) {
    return (
      <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
        <CardContent className="py-12 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-primary-400 animate-spin" />
          <span className="ml-3 text-surface-400 text-sm">Loading EoT claims...</span>
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
              <CalendarClock className="w-5 h-5 text-blue-400" />
              Extension of Time Claims
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-surface-600 text-surface-300">
                {claims.length} claim{claims.length !== 1 ? 's' : ''}
              </Badge>
              {canWrite && (
                <Dialog open={showForm} onOpenChange={setShowForm}>
                  <DialogTrigger>
                    <Button size="sm" className="bg-primary-600 hover:bg-primary-500 text-white">
                      <Plus className="w-4 h-4 mr-1" /> New EoT Claim
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="bg-surface-800 border-surface-700 max-w-2xl max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle className="text-white">Create Extension of Time Claim</DialogTitle>
                    </DialogHeader>
                    <EoTClaimForm
                      projectId={projectId}
                      userId={user.uid}
                      config={config}
                      onSubmit={handleCreate}
                      onCancel={() => setShowForm(false)}
                    />
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Claims List */}
      {claimsWithDeadline.length === 0 ? (
        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardContent className="py-12 text-center">
            <CalendarClock className="w-8 h-8 text-surface-500 mx-auto mb-3" />
            <p className="text-surface-300 text-sm">No Extension of Time claims registered.</p>
            <p className="text-xs text-surface-500 mt-2">
              Use the New EoT Claim button to register a delay event and claim additional time.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {claimsWithDeadline.map((claim) => (
            <Card key={claim.id} className="bg-surface-800/70 backdrop-blur border-surface-700/50">
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4">
                  {/* Claim Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Badge variant="outline" className={STATUS_CONFIG[claim.status].color}>
                        {STATUS_CONFIG[claim.status].label}
                      </Badge>
                      <span className="text-xs text-surface-400 font-mono">
                        {claim.claimReference}
                      </span>
                      {claim.isLateSubmission && (
                        <Badge variant="outline" className="bg-red-900/30 text-red-300 border-red-700/50">
                          <AlertTriangle className="w-3 h-3 mr-1" /> Late Submission
                        </Badge>
                      )}
                      {claim.deadlineRemaining !== null && (
                        <Badge variant="outline" className={getDeadlineUrgency(claim.deadlineRemaining)?.className}>
                          {getDeadlineUrgency(claim.deadlineRemaining)?.label}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm font-medium text-white">
                      {CAUSE_LABELS[claim.cause]} — {claim.periodClaimedDays} working day{claim.periodClaimedDays !== 1 ? 's' : ''}
                    </p>
                    <p className="text-xs text-surface-400 mt-1 line-clamp-2">
                      {claim.narrative}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-surface-400 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        Event: {claim.delayEventDate}
                      </span>
                      {claim.notificationDeadline && (
                        <span className={`flex items-center gap-1 ${getDeadlineColor(claim.deadlineRemaining)}`}>
                          <Clock className="w-3 h-3" />
                          Notification Deadline: {claim.notificationDeadline}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <FileText className="w-3 h-3" />
                        {claim.evidenceAttachments.length} evidence item{claim.evidenceAttachments.length !== 1 ? 's' : ''}
                      </span>
                      {claim.approvedDays !== undefined && (
                        <span className="flex items-center gap-1 text-green-400">
                          <CheckCircle2 className="w-3 h-3" />
                          Approved: {claim.approvedDays} day{claim.approvedDays !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {/* Submit button for draft claims */}
                    {canWrite && claim.status === 'draft' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSubmit(claim.id)}
                        disabled={actionLoading === claim.id}
                        className="text-blue-400 hover:text-blue-300 text-xs"
                        title="Submit for Review"
                      >
                        {actionLoading === claim.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Send className="w-3.5 h-3.5 mr-1" />
                        )}
                        Submit
                      </Button>
                    )}
                    {/* Review button for submitted/under_review claims */}
                    {canReview && ['submitted', 'under_review'].includes(claim.status) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowReviewDialog(claim)}
                        disabled={actionLoading === claim.id}
                        className="text-purple-400 hover:text-purple-300 text-xs"
                        title="Review Claim"
                      >
                        <ClipboardList className="w-3.5 h-3.5 mr-1" />
                        Review
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Review Dialog */}
      {showReviewDialog && (
        <Dialog open={!!showReviewDialog} onOpenChange={() => setShowReviewDialog(null)}>
          <DialogContent className="bg-surface-800 border-surface-700 max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-white">
                Review EoT Claim: {showReviewDialog.claimReference}
              </DialogTitle>
            </DialogHeader>
            <EoTReviewPanel
              claim={showReviewDialog}
              config={config}
              onDecision={(decision, approvedDays) =>
                handleReview(showReviewDialog.id, decision, approvedDays)
              }
              onCancel={() => setShowReviewDialog(null)}
              loading={actionLoading === showReviewDialog.id}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// EoT Claim Creation Form
// ══════════════════════════════════════════════════════════════════════════════

interface EoTClaimFormProps {
  projectId: string;
  userId: string;
  config: ContractConfig | null;
  onSubmit: (input: EoTClaimInput) => Promise<void>;
  onCancel: () => void;
}

function EoTClaimForm({ projectId, userId, config, onSubmit, onCancel }: EoTClaimFormProps) {
  const [cause, setCause] = useState<DelayCause | ''>('');
  const [periodClaimedDays, setPeriodClaimedDays] = useState('');
  const [delayEventDate, setDelayEventDate] = useState(new Date().toISOString().split('T')[0]);
  const [narrative, setNarrative] = useState('');
  const [evidenceAttachments, setEvidenceAttachments] = useState<EvidenceAttachment[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  // Evidence form state
  const [evidenceType, setEvidenceType] = useState<EvidenceAttachment['type']>('site_diary');
  const [evidenceSourceId, setEvidenceSourceId] = useState('');
  const [evidenceDate, setEvidenceDate] = useState('');
  const [evidenceCaption, setEvidenceCaption] = useState('');

  // Calculate notification deadline for display (pure calculation using client-safe imports)
  const notificationInfo = useMemo(() => {
    if (!config?.contractForm || !delayEventDate) return null;
    try {
      const year = parseInt(delayEventDate.split('-')[0], 10);
      const holidays = getSouthAfricanHolidays(year);
      const rule = getEoTNotificationRule(config.contractForm);
      const deadline = rule.dayType === 'working'
        ? addWorkingDays(delayEventDate, rule.notificationPeriodDays, holidays)
        : (() => { const d = new Date(delayEventDate); d.setDate(d.getDate() + rule.notificationPeriodDays); return d.toISOString().split('T')[0]; })();
      const today = new Date().toISOString().split('T')[0];
      const remainingDays = getRemainingWorkingDays(today, deadline, holidays);
      return { deadline, remainingDays };
    } catch {
      return null;
    }
  }, [config, delayEventDate]);

  const handleAddEvidence = () => {
    if (!evidenceSourceId.trim() || !evidenceDate || !evidenceCaption.trim()) return;
    if (evidenceCaption.length > 200) return;

    const newEvidence: EvidenceAttachment = {
      id: `ev-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      type: evidenceType,
      sourceId: evidenceSourceId.trim(),
      date: evidenceDate,
      caption: evidenceCaption.trim(),
    };
    setEvidenceAttachments((prev) => [...prev, newEvidence]);
    setEvidenceSourceId('');
    setEvidenceDate('');
    setEvidenceCaption('');
  };

  const handleRemoveEvidence = (id: string) => {
    setEvidenceAttachments((prev) => prev.filter((e) => e.id !== id));
  };

  const handleSubmit = async () => {
    const validationErrors: string[] = [];
    if (!cause) validationErrors.push('Delay cause is required');
    const days = parseInt(periodClaimedDays, 10);
    if (!periodClaimedDays || isNaN(days) || days < 1 || days > 365) {
      validationErrors.push('Period must be between 1 and 365 working days');
    }
    if (!delayEventDate) validationErrors.push('Delay event date is required');
    if (!narrative.trim()) validationErrors.push('Narrative description is required');
    if (narrative.length > 2000) validationErrors.push('Narrative must be 2000 characters or fewer');
    if (evidenceAttachments.length < 1) {
      validationErrors.push('At least 1 evidence attachment is required');
    }

    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    setSubmitting(true);
    setErrors([]);
    try {
      await onSubmit({
        projectId,
        cause: cause as DelayCause,
        periodClaimedDays: days,
        delayEventDate,
        narrative: narrative.trim(),
        evidenceAttachments,
        createdBy: userId,
      });
    } catch {
      setErrors(['Failed to create EoT claim. Please try again.']);
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

      {/* Notification Deadline Display */}
      {notificationInfo && (
        <div className={`rounded-lg p-3 border ${
          notificationInfo.remainingDays <= 0
            ? 'bg-red-900/20 border-red-700/50'
            : notificationInfo.remainingDays <= 3
            ? 'bg-amber-900/20 border-amber-700/50'
            : 'bg-blue-900/20 border-blue-700/50'
        }`}>
          <div className="flex items-center gap-2 text-xs">
            <Clock className="w-3.5 h-3.5" />
            <span className="font-medium">Notification Deadline:</span>
            <span>{notificationInfo.deadline}</span>
            <Badge variant="outline" className={getDeadlineUrgency(notificationInfo.remainingDays)?.className}>
              {getDeadlineUrgency(notificationInfo.remainingDays)?.label}
            </Badge>
          </div>
          {notificationInfo.remainingDays <= 0 && (
            <p className="text-xs text-red-300 mt-1 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              This submission will be flagged as late. The notification deadline has passed.
            </p>
          )}
        </div>
      )}

      {/* Delay Cause */}
      <div>
        <label className="text-xs text-surface-400 uppercase tracking-wider block mb-1">Delay Cause</label>
        <select
          value={cause}
          onChange={(e) => setCause(e.target.value as DelayCause | '')}
          className="w-full h-9 rounded-md border border-surface-600 bg-surface-900 text-sm text-white px-3"
        >
          <option value="">Select delay cause...</option>
          {(Object.keys(CAUSE_LABELS) as DelayCause[]).map((key) => (
            <option key={key} value={key}>{CAUSE_LABELS[key]}</option>
          ))}
        </select>
      </div>

      {/* Period + Date */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-surface-400 uppercase tracking-wider block mb-1">
            Period Claimed (working days)
          </label>
          <Input
            type="number"
            value={periodClaimedDays}
            onChange={(e) => setPeriodClaimedDays(e.target.value)}
            placeholder="e.g. 14"
            min={1}
            max={365}
            className="bg-surface-900 border-surface-600 text-white"
          />
        </div>
        <div>
          <label className="text-xs text-surface-400 uppercase tracking-wider block mb-1">
            Delay Event Date
          </label>
          <Input
            type="date"
            value={delayEventDate}
            onChange={(e) => setDelayEventDate(e.target.value)}
            className="bg-surface-900 border-surface-600 text-white"
          />
        </div>
      </div>

      {/* Narrative */}
      <div>
        <label className="text-xs text-surface-400 uppercase tracking-wider block mb-1">
          Narrative <span className="text-surface-500">({narrative.length}/2000)</span>
        </label>
        <textarea
          value={narrative}
          onChange={(e) => setNarrative(e.target.value)}
          maxLength={2000}
          rows={4}
          className="w-full rounded-md border border-surface-600 bg-surface-900 text-sm text-white px-3 py-2 resize-none"
          placeholder="Describe the delay event, its impact on the programme, and the basis for the extension claimed..."
        />
      </div>

      {/* Evidence Attachments */}
      <div>
        <label className="text-xs text-surface-400 uppercase tracking-wider block mb-2">
          Evidence Attachments <span className="text-surface-500">({evidenceAttachments.length} linked)</span>
        </label>

        {/* Existing evidence list */}
        {evidenceAttachments.length > 0 && (
          <div className="space-y-2 mb-3">
            {evidenceAttachments.map((ev) => {
              const typeInfo = EVIDENCE_TYPE_LABELS[ev.type];
              const Icon = typeInfo.icon;
              return (
                <div
                  key={ev.id}
                  className="flex items-center gap-2 bg-surface-900/50 border border-surface-700 rounded-md px-3 py-2"
                >
                  <Icon className="w-4 h-4 text-surface-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-white truncate">{ev.caption}</p>
                    <p className="text-xs text-surface-500">{typeInfo.label} — {ev.date}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveEvidence(ev.id)}
                    className="text-red-400 hover:text-red-300 h-6 w-6 p-0"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        {/* Add evidence form */}
        <div className="bg-surface-900/30 border border-surface-700/50 rounded-lg p-3 space-y-2">
          <p className="text-xs text-surface-400 font-medium">Add Evidence</p>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={evidenceType}
              onChange={(e) => setEvidenceType(e.target.value as EvidenceAttachment['type'])}
              className="h-8 rounded-md border border-surface-600 bg-surface-900 text-xs text-white px-2"
            >
              {(Object.entries(EVIDENCE_TYPE_LABELS) as [EvidenceAttachment['type'], { label: string }][]).map(
                ([key, val]) => (
                  <option key={key} value={key}>{val.label}</option>
                )
              )}
            </select>
            <Input
              value={evidenceDate}
              onChange={(e) => setEvidenceDate(e.target.value)}
              type="date"
              className="h-8 bg-surface-900 border-surface-600 text-white text-xs"
            />
          </div>
          <Input
            value={evidenceSourceId}
            onChange={(e) => setEvidenceSourceId(e.target.value)}
            placeholder="Source reference (e.g. diary-2025-07-01)"
            className="h-8 bg-surface-900 border-surface-600 text-white text-xs"
          />
          <div className="flex gap-2">
            <Input
              value={evidenceCaption}
              onChange={(e) => setEvidenceCaption(e.target.value)}
              placeholder="Caption (max 200 chars)"
              maxLength={200}
              className="h-8 bg-surface-900 border-surface-600 text-white text-xs flex-1"
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={handleAddEvidence}
              disabled={!evidenceSourceId.trim() || !evidenceDate || !evidenceCaption.trim()}
              className="text-primary-400 hover:text-primary-300 text-xs h-8"
            >
              <Plus className="w-3 h-3 mr-1" /> Add
            </Button>
          </div>
        </div>
      </div>

      {/* Form Actions */}
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
          Create Claim
        </Button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Review Panel
// ══════════════════════════════════════════════════════════════════════════════

interface EoTReviewPanelProps {
  claim: EoTClaimRecord;
  config: ContractConfig | null;
  onDecision: (decision: 'granted' | 'partially_granted' | 'rejected', approvedDays?: number) => void;
  onCancel: () => void;
  loading: boolean;
}

function EoTReviewPanel({ claim, config, onDecision, onCancel, loading }: EoTReviewPanelProps) {
  const [approvedDays, setApprovedDays] = useState('');
  const [selectedDecision, setSelectedDecision] = useState<'granted' | 'partially_granted' | 'rejected' | ''>('');

  // Compute revised completion date impact for display
  const revisedDatePreview = useMemo(() => {
    if (!config || !selectedDecision || selectedDecision === 'rejected') return null;
    const currentCompletion = config.revisedCompletionDate || config.practicalCompletionDate;
    if (!currentCompletion) return null;

    const daysToAdd = selectedDecision === 'granted'
      ? claim.periodClaimedDays
      : parseInt(approvedDays, 10);

    if (!daysToAdd || isNaN(daysToAdd) || daysToAdd < 1) return null;

    try {
      const year = parseInt(currentCompletion.split('-')[0], 10);
      const holidays = getSouthAfricanHolidays(year);
      const newDate = addWorkingDays(currentCompletion, daysToAdd, holidays);
      return { currentDate: currentCompletion, newDate, daysAdded: daysToAdd };
    } catch {
      return null;
    }
  }, [config, selectedDecision, approvedDays, claim.periodClaimedDays]);

  const handleDecision = () => {
    if (!selectedDecision) return;
    if (selectedDecision === 'partially_granted') {
      const days = parseInt(approvedDays, 10);
      if (!days || days < 1 || days >= claim.periodClaimedDays) return;
      onDecision(selectedDecision, days);
    } else {
      onDecision(selectedDecision);
    }
  };

  return (
    <div className="space-y-4 mt-2">
      {/* Claim Summary */}
      <div className="bg-surface-900/50 border border-surface-700 rounded-lg p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={STATUS_CONFIG[claim.status].color}>
            {STATUS_CONFIG[claim.status].label}
          </Badge>
          {claim.isLateSubmission && (
            <Badge variant="outline" className="bg-red-900/30 text-red-300 border-red-700/50">
              Late Submission
            </Badge>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-surface-500">Cause:</span>
            <span className="text-white ml-1">{CAUSE_LABELS[claim.cause]}</span>
          </div>
          <div>
            <span className="text-surface-500">Period Claimed:</span>
            <span className="text-white ml-1">{claim.periodClaimedDays} working days</span>
          </div>
          <div>
            <span className="text-surface-500">Event Date:</span>
            <span className="text-white ml-1">{claim.delayEventDate}</span>
          </div>
          <div>
            <span className="text-surface-500">Evidence:</span>
            <span className="text-white ml-1">{claim.evidenceAttachments.length} item(s)</span>
          </div>
        </div>
        <div className="text-xs text-surface-300 mt-2">
          <span className="text-surface-500">Narrative:</span>
          <p className="mt-1">{claim.narrative}</p>
        </div>
      </div>

      {/* Evidence List */}
      {claim.evidenceAttachments.length > 0 && (
        <div>
          <label className="text-xs text-surface-400 uppercase tracking-wider block mb-2">
            Linked Evidence
          </label>
          <div className="space-y-1">
            {claim.evidenceAttachments.map((ev) => {
              const typeInfo = EVIDENCE_TYPE_LABELS[ev.type];
              const Icon = typeInfo.icon;
              return (
                <div key={ev.id} className="flex items-center gap-2 text-xs text-surface-300">
                  <Icon className="w-3.5 h-3.5 text-surface-500" />
                  <span>{typeInfo.label}</span>
                  <span className="text-surface-500">—</span>
                  <span className="truncate">{ev.caption}</span>
                  <span className="text-surface-500 ml-auto">{ev.date}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Decision */}
      <div>
        <label className="text-xs text-surface-400 uppercase tracking-wider block mb-2">Decision</label>
        <div className="grid grid-cols-3 gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedDecision('granted')}
            className={`border text-xs ${
              selectedDecision === 'granted'
                ? 'border-green-500 bg-green-900/30 text-green-300'
                : 'border-surface-600 text-surface-300 hover:border-green-600'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Grant
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedDecision('partially_granted')}
            className={`border text-xs ${
              selectedDecision === 'partially_granted'
                ? 'border-amber-500 bg-amber-900/30 text-amber-300'
                : 'border-surface-600 text-surface-300 hover:border-amber-600'
            }`}
          >
            <Clock className="w-3.5 h-3.5 mr-1" /> Partial
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedDecision('rejected')}
            className={`border text-xs ${
              selectedDecision === 'rejected'
                ? 'border-red-500 bg-red-900/30 text-red-300'
                : 'border-surface-600 text-surface-300 hover:border-red-600'
            }`}
          >
            <XCircle className="w-3.5 h-3.5 mr-1" /> Reject
          </Button>
        </div>
      </div>

      {/* Approved Days (for partial grant) */}
      {selectedDecision === 'partially_granted' && (
        <div>
          <label className="text-xs text-surface-400 uppercase tracking-wider block mb-1">
            Approved Days (1 – {claim.periodClaimedDays - 1})
          </label>
          <Input
            type="number"
            value={approvedDays}
            onChange={(e) => setApprovedDays(e.target.value)}
            min={1}
            max={claim.periodClaimedDays - 1}
            placeholder={`Max ${claim.periodClaimedDays - 1}`}
            className="bg-surface-900 border-surface-600 text-white"
          />
        </div>
      )}

      {/* Revised Completion Date Impact */}
      {revisedDatePreview && (
        <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-3">
          <p className="text-xs text-blue-300 font-medium mb-1">Revised Completion Date Impact</p>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-surface-400">Current:</span>
            <span className="text-white">{revisedDatePreview.currentDate}</span>
            <span className="text-surface-500">→</span>
            <span className="text-green-300 font-medium">{revisedDatePreview.newDate}</span>
            <span className="text-surface-400">(+{revisedDatePreview.daysAdded} working days)</span>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onCancel} className="text-surface-300">
          Cancel
        </Button>
        <Button
          onClick={handleDecision}
          disabled={!selectedDecision || loading || (selectedDecision === 'partially_granted' && (!approvedDays || parseInt(approvedDays, 10) < 1 || parseInt(approvedDays, 10) >= claim.periodClaimedDays))}
          className={`text-white ${
            selectedDecision === 'granted'
              ? 'bg-green-600 hover:bg-green-500'
              : selectedDecision === 'rejected'
              ? 'bg-red-600 hover:bg-red-500'
              : 'bg-amber-600 hover:bg-amber-500'
          }`}
        >
          {loading ? (
            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
          ) : selectedDecision === 'granted' ? (
            <CheckCircle2 className="w-4 h-4 mr-1" />
          ) : selectedDecision === 'rejected' ? (
            <XCircle className="w-4 h-4 mr-1" />
          ) : (
            <Clock className="w-4 h-4 mr-1" />
          )}
          Confirm {selectedDecision === 'granted' ? 'Grant' : selectedDecision === 'partially_granted' ? 'Partial Grant' : selectedDecision === 'rejected' ? 'Rejection' : 'Decision'}
        </Button>
      </div>
    </div>
  );
}

export default EoTClaimManager;
