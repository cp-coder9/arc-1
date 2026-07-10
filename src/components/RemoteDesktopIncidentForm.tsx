/**
 * RemoteDesktopIncidentForm — Structured Incident Reporting Form
 *
 * Provides a "Report Issue" form during or after a remote desktop session.
 * Fields: category (connection_quality, app_not_working, security_concern,
 * billing_dispute, other), description (10–1000 characters), and optional
 * screenshot attachment (max 5 MB, captured from viewport).
 *
 * When category is "security_concern", displays a warning that input
 * forwarding will be immediately paused.
 *
 * Renders within the Architex OS shell — no custom chrome.
 * Uses platform CSS tokens and class system.
 *
 * Validates: Requirements 3.1, 3.2, 3.4
 */

import React, { useCallback, useState, useRef } from 'react';
import { AlertCircle, Camera, Send, X, ShieldAlert } from 'lucide-react';
import type { UserProfile } from '@/types';
import type { IncidentCategory } from '@/services/remoteDesktop/types';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface IncidentFormData {
  category: IncidentCategory;
  description: string;
  screenshotDataUrl: string | null;
}

export interface RemoteDesktopIncidentFormProps {
  /** Current authenticated user */
  user: UserProfile;
  /** Current session ID */
  sessionId: string;
  /** Current booking ID */
  bookingId: string;
  /** Reporter role (consumer or owner) */
  reporterRole: 'consumer' | 'owner';
  /** Callback when the form is submitted */
  onSubmit: (data: IncidentFormData) => void;
  /** Callback when the form is cancelled */
  onCancel: () => void;
}

// ─── Constants ──────────────────────────────────────────────────────────────────

const MIN_DESCRIPTION_LENGTH = 10;
const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_SCREENSHOT_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const CATEGORY_OPTIONS: { value: IncidentCategory; label: string; description: string }[] = [
  {
    value: 'connection_quality',
    label: 'Connection Quality',
    description: 'Lag, freezing, pixelation, or audio issues',
  },
  {
    value: 'app_not_working',
    label: 'Application Not Working',
    description: 'App crashes, hangs, or fails to respond',
  },
  {
    value: 'security_concern',
    label: 'Security Concern',
    description: 'Unauthorised access, suspicious activity, or policy violation',
  },
  {
    value: 'billing_dispute',
    label: 'Billing Dispute',
    description: 'Incorrect charges, session time discrepancy',
  },
  {
    value: 'other',
    label: 'Other',
    description: 'Any other issue not listed above',
  },
];

// ─── Component ──────────────────────────────────────────────────────────────────

export function RemoteDesktopIncidentForm({
  user,
  sessionId,
  bookingId,
  reporterRole,
  onSubmit,
  onCancel,
}: RemoteDesktopIncidentFormProps) {
  const [category, setCategory] = useState<IncidentCategory>('connection_quality');
  const [description, setDescription] = useState('');
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string | null>(null);
  const [screenshotError, setScreenshotError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const descriptionLength = description.length;
  const isDescriptionValid =
    descriptionLength >= MIN_DESCRIPTION_LENGTH && descriptionLength <= MAX_DESCRIPTION_LENGTH;
  const canSubmit = isDescriptionValid && !isSubmitting;
  const isSecurityConcern = category === 'security_concern';

  const handleCategoryChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setCategory(e.target.value as IncidentCategory);
  }, []);

  const handleDescriptionChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDescription(e.target.value.slice(0, MAX_DESCRIPTION_LENGTH));
  }, []);

  const handleScreenshotAttach = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setScreenshotError(null);

    if (file.size > MAX_SCREENSHOT_SIZE_BYTES) {
      setScreenshotError('Screenshot must be under 5 MB');
      return;
    }

    if (!file.type.startsWith('image/')) {
      setScreenshotError('File must be an image');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setScreenshotDataUrl(reader.result as string);
    };
    reader.onerror = () => {
      setScreenshotError('Failed to read file');
    };
    reader.readAsDataURL(file);
  }, []);

  const handleRemoveScreenshot = useCallback(() => {
    setScreenshotDataUrl(null);
    setScreenshotError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!canSubmit) return;

      setIsSubmitting(true);
      onSubmit({ category, description, screenshotDataUrl });
    },
    [canSubmit, category, description, screenshotDataUrl, onSubmit],
  );

  return (
    <div className="panel" style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertCircle size={20} style={{ color: 'var(--amber)', flexShrink: 0 }} />
          <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>
            Report Issue
          </h2>
        </div>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Close form"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'transparent',
            cursor: 'pointer',
          }}
        >
          <X size={14} style={{ color: 'var(--muted)' }} />
        </button>
      </div>

      {/* Security Warning */}
      {isSecurityConcern && (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            padding: 12,
            borderRadius: 10,
            border: '1px solid rgba(217,87,71,.18)',
            background: 'rgba(217,87,71,.04)',
            marginBottom: 16,
          }}
        >
          <ShieldAlert size={16} style={{ color: 'var(--red)', flexShrink: 0, marginTop: 2 }} />
          <p style={{ fontSize: 12, color: 'var(--red)', margin: 0, lineHeight: 1.5 }}>
            Submitting a security concern will immediately pause all input forwarding to the
            remote host. A Platform Administrator will review within 15 minutes.
          </p>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Category */}
        <div>
          <label
            htmlFor="incident-category"
            style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}
          >
            Category
          </label>
          <select
            id="incident-category"
            value={category}
            onChange={handleCategoryChange}
            style={{
              width: '100%',
              height: 36,
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: 'rgba(255,255,255,.7)',
              padding: '0 12px',
              fontSize: 13,
              color: 'var(--ink)',
              fontFamily: 'var(--font)',
              cursor: 'pointer',
            }}
          >
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <p style={{ fontSize: 11, color: 'var(--muted)', margin: '4px 0 0' }}>
            {CATEGORY_OPTIONS.find((o) => o.value === category)?.description}
          </p>
        </div>

        {/* Description */}
        <div>
          <label
            htmlFor="incident-description"
            style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}
          >
            Description
          </label>
          <textarea
            id="incident-description"
            value={description}
            onChange={handleDescriptionChange}
            placeholder="Describe the issue in detail (minimum 10 characters)..."
            rows={4}
            style={{
              width: '100%',
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: 'rgba(255,255,255,.7)',
              padding: 12,
              fontSize: 13,
              color: 'var(--ink)',
              fontFamily: 'var(--font)',
              resize: 'vertical',
              minHeight: 80,
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <span
              style={{
                fontSize: 11,
                color: descriptionLength < MIN_DESCRIPTION_LENGTH ? 'var(--red)' : 'var(--muted)',
              }}
            >
              {descriptionLength < MIN_DESCRIPTION_LENGTH
                ? `${MIN_DESCRIPTION_LENGTH - descriptionLength} more characters needed`
                : 'Meets minimum length'}
            </span>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>
              {descriptionLength}/{MAX_DESCRIPTION_LENGTH}
            </span>
          </div>
        </div>

        {/* Screenshot Attachment */}
        <div>
          <label
            style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}
          >
            Screenshot (Optional)
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            style={{ display: 'none' }}
            aria-label="Attach screenshot"
          />

          {screenshotDataUrl ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: 10,
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: 'rgba(255,255,255,.5)',
              }}
            >
              <img
                src={screenshotDataUrl}
                alt="Attached screenshot preview"
                style={{ width: 48, height: 36, objectFit: 'cover', borderRadius: 6 }}
              />
              <span style={{ fontSize: 12, color: 'var(--ink)', flex: 1 }}>Screenshot attached</span>
              <button
                type="button"
                onClick={handleRemoveScreenshot}
                aria-label="Remove screenshot"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 24,
                  height: 24,
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  cursor: 'pointer',
                }}
              >
                <X size={12} style={{ color: 'var(--muted)' }} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn"
              onClick={handleScreenshotAttach}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                border: '1px solid var(--border)',
                background: 'rgba(255,255,255,.7)',
                color: 'var(--ink)',
                height: 32,
                fontSize: 12,
              }}
            >
              <Camera size={14} />
              Attach Screenshot
            </button>
          )}

          {screenshotError && (
            <p style={{ fontSize: 11, color: 'var(--red)', margin: '4px 0 0' }}>{screenshotError}</p>
          )}
          <p style={{ fontSize: 11, color: 'var(--muted)', margin: '4px 0 0' }}>
            Maximum 5 MB. Image files only.
          </p>
        </div>

        {/* Context Info (read-only) */}
        <div style={{ fontSize: 11, color: 'var(--muted)', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          Session: <span style={{ fontFamily: 'monospace' }}>{sessionId}</span> · Booking: <span style={{ fontFamily: 'monospace' }}>{bookingId}</span> · Reporter: {user.displayName || user.email} ({reporterRole})
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="btn"
            onClick={onCancel}
            style={{
              border: '1px solid var(--border)',
              background: 'rgba(255,255,255,.7)',
              color: 'var(--ink)',
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn"
            disabled={!canSubmit}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              opacity: canSubmit ? 1 : 0.5,
              cursor: canSubmit ? 'pointer' : 'not-allowed',
            }}
          >
            <Send size={14} />
            Submit Report
          </button>
        </div>
      </form>
    </div>
  );
}

export default RemoteDesktopIncidentForm;
