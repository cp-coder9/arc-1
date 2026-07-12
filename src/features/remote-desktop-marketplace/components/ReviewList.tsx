// ─── Remote Desktop Marketplace — ReviewList ─────────────────────────────────
//
// Paginated review display. Shows reviews in newest-first order with 10 per
// page. Each review includes reviewer name, verified badge, rating stars,
// date, comment (truncated at 500 chars with expand toggle), owner reply,
// and optional tags as pills.

import { useState, useMemo } from 'react';
import { CheckCircle } from 'lucide-react';
import type { ReviewRecord } from '../types';
import { REVIEW_TAGS } from '../constants';
import { RatingStars } from './shared/RatingStars';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReviewListProps {
  reviews: ReviewRecord[];
  showResourceName?: boolean;
  emptyMessage?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const REVIEWS_PER_PAGE = 10;
const COMMENT_TRUNCATE_LENGTH = 500;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function getTagLabel(tagValue: string): string {
  const found = REVIEW_TAGS.find((t) => t.value === tagValue);
  return found?.label ?? tagValue;
}

// ─── Single Review Item ───────────────────────────────────────────────────────

function ReviewItem({
  review,
  showResourceName,
}: {
  review: ReviewRecord;
  showResourceName?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const commentTruncated =
    review.comment && review.comment.length > COMMENT_TRUNCATE_LENGTH;
  const displayComment =
    review.comment && !expanded
      ? review.comment.slice(0, COMMENT_TRUNCATE_LENGTH)
      : review.comment;

  return (
    <div
      style={{
        padding: 14,
        borderRadius: 12,
        border: '1px solid var(--border)',
        background: 'rgba(255,255,255,.5)',
      }}
    >
      {/* Header: name, verified badge, rating, date */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <strong style={{ color: 'var(--ink)', fontSize: 13 }}>
            {review.consumerDisplayName}
          </strong>
          {review.isVerified && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
                color: 'var(--teal)',
                fontSize: 11,
              }}
              title="Verified review — linked to a completed session"
            >
              <CheckCircle size={13} />
              Verified
            </span>
          )}
          <RatingStars mode="display" rating={review.rating} size={14} />
        </div>
        <span style={{ color: 'var(--muted)', fontSize: 11 }}>
          {formatDate(review.createdAt)}
        </span>
      </div>

      {/* Resource name (optional) */}
      {showResourceName && review.listingId && (
        <p style={{ color: 'var(--muted)', fontSize: 12, margin: '0 0 6px' }}>
          Resource: {review.listingId}
        </p>
      )}

      {/* Comment */}
      {displayComment && (
        <p
          style={{
            color: 'var(--ink)',
            fontSize: 13,
            lineHeight: 1.6,
            margin: 0,
          }}
        >
          {displayComment}
          {commentTruncated && !expanded && '…'}
        </p>
      )}

      {/* Expand/collapse toggle */}
      {commentTruncated && (
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--teal)',
            fontSize: 12,
            padding: '4px 0 0',
            fontWeight: 500,
          }}
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}

      {/* Tags as pills */}
      {review.tags && review.tags.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {review.tags.map((tag) => (
            <span
              key={tag}
              className="pill"
              style={{
                color: 'var(--muted)',
                background: 'rgba(16,32,51,.04)',
                borderColor: 'var(--border)',
                fontSize: 11,
              }}
            >
              {getTagLabel(tag)}
            </span>
          ))}
        </div>
      )}

      {/* Owner reply */}
      {review.ownerReply && (
        <div
          style={{
            marginTop: 10,
            padding: '10px 12px',
            borderRadius: 8,
            background: 'rgba(25,183,176,.04)',
            border: '1px solid rgba(25,183,176,.12)',
          }}
        >
          <span
            style={{
              fontSize: 11,
              color: 'var(--deep)',
              fontWeight: 600,
              display: 'block',
              marginBottom: 4,
            }}
          >
            Owner Reply
          </span>
          <p
            style={{
              color: 'var(--ink)',
              fontSize: 13,
              lineHeight: 1.5,
              margin: 0,
            }}
          >
            {review.ownerReply}
          </p>
          {review.ownerRepliedAt && (
            <span style={{ color: 'var(--muted)', fontSize: 11, marginTop: 4, display: 'block' }}>
              {formatDate(review.ownerRepliedAt)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ReviewList({
  reviews,
  showResourceName = false,
  emptyMessage = 'No reviews yet.',
}: ReviewListProps) {
  const [currentPage, setCurrentPage] = useState(1);

  // Sort newest-first (chronological descending)
  const sortedReviews = useMemo(
    () =>
      [...reviews].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    [reviews]
  );

  const totalPages = Math.max(1, Math.ceil(sortedReviews.length / REVIEWS_PER_PAGE));
  const startIdx = (currentPage - 1) * REVIEWS_PER_PAGE;
  const pageReviews = sortedReviews.slice(startIdx, startIdx + REVIEWS_PER_PAGE);

  // ─── Empty state ──────────────────────────────────────────────────────────

  if (reviews.length === 0) {
    return (
      <p style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>
        {emptyMessage}
      </p>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Review items */}
      {pageReviews.map((review) => (
        <ReviewItem
          key={review.id}
          review={review}
          showResourceName={showResourceName}
        />
      ))}

      {/* Pagination controls */}
      {totalPages > 1 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 6,
            marginTop: 8,
          }}
        >
          <button
            className="btn"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            style={{
              background: 'rgba(255,255,255,.7)',
              borderColor: 'var(--border)',
              color: currentPage === 1 ? 'var(--muted)' : 'var(--ink)',
              opacity: currentPage === 1 ? 0.5 : 1,
              fontSize: 12,
              padding: '6px 12px',
              height: 32,
            }}
          >
            ← Prev
          </button>

          <span style={{ color: 'var(--muted)', fontSize: 12 }}>
            Page {currentPage} of {totalPages}
          </span>

          <button
            className="btn"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            style={{
              background: 'rgba(255,255,255,.7)',
              borderColor: 'var(--border)',
              color: currentPage === totalPages ? 'var(--muted)' : 'var(--ink)',
              opacity: currentPage === totalPages ? 0.5 : 1,
              fontSize: 12,
              padding: '6px 12px',
              height: 32,
            }}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

export default ReviewList;
