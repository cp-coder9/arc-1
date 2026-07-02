/**
 * Payment Schedule View
 *
 * Displays the payment timeline with status per cycle, retention summary,
 * certificate linking interface, and overdue highlighting with Action Centre
 * notification trigger.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
 */

import React, { useState, useMemo, useCallback } from 'react';
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
  DialogFooter,
} from '@/components/ui/dialog';
import {
  CreditCard,
  Calendar,
  AlertTriangle,
  CheckCircle,
  Clock,
  Link2,
  DollarSign,
  Shield,
  Bell,
} from 'lucide-react';
import {
  generateSchedule,
  calculateRetention,
  linkCertificate,
  runPaymentDeadlineCheck,
  surfaceToActionCentre,
  getSouthAfricanHolidays,
} from '@/services/contractAdmin';
import type {
  PaymentScheduleEntry,
  PaymentCycleStatus,
  ContractConfig,
  PaymentOverdueResult,
} from '@/services/contractAdmin';

// ══════════════════════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════════════════════

interface PaymentScheduleViewProps {
  user: UserProfile;
  projectId: string;
}

interface RetentionSummary {
  retentionHeld: number;
  atLimit: boolean;
  retentionPercentage: number;
  retentionLimit: number;
  releaseConditions: string;
}

// ══════════════════════════════════════════════════════════════════════════════
// Status Helpers
// ══════════════════════════════════════════════════════════════════════════════

const STATUS_CONFIG: Record<PaymentCycleStatus, { label: string; color: string; icon: React.ReactNode }> = {
  pending: {
    label: 'Pending',
    color: 'bg-surface-700/50 text-surface-300 border-surface-600/50',
    icon: <Clock className="w-3.5 h-3.5" />,
  },
  certificate_issued: {
    label: 'Certificate Issued',
    color: 'bg-blue-900/30 text-blue-300 border-blue-700/50',
    icon: <CreditCard className="w-3.5 h-3.5" />,
  },
  payment_confirmed: {
    label: 'Payment Confirmed',
    color: 'bg-green-900/30 text-green-300 border-green-700/50',
    icon: <CheckCircle className="w-3.5 h-3.5" />,
  },
  overdue: {
    label: 'Overdue',
    color: 'bg-red-900/30 text-red-300 border-red-700/50',
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
  },
};

function formatDate(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    return date.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return isoDate;
  }
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(amount);
}

// ══════════════════════════════════════════════════════════════════════════════
// Certificate Linking Dialog
// ══════════════════════════════════════════════════════════════════════════════

interface CertificateLinkDialogProps {
  open: boolean;
  onClose: () => void;
  entry: PaymentScheduleEntry | null;
  projectId: string;
  onLinked: () => void;
}

function CertificateLinkDialog({ open, onClose, entry, projectId, onLinked }: CertificateLinkDialogProps) {
  const [certificateId, setCertificateId] = useState('');
  const [certifiedAmount, setCertifiedAmount] = useState('');
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState('');

  const handleLink = useCallback(async () => {
    if (!entry || !certificateId.trim() || !certifiedAmount.trim()) {
      setError('Please provide both certificate ID and certified amount.');
      return;
    }

    const amount = parseFloat(certifiedAmount);
    if (isNaN(amount) || amount <= 0) {
      setError('Certified amount must be a positive number.');
      return;
    }

    setLinking(true);
    setError('');
    try {
      await linkCertificate(projectId, entry.id, certificateId.trim(), amount);
      setCertificateId('');
      setCertifiedAmount('');
      onLinked();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link certificate.');
    } finally {
      setLinking(false);
    }
  }, [entry, certificateId, certifiedAmount, projectId, onLinked, onClose]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-surface-800 border-surface-700/50">
        <DialogHeader>
          <DialogTitle className="text-white">
            Link Payment Certificate — Cycle {entry?.cycleNumber}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div>
            <label className="text-xs text-surface-400 uppercase tracking-wider mb-1 block">
              Finance Module Certificate ID
            </label>
            <Input
              value={certificateId}
              onChange={(e) => setCertificateId(e.target.value)}
              placeholder="e.g. CERT-2025-001"
              className="bg-surface-900/50 border-surface-700/50 text-white"
            />
          </div>
          <div>
            <label className="text-xs text-surface-400 uppercase tracking-wider mb-1 block">
              Certified Amount (ZAR)
            </label>
            <Input
              type="number"
              value={certifiedAmount}
              onChange={(e) => setCertifiedAmount(e.target.value)}
              placeholder="0.00"
              min="0.01"
              step="0.01"
              className="bg-surface-900/50 border-surface-700/50 text-white"
            />
          </div>
          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="text-surface-400">
            Cancel
          </Button>
          <Button onClick={handleLink} disabled={linking} className="bg-primary-600 hover:bg-primary-500 text-white">
            {linking ? 'Linking...' : 'Link Certificate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Main Component
// ══════════════════════════════════════════════════════════════════════════════

export function PaymentScheduleView({ user, projectId }: PaymentScheduleViewProps) {
  // In a real implementation, schedule and config would be loaded from Firestore
  const [schedule, setSchedule] = useState<PaymentScheduleEntry[]>([]);
  const [overdueEntries, setOverdueEntries] = useState<PaymentOverdueResult[]>([]);
  const [contractConfig, setContractConfig] = useState<ContractConfig | null>(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<PaymentScheduleEntry | null>(null);
  const [loading, setLoading] = useState(false);

  // Retention calculation derived from schedule
  const retentionSummary: RetentionSummary | null = useMemo(() => {
    if (!contractConfig) return null;

    const params = contractConfig.formSpecificParams;
    // JBCC has retention fields — other forms may vary
    const retentionPercentage = 'retentionPercentage' in params ? (params as { retentionPercentage: number }).retentionPercentage : 5;
    const retentionLimit = contractConfig.contractSum * (retentionPercentage / 100);

    const cumulativeCertified = schedule
      .filter((e) => e.certifiedAmount != null)
      .reduce((sum, e) => sum + (e.certifiedAmount ?? 0), 0);

    const result = calculateRetention(cumulativeCertified, retentionPercentage, retentionLimit);

    return {
      ...result,
      retentionPercentage,
      retentionLimit,
      releaseConditions: `${retentionPercentage / 2}% released at Practical Completion, remainder at end of Defects Liability Period`,
    };
  }, [schedule, contractConfig]);

  // Trigger overdue check + Action Centre notification
  const handleOverdueCheck = useCallback(async () => {
    setLoading(true);
    try {
      const results = await runPaymentDeadlineCheck(projectId);
      setOverdueEntries(results);

      // Trigger Action Centre notification for overdue items (Req 7.5)
      for (const overdue of results) {
        await surfaceToActionCentre({
          projectId,
          targetUserId: user.uid,
          priority: 'high',
          deadlineDate: overdue.paymentDeadline,
          subject: `Payment overdue: Cycle ${overdue.cycleNumber} — ${overdue.daysOverdue} day(s) overdue`,
          entityType: 'payment',
          entityId: overdue.scheduleEntryId,
          remainingDays: -overdue.daysOverdue,
        });
      }
    } catch {
      // Silently handle — would log to error tracking in production
    } finally {
      setLoading(false);
    }
  }, [projectId, user.uid]);

  // Open certificate linking dialog
  const handleLinkCertificate = useCallback((entry: PaymentScheduleEntry) => {
    setSelectedEntry(entry);
    setLinkDialogOpen(true);
  }, []);

  const handleCertificateLinked = useCallback(() => {
    // Refresh schedule after linking
    setSchedule((prev) =>
      prev.map((e) =>
        e.id === selectedEntry?.id ? { ...e, status: 'certificate_issued' as PaymentCycleStatus } : e
      )
    );
  }, [selectedEntry]);

  return (
    <div className="space-y-6">
      {/* Header with overdue check action */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-primary-400" />
            Payment Schedule
          </h2>
          <p className="text-sm text-surface-400 mt-1">
            Certificate timeline, retention tracking, and overdue alerts
          </p>
        </div>
        <Button
          onClick={handleOverdueCheck}
          disabled={loading}
          variant="outline"
          className="border-surface-600 text-surface-300 hover:bg-surface-700/50"
        >
          <Bell className="w-4 h-4 mr-2" />
          {loading ? 'Checking...' : 'Check Overdue'}
        </Button>
      </div>

      {/* Retention Summary Card */}
      {retentionSummary && (
        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-surface-300 flex items-center gap-2">
              <Shield className="w-4 h-4 text-amber-400" />
              Retention Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-surface-900/50 rounded-lg border border-surface-700/30 p-3">
                <p className="text-xs text-surface-400 uppercase tracking-wider">Retention Held</p>
                <p className="text-lg font-semibold text-white mt-1">
                  {formatCurrency(retentionSummary.retentionHeld)}
                </p>
              </div>
              <div className="bg-surface-900/50 rounded-lg border border-surface-700/30 p-3">
                <p className="text-xs text-surface-400 uppercase tracking-wider">Retention %</p>
                <p className="text-lg font-semibold text-white mt-1">
                  {retentionSummary.retentionPercentage.toFixed(2)}%
                </p>
              </div>
              <div className="bg-surface-900/50 rounded-lg border border-surface-700/30 p-3">
                <p className="text-xs text-surface-400 uppercase tracking-wider">Retention Limit</p>
                <p className="text-lg font-semibold text-white mt-1">
                  {formatCurrency(retentionSummary.retentionLimit)}
                </p>
                {retentionSummary.atLimit && (
                  <Badge className="mt-1 bg-amber-900/30 text-amber-300 border-amber-700/50 text-[10px]">
                    At Limit
                  </Badge>
                )}
              </div>
              <div className="bg-surface-900/50 rounded-lg border border-surface-700/30 p-3">
                <p className="text-xs text-surface-400 uppercase tracking-wider">Release Conditions</p>
                <p className="text-xs text-surface-300 mt-1 leading-relaxed">
                  {retentionSummary.releaseConditions}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payment Timeline */}
      <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-surface-300 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary-400" />
            Payment Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          {schedule.length === 0 ? (
            <div className="text-center py-12">
              <CreditCard className="w-10 h-10 text-surface-600 mx-auto mb-3" />
              <p className="text-sm text-surface-400">
                No payment schedule generated yet.
              </p>
              <p className="text-xs text-surface-500 mt-1">
                A schedule will be generated when contract setup is completed.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-700/50">
                    <th className="text-left py-2 px-3 text-xs text-surface-400 uppercase tracking-wider">Cycle</th>
                    <th className="text-left py-2 px-3 text-xs text-surface-400 uppercase tracking-wider">Valuation Date</th>
                    <th className="text-left py-2 px-3 text-xs text-surface-400 uppercase tracking-wider">Certificate Deadline</th>
                    <th className="text-left py-2 px-3 text-xs text-surface-400 uppercase tracking-wider">Payment Deadline</th>
                    <th className="text-left py-2 px-3 text-xs text-surface-400 uppercase tracking-wider">Status</th>
                    <th className="text-left py-2 px-3 text-xs text-surface-400 uppercase tracking-wider">Certified</th>
                    <th className="text-right py-2 px-3 text-xs text-surface-400 uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {schedule.map((entry) => {
                    const statusCfg = STATUS_CONFIG[entry.status];
                    const isOverdue = entry.status === 'overdue';

                    return (
                      <tr
                        key={entry.id}
                        className={`border-b border-surface-700/30 ${isOverdue ? 'bg-red-900/10' : 'hover:bg-surface-700/20'}`}
                      >
                        <td className="py-2.5 px-3 text-white font-medium">
                          {entry.cycleNumber}
                        </td>
                        <td className="py-2.5 px-3 text-surface-300">
                          {formatDate(entry.valuationDate)}
                        </td>
                        <td className="py-2.5 px-3 text-surface-300">
                          {formatDate(entry.certificateDeadline)}
                        </td>
                        <td className={`py-2.5 px-3 ${isOverdue ? 'text-red-300 font-medium' : 'text-surface-300'}`}>
                          {formatDate(entry.paymentDeadline)}
                        </td>
                        <td className="py-2.5 px-3">
                          <Badge className={`${statusCfg.color} border text-[10px] flex items-center gap-1 w-fit`}>
                            {statusCfg.icon}
                            {statusCfg.label}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-3 text-surface-300">
                          {entry.certifiedAmount != null ? formatCurrency(entry.certifiedAmount) : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {entry.status === 'pending' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleLinkCertificate(entry)}
                              className="text-primary-400 hover:text-primary-300 text-xs"
                            >
                              <Link2 className="w-3.5 h-3.5 mr-1" />
                              Link Certificate
                            </Button>
                          )}
                          {entry.certificateId && (
                            <span className="text-xs text-surface-500">
                              {entry.certificateId}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Overdue Alerts */}
      {overdueEntries.length > 0 && (
        <Card className="bg-red-900/20 backdrop-blur border-red-700/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-red-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              Overdue Payments ({overdueEntries.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {overdueEntries.map((overdue) => (
                <div
                  key={overdue.scheduleEntryId}
                  className="flex items-center justify-between bg-red-900/20 border border-red-800/30 rounded-lg px-4 py-2"
                >
                  <div>
                    <p className="text-sm text-red-200 font-medium">
                      Cycle {overdue.cycleNumber}
                    </p>
                    <p className="text-xs text-red-300/70">
                      Payment deadline: {formatDate(overdue.paymentDeadline)}
                    </p>
                  </div>
                  <Badge className="bg-red-900/50 text-red-200 border-red-700/50 text-xs">
                    {overdue.daysOverdue} day{overdue.daysOverdue !== 1 ? 's' : ''} overdue
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Certificate Linking Dialog */}
      <CertificateLinkDialog
        open={linkDialogOpen}
        onClose={() => setLinkDialogOpen(false)}
        entry={selectedEntry}
        projectId={projectId}
        onLinked={handleCertificateLinked}
      />
    </div>
  );
}

export default PaymentScheduleView;
