/**
 * ActionBar — Calculate, Export PDF, Save to Passport, Push to SpecForge
 *
 * Horizontal button bar gating export/save actions behind professional sign-off.
 * Shows contextual notices for missing project context or dismissed sign-off.
 *
 * Requirements: 7.5, 7.6, 8.1, 8.4, 9.1, 9.2, 9.3, 9.4
 */

import React from 'react';

export interface ActionBarProps {
  canCalculate: boolean;
  canExport: boolean; // true only after sign-off completed
  saving: boolean;
  exporting: boolean;
  signOffCompleted: boolean;
  hasProjectContext: boolean; // false when no active project
  signOffDismissed: boolean; // true if sign-off modal was dismissed without completing
  onCalculate: () => void;
  onExportPdf: () => void;
  onSavePassport: () => void;
  onPushSpecForge: () => void;
  onSignOff: () => void; // opens the sign-off modal
  saveError?: boolean;
  exportError?: boolean;
  specForgeError?: boolean;
}

export default function ActionBar({
  canCalculate,
  canExport,
  saving,
  exporting,
  signOffCompleted,
  hasProjectContext,
  signOffDismissed,
  onCalculate,
  onExportPdf,
  onSavePassport,
  onPushSpecForge,
  onSignOff,
  saveError,
  exportError,
  specForgeError,
}: ActionBarProps) {
  // Export/save buttons gate behind sign-off — clicking opens sign-off modal if not completed
  const handleExportPdf = () => {
    if (!signOffCompleted) {
      onSignOff();
      return;
    }
    onExportPdf();
  };

  const handleSavePassport = () => {
    if (!signOffCompleted) {
      onSignOff();
      return;
    }
    onSavePassport();
  };

  const handlePushSpecForge = () => {
    if (!signOffCompleted) {
      onSignOff();
      return;
    }
    onPushSpecForge();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Button bar */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Calculate — always visible */}
        <button
          className="btn"
          onClick={onCalculate}
          disabled={!canCalculate}
          style={{
            padding: '8px 16px',
            fontSize: 13,
            cursor: canCalculate ? 'pointer' : 'not-allowed',
            opacity: canCalculate ? 1 : 0.5,
          }}
        >
          Calculate
        </button>

        {/* Export PDF — visible after results */}
        {canExport || signOffCompleted ? (
          <div style={{ position: 'relative', display: 'inline-flex' }}>
            <button
              className="btn-secondary"
              onClick={handleExportPdf}
              disabled={exporting}
              style={{
                padding: '8px 16px',
                fontSize: 13,
                cursor: exporting ? 'not-allowed' : 'pointer',
                opacity: exporting ? 0.6 : 1,
              }}
            >
              {exporting ? 'Exporting…' : 'Export PDF'}
            </button>
            {exportError && <ErrorBadge />}
          </div>
        ) : null}

        {/* Save to Passport — visible after results, disabled without project */}
        {canExport || signOffCompleted ? (
          <div style={{ position: 'relative', display: 'inline-flex' }}>
            <button
              className="btn-secondary"
              onClick={handleSavePassport}
              disabled={saving || !hasProjectContext}
              style={{
                padding: '8px 16px',
                fontSize: 13,
                cursor: saving || !hasProjectContext ? 'not-allowed' : 'pointer',
                opacity: saving || !hasProjectContext ? 0.5 : 1,
              }}
            >
              {saving ? 'Saving…' : 'Save to Passport'}
            </button>
            {saveError && <ErrorBadge />}
          </div>
        ) : null}

        {/* Push to SpecForge — visible after results, disabled without project */}
        {canExport || signOffCompleted ? (
          <div style={{ position: 'relative', display: 'inline-flex' }}>
            <button
              className="btn-secondary"
              onClick={handlePushSpecForge}
              disabled={saving || !hasProjectContext}
              style={{
                padding: '8px 16px',
                fontSize: 13,
                cursor: saving || !hasProjectContext ? 'not-allowed' : 'pointer',
                opacity: saving || !hasProjectContext ? 0.5 : 1,
              }}
            >
              Push to SpecForge
            </button>
            {specForgeError && <ErrorBadge />}
          </div>
        ) : null}
      </div>

      {/* Notice: no active project context */}
      {!hasProjectContext && (canExport || signOffCompleted) && (
        <p style={{ fontSize: 12, color: 'var(--amber)', margin: 0 }}>
          Select a project to enable Passport and SpecForge actions
        </p>
      )}

      {/* Notice: sign-off dismissed without completion */}
      {signOffDismissed && !signOffCompleted && (
        <p style={{ fontSize: 12, color: 'var(--amber)', margin: 0 }}>
          Save and export unavailable until sign-off is completed
        </p>
      )}
    </div>
  );
}

/**
 * Small red dot indicator shown on buttons when save/export fails.
 */
function ErrorBadge() {
  return (
    <span
      style={{
        position: 'absolute',
        top: -3,
        right: -3,
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: 'var(--red)',
      }}
      aria-label="Action failed"
    />
  );
}
