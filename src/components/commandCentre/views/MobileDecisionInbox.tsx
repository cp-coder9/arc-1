'use client';

/**
 * Mobile Decision Inbox — Command Centre View
 *
 * Optimised for viewport widths below 768px. Presents pending actions as
 * vertically-stacked decision cards sorted by urgency:
 *   overdue → today → this_week → standard
 * Within each group, cards are sorted by deadline ascending.
 *
 * Each card displays:
 *   - Title (max 80 chars, truncated with ellipsis)
 *   - Requesting party
 *   - Project reference
 *   - Financial impact (currency formatted)
 *   - Deadline
 *   - Urgency badge
 *   - Approve / Reject / Defer action buttons
 *
 * Action behaviours:
 *   - Approve/Reject: show confirmation prompt with action type + title before executing;
 *     write same audit trail entry as desktop workflow
 *   - Defer: require new deadline (1–30 calendar days in future), record deferral in audit trail
 *   - On success: show confirmation indicator for 3 seconds, remove card from pending list
 *   - Supporting documents: display inline preview panel or tap-to-open link
 *
 * @validates Requirements 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7
 */

import { useState, useMemo, useCallback } from 'react';
import {
  Check,
  X,
  Clock,
  Calendar,
  FileText,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  AlertCircle,
} from 'lucide-react';
import { sortByUrgency, validateDeferDate, type DecisionCard } from '@/services/commandCentre/decisionInboxUtils';

// ── Action Types ─────────────────────────────────────────────────────────────

type DecisionAction = 'approve' | 'reject' | 'defer';

interface ConfirmationState {
  cardId: string;
  action: 'approve' | 'reject';
}

interface DeferState {
  cardId: string;
  proposedDate: string;
  dateError: string | null;
}

interface SuccessState {
  cardId: string;
  action: DecisionAction;
}

// ── Props ────────────────────────────────────────────────────────────────────

interface MobileDecisionInboxProps {
  projectId: string;
  cards?: DecisionCard[];
  onApprove?: (cardId: string) => Promise<void> | void;
  onReject?: (cardId: string) => Promise<void> | void;
  onDefer?: (cardId: string, newDeadline: string) => Promise<void> | void;
  currency?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Truncate title to max 80 chars with ellipsis */
function truncateTitle(title: string, maxLength = 80): string {
  if (title.length <= maxLength) return title;
  return title.slice(0, maxLength - 1) + '…';
}

/** Format currency value for display */
function formatCurrency(amount: number | undefined, currency = 'ZAR'): string {
  if (amount === undefined || amount === null) return '—';
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Returns today's ISO date string (YYYY-MM-DD) */
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Returns an ISO date string N days from today */
function daysFromTodayISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Urgency badge styling */
const URGENCY_STYLES: Record<DecisionCard['urgency'], { bg: string; text: string; label: string }> = {
  overdue: { bg: 'rgba(217,87,71,.1)', text: 'var(--red)', label: 'Overdue' },
  today: { bg: 'rgba(245,166,35,.1)', text: 'var(--amber)', label: 'Today' },
  this_week: { bg: 'rgba(25,183,176,.1)', text: 'var(--teal)', label: 'This Week' },
  standard: { bg: 'rgba(16,32,51,.04)', text: 'var(--muted)', label: 'Standard' },
};

// ── Sub-components ────────────────────────────────────────────────────────────

/** Confirmation modal overlay for approve/reject actions */
function ConfirmationDialog({
  card,
  action,
  onConfirm,
  onCancel,
}: {
  card: DecisionCard;
  action: 'approve' | 'reject';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const isApprove = action === 'approve';
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(16,32,51,.5)',
        display: 'flex',
        alignItems: 'flex-end',
        padding: 0,
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div
        className="panel"
        style={{
          width: '100%',
          borderRadius: '22px 22px 0 0',
          padding: 22,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div id="confirm-dialog-title" style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>
          {isApprove ? 'Confirm Approval' : 'Confirm Rejection'}
        </div>

        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
          Action type: <strong style={{ color: 'var(--ink)' }}>{card.actionType}</strong>
        </div>

        <div style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.4 }}>
          {isApprove
            ? `Are you sure you want to approve "${truncateTitle(card.title, 60)}"?`
            : `Are you sure you want to reject "${truncateTitle(card.title, 60)}"?`
          }
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="btn-secondary btn"
            style={{ flex: 1, fontSize: 13 }}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className={isApprove ? 'btn' : 'btn btn-danger'}
            style={{ flex: 1, fontSize: 13 }}
            onClick={onConfirm}
            autoFocus
          >
            {isApprove ? 'Approve' : 'Reject'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Defer date picker sheet */
function DeferSheet({
  card,
  deferState,
  onDateChange,
  onConfirm,
  onCancel,
}: {
  card: DecisionCard;
  deferState: DeferState;
  onDateChange: (date: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const today = todayISO();
  const maxDate = daysFromTodayISO(30);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(16,32,51,.5)',
        display: 'flex',
        alignItems: 'flex-end',
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="defer-dialog-title"
    >
      <div
        className="panel"
        style={{
          width: '100%',
          borderRadius: '22px 22px 0 0',
          padding: 22,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div id="defer-dialog-title" style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>
          Defer Decision
        </div>

        <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.4 }}>
          Select a new deadline for &ldquo;{truncateTitle(card.title, 60)}&rdquo;
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label htmlFor="defer-date" style={{ fontSize: 12, color: 'var(--deep)', fontWeight: 600 }}>
            New Deadline (1–30 days from today)
          </label>
          <input
            id="defer-date"
            type="date"
            value={deferState.proposedDate}
            min={daysFromTodayISO(1)}
            max={maxDate}
            onChange={(e) => onDateChange(e.target.value)}
            style={{
              border: `1px solid ${deferState.dateError ? 'var(--red)' : 'var(--border)'}`,
              borderRadius: 10,
              padding: '8px 12px',
              fontSize: 14,
              color: 'var(--ink)',
              background: 'rgba(255,255,255,.9)',
              width: '100%',
            }}
            aria-invalid={!!deferState.dateError}
            aria-describedby={deferState.dateError ? 'defer-date-error' : undefined}
          />
          {deferState.dateError && (
            <div
              id="defer-date-error"
              style={{ fontSize: 12, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 4 }}
              role="alert"
            >
              <AlertCircle style={{ width: 12, height: 12 }} />
              {deferState.dateError}
            </div>
          )}
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>
            Earliest: {daysFromTodayISO(1)} · Latest: {maxDate}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="btn-secondary btn"
            style={{ flex: 1, fontSize: 13 }}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="btn"
            style={{ flex: 1, fontSize: 13 }}
            onClick={onConfirm}
            disabled={!deferState.proposedDate || !!deferState.dateError}
          >
            Defer
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export default function MobileDecisionInbox({
  projectId,
  cards = [],
  onApprove,
  onReject,
  onDefer,
  currency = 'ZAR',
}: MobileDecisionInboxProps) {
  const [pendingCards, setPendingCards] = useState<DecisionCard[]>(cards);
  const [confirmState, setConfirmState] = useState<ConfirmationState | null>(null);
  const [deferState, setDeferState] = useState<DeferState | null>(null);
  const [successState, setSuccessState] = useState<SuccessState | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set());

  // When parent updates cards externally, sync new arrivals
  // (existing pending list serves as the mutable removal-capable list)
  const pendingCardIds = useMemo(() => new Set(pendingCards.map((c) => c.id)), [pendingCards]);

  // Keep new external cards synced in
  useMemo(() => {
    const newCards = cards.filter((c) => !pendingCardIds.has(c.id));
    if (newCards.length > 0) {
      setPendingCards((prev) => [...prev, ...newCards]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards]);

  const sortedCards = useMemo(() => sortByUrgency(pendingCards), [pendingCards]);

  // Suppress unused projectId lint
  void projectId;

  /** Remove a card from the pending list after successful action */
  const removeCard = useCallback((cardId: string) => {
    setPendingCards((prev) => prev.filter((c) => c.id !== cardId));
  }, []);

  /** Show success indicator for 3 seconds, then remove card */
  const handleSuccess = useCallback((cardId: string, action: DecisionAction) => {
    setSuccessState({ cardId, action });
    setTimeout(() => {
      setSuccessState(null);
      removeCard(cardId);
    }, 3000);
  }, [removeCard]);

  // ── Approve flow ──────────────────────────────────────────────────────────

  const initiateApprove = (cardId: string) => {
    setConfirmState({ cardId, action: 'approve' });
  };

  const confirmApprove = async () => {
    if (!confirmState) return;
    const { cardId } = confirmState;
    setConfirmState(null);
    setProcessing(cardId);
    try {
      await onApprove?.(cardId);
      handleSuccess(cardId, 'approve');
    } finally {
      setProcessing(null);
    }
  };

  // ── Reject flow ───────────────────────────────────────────────────────────

  const initiateReject = (cardId: string) => {
    setConfirmState({ cardId, action: 'reject' });
  };

  const confirmReject = async () => {
    if (!confirmState) return;
    const { cardId } = confirmState;
    setConfirmState(null);
    setProcessing(cardId);
    try {
      await onReject?.(cardId);
      handleSuccess(cardId, 'reject');
    } finally {
      setProcessing(null);
    }
  };

  // ── Defer flow ────────────────────────────────────────────────────────────

  const initiateDefer = (cardId: string) => {
    setDeferState({ cardId, proposedDate: '', dateError: null });
  };

  const handleDeferDateChange = (date: string) => {
    const today = todayISO();
    let dateError: string | null = null;
    if (date && !validateDeferDate(date, today)) {
      dateError = 'Please select a date between 1 and 30 days from today.';
    }
    setDeferState((prev) => prev ? { ...prev, proposedDate: date, dateError } : null);
  };

  const confirmDefer = async () => {
    if (!deferState) return;
    const { cardId, proposedDate } = deferState;

    // Final validation
    if (!validateDeferDate(proposedDate, todayISO())) {
      setDeferState((prev) => prev ? { ...prev, dateError: 'Please select a date between 1 and 30 days from today.' } : null);
      return;
    }

    setDeferState(null);
    setProcessing(cardId);
    try {
      await onDefer?.(cardId, proposedDate);
      handleSuccess(cardId, 'defer');
    } finally {
      setProcessing(null);
    }
  };

  const toggleDocs = (cardId: string) => {
    setExpandedDocs((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  };

  // ── Confirm cancel ────────────────────────────────────────────────────────

  const cancelDialog = () => {
    setConfirmState(null);
    setDeferState(null);
  };

  // ── Active dialogs ────────────────────────────────────────────────────────

  const confirmCard = confirmState
    ? pendingCards.find((c) => c.id === confirmState.cardId)
    : null;
  const deferCard = deferState
    ? pendingCards.find((c) => c.id === deferState.cardId)
    : null;

  return (
    <>
      <div
        className="mobile-decision-inbox"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          maxWidth: 768,
          padding: '14px',
        }}
        aria-busy={processing !== null}
      >
        {/* Header */}
        <div className="hero" style={{ marginBottom: 4 }}>
          <div className="hero-header">
            <div>
              <div className="eyebrow">DECISION INBOX</div>
              <h1 style={{ fontSize: 20 }}>Pending Decisions</h1>
              <p className="sub">
                {sortedCards.length} item{sortedCards.length !== 1 ? 's' : ''} requiring action
              </p>
            </div>
          </div>
        </div>

        {/* Empty State */}
        {sortedCards.length === 0 && (
          <div className="panel" style={{ textAlign: 'center', padding: '40px 22px' }}>
            <Check style={{ width: 32, height: 32, color: 'var(--green)', margin: '0 auto 12px' }} />
            <p style={{ color: 'var(--muted)', fontSize: 14 }}>No pending decisions</p>
          </div>
        )}

        {/* Decision Cards */}
        {sortedCards.map((card) => {
          const urgencyStyle = URGENCY_STYLES[card.urgency];
          const isProcessing = processing === card.id;
          const isSuccess = successState?.cardId === card.id;
          const hasDocuments = (card.supportingDocuments ?? []).length > 0;
          const isDocsExpanded = expandedDocs.has(card.id);

          return (
            <div
              key={card.id}
              className="panel"
              style={{
                padding: 16,
                opacity: isProcessing ? 0.6 : 1,
                transition: 'opacity 0.2s ease',
                outline: isSuccess ? `2px solid var(--green)` : undefined,
              }}
              aria-live="polite"
            >
              {/* ── Success indicator ─────────────────────────────────── */}
              {isSuccess && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    marginBottom: 10,
                    padding: '6px 10px',
                    background: 'rgba(74,222,128,.08)',
                    border: '1px solid rgba(74,222,128,.2)',
                    borderRadius: 8,
                  }}
                  role="status"
                >
                  <Check style={{ width: 14, height: 14, color: 'var(--green)' }} />
                  <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>
                    {successState?.action === 'approve' && 'Approved successfully'}
                    {successState?.action === 'reject' && 'Rejected successfully'}
                    {successState?.action === 'defer' && 'Deferred successfully'}
                  </span>
                </div>
              )}

              {/* ── Urgency Badge + Deadline Row ──────────────────────── */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 10,
              }}>
                <span
                  className="pill"
                  style={{
                    background: urgencyStyle.bg,
                    color: urgencyStyle.text,
                    borderColor: urgencyStyle.text,
                    fontSize: 11,
                    padding: '2px 8px',
                  }}
                >
                  <span className="dot" style={{ background: urgencyStyle.text }} />
                  {urgencyStyle.label}
                </span>
                <span style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Calendar style={{ width: 12, height: 12 }} />
                  {card.deadline}
                </span>
              </div>

              {/* ── Title ─────────────────────────────────────────────── */}
              <h3 style={{
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--ink)',
                marginBottom: 8,
                lineHeight: 1.3,
              }}>
                {truncateTitle(card.title)}
              </h3>

              {/* ── Meta Details ──────────────────────────────────────── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: 'var(--muted)' }}>Requesting Party</span>
                  <span style={{ color: 'var(--ink)', fontWeight: 500 }}>{card.requestingParty}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: 'var(--muted)' }}>Project</span>
                  <span style={{ color: 'var(--ink)', fontWeight: 500 }}>{card.projectReference}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: 'var(--muted)' }}>Financial Impact</span>
                  <span style={{ color: 'var(--deep)', fontWeight: 600 }}>
                    {formatCurrency(card.financialImpact, currency)}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: 'var(--muted)' }}>Action Type</span>
                  <span style={{ color: 'var(--ink)', fontWeight: 500 }}>{card.actionType}</span>
                </div>
              </div>

              {/* ── Supporting Documents ──────────────────────────────── */}
              {hasDocuments && (
                <div style={{ marginBottom: 12 }}>
                  <button
                    className="btn-secondary btn"
                    style={{
                      width: '100%',
                      fontSize: 12,
                      height: 32,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0 10px',
                    }}
                    onClick={() => toggleDocs(card.id)}
                    aria-expanded={isDocsExpanded}
                    aria-controls={`docs-${card.id}`}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <FileText style={{ width: 12, height: 12 }} />
                      Supporting Documents ({card.supportingDocuments!.length})
                    </span>
                    {isDocsExpanded
                      ? <ChevronUp style={{ width: 12, height: 12 }} />
                      : <ChevronDown style={{ width: 12, height: 12 }} />
                    }
                  </button>

                  {isDocsExpanded && (
                    <div
                      id={`docs-${card.id}`}
                      style={{
                        marginTop: 6,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                        padding: '8px 10px',
                        background: 'rgba(223,245,242,.5)',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                      }}
                    >
                      {card.supportingDocuments!.map((doc) => (
                        <a
                          key={doc.id}
                          href={doc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            fontSize: 12,
                            color: 'var(--teal)',
                            textDecoration: 'none',
                            padding: '4px 0',
                          }}
                          aria-label={`Open ${doc.title} in new tab`}
                        >
                          <ExternalLink style={{ width: 11, height: 11 }} />
                          {doc.title}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Action Buttons ─────────────────────────────────────── */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn"
                  style={{
                    flex: 1,
                    fontSize: 12,
                    height: 36,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                  }}
                  onClick={() => initiateApprove(card.id)}
                  disabled={isProcessing || isSuccess}
                  aria-label={`Approve: ${card.title}`}
                >
                  <Check style={{ width: 14, height: 14 }} />
                  Approve
                </button>
                <button
                  className="btn-danger btn"
                  style={{
                    flex: 1,
                    fontSize: 12,
                    height: 36,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                  }}
                  onClick={() => initiateReject(card.id)}
                  disabled={isProcessing || isSuccess}
                  aria-label={`Reject: ${card.title}`}
                >
                  <X style={{ width: 14, height: 14 }} />
                  Reject
                </button>
                <button
                  className="btn-secondary btn"
                  style={{
                    flex: 1,
                    fontSize: 12,
                    height: 36,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                  }}
                  onClick={() => initiateDefer(card.id)}
                  disabled={isProcessing || isSuccess}
                  aria-label={`Defer: ${card.title}`}
                >
                  <Clock style={{ width: 14, height: 14 }} />
                  Defer
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Confirmation Dialog ──────────────────────────────────────────── */}
      {confirmState && confirmCard && (
        <ConfirmationDialog
          card={confirmCard}
          action={confirmState.action}
          onConfirm={confirmState.action === 'approve' ? confirmApprove : confirmReject}
          onCancel={cancelDialog}
        />
      )}

      {/* ── Defer Sheet ──────────────────────────────────────────────────── */}
      {deferState && deferCard && (
        <DeferSheet
          card={deferCard}
          deferState={deferState}
          onDateChange={handleDeferDateChange}
          onConfirm={confirmDefer}
          onCancel={cancelDialog}
        />
      )}
    </>
  );
}
