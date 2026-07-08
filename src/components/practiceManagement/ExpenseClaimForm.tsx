// ExpenseClaimForm — Expense claim submission form
// Requirements: 2.1, 2.2, 2.3, 2.4, 15.5

import React, { useState } from 'react';
import { Receipt, Upload, Send } from 'lucide-react';
import type { UserProfile } from '@/types';
import type { ExpenseCategory, ExpenseType } from '@/services/practiceManagement/types';

export interface ExpenseClaimFormProps {
  user: UserProfile;
  projectId?: string;
}

interface FormState {
  description: string;
  amountRands: string;
  date: string;
  projectId: string;
  category: ExpenseCategory | '';
  expenseType: ExpenseType;
  receiptFile: File | null;
}

const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: 'travel', label: 'Travel' },
  { value: 'printing', label: 'Printing' },
  { value: 'courier', label: 'Courier' },
  { value: 'accommodation', label: 'Accommodation' },
  { value: 'meals', label: 'Meals' },
  { value: 'other', label: 'Other' },
];

const EXPENSE_TYPES: { value: ExpenseType; label: string }[] = [
  { value: 'reimbursable', label: 'Reimbursable (paid back to staff)' },
  { value: 'disbursement', label: 'Disbursement (recoverable from client)' },
];

const INITIAL_FORM: FormState = {
  description: '',
  amountRands: '',
  date: new Date().toISOString().split('T')[0],
  projectId: '',
  category: '',
  expenseType: 'reimbursable',
  receiptFile: null,
};

/**
 * ExpenseClaimForm — Expense claim submission for staff members.
 * Captures description, amount, date, project, category, type, and receipt upload.
 * Renders inside AppShell content area using CSS token classes.
 */
export function ExpenseClaimForm({ user, projectId }: ExpenseClaimFormProps) {
  const [form, setForm] = useState<FormState>({
    ...INITIAL_FORM,
    projectId: projectId || '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function updateField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  }

  function validate(): boolean {
    const fieldErrors: Partial<Record<keyof FormState, string>> = {};

    if (!form.description.trim()) {
      fieldErrors.description = 'Description is required';
    } else if (form.description.length > 500) {
      fieldErrors.description = 'Description must be 500 characters or fewer';
    }

    const amount = parseFloat(form.amountRands);
    if (!form.amountRands || isNaN(amount) || amount <= 0) {
      fieldErrors.amountRands = 'Amount must be a positive number';
    }

    if (!form.date) {
      fieldErrors.date = 'Date is required';
    }

    if (!form.projectId.trim()) {
      fieldErrors.projectId = 'Project is required';
    }

    if (!form.category) {
      fieldErrors.category = 'Category is required';
    }

    setErrors(fieldErrors);
    return Object.keys(fieldErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      // In production, this would call the expense manager service
      // await expenseManagerService.createExpenseClaim({ ... });
      // For now, simulate submission
      await new Promise((resolve) => setTimeout(resolve, 600));
      setSubmitted(true);
      setForm({ ...INITIAL_FORM, projectId: projectId || '' });
    } catch {
      setErrors({ description: 'Failed to submit claim. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] || null;
    updateField('receiptFile', file);
  }

  const hasErrors = Object.keys(errors).length > 0;

  if (submitted) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <section className="panel" style={{ textAlign: 'center', padding: 40 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: 'rgba(74,222,128,.12)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 14,
            }}
          >
            <Receipt size={22} style={{ color: 'var(--green)' }} />
          </div>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
            Expense Claim Submitted
          </h2>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 18 }}>
            Your claim has been submitted for approval. You'll be notified once it's reviewed.
          </p>
          <button className="btn" onClick={() => setSubmitted(false)}>
            Submit Another Claim
          </button>
        </section>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Hero */}
      <div className="hero">
        <div className="hero-header">
          <div>
            <div className="eyebrow">EXPENSES</div>
            <h1>New Expense Claim</h1>
            <p className="sub">Submit project-related expenses for approval</p>
          </div>
        </div>
        <div className="hero-pills">
          <span className="pill">
            <span className="dot"></span> {user.displayName}
          </span>
        </div>
      </div>

      {/* Expense Form */}
      <section className="panel">
        <h2
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '.5px',
            color: 'var(--deep)',
            margin: '0 0 16px 0',
          }}
        >
          Claim Details
        </h2>

        <form onSubmit={handleSubmit}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 14,
            }}
          >
            {/* Description */}
            <div style={{ gridColumn: '1 / -1' }}>
              <FieldGroup label="Description" error={errors.description}>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => updateField('description', e.target.value)}
                  placeholder="e.g. Site visit to Sandton project — parking + tolls"
                  style={inputStyle(!!errors.description)}
                  aria-invalid={!!errors.description}
                  maxLength={500}
                />
              </FieldGroup>
            </div>

            {/* Amount */}
            <FieldGroup label="Amount (ZAR)" error={errors.amountRands}>
              <input
                type="number"
                value={form.amountRands}
                onChange={(e) => updateField('amountRands', e.target.value)}
                placeholder="0.00"
                style={inputStyle(!!errors.amountRands)}
                aria-invalid={!!errors.amountRands}
                min="0.01"
                step="0.01"
              />
            </FieldGroup>

            {/* Date */}
            <FieldGroup label="Date" error={errors.date}>
              <input
                type="date"
                value={form.date}
                onChange={(e) => updateField('date', e.target.value)}
                style={inputStyle(!!errors.date)}
                aria-invalid={!!errors.date}
              />
            </FieldGroup>

            {/* Project */}
            <FieldGroup label="Project" error={errors.projectId}>
              <input
                type="text"
                value={form.projectId}
                onChange={(e) => updateField('projectId', e.target.value)}
                placeholder="Project reference or ID"
                style={inputStyle(!!errors.projectId)}
                aria-invalid={!!errors.projectId}
              />
            </FieldGroup>

            {/* Category */}
            <FieldGroup label="Category" error={errors.category}>
              <select
                value={form.category}
                onChange={(e) => updateField('category', e.target.value as ExpenseCategory | '')}
                style={inputStyle(!!errors.category)}
                aria-invalid={!!errors.category}
              >
                <option value="">— Select category —</option>
                {EXPENSE_CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </FieldGroup>

            {/* Expense Type */}
            <FieldGroup label="Type">
              <select
                value={form.expenseType}
                onChange={(e) => updateField('expenseType', e.target.value as ExpenseType)}
                style={inputStyle(false)}
              >
                {EXPENSE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </FieldGroup>

            {/* Receipt Upload */}
            <div style={{ gridColumn: '1 / -1' }}>
              <FieldGroup label="Receipt (optional)">
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 14px',
                    border: '1px dashed var(--border)',
                    borderRadius: 8,
                    cursor: 'pointer',
                    background: 'rgba(255,255,255,.5)',
                    transition: 'border-color .15s',
                  }}
                >
                  <Upload size={16} style={{ color: 'var(--teal)' }} aria-hidden="true" />
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                    {form.receiptFile ? form.receiptFile.name : 'Click to upload receipt (PDF, JPG, PNG)'}
                  </span>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                  />
                </label>
              </FieldGroup>
            </div>
          </div>

          {/* Submit */}
          <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              type="submit"
              className="btn"
              disabled={submitting || hasErrors}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                opacity: submitting ? 0.6 : 1,
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              <Send size={14} aria-hidden="true" />
              {submitting ? 'Submitting...' : 'Submit for Approval'}
            </button>
            {hasErrors && (
              <span style={{ fontSize: 12, color: 'var(--red)' }}>
                Please correct the highlighted fields.
              </span>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

interface FieldGroupProps {
  label: string;
  error?: string;
  children: React.ReactNode;
}

function FieldGroup({ label, error, children }: FieldGroupProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--muted)',
          textTransform: 'uppercase',
          letterSpacing: '.3px',
        }}
      >
        {label}
      </label>
      {children}
      {error && (
        <span style={{ fontSize: 11, color: 'var(--red)', lineHeight: 1.3 }} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

function inputStyle(hasError: boolean): React.CSSProperties {
  return {
    width: '100%',
    height: 36,
    padding: '0 12px',
    fontSize: 13,
    fontFamily: 'var(--font)',
    color: 'var(--ink)',
    background: hasError ? 'rgba(217,87,71,.03)' : 'rgba(255,255,255,.7)',
    border: `1px solid ${hasError ? 'rgba(217,87,71,.4)' : 'var(--border)'}`,
    borderRadius: 8,
    outline: 'none',
    transition: 'border-color .15s',
  };
}

export default ExpenseClaimForm;
