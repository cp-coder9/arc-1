import React, { useState, useCallback } from 'react';
import type { CalendarSlot, CreateBookingRequest, MarketplaceErrorCode } from '../types';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface BookingRequestFormProps {
  listingId: string;
  resourceName: string;
  hourlyRate: number;
  availableApps: string[];
  selectedSlots: CalendarSlot[];
  minHours: number;
  maxHours: number;
  onSubmit: (request: CreateBookingRequest) => Promise<void>;
  onCancel: () => void;
}

// ─── Internal Types ───────────────────────────────────────────────────────────

interface FormData {
  intendedSoftware: string;
  projectReference: string;
  messageToOwner: string;
}

interface FormError {
  code: MarketplaceErrorCode | 'VALIDATION_ERROR';
  message: string;
  field?: string;
}

type FormView = 'form' | 'confirmation';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeTimeRange(slots: CalendarSlot[]): { start: string; end: string } {
  if (slots.length === 0) return { start: '', end: '' };

  const sorted = [...slots].sort((a, b) => {
    const dateComp = a.date.localeCompare(b.date);
    if (dateComp !== 0) return dateComp;
    return a.startHour - b.startHour;
  });

  const firstSlot = sorted[0];
  const lastSlot = sorted[sorted.length - 1];

  const startDate = new Date(`${firstSlot.date}T${String(firstSlot.startHour).padStart(2, '0')}:00:00`);
  const endDate = new Date(`${lastSlot.date}T${String(lastSlot.endHour).padStart(2, '0')}:00:00`);

  return {
    start: startDate.toISOString(),
    end: endDate.toISOString(),
  };
}

function formatDateTime(iso: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return date.toLocaleString('en-ZA', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatCurrency(amount: number): string {
  return `R ${amount.toLocaleString('en-ZA')}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BookingRequestForm({
  listingId,
  resourceName,
  hourlyRate,
  availableApps,
  selectedSlots,
  minHours,
  maxHours,
  onSubmit,
  onCancel,
}: BookingRequestFormProps) {
  const [view, setView] = useState<FormView>('form');
  const [formData, setFormData] = useState<FormData>({
    intendedSoftware: availableApps.length > 0 ? availableApps[0] : '',
    projectReference: '',
    messageToOwner: '',
  });
  const [error, setError] = useState<FormError | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Computed values
  const durationHours = selectedSlots.length;
  const estimatedCost = hourlyRate * durationHours;
  const { start: startsAt, end: endsAt } = computeTimeRange(selectedSlots);

  // ─── Validation ───────────────────────────────────────────────────────────────

  const validate = useCallback((): FormError | null => {
    if (!formData.intendedSoftware) {
      return {
        code: 'VALIDATION_ERROR',
        message: 'Please select the software you intend to use.',
        field: 'intendedSoftware',
      };
    }

    if (durationHours < minHours) {
      return {
        code: 'BOOKING_DURATION_INVALID',
        message: `Minimum booking duration is ${minHours} hour${minHours > 1 ? 's' : ''}.`,
        field: 'duration',
      };
    }

    if (durationHours > maxHours) {
      return {
        code: 'BOOKING_DURATION_INVALID',
        message: `Maximum booking duration is ${maxHours} hours.`,
        field: 'duration',
      };
    }

    if (formData.messageToOwner.length > 500) {
      return {
        code: 'VALIDATION_ERROR',
        message: 'Message must be 500 characters or less.',
        field: 'messageToOwner',
      };
    }

    return null;
  }, [formData, durationHours, minHours, maxHours]);

  // ─── Submit ───────────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      const validationError = validate();
      if (validationError) {
        setError(validationError);
        return;
      }

      setIsSubmitting(true);

      const request: CreateBookingRequest = {
        listingId,
        startsAt,
        endsAt,
        intendedSoftware: formData.intendedSoftware,
        ...(formData.projectReference.trim() && {
          projectReference: formData.projectReference.trim(),
        }),
        ...(formData.messageToOwner.trim() && {
          messageToOwner: formData.messageToOwner.trim(),
        }),
      };

      try {
        await onSubmit(request);
        setView('confirmation');
      } catch (err: unknown) {
        // Preserve form data on error — do NOT clear fields
        const message =
          err instanceof Error ? err.message : 'An unexpected error occurred.';

        // Try to extract error code from message
        let code: MarketplaceErrorCode | 'VALIDATION_ERROR' = 'VALIDATION_ERROR';
        if (message.includes('conflict') || message.includes('BOOKING_CONFLICT')) {
          code = 'BOOKING_CONFLICT';
        } else if (message.includes('unverified') || message.includes('CONSUMER_UNVERIFIED')) {
          code = 'BOOKING_CONSUMER_UNVERIFIED';
        } else if (message.includes('duration') || message.includes('DURATION_INVALID')) {
          code = 'BOOKING_DURATION_INVALID';
        }

        setError({ code, message });
      } finally {
        setIsSubmitting(false);
      }
    },
    [validate, listingId, startsAt, endsAt, formData, onSubmit]
  );

  // ─── Render: Confirmation View ────────────────────────────────────────────────

  if (view === 'confirmation') {
    return (
      <section className="panel" style={styles.container}>
        <h2 style={styles.heading}>Booking Requested</h2>

        <div style={styles.confirmationContent}>
          <div style={styles.summaryRow}>
            <span style={styles.summaryLabel}>Resource</span>
            <span style={styles.summaryValue}>{resourceName}</span>
          </div>
          <div style={styles.summaryRow}>
            <span style={styles.summaryLabel}>Time Slot</span>
            <span style={styles.summaryValue}>
              {formatDateTime(startsAt)} → {formatDateTime(endsAt)}
            </span>
          </div>
          <div style={styles.summaryRow}>
            <span style={styles.summaryLabel}>Estimated Cost</span>
            <span style={styles.summaryValue}>{formatCurrency(estimatedCost)}</span>
          </div>
          <div style={styles.summaryRow}>
            <span style={styles.summaryLabel}>Status</span>
            <span className="pill" style={styles.statusPill}>
              <span className="dot"></span> Awaiting Owner Approval
            </span>
          </div>
          <div style={styles.summaryRow}>
            <span style={styles.summaryLabel}>Estimated Response</span>
            <span style={styles.summaryValue}>Within 24 hours</span>
          </div>
        </div>

        <button
          type="button"
          className="btn"
          onClick={onCancel}
          style={styles.doneButton}
        >
          Done
        </button>
      </section>
    );
  }

  // ─── Render: Form View ────────────────────────────────────────────────────────

  return (
    <section className="panel" style={styles.container}>
      <h2 style={styles.heading}>Book This Resource</h2>

      {/* Summary Section */}
      <div style={styles.summarySection}>
        <div style={styles.summaryRow}>
          <span style={styles.summaryLabel}>Resource</span>
          <span style={styles.summaryValue}>{resourceName}</span>
        </div>
        <div style={styles.summaryRow}>
          <span style={styles.summaryLabel}>Time</span>
          <span style={styles.summaryValue}>
            {formatDateTime(startsAt)} → {formatDateTime(endsAt)}
          </span>
        </div>
        <div style={styles.summaryRow}>
          <span style={styles.summaryLabel}>Duration</span>
          <span style={styles.summaryValue}>
            {durationHours} hour{durationHours !== 1 ? 's' : ''}
          </span>
        </div>
        <div style={styles.summaryRow}>
          <span style={styles.summaryLabel}>Estimated Cost</span>
          <span style={styles.summaryValueHighlight}>{formatCurrency(estimatedCost)}</span>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div style={styles.errorContainer} role="alert">
          <span style={styles.errorText}>{error.message}</span>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} style={styles.form}>
        {/* Intended Software */}
        <div style={styles.fieldGroup}>
          <label htmlFor="intended-software" style={styles.label}>
            Intended Software
          </label>
          <select
            id="intended-software"
            value={formData.intendedSoftware}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, intendedSoftware: e.target.value }))
            }
            style={{
              ...styles.input,
              ...(error?.field === 'intendedSoftware' ? styles.inputError : {}),
            }}
          >
            {availableApps.map((app) => (
              <option key={app} value={app}>
                {app}
              </option>
            ))}
          </select>
        </div>

        {/* Project Reference */}
        <div style={styles.fieldGroup}>
          <label htmlFor="project-reference" style={styles.label}>
            Project Reference
            <span style={styles.optionalTag}>(optional)</span>
          </label>
          <input
            id="project-reference"
            type="text"
            placeholder="Link to an existing project"
            value={formData.projectReference}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, projectReference: e.target.value }))
            }
            style={styles.input}
          />
        </div>

        {/* Message to Owner */}
        <div style={styles.fieldGroup}>
          <label htmlFor="message-to-owner" style={styles.label}>
            Message to Owner
            <span style={styles.optionalTag}>(optional)</span>
          </label>
          <textarea
            id="message-to-owner"
            placeholder="Introduce yourself, describe your project needs..."
            value={formData.messageToOwner}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, messageToOwner: e.target.value }))
            }
            maxLength={500}
            rows={4}
            style={{
              ...styles.input,
              ...styles.textarea,
              ...(error?.field === 'messageToOwner' ? styles.inputError : {}),
            }}
          />
          <span style={styles.charCounter}>
            {formData.messageToOwner.length}/500
          </span>
        </div>

        {/* Actions */}
        <div style={styles.actions}>
          <button
            type="button"
            className="btn"
            onClick={onCancel}
            style={styles.cancelButton}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn"
            disabled={isSubmitting}
            style={styles.submitButton}
          >
            {isSubmitting ? 'Submitting…' : 'Request Booking'}
          </button>
        </div>
      </form>
    </section>
  );
}

// ─── Styles (CSS token-based) ─────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 520,
    margin: '0 auto',
  },
  heading: {
    fontSize: 18,
    fontWeight: 600,
    color: 'var(--ink)',
    marginBottom: 16,
  },
  summarySection: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottom: '1px solid var(--border)',
  },
  summaryRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 0',
  },
  summaryLabel: {
    fontSize: 13,
    color: 'var(--muted)',
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--ink)',
  },
  summaryValueHighlight: {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--teal)',
  },
  statusPill: {
    fontSize: 12,
  },
  errorContainer: {
    padding: '10px 14px',
    borderRadius: 8,
    border: '1px solid var(--red)',
    background: 'rgba(217, 87, 71, 0.06)',
    marginBottom: 14,
  },
  errorText: {
    fontSize: 13,
    color: 'var(--red)',
  },
  form: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 14,
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--ink)',
  },
  optionalTag: {
    fontSize: 11,
    color: 'var(--muted)',
    marginLeft: 6,
    fontWeight: 400,
  },
  input: {
    width: '100%',
    padding: '8px 12px',
    fontSize: 13,
    color: 'var(--ink)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    outline: 'none',
    background: 'rgba(255,255,255,.7)',
    transition: 'border-color 0.15s ease',
  },
  inputError: {
    borderColor: 'var(--red)',
  },
  textarea: {
    resize: 'vertical' as const,
    minHeight: 80,
  },
  charCounter: {
    fontSize: 11,
    color: 'var(--muted)',
    textAlign: 'right' as const,
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 6,
  },
  cancelButton: {
    borderColor: 'var(--border)',
    background: 'rgba(255,255,255,.7)',
    color: 'var(--ink)',
  },
  submitButton: {
    opacity: 1,
  },
  doneButton: {
    marginTop: 16,
    width: '100%',
  },
  confirmationContent: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
    marginBottom: 8,
  },
};
