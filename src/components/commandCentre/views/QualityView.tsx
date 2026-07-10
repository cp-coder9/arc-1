'use client';

import { AlertCircle } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { useProjectContext } from '@/components/commandCentre/ProjectContextProvider';
import SnagManager from '@/components/SnagManager';
import NCRManager from '@/components/NCRManager';

interface QualityViewProps {
  projectId: string;
}

/**
 * QualityView — Command Centre subsystem view for Quality & Snags.
 *
 * Renders the existing SnagManager and NCRManager components with full CRUD
 * and lifecycle management. Both managers subscribe to their respective
 * Firestore collections ordered by createdAt descending via onSnapshot,
 * ensuring bidirectional data consistency with standalone manager instances.
 *
 * Requirements: 3.1, 3.2, 3.7
 */
export default function QualityView({ projectId }: QualityViewProps) {
  const { context } = useProjectContext();
  const currentUserId = auth.currentUser?.uid ?? '';

  // Requirement 3.7: Show project selection prompt when no active project is selected
  if (!projectId || !context?.projectId) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="panel" style={{ textAlign: 'center', padding: '48px 22px' }}>
          <AlertCircle style={{ width: 40, height: 40, color: 'var(--muted)', margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--ink)', marginBottom: 8 }}>
            No Project Selected
          </h2>
          <p style={{ fontSize: 13, color: 'var(--muted)', maxWidth: 400, margin: '0 auto' }}>
            Select a project from the project switcher to view quality tracking, snag lists, and non-conformance reports.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Hero */}
      <div className="hero">
        <div className="hero-header">
          <div>
            <div className="eyebrow">QUALITY & SNAGS</div>
            <h1>Quality Tracker</h1>
            <p className="sub">Snag management and non-conformance reports</p>
          </div>
        </div>
        <div className="hero-pills">
          <span className="pill">
            <span className="dot"></span> Active
          </span>
        </div>
      </div>

      {/* Requirement 3.1: SnagManager in compact mode with full CRUD (create, read, update, close)
          The SnagManager internally subscribes to projects/{projectId}/snags/ ordered by createdAt desc
          via onSnapshot, providing real-time updates and bidirectional data consistency. */}
      <SnagManager
        projectId={projectId}
        currentUserId={currentUserId}
        compact={false}
      />

      {/* Requirement 3.2: NCRManager in compact mode with full lifecycle (raise, investigate, resolve, close)
          The NCRManager internally subscribes to projects/{projectId}/ncrs/ ordered by createdAt desc
          via onSnapshot, providing real-time updates and bidirectional data consistency. */}
      <NCRManager
        projectId={projectId}
        currentUserId={currentUserId}
        compact={false}
      />
    </div>
  );
}
