/**
 * FileManifestPanel — File manifest display for Remote Desktop sessions
 *
 * Shows the file manifest from the Session Workspace. Each file displays:
 * name, size (human-readable), and status chip (pending_approval, uploading,
 * completed, failed).
 *
 * Accessible during/after a session and in the booking detail view.
 *
 * Uses Architex OS design tokens and platform CSS classes (.panel, .table,
 * .chip-approved, .chip-pending, .chip-rejected).
 *
 * Requirements: 8.9
 */

import React from 'react';
import { File, Upload, Check, X } from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface FileManifestEntry {
  name: string;
  sizeBytes: number;
  extension: string;
  transferStatus: 'pending_approval' | 'uploading' | 'completed' | 'failed';
}

export interface FileManifestPanelProps {
  /** List of files in the manifest */
  files: FileManifestEntry[];
  /** Session identifier for context */
  sessionId: string;
  /** Whether to show approval actions (Approve All button) */
  showApprovalActions?: boolean;
  /** Callback when Approve All is clicked */
  onApproveAll?: () => void;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Format bytes to a human-readable string (KB, MB, GB).
 */
export function formatBytes(bytes: number): string {
  if (bytes < 0) return '0 B';
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Get the display label for a transfer status.
 */
function getStatusLabel(status: FileManifestEntry['transferStatus']): string {
  switch (status) {
    case 'pending_approval':
      return 'Pending';
    case 'uploading':
      return 'Uploading';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
  }
}

/**
 * Get the chip CSS class for a transfer status.
 */
function getStatusChipClass(status: FileManifestEntry['transferStatus']): string {
  switch (status) {
    case 'completed':
      return 'chip chip-approved';
    case 'pending_approval':
    case 'uploading':
      return 'chip chip-pending';
    case 'failed':
      return 'chip chip-rejected';
  }
}

/**
 * Get the icon for a transfer status.
 */
function StatusIcon({ status }: { status: FileManifestEntry['transferStatus'] }) {
  const iconSize = 12;
  switch (status) {
    case 'pending_approval':
      return <File size={iconSize} style={{ flexShrink: 0 }} />;
    case 'uploading':
      return <Upload size={iconSize} style={{ flexShrink: 0 }} />;
    case 'completed':
      return <Check size={iconSize} style={{ flexShrink: 0 }} />;
    case 'failed':
      return <X size={iconSize} style={{ flexShrink: 0 }} />;
  }
}

// ─── Component ──────────────────────────────────────────────────────────────────

export function FileManifestPanel({
  files,
  sessionId,
  showApprovalActions = false,
  onApproveAll,
}: FileManifestPanelProps) {
  return (
    <section className="panel" aria-label="File manifest" data-session-id={sessionId}>
      <h2 style={styles.heading}>File Manifest</h2>

      {files.length === 0 ? (
        <div style={styles.emptyState}>
          <File size={20} style={{ color: 'var(--muted)' }} />
          <p style={styles.emptyText}>No files produced in this session</p>
        </div>
      ) : (
        <>
          <table className="table" style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>File Name</th>
                <th style={styles.th}>Size</th>
                <th style={styles.th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {files.map((file, index) => (
                <tr key={`${file.name}-${index}`}>
                  <td style={styles.fileNameCell}>
                    <File size={14} style={{ color: 'var(--teal)', flexShrink: 0 }} />
                    <span style={styles.fileName}>{file.name}</span>
                  </td>
                  <td style={styles.sizeCell}>{formatBytes(file.sizeBytes)}</td>
                  <td>
                    <span className={getStatusChipClass(file.transferStatus)} style={styles.chip}>
                      <StatusIcon status={file.transferStatus} />
                      {getStatusLabel(file.transferStatus)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {showApprovalActions && onApproveAll && (
            <div style={styles.actions}>
              <button
                type="button"
                className="btn"
                onClick={onApproveAll}
                aria-label="Approve all files for transfer"
              >
                <Check size={14} />
                <span>Approve All</span>
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  heading: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: 'var(--deep)',
    marginBottom: 14,
  },
  table: {
    width: '100%',
  },
  th: {
    fontSize: 10,
    textTransform: 'uppercase',
    color: 'var(--muted)',
    fontWeight: 600,
    letterSpacing: '0.04em',
    textAlign: 'left',
    padding: '8px 10px',
  },
  fileNameCell: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 10px',
    fontSize: 13,
  },
  fileName: {
    color: 'var(--ink)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  sizeCell: {
    fontSize: 13,
    color: 'var(--muted)',
    padding: '8px 10px',
    fontFamily: 'monospace',
    whiteSpace: 'nowrap',
  },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 11,
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '32px 14px',
  },
  emptyText: {
    fontSize: 13,
    color: 'var(--muted)',
    margin: 0,
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    paddingTop: 14,
    borderTop: '1px solid var(--border)',
    marginTop: 14,
  },
};

export default FileManifestPanel;
