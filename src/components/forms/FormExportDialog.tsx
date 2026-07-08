/**
 * FormExportDialog — Export readiness checklist and export options for a form instance.
 *
 * Shows:
 * - Export readiness checklist (required fields ✓/✗, validation ✓/✗, signatures ✓/✗)
 * - Validation errors grouped by section with field labels
 * - Export options: single PDF or combined with related forms
 * - Proceed / Cancel buttons
 *
 * Requirements validated: 5.1, 5.2, 5.3
 */

import React, { useState } from 'react';
import { Download, CheckCircle, XCircle, AlertTriangle, FileText, Files } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ExportValidationError {
  fieldId: string;
  label: string;
  section: string;
}

interface Props {
  instanceId: string;
  onExport: (options: { format: 'single' | 'combined' }) => void;
  onClose: () => void;
  validationErrors: ExportValidationError[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Group validation errors by section name */
function groupBySection(errors: ExportValidationError[]): Record<string, ExportValidationError[]> {
  const groups: Record<string, ExportValidationError[]> = {};
  for (const error of errors) {
    const key = error.section || 'General';
    if (!groups[key]) groups[key] = [];
    groups[key].push(error);
  }
  return groups;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function FormExportDialog({
  instanceId: _instanceId,
  onExport,
  onClose,
  validationErrors,
}: Props) {
  const [exportFormat, setExportFormat] = useState<'single' | 'combined'>('single');

  const hasErrors = validationErrors.length > 0;
  const requiredFieldsReady = !hasErrors;
  const validationPassed = !hasErrors;
  // Signatures readiness is assumed true when no validation errors reference signature fields
  const signaturesReady = !validationErrors.some(
    (e) => e.section.toLowerCase().includes('signature')
  );

  const allReady = requiredFieldsReady && validationPassed && signaturesReady;
  const groupedErrors = groupBySection(validationErrors);

  return (
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
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Export form dialog"
    >
      <div
        className="panel"
        onClick={(e) => e.stopPropagation()}
        style={{
          padding: '24px 28px',
          maxWidth: 480,
          width: '90%',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <Download style={{ width: 20, height: 20, color: 'var(--deep)' }} />
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>
            Export to PDF
          </h2>
        </div>

        {/* Readiness Checklist */}
        <div
          className="panel"
          style={{
            padding: '14px 16px',
            marginBottom: 16,
            background: allReady ? 'rgba(74,222,128,.04)' : 'rgba(245,166,35,.04)',
          }}
        >
          <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--deep)', marginBottom: 10 }}>
            Export Readiness
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Required Fields */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {requiredFieldsReady ? (
                <CheckCircle style={{ width: 14, height: 14, color: 'var(--green)' }} />
              ) : (
                <XCircle style={{ width: 14, height: 14, color: 'var(--red)' }} />
              )}
              <span style={{ fontSize: 13, color: 'var(--ink)' }}>
                Required fields {requiredFieldsReady ? 'complete' : 'incomplete'}
              </span>
            </div>

            {/* Validation */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {validationPassed ? (
                <CheckCircle style={{ width: 14, height: 14, color: 'var(--green)' }} />
              ) : (
                <XCircle style={{ width: 14, height: 14, color: 'var(--red)' }} />
              )}
              <span style={{ fontSize: 13, color: 'var(--ink)' }}>
                Validation {validationPassed ? 'passed' : 'failed'}
              </span>
            </div>

            {/* Signatures */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {signaturesReady ? (
                <CheckCircle style={{ width: 14, height: 14, color: 'var(--green)' }} />
              ) : (
                <XCircle style={{ width: 14, height: 14, color: 'var(--red)' }} />
              )}
              <span style={{ fontSize: 13, color: 'var(--ink)' }}>
                Signatures {signaturesReady ? 'complete' : 'outstanding'}
              </span>
            </div>
          </div>
        </div>

        {/* Validation Errors (grouped by section) */}
        {hasErrors && (
          <div
            className="panel"
            style={{
              padding: '14px 16px',
              marginBottom: 16,
              background: 'rgba(217,87,71,.03)',
              borderColor: 'rgba(217,87,71,.12)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <AlertTriangle style={{ width: 14, height: 14, color: 'var(--amber)' }} />
              <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--red)', margin: 0 }}>
                Incomplete Fields ({validationErrors.length})
              </h3>
            </div>

            {Object.entries(groupedErrors).map(([section, errors]) => (
              <div key={section} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--deep)', marginBottom: 4 }}>
                  {section}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingLeft: 12 }}>
                  {errors.map((error) => (
                    <div key={error.fieldId} style={{ fontSize: 12, color: 'var(--muted)' }}>
                      • {error.label}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Export Options */}
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--deep)', marginBottom: 10 }}>
            Export Options
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Single PDF */}
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 14px',
                borderRadius: 10,
                border: exportFormat === 'single'
                  ? '1px solid var(--teal)'
                  : '1px solid var(--border)',
                background: exportFormat === 'single'
                  ? 'var(--aqua)'
                  : 'rgba(255,255,255,.7)',
                cursor: 'pointer',
              }}
            >
              <input
                type="radio"
                name="export-format"
                value="single"
                checked={exportFormat === 'single'}
                onChange={() => setExportFormat('single')}
                style={{ accentColor: 'var(--teal)' }}
              />
              <FileText style={{ width: 16, height: 16, color: 'var(--deep)' }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>
                  Single PDF
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                  Export this form as a standalone document
                </div>
              </div>
            </label>

            {/* Combined PDF */}
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 14px',
                borderRadius: 10,
                border: exportFormat === 'combined'
                  ? '1px solid var(--teal)'
                  : '1px solid var(--border)',
                background: exportFormat === 'combined'
                  ? 'var(--aqua)'
                  : 'rgba(255,255,255,.7)',
                cursor: 'pointer',
              }}
            >
              <input
                type="radio"
                name="export-format"
                value="combined"
                checked={exportFormat === 'combined'}
                onChange={() => setExportFormat('combined')}
                style={{ accentColor: 'var(--teal)' }}
              />
              <Files style={{ width: 16, height: 16, color: 'var(--deep)' }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>
                  Combined with related forms
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                  Merge with other project forms into a single document
                </div>
              </div>
            </label>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            className="btn"
            onClick={onClose}
            style={{
              minWidth: 90,
              border: '1px solid var(--border)',
              background: 'rgba(255,255,255,.7)',
              color: 'var(--ink)',
            }}
          >
            Cancel
          </button>
          <button
            className="btn"
            onClick={() => onExport({ format: exportFormat })}
            style={{
              minWidth: 120,
              opacity: hasErrors ? 0.7 : 1,
            }}
          >
            <Download style={{ width: 14, height: 14, marginRight: 6, display: 'inline' }} />
            {hasErrors ? 'Export Anyway' : 'Export PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}
