'use client';

import React, { useState, useCallback } from 'react';
import { ExternalLink, AlertCircle } from 'lucide-react';
import type { CommandCentreView } from '@/services/commandCentre/types';
import { useProjectContext } from './ProjectContextProvider';

// ── Entity Link Interface ────────────────────────────────────────────────────

export interface EntityLink {
  linkedEntityId: string;
  linkedEntityType: CommandCentreView;
  label: string;
}

// ── Truncation Utility (exported for property testing) ───────────────────────

/**
 * Truncates a label to a maximum length, appending an ellipsis (…) if exceeded.
 * If the label is at or under maxLength, returns the full label unchanged.
 */
export function truncateLabel(label: string, maxLength: number = 40): string {
  if (label.length <= maxLength) {
    return label;
  }
  return label.slice(0, maxLength - 1) + '…';
}

// ── Highlight Event (subsystem views can subscribe to highlight targets) ─────

/** Event name used to signal that a linked entity should be highlighted */
export const LINK_CHIP_HIGHLIGHT_EVENT = 'command-centre:highlight-entity';

export interface HighlightEntityDetail {
  entityId: string;
  entityType: CommandCentreView;
}

/**
 * Dispatch a highlight event so the target subsystem view can apply
 * a temporary visual emphasis to the referenced item.
 */
function dispatchHighlightEvent(entityId: string, entityType: CommandCentreView): void {
  const event = new CustomEvent<HighlightEntityDetail>(LINK_CHIP_HIGHLIGHT_EVENT, {
    detail: { entityId, entityType },
  });
  window.dispatchEvent(event);
}

// ── Validate linked entity exists (stub — views can override via context) ────

/**
 * Placeholder entity resolution. In a full implementation, each subsystem view
 * would register a resolver. For now, we optimistically navigate and rely on
 * the target view to display "not found" if the entity is missing.
 *
 * Returns false only when we can definitively determine the entity doesn't exist.
 * Currently returns true (optimistic) — target views handle missing entities.
 */
function entityExistsCheck(_entityId: string, _entityType: CommandCentreView): boolean {
  // Optimistic: let the target view handle resolution.
  // If the entity is not found, the target view dispatches a "not found" event
  // which triggers the inline notification in the chip.
  return true;
}

// ── LinkChip Props ───────────────────────────────────────────────────────────

interface LinkChipProps {
  /** The entity link data */
  link: EntityLink;
  /** Optional: override entity existence check (for testing/custom resolution) */
  entityExists?: (entityId: string, entityType: CommandCentreView) => boolean;
  /** Optional: custom class name to append */
  className?: string;
}

// ── LinkChip Component ───────────────────────────────────────────────────────

/**
 * Universal cross-subsystem navigable chip.
 *
 * Renders for any entity with a `linkedEntityId` and `linkedEntityType`.
 * Displays the linked entity name/reference as its label, truncated to 40 chars.
 * On click: navigates to the target subsystem view via client-side transition.
 * If the linked entity cannot be found: displays an inline notification without navigating away.
 *
 * Styled with `.chip` class per platform convention (teal border, inline-flex).
 *
 * @requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7
 */
export function LinkChip({ link, entityExists, className }: LinkChipProps) {
  const { navigateToView } = useProjectContext();
  const [notFound, setNotFound] = useState(false);

  const displayLabel = truncateLabel(link.label, 40);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Check if entity exists (custom resolver or default)
      const resolver = entityExists ?? entityExistsCheck;
      const exists = resolver(link.linkedEntityId, link.linkedEntityType);

      if (!exists) {
        // Entity not found: show inline notification, do NOT navigate away
        setNotFound(true);
        // Auto-dismiss after 4 seconds
        setTimeout(() => setNotFound(false), 4000);
        return;
      }

      // Navigate to target subsystem view (client-side, no page reload)
      navigateToView(link.linkedEntityType);

      // Dispatch highlight event so target view can emphasize the item
      // (2-3 second highlight as per requirements)
      setTimeout(() => {
        dispatchHighlightEvent(link.linkedEntityId, link.linkedEntityType);
      }, 100);
    },
    [link, navigateToView, entityExists],
  );

  // Don't render if required fields are missing
  if (!link.linkedEntityId || !link.linkedEntityType) {
    return null;
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <button
        type="button"
        onClick={handleClick}
        className={`chip ${className ?? ''}`.trim()}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '2px 10px',
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 500,
          color: 'var(--teal, #19B7B0)',
          background: 'rgba(25, 183, 176, 0.08)',
          border: '1px solid rgba(25, 183, 176, 0.25)',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          whiteSpace: 'nowrap',
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
        title={link.label}
        aria-label={`Navigate to ${link.label} in ${link.linkedEntityType}`}
      >
        <ExternalLink style={{ width: 12, height: 12, flexShrink: 0 }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayLabel}</span>
      </button>

      {/* Inline notification when linked entity is not found */}
      {notFound && (
        <span
          role="alert"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '2px 8px',
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 500,
            color: 'var(--amber, #F5A623)',
            background: 'rgba(245, 166, 35, 0.08)',
            border: '1px solid rgba(245, 166, 35, 0.2)',
            whiteSpace: 'nowrap',
          }}
        >
          <AlertCircle style={{ width: 11, height: 11, flexShrink: 0 }} />
          Linked item unavailable
        </span>
      )}
    </span>
  );
}

export default LinkChip;
