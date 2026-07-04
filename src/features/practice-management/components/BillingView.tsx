/**
 * BillingView — Invoice generation and billing management for Practice Management (P2.9)
 *
 * Features:
 * - Invoice generation UI with project selection
 * - Draft preview with line items by category/staff
 * - VAT calculation at 15%
 * - Approve invoice action
 * - Billing model display (hourly, fixed_fee, percentage_of_construction)
 *
 * Validates: Requirements 10.6, 11.6
 */

import React, { useState, useMemo } from 'react';
import {
  Receipt,
  FileText,
  CheckCircle2,
  AlertTriangle,
  DollarSign,
  Clock,
  CalendarDays,
  Eye,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type {
  Invoice,
  InvoiceLineItem,
  BillingModel,
  PracticeProject,
  TimesheetEntry,
  Disbursement,
  ChargeOutRates,
} from '../types';
import {
  compileDraftInvoice,
  approveInvoice,
  type DraftInvoice,
  type InvoiceConfig,
} from '../services/billingBridge';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface BillingViewProps {
  firmId: string;
  projects?: PracticeProject[];
  invoices?: Invoice[];
  timesheetEntries?: TimesheetEntry[];
  disbursements?: Disbursement[];
  rates?: ChargeOutRates[];
  onInvoiceApproved?: (invoice: Invoice) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BillingView({
  firmId,
  projects = [],
  invoices = [],
  timesheetEntries = [],
  disbursements = [],
  rates = [],
  onInvoiceApproved,
}: BillingViewProps) {
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [groupBy, setGroupBy] = useState<'activity_category' | 'staff_member'>('activity_category');
  const [currentDraft, setCurrentDraft] = useState<DraftInvoice | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [showDraftPreview, setShowDraftPreview] = useState(false);

  // Derive active projects for the selector
  const activeProjects = useMemo(
    () => projects.filter(p => p.firmId === firmId && p.status === 'active'),
    [projects, firmId]
  );

  // Summary statistics
  const stats = useMemo(() => {
    const firmInvoices = invoices.filter(i => i.firmId === firmId);
    const totalInvoiced = firmInvoices.reduce((sum, inv) => sum + inv.totalZAR, 0);
    const draftCount = firmInvoices.filter(i => i.status === 'draft').length;
    const approvedCount = firmInvoices.filter(i => i.status === 'approved' || i.status === 'sent').length;
    const paidCount = firmInvoices.filter(i => i.status === 'paid').length;
    return { totalInvoiced, draftCount, approvedCount, paidCount, total: firmInvoices.length };
  }, [invoices, firmId]);

  // Generate draft invoice
  const handleGenerateDraft = () => {
    if (!selectedProjectId) {
      setDraftError('Please select a project.');
      return;
    }

    const project = activeProjects.find(p => p.id === selectedProjectId);
    if (!project) {
      setDraftError('Selected project not found.');
      return;
    }

    const config: InvoiceConfig = {
      projectId: selectedProjectId,
      groupBy,
      billingModel: project.billingModel,
      rates,
      totalFeeZAR: project.totalFeeZAR,
    };

    const result = compileDraftInvoice(timesheetEntries, disbursements, config);
    if (result.success) {
      setCurrentDraft(result.data);
      setDraftError(null);
      setShowDraftPreview(true);
    } else {
      setDraftError(result.error.message);
      setCurrentDraft(null);
      setShowDraftPreview(false);
    }
  };

  // Approve the draft invoice
  const handleApproveDraft = () => {
    if (!currentDraft) return;

    const result = approveInvoice(
      currentDraft,
      { uid: 'current-user', displayName: 'Current User' },
      new Date()
    );

    if (result.success) {
      onInvoiceApproved?.(result.data.invoice);
      setCurrentDraft(null);
      setShowDraftPreview(false);
      setSelectedProjectId('');
    }
  };

  return (
    <div className="space-y-6" data-testid="billing-view">
      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<DollarSign className="h-5 w-5 text-green-400" />}
          label="Total Invoiced"
          value={formatCurrency(stats.totalInvoiced)}
        />
        <StatCard
          icon={<FileText className="h-5 w-5 text-amber-400" />}
          label="Draft Invoices"
          value={String(stats.draftCount)}
        />
        <StatCard
          icon={<CheckCircle2 className="h-5 w-5 text-blue-400" />}
          label="Approved / Sent"
          value={String(stats.approvedCount)}
        />
        <StatCard
          icon={<Receipt className="h-5 w-5 text-emerald-400" />}
          label="Paid"
          value={String(stats.paidCount)}
        />
      </div>

      {/* Invoice Generation Panel */}
      <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            Generate Invoice
          </CardTitle>
          <CardDescription>
            Select a project and generate a draft invoice from approved timesheets and disbursements.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Project Selector */}
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                Project
              </label>
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-800/50 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                aria-label="Select project for invoicing"
              >
                <option value="">Select a project...</option>
                {activeProjects.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.clientName} — {p.projectDescription.slice(0, 40)}
                  </option>
                ))}
              </select>
            </div>

            {/* Group By Selector */}
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                Group Line Items By
              </label>
              <select
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value as 'activity_category' | 'staff_member')}
                className="w-full rounded-lg border border-border bg-surface-800/50 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                aria-label="Group line items by"
              >
                <option value="activity_category">Activity Category</option>
                <option value="staff_member">Staff Member</option>
              </select>
            </div>

            {/* Generate Button */}
            <div className="flex items-end">
              <Button
                onClick={handleGenerateDraft}
                className="w-full"
                disabled={!selectedProjectId}
              >
                <Eye className="h-4 w-4 mr-2" />
                Preview Draft Invoice
              </Button>
            </div>
          </div>

          {draftError && (
            <div className="flex items-center gap-2 text-sm text-amber-400 bg-amber-400/10 rounded-lg px-3 py-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {draftError}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Draft Preview */}
      {showDraftPreview && currentDraft && (
        <Card className="rounded-2xl border-border bg-card/90 shadow-sm border-primary/30">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Draft Invoice Preview
              </CardTitle>
              <Badge variant="secondary" className="uppercase">
                {formatBillingModel(currentDraft.billingModel)}
              </Badge>
            </div>
            <CardDescription>
              Review line items, totals, and VAT before approving.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Line Items Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm" role="table">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="pb-2 pr-4">Description</th>
                    <th className="pb-2 pr-4 text-right">Hours</th>
                    <th className="pb-2 pr-4 text-right">Rate (R)</th>
                    <th className="pb-2 text-right">Amount (R)</th>
                  </tr>
                </thead>
                <tbody>
                  {currentDraft.lineItems.map((item, idx) => (
                    <tr key={idx} className="border-b border-border/50">
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-2">
                          {item.description}
                          <Badge variant="outline" className="text-[10px] px-1">
                            {item.category}
                          </Badge>
                        </div>
                      </td>
                      <td className="py-2 pr-4 text-right text-muted-foreground">
                        {item.hours ? item.hours.toFixed(2) : '—'}
                      </td>
                      <td className="py-2 pr-4 text-right text-muted-foreground">
                        {item.rate ? formatCurrency(item.rate) : '—'}
                      </td>
                      <td className="py-2 text-right font-medium">
                        {formatCurrency(item.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="border-t border-border pt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatCurrency(currentDraft.subtotalZAR)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">VAT (15%)</span>
                <span>{formatCurrency(currentDraft.vatZAR)}</span>
              </div>
              <div className="flex justify-between text-base font-bold border-t border-border pt-2">
                <span>Total</span>
                <span className="text-primary">{formatCurrency(currentDraft.totalZAR)}</span>
              </div>
            </div>

            {/* Approve Action */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowDraftPreview(false);
                  setCurrentDraft(null);
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleApproveDraft}>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Approve Invoice
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Invoices */}
      <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            Recent Invoices
          </CardTitle>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No invoices generated yet. Select a project above to create your first invoice.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" role="table">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="pb-2 pr-4">Invoice #</th>
                    <th className="pb-2 pr-4">Project</th>
                    <th className="pb-2 pr-4">Model</th>
                    <th className="pb-2 pr-4 text-right">Total</th>
                    <th className="pb-2">Status</th>
                    <th className="pb-2">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.slice(0, 10).map(inv => (
                    <tr key={inv.id} className="border-b border-border/50">
                      <td className="py-2 pr-4 font-mono text-xs">{inv.invoiceNumber}</td>
                      <td className="py-2 pr-4">{inv.projectId}</td>
                      <td className="py-2 pr-4">
                        <Badge variant="outline" className="text-[10px]">
                          {formatBillingModel(inv.billingModel)}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4 text-right font-medium">
                        {formatCurrency(inv.totalZAR)}
                      </td>
                      <td className="py-2">
                        <InvoiceStatusBadge status={inv.status} />
                      </td>
                      <td className="py-2 text-muted-foreground text-xs">
                        {new Date(inv.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Sub-Components ───────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Card className="rounded-xl border-border bg-card/90 shadow-sm">
      <CardContent className="p-4 flex items-center gap-3">
        <div className="p-2 rounded-lg bg-surface-800/50">{icon}</div>
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="text-lg font-bold text-foreground">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function InvoiceStatusBadge({ status }: { status: Invoice['status'] }) {
  const variants: Record<Invoice['status'], { class: string; label: string }> = {
    draft: { class: 'bg-amber-400/10 text-amber-400 border-amber-400/30', label: 'Draft' },
    approved: { class: 'bg-blue-400/10 text-blue-400 border-blue-400/30', label: 'Approved' },
    sent: { class: 'bg-purple-400/10 text-purple-400 border-purple-400/30', label: 'Sent' },
    paid: { class: 'bg-green-400/10 text-green-400 border-green-400/30', label: 'Paid' },
  };
  const v = variants[status] || variants.draft;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium border ${v.class}`}>
      {v.label}
    </span>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  return `R ${amount.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatBillingModel(model: BillingModel): string {
  const labels: Record<BillingModel, string> = {
    hourly: 'Hourly',
    fixed_fee: 'Fixed Fee',
    percentage_of_construction: '% of Construction',
  };
  return labels[model] || model;
}
