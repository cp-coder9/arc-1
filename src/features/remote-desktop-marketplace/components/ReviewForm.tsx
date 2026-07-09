import React, { useState, useCallback } from 'react';
import type { CreateReviewRequest, ReviewTag } from '../types';
import { REVIEW_TAGS } from '../constants';
import { RatingStars } from './shared/RatingStars';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ReviewFormProps {
  bookingId: string;
  onSubmit: (review: CreateReviewRequest) => Promise<void>;
  onCancel: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const COMMENT_MIN = 10;
const COMMENT_MAX = 500;
const MAX_TAGS = 3;

// ─── Component ────────────────────────────────────────────────────────────────

export default function ReviewForm({ bookingId, onSubmit, onCancel }: ReviewFormProps) {
  const [rating, setRating] = useState<number>(0);
  const [comment, setComment] = useState('');
  const [selectedTags, setSelectedTags] = useState<ReviewTag[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // ─── Tag Toggle ───────────────────────────────────────────────────────────────

  const toggleTag = useCallback((tag: ReviewTag) => {
    setSelectedTags((prev) => {
      if (prev.includes(tag)) {
        return prev.filter((t) => t !== tag);
      }
      if (prev.length >= MAX_TAGS) return prev;
      return [...prev, tag];
    });
  }, []);

  // ─── Validation ───────────────────────────────────────────────────────────────

  const validate = useCallback((): string | null => {
    if (rating < 1 || rating > 5) {
      return 'Please select a rating (1-5 stars).';
    }

    if (comment.length > 0 && comment.length < COMMENT_MIN) {
      return `Comment must be at least ${COMMENT_MIN} characters.`;
    }

    if (comment.length > COMMENT_MAX) {
      return `Comment must not exceed ${COMMENT_MAX} characters.`;
    }

    return null;
  }, [rating, comment]);

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

      const review: CreateReviewRequest = {
        bookingId,
        rating: rating as 1 | 2 | 3 | 4 | 5,
        ...(comment.trim().length >= COMMENT_MIN && { comment: comment.trim() }),
        ...(selectedTags.length > 0 && { tags: selectedTags }),
      };

      try {
        await onSubmit(review);
        setSuccess(true);
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'An unexpected error occurred.';

        // Map known error codes
        if (message.includes('REVIEW_DUPLICATE') || message.includes('already exists')) {
          setError('A review already exists for this booking.');
        } else if (message.includes('REVIEW_INELIGIBLE') || message.includes('not eligible')) {
          setError('This booking is not eligible for a review.');
        } else {
          setError(message);
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [validate, bookingId, rating, comment, selectedTags, onSubmit]
  );

  // ─── Render: Success ──────────────────────────────────────────────────────────

  if (success) {
    return (
      <section className="panel" style={styles.container}>
        <div style={styles.successContent}>
          <div style={styles.successIcon}>✓</div>
          <h2 style={styles.successHeading}>Your review has been recorded</h2>
          <p style={styles.successSub}>Thank you for your feedback.</p>
          <button type="button" className="btn" onClick={onCancel} style={styles.doneButton}>
            Done
          </button>
        </div>
      </section>
    );
  }

  // ─── Render: Form ─────────────────────────────────────────────────────────────

  return (
    <section className="panel" style={styles.container}>
      <h2 style={styles.heading}>Leave a Review</h2>

      {/* Error */}
      {error && (
        <div style={styles.errorContainer} role="alert">
          <span style={styles.errorText}>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} style={styles.form}>
        {/* Rating */}
        <div style={styles.fieldGroup}>
          <label style={styles.label}>Rating</label>
          <RatingStars mode="input" value={rating} onChange={setRating} size={28} />
        </div>

        {/* Comment */}
        <div style={styles.fieldGroup}>
          <label htmlFor="review-comment" style={styles.label}>
            Comment
            <span style={styles.optionalTag}>(optional)</span>
          </label>
          <textarea
            id="review-comment"
            placeholder="Share your experience..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={COMMENT_MAX}
            rows={4}
            style={styles.textarea}
          />
          <div style={styles.counterRow}>
            {comment.length > 0 && comment.length < COMMENT_MIN && (
              <span style={styles.hintText}>min {COMMENT_MIN}</span>
            )}
            <span style={styles.charCounter}>
              {comment.length}/{COMMENT_MAX}
            </span>
          </div>
        </div>

        {/* Tags */}
        <div style={styles.fieldGroup}>
          <label style={styles.label}>
            Tags
            <span style={styles.optionalTag}>(optional, max {MAX_TAGS})</span>
          </label>
          <div style={styles.tagGrid}>
            {REVIEW_TAGS.map((tag) => {
              const isSelected = selectedTags.includes(tag.value);
              const isDisabled = !isSelected && selectedTags.length >= MAX_TAGS;
              return (
                <button
                  key={tag.value}
                  type="button"
                  className="pill"
                  onClick={() => toggleTag(tag.value)}
                  disabled={isDisabled}
                  style={{
                    ...styles.tagPill,
                    ...(isSelected ? styles.tagPillActive : {}),
                    ...(isDisabled ? styles.tagPillDisabled : {}),
                  }}
                  aria-pressed={isSelected}
                >
                  {tag.label}
                </button>
              );
            })}
          </div>
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
            disabled={isSubmitting || rating === 0}
            style={{
              ...styles.submitButton,
              ...(isSubmitting || rating === 0 ? styles.submitButtonDisabled : {}),
            }}
          >
            {isSubmitting ? 'Submitting…' : 'Submit Review'}
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
    gap: 16,
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
  textarea: {
    width: '100%',
    padding: '8px 12px',
    fontSize: 13,
    color: 'var(--ink)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    outline: 'none',
    background: 'rgba(255,255,255,.7)',
    resize: 'vertical' as const,
    minHeight: 80,
  },
  counterRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  hintText: {
    fontSize: 11,
    color: 'var(--amber)',
  },
  charCounter: {
    fontSize: 11,
    color: 'var(--muted)',
    marginLeft: 'auto',
  },
  tagGrid: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 8,
  },
  tagPill: {
    cursor: 'pointer',
    fontSize: 12,
    padding: '6px 12px',
    border: '1px solid var(--border)',
    background: 'rgba(255,255,255,.7)',
    color: 'var(--ink)',
    borderRadius: 999,
    transition: 'all 0.15s ease',
  },
  tagPillActive: {
    borderColor: 'var(--teal)',
    background: 'var(--aqua)',
    color: 'var(--deep)',
  },
  tagPillDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
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
  submitButtonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  successContent: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    textAlign: 'center' as const,
    padding: '16px 0',
  },
  successIcon: {
    width: 48,
    height: 48,
    borderRadius: '50%',
    background: 'rgba(74, 222, 128, 0.1)',
    border: '2px solid var(--green)',
    color: 'var(--green)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 22,
    fontWeight: 700,
    marginBottom: 12,
  },
  successHeading: {
    fontSize: 16,
    fontWeight: 600,
    color: 'var(--ink)',
    marginBottom: 4,
  },
  successSub: {
    fontSize: 13,
    color: 'var(--muted)',
    marginBottom: 16,
  },
  doneButton: {
    width: '100%',
    maxWidth: 200,
  },
};
