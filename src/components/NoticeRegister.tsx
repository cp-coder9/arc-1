/**
 * Notice Register Component
 *
 * Displays the contractual notice register list with status, deadline,
 * and remaining days. Provides a registration form and deadline countdown
 * with color-coded urgency. Supports status transitions (acknowledge,
 * respond, withdraw) respecting current status.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.2, 4.3, 4.4
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
  Bell,
  Plus,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Send,
  Loader2,
  FileText,
  Calendar,
} from 'lucide-react';
import {
  getNoticeTypesForForm,
  getRemainingWorkingDays,
  getSouthAfricanHolidays,
  resolveMultiRolePermissions,
} from '@/services/contractAdmin/client';
import { apiFetch } from '@/lib/apiClient';
import type {
  NoticeRecord,
  NoticeStatus,
  NoticeRegistrationInput,
  ContractConfig,
  ContractProjectAssignment,
} from '@/services/contractAdmin/client';

// TODO: wire to real API endpoint
async function getActiveNoticesViaApi(projectId: string): Promise<NoticeRecord[]> {
  const res = await apiFetch(`/api/contract-admin/notices?projectId=${encodeURIComponent(projectId)}`);
  if (!res.ok) return [];
  return res.json();
}

// TODO: wire to real API endpoint
async function registerNoticeViaApi(input: NoticeRegistrationInput) {
  const res = await apiFetch('/api/contract-admin/notices/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Notice registration failed: ${res.statusText}`);
  return res.json();
}

// TODO: wire to real API endpoint
async function acknowledgeNoticeViaApi(projectId: string, noticeId: string, userId: string) {
  const res = await apiFetch('/api/contract-admin/notices/acknowledge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, noticeId, userId }),
  });
  if (!res.ok) throw new Error(`Acknowledge failed: ${res.statusText}`);
  return res.json();
}

// TODO: wire to real API endpoint
async function respondToNoticeViaApi(projectId: string, noticeId: string, userId: string, response: string) {
  const res = await apiFetch('/api/contract-admin/notices/respond', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, noticeId, userId, response }),
  });
  if (!res.ok) throw new Error(`Respond failed: ${res.statusText}`);
  return res.json();
}

// TODO: wire to real API endpoint
async function withdrawNoticeViaApi(projectId: string, noticeId: string, userId: string, reason: string) {
  const res = await apiFetch('/api/contract-admin/notices/withdraw', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, noticeId, userId, reason }),
  });
  if (!res.ok) throw new Error(`Withdraw failed: ${res.statusText}`);
  return res.json();
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

interface NoticeRegisterProps {
  user: UserProfile;
  projectId: string;
}

// ══════════════════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════════════════

const STATUS_CONFIG: Record<NoticeStatus, { label: string; color: string }> = {
  issued: { label: 'Issued', color: 'bg-blue-600/20 text-blue-300 border-blue-600/50' },
  acknowledged: { label: 'Acknowledged', color: 'bg-purple-600/20 text-purple-300 border-purple-600/50' },
  responded: { label: 'Responded', color: 'bg-green-600/20 text-green-300 border-green-600/50' },
  expired: { label: 'Expired', color: 'bg-red-600/20 text-red-300 border-red-600/50' },
  withdrawn: { label: 'Withdrawn', color: 'bg-surface-600/20 text-surface-300 border-surface-600/50' },
};

function getUrgencyColor(remainingDays: number | null): string {
  if (remainingDays === null) return 'text-surface-400';
  if (remainingDays <= 1) return 'text-red-400';
  if (remainingDays <= 3) return 'text-amber-400';
  if (remainingDays <= 7) return 'text-amber-300';
  return 'text-green-400';
}

function getUrgencyBadge(remainingDays: number | null): { label: string; className: string } | null {
  if (remainingDays === null) return null;
  if (remainingDays <= 1) return { label: `${remainingDays}d — Critical`, className: 'bg-red-600/20 text-red-300 border-red-600/50' };
  if (remainingDays <= 3) return { label: `${remainingDays}d — Urgent`, className: 'bg-amber-600/20 text-amber-300 border-amber-600/50' };
  if (remainingDays <= 7) return { label: `${remainingDays}d — Warning`, className: 'bg-amber-600/10 text-amber-200 border-amber-600/30' };
  return { label: `${remainingDays}d remaining`, className: 'bg-green-600/10 text-green-300 border-green-600/30' };
}

// ══════════════════════════════════════════════════════════════════════════════
// Main Component
// ══════════════════════════════════════════════════════════════════════════════

export function NoticeRegister({ user, projectId }: NoticeRegisterProps) {
  const [notices, setNotices] = useState<NoticeRecord[]>([]);
  const [config, setConfig] = useState<ContractConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
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
    const permissions = resolveMultiRolePermissions([user.role], 'notices', projectAssignment);
    return permissions.includes('write');
  }, [user.role, projectAssignment]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [noticeList, contractConfig] = await Promise.all([
        getActiveNoticesViaApi(projectId),
        getContractConfigViaApi(projectId),
      ]);
      setNotices(noticeList);
      setConfig(contractConfig);
    } catch {
      // Error state handled by empty list
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAcknowledge = useCallback(async (noticeId: string) => {
    setActionLoading(noticeId);
    try {
      await acknowledgeNoticeViaApi(projectId, noticeId, user.uid);
      await loadData();
    } finally {
      setActionLoading(null);
    }
  }, [projectId, user.uid, loadData]);

  const handleRespond = useCallback(async (noticeId: string) => {
    setActionLoading(noticeId);
    try {
      await respondToNoticeViaApi(projectId, noticeId, user.uid, 'Response submitted via platform');
      await loadData();
    } finally {
      setActionLoading(null);
    }
  }, [projectId, user.uid, loadData]);

  const handleWithdraw = useCallback(async (noticeId: string) => {
    setActionLoading(noticeId);
    try {
      await withdrawNoticeViaApi(projectId, noticeId, user.uid, 'Withdrawn via platform');
      await loadData();
    } finally {
      setActionLoading(null);
    }
  }, [projectId, user.uid, loadData]);

  const handleRegister = useCallback(async (input: NoticeRegistrationInput) => {
    try {
      await registerNoticeViaApi(input);
      setShowForm(false);
      await loadData();
    } catch {
      // Error handling via future toast
    }
  }, [loadData]);

  // Compute remaining days for each notice with a deadline
  const noticesWithCountdown = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const year = new Date().getFullYear();
    const holidays = getSouthAfricanHolidays(year);

    return notices.map((notice) => {
      let remainingDays: number | null = null;
      if (notice.deadline && ['issued', 'acknowledged'].includes(notice.status)) {
        remainingDays = getRemainingWorkingDays(today, notice.deadline, holidays);
      }
      return { ...notice, remainingDays };
    });
  }, [notices]);

  if (loading) {
    return (
      <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
        <CardContent className="py-12 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-primary-400 animate-spin" />
          <span className="ml-3 text-surface-400 text-sm">Loading notice register...</span>
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
              <Bell className="w-5 h-5 text-blue-400" />
              Notice Register
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-surface-600 text-surface-300">
                {notices.length} notice{notices.length !== 1 ? 's' : ''}
              </Badge>
              {canWrite && (
                <Dialog open={showForm} onOpenChange={setShowForm}>
                  <DialogTrigger>
                    <Button size="sm" className="bg-primary-600 hover:bg-primary-500 text-white">
                      <Plus className="w-4 h-4 mr-1" /> Register Notice
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="bg-surface-800 border-surface-700 max-w-lg">
                    <DialogHeader>
                      <DialogTitle className="text-white">Register Contractual Notice</DialogTitle>
                    </DialogHeader>
                    <NoticeRegistrationForm
                      projectId={projectId}
                      userId={user.uid}
                      config={config}
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

      {/* Notice List */}
      {noticesWithCountdown.length === 0 ? (
        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardContent className="py-12 text-center">
            <Bell className="w-8 h-8 text-surface-500 mx-auto mb-3" />
            <p className="text-surface-300 text-sm">No contractual notices registered.</p>
            <p className="text-xs text-surface-500 mt-2">
              Use the Register Notice button to add a new notice.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {noticesWithCountdown.map((notice) => (
            <Card key={notice.id} className="bg-surface-800/70 backdrop-blur border-surface-700/50">
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4">
                  {/* Notice Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className={STATUS_CONFIG[notice.status].color}>
                        {STATUS_CONFIG[notice.status].label}
                      </Badge>
                      <span className="text-xs text-surface-400">
                        Clause {notice.referenceClause}
                      </span>
                      {notice.remainingDays !== null && (
                        <Badge variant="outline" className={getUrgencyBadge(notice.remainingDays)?.className}>
                          {getUrgencyBadge(notice.remainingDays)?.label}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm font-medium text-white truncate">{notice.subject}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-surface-400">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        Issued: {notice.dateIssued}
                      </span>
                      {notice.deadline && (
                        <span className={`flex items-center gap-1 ${getUrgencyColor(notice.remainingDays)}`}>
                          <Clock className="w-3 h-3" />
                          Deadline: {notice.deadline}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <FileText className="w-3 h-3" />
                        {notice.linkedDocumentIds.length} doc{notice.linkedDocumentIds.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  {canWrite && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {notice.status === 'issued' && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleAcknowledge(notice.id)}
                            disabled={actionLoading === notice.id}
                            className="text-purple-400 hover:text-purple-300 text-xs"
                            title="Acknowledge"
                          >
                            {actionLoading === notice.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRespond(notice.id)}
                            disabled={actionLoading === notice.id}
                            className="text-green-400 hover:text-green-300 text-xs"
                            title="Respond"
                          >
                            <Send className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleWithdraw(notice.id)}
                            disabled={actionLoading === notice.id}
                            className="text-red-400 hover:text-red-300 text-xs"
                            title="Withdraw"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                          </Button>
                        </>
                      )}
                      {notice.status === 'acknowledged' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRespond(notice.id)}
                          disabled={actionLoading === notice.id}
                          className="text-green-400 hover:text-green-300 text-xs"
                          title="Respond"
                        >
                          <Send className="w-3.5 h-3.5 mr-1" /> Respond
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
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Registration Form
// ══════════════════════════════════════════════════════════════════════════════

interface NoticeRegistrationFormProps {
  projectId: string;
  userId: string;
  config: ContractConfig | null;
  onSubmit: (input: NoticeRegistrationInput) => Promise<void>;
  onCancel: () => void;
}

function NoticeRegistrationForm({ projectId, userId, config, onSubmit, onCancel }: NoticeRegistrationFormProps) {
  const [noticeType, setNoticeType] = useState('');
  const [issuingPartyId, setIssuingPartyId] = useState('');
  const [receivingPartyId, setReceivingPartyId] = useState('');
  const [referenceClause, setReferenceClause] = useState('');
  const [dateIssued, setDateIssued] = useState(new Date().toISOString().split('T')[0]);
  const [subject, setSubject] = useState('');
  const [linkedDocumentIds, setLinkedDocumentIds] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const noticeTypes = useMemo(() => {
    if (!config) return [];
    return getNoticeTypesForForm(config.contractForm);
  }, [config]);

  const parties = config?.parties ?? [];

  const handleSubmit = async () => {
    const validationErrors: string[] = [];
    if (!noticeType) validationErrors.push('Notice type is required');
    if (!issuingPartyId) validationErrors.push('Issuing party is required');
    if (!receivingPartyId) validationErrors.push('Receiving party is required');
    if (!referenceClause) validationErrors.push('Clause reference is required');
    if (!dateIssued) validationErrors.push('Date issued is required');
    if (!subject.trim()) validationErrors.push('Subject is required');
    if (subject.length > 500) validationErrors.push('Subject must be 500 characters or fewer');

    const docIds = linkedDocumentIds.split(',').map((s) => s.trim()).filter(Boolean);
    if (docIds.length > 20) validationErrors.push('Maximum 20 linked documents allowed');

    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    setSubmitting(true);
    setErrors([]);
    try {
      await onSubmit({
        projectId,
        noticeType,
        issuingPartyId,
        receivingPartyId,
        referenceClause,
        dateIssued,
        subject: subject.trim(),
        linkedDocumentIds: docIds,
        registeredBy: userId,
      });
    } catch {
      setErrors(['Failed to register notice. Please try again.']);
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

      {/* Notice Type */}
      <div>
        <label className="text-xs text-surface-400 uppercase tracking-wider block mb-1">Notice Type</label>
        <select
          value={noticeType}
          onChange={(e) => setNoticeType(e.target.value)}
          className="w-full h-9 rounded-md border border-surface-600 bg-surface-900 text-sm text-white px-3"
        >
          <option value="">Select notice type...</option>
          {noticeTypes.map((nt) => (
            <option key={nt.id} value={nt.id}>{nt.name}</option>
          ))}
        </select>
      </div>

      {/* Issuing / Receiving Party */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-surface-400 uppercase tracking-wider block mb-1">Issuing Party</label>
          <select
            value={issuingPartyId}
            onChange={(e) => setIssuingPartyId(e.target.value)}
            className="w-full h-9 rounded-md border border-surface-600 bg-surface-900 text-sm text-white px-3"
          >
            <option value="">Select...</option>
            {parties.map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.role})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-surface-400 uppercase tracking-wider block mb-1">Receiving Party</label>
          <select
            value={receivingPartyId}
            onChange={(e) => setReceivingPartyId(e.target.value)}
            className="w-full h-9 rounded-md border border-surface-600 bg-surface-900 text-sm text-white px-3"
          >
            <option value="">Select...</option>
            {parties.map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.role})</option>
            ))}
          </select>
        </div>
      </div>

      {/* Clause Reference + Date */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-surface-400 uppercase tracking-wider block mb-1">Clause Reference</label>
          <Input
            value={referenceClause}
            onChange={(e) => setReferenceClause(e.target.value)}
            placeholder="e.g. 23.1"
            className="bg-surface-900 border-surface-600 text-white"
          />
        </div>
        <div>
          <label className="text-xs text-surface-400 uppercase tracking-wider block mb-1">Date Issued</label>
          <Input
            type="date"
            value={dateIssued}
            onChange={(e) => setDateIssued(e.target.value)}
            className="bg-surface-900 border-surface-600 text-white"
          />
        </div>
      </div>

      {/* Subject */}
      <div>
        <label className="text-xs text-surface-400 uppercase tracking-wider block mb-1">
          Subject <span className="text-surface-500">({subject.length}/500)</span>
        </label>
        <textarea
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={500}
          rows={3}
          className="w-full rounded-md border border-surface-600 bg-surface-900 text-sm text-white px-3 py-2 resize-none"
          placeholder="Brief description of the notice..."
        />
      </div>

      {/* Linked Documents */}
      <div>
        <label className="text-xs text-surface-400 uppercase tracking-wider block mb-1">
          Linked Document IDs <span className="text-surface-500">(comma-separated, max 20)</span>
        </label>
        <Input
          value={linkedDocumentIds}
          onChange={(e) => setLinkedDocumentIds(e.target.value)}
          placeholder="doc-001, doc-002"
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
          Register Notice
        </Button>
      </div>
    </div>
  );
}

export default NoticeRegister;
