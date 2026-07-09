/**
 * PracticeInvoiceList — Invoice status tracking view for practice management.
 *
 * Displays all project invoices with status chips (draft, submitted, sent, paid,
 * overdue, write-off) and key financial details.
 *
 * Renders inside the AppShell 3-column grid using CSS token classes.
 * Follows the Hero → Stat Row → Panels content pattern.
 *
 * Requirements: 7.1, 7.2, 7.4, 15.1, 15.2
 * @module practiceManagement/PracticeInvoiceList
 */

import { useMemo } from 'react';
import { FileText, Clock, CheckCircle, AlertTriangle, XCircle, Send } from 'lucide-react';
import type { UserProfile } from '@/types';
import type {
  PracticeInvoice,
  PracticeInvoiceStatus,
  PracticeInvoiceType,
} from '@/services/practiceManagement/types';

// ─── Props ───────────────────────────────────────────────────────────────────

interface PracticeInvoiceListProps {
  user: UserProfile;
  projectId?: string;
  projectName?: string;
  invoices?: PracticeInvoice[];
  onUpdateStatus?: (invoiceId: string, status: PracticeInvoiceStatus) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const currency = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
});

function formatCents(cents: number): string {
  return currency.format(cents / 100);
}

const STATUS_CONFIG: Record<PracticeInvoiceStatus, { label: string; color: string; chipClass: string }> = {
  draft: { label: 'Draft', color: 'var(--muted)', chipClass: 'chip chip-draft' },
  submitted: { label: 'Submitted', color: 'var(--teal)', chipClass: 'chip chip-pending' },
  sent_to_client: { label: 'Sent', color: 'var(--deep)', chipClass: 'chip chip-approved' },
  paid: { label: 'Paid', color: 'var(--green)', chipClass: 'chip chip-approved' },
  overdue: { label: 'Overdue', color: 'var(--red)', chipClass: 'chip chip-rejected' },
  write_off: { label: 'Write-Off', color: 'var(--amber)', chipClass: 'chip chip-draft' },
};

const TYPE_LABELS: Record<PracticeInvoiceType, string> = {
  lump_sum: 'Lump Sum',
  time_based: 'Time-Based',
  disbursement: 'Disbursement',
};

function statusChip(status: PracticeInvoiceStatus) {
  const config = STATUS_CONFIG[status];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 11,
        fontWeight: 500,
        padding: '2px 8px',
        borderRadius: 999,
        color: config.color,
        background: `color-mix(in srgb, ${config.color} 10%, transparent)`,
        border: `1px solid color-mix(in srgb, ${config.color} 18%, transparent)`,
      }}
    >
      {config.label}
    </span>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function PracticeInvoiceList({
  user,
  projectName = 'Project',
  invoices = [],
  onUpdateStatus,
}: PracticeInvoiceListProps) {
  const summary = useMemo(() => {
    const totalInvoiced = invoices.reduce((sum, inv) => sum + inv.totalCents, 0);
    const totalPaid = invoices
      .filter((inv) => inv.status === 'paid')
      .reduce((sum, inv) => sum + inv.totalCents, 0);
    const totalOverdue = invoices
      .filter((inv) => inv.status === 'overdue')
      .reduce((sum, inv) => sum + inv.totalCents, 0);
    const overdueCount = invoices.filter((inv) => inv.status === 'overdue').length;
    return { totalInvoiced, totalPaid, totalOverdue, overdueCount };
  }, [invoices]);

  // ─── Empty State ─────────────────────────────────────────────────────────

  if (invoices.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <section className="panel" style={{ textAlign: 'center', padding: 40 }}>
          <FileText size={28} style={{ color: 'var(--muted)', marginBottom: 8 }} />
          <h2 style={{ color: 'var(--ink)', fontSize: 15, marginBottom: 6 }}>
            No Invoices
          </h2>
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>
            Practice invoices will appear here once created via the Invoice Builder.
          </p>
        </section>
      </div>
    );
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Hero */}
      <div className="hero">
        <div className="hero-header">
          <div>
            <div className="eyebrow">PRACTICE INVOICING</div>
            <h1>{projectName} — Invoices</h1>
            <p className="sub">
              {invoices.length} invoice{invoices.length !== 1 ? 's' : ''} · Tracking
              payment status
            </p>
          </div>
        </div>
        <div className="hero-pills">
          {summary.overdueCount > 0 && (
            <span
              className="pill"
              style={{
                color: 'var(--red)',
                background: 'rgba(217,87,71,.08)',
                borderColor: 'rgba(217,87,71,.18)',
              }}
            >
              <span className="dot" style={{ background: 'var(--red)' }}></span>{' '}
              {summary.overdueCount} Overdue
            </span>
          )}
          <span className="pill">
            <span className="dot"></span> {invoices.length} Invoices
          </span>
        </div>
      </div>

      {/* Stat Row */}
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--deep)' }}>
            {formatCents(summary.totalInvoiced)}
          </div>
          <div className="stat-label">Total Invoiced</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--green)' }}>
            {formatCents(summary.totalPaid)}
          </div>
          <div className="stat-label">Total Paid</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--red)' }}>
            {formatCents(summary.totalOverdue)}
          </div>
          <div className="stat-label">Total Overdue</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--teal)' }}>
            {formatCents(summary.totalInvoiced - summary.totalPaid)}
          </div>
          <div className="stat-label">Outstanding</div>
        </div>
      </div>

      {/* Invoice Table Panel */}
      <section className="panel">
        <h2>Invoice Register</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Invoice #</th>
              <th>Type</th>
              <th>Description</th>
              <th style={{ textAlign: 'right' }}>Amount</th>
              <th style={{ textAlign: 'right' }}>VAT</th>
              <th style={{ textAlign: 'right' }}>Total</th>
              <th>Due Date</th>
              <th style={{ textAlign: 'center' }}>Status</th>
              <th style={{ textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => (
              <tr key={invoice.id}>
                <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>
                  {invoice.invoiceNumber}
                </td>
                <td style={{ fontSize: 11 }}>
                  {TYPE_LABELS[invoice.invoiceType]}
                </td>
                <td style={{ fontSize: 12 }}>
                  {invoice.description}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 11 }}>
                  {formatCents(invoice.amountCents)}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 11 }}>
                  {formatCents(invoice.vatCents)}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 11, fontWeight: 600 }}>
                  {formatCents(invoice.totalCents)}
                </td>
                <td style={{ fontSize: 11, fontFamily: 'monospace' }}>
                  {invoice.dueDate}
                </td>
                <td style={{ textAlign: 'center' }}>
                  {statusChip(invoice.status)}
                </td>
                <td style={{ textAlign: 'center' }}>
                  {invoice.status === 'draft' && onUpdateStatus && (
                    <button
                      className="btn"
                      style={{ fontSize: 10, padding: '2px 8px', height: 24 }}
                      onClick={() => onUpdateStatus(invoice.id, 'submitted')}
                    >
                      <Send size={10} style={{ marginRight: 3 }} />
                      Submit
                    </button>
                  )}
                  {invoice.status === 'submitted' && onUpdateStatus && (
                    <button
                      className="btn"
                      style={{ fontSize: 10, padding: '2px 8px', height: 24 }}
                      onClick={() => onUpdateStatus(invoice.id, 'sent_to_client')}
                    >
                      <Send size={10} style={{ marginRight: 3 }} />
                      Send
                    </button>
                  )}
                  {invoice.status === 'sent_to_client' && onUpdateStatus && (
                    <button
                      className="btn"
                      style={{ fontSize: 10, padding: '2px 8px', height: 24 }}
                      onClick={() => onUpdateStatus(invoice.id, 'paid')}
                    >
                      <CheckCircle size={10} style={{ marginRight: 3 }} />
                      Mark Paid
                    </button>
                  )}
                  {(invoice.status === 'overdue' || invoice.status === 'sent_to_client') &&
                    onUpdateStatus && (
                      <button
                        className="btn btn-secondary"
                        style={{ fontSize: 10, padding: '2px 8px', height: 24, marginLeft: 4 }}
                        onClick={() => onUpdateStatus(invoice.id, 'write_off')}
                      >
                        <XCircle size={10} style={{ marginRight: 3 }} />
                        Write Off
                      </button>
                    )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
