/**
 * PracticeInvoiceBuilder — Invoice creation workflow for practice management.
 *
 * Supports type selection (lump_sum, time_based, disbursement), timesheet/expense
 * linking, and amount calculation before creating a draft invoice.
 *
 * Renders inside the AppShell 3-column grid using CSS token classes.
 * Follows the Hero → Stat Row → Panels content pattern.
 *
 * Requirements: 7.1, 7.2, 7.4, 15.1, 15.2
 * @module practiceManagement/PracticeInvoiceBuilder
 */

import { useState, useMemo } from 'react';
import { FileText, Plus, Link, Calculator } from 'lucide-react';
import type { UserProfile } from '@/types';
import type {
  PracticeInvoiceType,
  SacapWorkStage,
  PracticeTimesheetEntry,
  ExpenseClaim,
} from '@/services/practiceManagement/types';
import { SACAP_STAGE_LABELS, SACAP_WORK_STAGES } from '@/services/practiceManagement/types';

// ─── Props ───────────────────────────────────────────────────────────────────

interface PracticeInvoiceBuilderProps {
  user: UserProfile;
  projectId?: string;
  projectName?: string;
  approvedTimesheets?: PracticeTimesheetEntry[];
  approvedExpenses?: ExpenseClaim[];
  onCreateInvoice?: (data: InvoiceFormData) => void;
}

interface InvoiceFormData {
  invoiceType: PracticeInvoiceType;
  amountCents: number;
  vatCents: number;
  dueDate: string;
  sacapStage?: SacapWorkStage;
  description: string;
  clientName?: string;
  clientEmail?: string;
  timesheetEntryIds: string[];
  expenseClaimIds: string[];
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

const VAT_RATE = 0.15;

const INVOICE_TYPE_LABELS: Record<PracticeInvoiceType, string> = {
  lump_sum: 'Lump Sum',
  time_based: 'Time-Based',
  disbursement: 'Disbursement',
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function PracticeInvoiceBuilder({
  user,
  projectName = 'Project',
  approvedTimesheets = [],
  approvedExpenses = [],
  onCreateInvoice,
}: PracticeInvoiceBuilderProps) {
  const [invoiceType, setInvoiceType] = useState<PracticeInvoiceType>('lump_sum');
  const [amountCents, setAmountCents] = useState(0);
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [sacapStage, setSacapStage] = useState<SacapWorkStage | ''>('');
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [selectedTimesheets, setSelectedTimesheets] = useState<string[]>([]);
  const [selectedExpenses, setSelectedExpenses] = useState<string[]>([]);

  // Compute totals from linked entries
  const linkedTimesheetTotal = useMemo(() => {
    return approvedTimesheets
      .filter((t) => selectedTimesheets.includes(t.id))
      .reduce((sum, t) => sum + (t.hours ?? 0) * 100, 0); // simplified: hours * rate
  }, [approvedTimesheets, selectedTimesheets]);

  const linkedExpenseTotal = useMemo(() => {
    return approvedExpenses
      .filter((e) => selectedExpenses.includes(e.id))
      .reduce((sum, e) => sum + e.amountCents, 0);
  }, [approvedExpenses, selectedExpenses]);

  const calculatedAmount = useMemo(() => {
    if (invoiceType === 'time_based') return linkedTimesheetTotal;
    if (invoiceType === 'disbursement') return linkedExpenseTotal;
    return amountCents;
  }, [invoiceType, amountCents, linkedTimesheetTotal, linkedExpenseTotal]);

  const vatAmount = Math.round(calculatedAmount * VAT_RATE);
  const totalAmount = calculatedAmount + vatAmount;

  const toggleTimesheet = (id: string) => {
    setSelectedTimesheets((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const toggleExpense = (id: string) => {
    setSelectedExpenses((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleSubmit = () => {
    if (!onCreateInvoice) return;
    onCreateInvoice({
      invoiceType,
      amountCents: calculatedAmount,
      vatCents: vatAmount,
      dueDate,
      sacapStage: sacapStage || undefined,
      description,
      clientName: clientName || undefined,
      clientEmail: clientEmail || undefined,
      timesheetEntryIds: selectedTimesheets,
      expenseClaimIds: selectedExpenses,
    });
  };

  const isValid = description.trim() && dueDate && calculatedAmount > 0;

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Hero */}
      <div className="hero">
        <div className="hero-header">
          <div>
            <div className="eyebrow">INVOICE BUILDER</div>
            <h1>{projectName}</h1>
            <p className="sub">Create a new practice invoice</p>
          </div>
        </div>
        <div className="hero-pills">
          <span className="pill">
            <span className="dot"></span> Draft
          </span>
        </div>
      </div>

      {/* Stat Row — Calculated Totals */}
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--deep)' }}>
            {formatCents(calculatedAmount)}
          </div>
          <div className="stat-label">Amount (excl. VAT)</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--muted)' }}>
            {formatCents(vatAmount)}
          </div>
          <div className="stat-label">VAT (15%)</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--teal)' }}>
            {formatCents(totalAmount)}
          </div>
          <div className="stat-label">Total (incl. VAT)</div>
        </div>
      </div>

      {/* Invoice Type Selection */}
      <section className="panel">
        <h2>Invoice Type</h2>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          {(['lump_sum', 'time_based', 'disbursement'] as PracticeInvoiceType[]).map(
            (type) => (
              <button
                key={type}
                className={invoiceType === type ? 'btn' : 'btn btn-secondary'}
                onClick={() => setInvoiceType(type)}
                style={{ fontSize: 12 }}
              >
                {INVOICE_TYPE_LABELS[type]}
              </button>
            ),
          )}
        </div>
      </section>

      {/* Invoice Details Form */}
      <section className="panel">
        <h2>Invoice Details</h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 12,
            marginTop: 10,
          }}
        >
          <div>
            <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
              Description *
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Invoice description"
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                fontSize: 13,
                color: 'var(--ink)',
                background: 'rgba(255,255,255,.7)',
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
              Due Date *
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                fontSize: 13,
                color: 'var(--ink)',
                background: 'rgba(255,255,255,.7)',
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
              SACAP Stage
            </label>
            <select
              value={sacapStage}
              onChange={(e) => setSacapStage(e.target.value as SacapWorkStage | '')}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                fontSize: 13,
                color: 'var(--ink)',
                background: 'rgba(255,255,255,.7)',
              }}
            >
              <option value="">Select stage (optional)</option>
              {SACAP_WORK_STAGES.map((s) => (
                <option key={s} value={s}>
                  {SACAP_STAGE_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          {invoiceType === 'lump_sum' && (
            <div>
              <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
                Amount (ZAR) *
              </label>
              <input
                type="number"
                value={amountCents / 100 || ''}
                onChange={(e) => setAmountCents(Math.round(parseFloat(e.target.value || '0') * 100))}
                placeholder="0.00"
                min={0}
                step={0.01}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  fontSize: 13,
                  color: 'var(--ink)',
                  background: 'rgba(255,255,255,.7)',
                }}
              />
            </div>
          )}
          <div>
            <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
              Client Name
            </label>
            <input
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Client name"
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                fontSize: 13,
                color: 'var(--ink)',
                background: 'rgba(255,255,255,.7)',
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
              Client Email
            </label>
            <input
              type="email"
              value={clientEmail}
              onChange={(e) => setClientEmail(e.target.value)}
              placeholder="client@example.com"
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                fontSize: 13,
                color: 'var(--ink)',
                background: 'rgba(255,255,255,.7)',
              }}
            />
          </div>
        </div>
      </section>

      {/* Timesheet Linking (for time_based type) */}
      {invoiceType === 'time_based' && (
        <section className="panel">
          <h2>
            <Link size={14} style={{ marginRight: 6, color: 'var(--teal)' }} />
            Link Approved Timesheets
          </h2>
          {approvedTimesheets.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
              No approved timesheet entries available for linking.
            </p>
          ) : (
            <table className="table" style={{ marginTop: 8 }}>
              <thead>
                <tr>
                  <th style={{ width: 32 }}></th>
                  <th>Date</th>
                  <th>Activity</th>
                  <th style={{ textAlign: 'right' }}>Hours</th>
                </tr>
              </thead>
              <tbody>
                {approvedTimesheets.slice(0, 20).map((entry) => (
                  <tr key={entry.id} onClick={() => toggleTimesheet(entry.id)} style={{ cursor: 'pointer' }}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedTimesheets.includes(entry.id)}
                        onChange={() => toggleTimesheet(entry.id)}
                        style={{ accentColor: 'var(--teal)' }}
                      />
                    </td>
                    <td style={{ fontSize: 11, fontFamily: 'monospace' }}>{entry.date}</td>
                    <td style={{ fontSize: 12 }}>{entry.activity}</td>
                    <td style={{ textAlign: 'right', fontSize: 11, fontFamily: 'monospace' }}>
                      {entry.hours?.toFixed(1) ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {/* Expense Linking (for disbursement type) */}
      {invoiceType === 'disbursement' && (
        <section className="panel">
          <h2>
            <Link size={14} style={{ marginRight: 6, color: 'var(--teal)' }} />
            Link Approved Expenses
          </h2>
          {approvedExpenses.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
              No approved expense claims available for linking.
            </p>
          ) : (
            <table className="table" style={{ marginTop: 8 }}>
              <thead>
                <tr>
                  <th style={{ width: 32 }}></th>
                  <th>Date</th>
                  <th>Description</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {approvedExpenses.slice(0, 20).map((expense) => (
                  <tr key={expense.id} onClick={() => toggleExpense(expense.id)} style={{ cursor: 'pointer' }}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedExpenses.includes(expense.id)}
                        onChange={() => toggleExpense(expense.id)}
                        style={{ accentColor: 'var(--teal)' }}
                      />
                    </td>
                    <td style={{ fontSize: 11, fontFamily: 'monospace' }}>{expense.date}</td>
                    <td style={{ fontSize: 12 }}>{expense.description}</td>
                    <td style={{ textAlign: 'right', fontSize: 11, fontFamily: 'monospace' }}>
                      {formatCents(expense.amountCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {/* Create Button */}
      <section className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            <Calculator size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
            Total: {formatCents(totalAmount)} (incl. VAT)
          </div>
          <button
            className="btn"
            onClick={handleSubmit}
            disabled={!isValid}
            style={{ opacity: isValid ? 1 : 0.5 }}
          >
            <Plus size={14} style={{ marginRight: 4 }} />
            Create Draft Invoice
          </button>
        </div>
      </section>
    </div>
  );
}
