/**
 * FormDraftsList — Displays the user's saved form drafts organized by project,
 * sorted by last-modified timestamps.
 *
 * Features:
 * - Draft rows with icon (category), title (template + project), metadata, status pill
 * - Click to resume (navigate to form editor)
 * - Delete with confirmation dialog
 * - Toggle for stale drafts (>180 days)
 * - Empty state when no drafts
 *
 * Requirements validated: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7
 */

import React, { useState, useCallback, useMemo } from 'react';
import { FileText, Trash2, Clock, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import type { FormDraft, FormCategory } from '@/services/forms/formTypes';
import { useFormDrafts } from '@/hooks/useFormDrafts';

// ── Types ────────────────────────────────────────────────────────────────────

interface Props {
  userId: string;
  onResumeDraft?: (instanceId: string) => void;
}

// ── Category Icons ───────────────────────────────────────────────────────────

const CATEGORY_ICONS: Record<FormCategory, string> = {
  municipal_submission: '🏛️',
  sacap: '📋',
  contract: '📄',
  appointment_letter: '✉️',
  power_of_attorney: '⚖️',
  company_resolution: '🏢',
  site_instruction: '🔧',
  variation_order: '📝',
  payment_certificate: '💰',
  compliance_declaration: '✅',
  custom: '📁',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(timestamp: unknown): string {
  let ms: number;

  if (timestamp && typeof timestamp === 'object' && 'toMillis' in (timestamp as object)) {
    ms = (timestamp as { toMillis(): number }).toMillis();
  } else if (
    timestamp &&
    typeof timestamp === 'object' &&
    '_seconds' in (timestamp as object)
  ) {
    ms = (timestamp as { _seconds: number })._seconds * 1000;
  } else {
    return 'Unknown';
  }

  const diff = Date.now() - ms;
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function getCategoryIcon(templateName: string): string {
  // Attempt to infer category from template name
  const lower = templateName.toLowerCase();
  if (lower.includes('municipal') || lower.includes('submission')) return CATEGORY_ICONS.municipal_submission;
  if (lower.includes('sacap')) return CATEGORY_ICONS.sacap;
  if (lower.includes('contract')) return CATEGORY_ICONS.contract;
  if (lower.includes('appointment')) return CATEGORY_ICONS.appointment_letter;
  if (lower.includes('power of attorney') || lower.includes('poa')) return CATEGORY_ICONS.power_of_attorney;
  if (lower.includes('resolution')) return CATEGORY_ICONS.company_resolution;
  if (lower.includes('site instruction')) return CATEGORY_ICONS.site_instruction;
  if (lower.includes('variation')) return CATEGORY_ICONS.variation_order;
  if (lower.includes('payment')) return CATEGORY_ICONS.payment_certificate;
  if (lower.includes('compliance') || lower.includes('declaration')) return CATEGORY_ICONS.compliance_declaration;
  return CATEGORY_ICONS.custom;
}

/** Group drafts by project name */
function groupByProject(drafts: FormDraft[]): Record<string, FormDraft[]> {
  const groups: Record<string, FormDraft[]> = {};
  for (const draft of drafts) {
    const key = draft.projectName || 'Standalone (No Project)';
    if (!groups[key]) groups[key] = [];
    groups[key].push(draft);
  }
  return groups;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function FormDraftsList({ userId, onResumeDraft }: Props) {
  const {
    drafts,
    loading,
    error,
    deleteDraft,
    showStale,
    setShowStale,
    refresh,
  } = useFormDrafts(userId);

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<boolean>(false);

  // Group drafts by project name, sorted by last-modified within each group
  const groupedDrafts = useMemo(() => {
    const groups = groupByProject(drafts);
    // Sort groups alphabetically by project name (Standalone last)
    const sortedKeys = Object.keys(groups).sort((a, b) => {
      if (a === 'Standalone (No Project)') return 1;
      if (b === 'Standalone (No Project)') return -1;
      return a.localeCompare(b);
    });
    return sortedKeys.map((key) => ({ projectName: key, drafts: groups[key] }));
  }, [drafts]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleResume = useCallback(
    (instanceId: string) => {
      if (onResumeDraft) {
        onResumeDraft(instanceId);
      }
    },
    [onResumeDraft],
  );

  const handleDeleteClick = useCallback((draftId: string) => {
    setDeleteConfirmId(draftId);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteConfirmId) return;
    setDeleting(true);
    try {
      await deleteDraft(deleteConfirmId);
    } catch {
      // Error already set in the hook
    } finally {
      setDeleting(false);
      setDeleteConfirmId(null);
    }
  }, [deleteConfirmId, deleteDraft]);

  const handleDeleteCancel = useCallback(() => {
    setDeleteConfirmId(null);
  }, []);

  // ── Loading State ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="panel" style={{ textAlign: 'center', padding: '32px 22px' }}>
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>Loading drafts...</p>
      </div>
    );
  }

  // ── Error State ────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="panel" style={{ textAlign: 'center', padding: '32px 22px' }}>
        <p style={{ color: 'var(--red)', fontSize: 13 }}>{error}</p>
        <button
          className="btn"
          onClick={refresh}
          style={{ marginTop: 12 }}
        >
          Retry
        </button>
      </div>
    );
  }

  // ── Empty State ────────────────────────────────────────────────────────────

  if (drafts.length === 0) {
    return (
      <div className="panel" style={{ textAlign: 'center', padding: '48px 22px' }}>
        <FileText
          style={{
            width: 40,
            height: 40,
            color: 'var(--muted)',
            margin: '0 auto 12px',
          }}
        />
        <p style={{ color: 'var(--ink)', fontSize: 14, fontWeight: 500 }}>
          No drafts yet
        </p>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 6 }}>
          When you start filling a form, it will auto-save here as a draft.
        </p>
      </div>
    );
  }

  // ── Main Content ───────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* ─── Header Bar ─────────────────────────────────────────────────── */}
      <div
        className="panel"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 18px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Clock style={{ width: 16, height: 16, color: 'var(--deep)' }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
            {drafts.length} draft{drafts.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Stale toggle */}
        <button
          className="btn-secondary"
          onClick={() => setShowStale(!showStale)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            padding: '6px 12px',
            border: '1px solid var(--border)',
            borderRadius: 8,
            background: showStale ? 'var(--aqua)' : 'rgba(255,255,255,.7)',
            color: showStale ? 'var(--deep)' : 'var(--muted)',
            cursor: 'pointer',
          }}
          aria-pressed={showStale}
          aria-label={showStale ? 'Hide stale drafts' : 'Show stale drafts'}
        >
          {showStale ? (
            <Eye style={{ width: 14, height: 14 }} />
          ) : (
            <EyeOff style={{ width: 14, height: 14 }} />
          )}
          {showStale ? 'Showing stale' : 'Show stale (180+ days)'}
        </button>
      </div>

      {/* ─── Grouped Draft Rows ─────────────────────────────────────────── */}
      {groupedDrafts.map(({ projectName, drafts: projectDrafts }) => (
        <div key={projectName} className="panel" style={{ padding: '16px 18px' }}>
          {/* Project Group Header */}
          <h3
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--deep)',
              marginBottom: 12,
            }}
          >
            {projectName}
          </h3>

          {/* Draft Rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {projectDrafts.map((draft, index) => (
              <div
                key={draft.id}
                className="draft-row"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 0',
                  borderTop: index > 0 ? '1px solid var(--border)' : 'none',
                  cursor: 'pointer',
                }}
                onClick={() => handleResume(draft.instanceId || draft.id)}
                role="button"
                tabIndex={0}
                aria-label={`Resume draft: ${draft.templateName}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleResume(draft.instanceId || draft.id);
                  }
                }}
              >
                {/* Icon */}
                <span
                  style={{
                    fontSize: 20,
                    width: 36,
                    height: 36,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 8,
                    background: 'var(--aqua)',
                    flexShrink: 0,
                  }}
                >
                  {getCategoryIcon(draft.templateName)}
                </span>

                {/* Title + Meta */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: 'var(--ink)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {draft.templateName}
                    {draft.projectName && (
                      <span style={{ color: 'var(--muted)', fontWeight: 400 }}>
                        {' '}· {draft.projectName}
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--muted)',
                      marginTop: 2,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <span>{formatRelativeTime(draft.lastModifiedAt)}</span>
                    {draft.isStale && (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                          color: 'var(--amber)',
                        }}
                      >
                        <AlertTriangle style={{ width: 11, height: 11 }} />
                        Stale
                      </span>
                    )}
                  </div>
                </div>

                {/* Status Pill */}
                <span
                  className="pill"
                  style={{
                    fontSize: 10,
                    padding: '3px 8px',
                    flexShrink: 0,
                  }}
                >
                  <span className="dot" /> Draft
                </span>

                {/* Delete Button */}
                <button
                  className="btn-danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteClick(draft.id);
                  }}
                  aria-label={`Delete draft: ${draft.templateName}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 32,
                    height: 32,
                    padding: 0,
                    borderRadius: 8,
                    border: '1px solid rgba(217,87,71,.18)',
                    background: 'rgba(217,87,71,.06)',
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  <Trash2
                    style={{ width: 14, height: 14, color: 'var(--red)' }}
                  />
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* ─── Delete Confirmation Dialog ─────────────────────────────────── */}
      {deleteConfirmId && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(16,32,51,.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={handleDeleteCancel}
          role="dialog"
          aria-modal="true"
          aria-label="Confirm draft deletion"
        >
          <div
            className="panel"
            onClick={(e) => e.stopPropagation()}
            style={{
              padding: '24px 28px',
              maxWidth: 380,
              width: '90%',
              textAlign: 'center',
            }}
          >
            <Trash2
              style={{
                width: 32,
                height: 32,
                color: 'var(--red)',
                margin: '0 auto 12px',
              }}
            />
            <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', marginBottom: 8 }}>
              Delete this draft?
            </h3>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20 }}>
              This will permanently remove the draft. This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button
                className="btn"
                onClick={handleDeleteCancel}
                disabled={deleting}
                style={{ minWidth: 90 }}
              >
                Cancel
              </button>
              <button
                className="btn-danger"
                onClick={handleDeleteConfirm}
                disabled={deleting}
                style={{
                  minWidth: 90,
                  padding: '8px 16px',
                  border: '1px solid rgba(217,87,71,.18)',
                  background: 'rgba(217,87,71,.06)',
                  color: 'var(--red)',
                  borderRadius: 12,
                  fontWeight: 500,
                  cursor: deleting ? 'not-allowed' : 'pointer',
                  opacity: deleting ? 0.6 : 1,
                }}
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
