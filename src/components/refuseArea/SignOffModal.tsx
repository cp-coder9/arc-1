/**
 * SignOffModal — Professional Sign-Off Gate
 *
 * Renders a modal dialog that blocks save/export actions until the professional
 * sign-off is completed. The user must check the acknowledgement checkbox before
 * the confirm action is enabled.
 *
 * Requirements: 8.1, 8.2, 8.4, 8.5
 */

import { useState } from 'react';
import { getAcknowledgementText } from '@/services/refuseArea/signOffService';

export interface SignOffModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export default function SignOffModal({ open, onClose, onConfirm }: SignOffModalProps) {
  const [acknowledged, setAcknowledged] = useState(false);

  if (!open) return null;

  const acknowledgementText = getAcknowledgementText();

  const handleConfirm = () => {
    if (acknowledged) {
      onConfirm();
      setAcknowledged(false);
    }
  };

  const handleClose = () => {
    setAcknowledged(false);
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="sign-off-modal-title"
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 22,
          maxWidth: 520,
          width: '100%',
          padding: 28,
          boxShadow: 'var(--shadow)',
          position: 'relative',
        }}
      >
        {/* Close button */}
        <button
          className="btn-secondary"
          onClick={handleClose}
          aria-label="Dismiss sign-off"
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            width: 28,
            height: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            border: '1px solid var(--border)',
            borderRadius: 8,
            background: 'rgba(255,255,255,0.7)',
            cursor: 'pointer',
            fontSize: 16,
            color: 'var(--muted)',
          }}
        >
          ×
        </button>

        {/* Title */}
        <h2
          id="sign-off-modal-title"
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: 'var(--ink)',
            marginBottom: 16,
          }}
        >
          Professional Sign-Off Required
        </h2>

        <p
          style={{
            fontSize: 13,
            color: 'var(--muted)',
            marginBottom: 20,
            lineHeight: 1.5,
          }}
        >
          You must confirm the following acknowledgement before saving or exporting
          this advisory result.
        </p>

        {/* Checkbox with acknowledgement text */}
        <label
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'flex-start',
            cursor: 'pointer',
            fontSize: 13,
            color: 'var(--ink)',
            lineHeight: 1.6,
            marginBottom: 24,
          }}
        >
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            style={{ marginTop: 3, flexShrink: 0 }}
          />
          <span>{acknowledgementText}</span>
        </label>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            className="btn-secondary"
            onClick={handleClose}
            style={{
              padding: '8px 16px',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            className="btn"
            onClick={handleConfirm}
            disabled={!acknowledged}
            style={{
              padding: '8px 16px',
              fontSize: 13,
              cursor: acknowledged ? 'pointer' : 'not-allowed',
              opacity: acknowledged ? 1 : 0.5,
            }}
          >
            Sign Off &amp; Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
