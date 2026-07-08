// ─── AutoFillIndicator Component ────────────────────────────────────────────
// Visual badge showing field data source status: auto-filled, overridden, or
// manual entry required. Includes revert action for overridden fields.
// Requirements: 2.4, 3.2, 3.3, 14.4

import React from 'react';

export type AutoFillStatus = 'auto_fill' | 'override' | 'manual_required';

interface AutoFillIndicatorProps {
  status: AutoFillStatus;
  onRevert?: () => void;
}

/**
 * Shows a status badge indicating how a form field was populated:
 * - "⚡ Auto" for auto-filled fields
 * - "✎ Override" for manually overridden fields (with revert button)
 * - "⚠ Manual entry required" for fields that could not be auto-filled
 */
export default function AutoFillIndicator({ status, onRevert }: AutoFillIndicatorProps) {
  if (status === 'auto_fill') {
    return (
      <span className="autofill-badge autofill-badge--auto">
        ⚡ Auto
      </span>
    );
  }

  if (status === 'override') {
    return (
      <span className="autofill-badge autofill-badge--override">
        ✎ Override
        {onRevert && (
          <button
            type="button"
            className="autofill-revert-btn"
            onClick={onRevert}
            title="Revert to auto-filled value"
          >
            ↺
          </button>
        )}
      </span>
    );
  }

  // manual_required
  return (
    <span className="autofill-badge autofill-badge--manual">
      ⚠ Manual entry required
    </span>
  );
}
