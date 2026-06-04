/**
 * Architex Project Communication Panel — Responsive wrapper
 *
 * Renders the mobile ProjectChatApplet on narrow viewports and the desktop
 * ProjectMessageCentre on wider screens. Both read/write the same Firestore
 * collections, delivering on the "one shared backend, two responsive
 * interfaces" product direction.
 */

import React, { useEffect, useState } from 'react';
import type { Job, Message, UserProfile } from '@/types';
import { ProjectChatApplet } from './ProjectChatApplet';
import { ProjectMessageCentre } from './ProjectMessageCentre';
import { subscribeToProjectCommunications } from './projectCommunicationService';

// ── Props ───────────────────────────────────────────────────────────────

export interface ProjectCommunicationPanelProps {
  user: UserProfile;
  jobs: Job[];
  selectedJobId?: string;
  /** When true, always show mobile view; when false, always desktop. When
   * omitted the panel auto-detects from the viewport width (< 768 → mobile). */
  forceView?: 'mobile' | 'desktop';
}

// ── Helpers ─────────────────────────────────────────────────────────────

function canSendMessage(user: UserProfile, job?: Job): {
  canSend: boolean;
  reason: string;
} {
  if (!job) {
    return {
      canSend: false,
      reason:
        'Select a live project before opening a governed communication thread.',
    };
  }
  const profId = String(
    (job as unknown as Record<string, unknown>).selectedProfessionalId ??
      (job as unknown as Record<string, unknown>).selectedBepId ??
      (job as unknown as Record<string, unknown>).selectedArchitectId ??
      '',
  );
  if (job.clientId === user.uid || profId === user.uid) {
    return {
      canSend: true,
      reason:
        'You are a project participant; messages are stored as governed project records.',
    };
  }
  if (user.role === 'admin') {
    return {
      canSend: false,
      reason:
        'Admins can review the message centre but must not impersonate project participants.',
    };
  }
  return {
    canSend: false,
    reason:
      'This role needs a live appointment, package award, or project-team link before direct messaging is enabled.',
  };
}

// ── Component ───────────────────────────────────────────────────────────

export function ProjectCommunicationPanel({
  user,
  jobs,
  selectedJobId,
  forceView,
}: ProjectCommunicationPanelProps) {
  const [projectId, setProjectId] = useState(selectedJobId ?? jobs[0]?.id ?? '');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 768 : false,
  );

  // Viewport detection
  useEffect(() => {
    if (forceView) return;
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [forceView]);

  // Subscribe to messages for the active project
  useEffect(() => {
    if (!projectId) {
      setMessages([]);
      return;
    }
    const unsubscribe = subscribeToProjectCommunications(
      projectId,
      setMessages,
    );
    return () => unsubscribe();
  }, [projectId]);

  const selectedJob = jobs.find((j) => j.id === projectId) ?? jobs[0];
  const { canSend, reason } = canSendMessage(user, selectedJob);

  const showMobile = forceView === 'mobile' || (forceView !== 'desktop' && isMobile);

  return (
    <div className="w-full" data-testid="project-communication-panel">
      {showMobile ? (
        <ProjectChatApplet
          user={user}
          jobs={jobs}
          selectedJobId={projectId}
          messages={messages}
          canSend={canSend}
          permissionReason={reason}
          onMessageSent={() => {
            /* Realtime subscription handles refresh */
          }}
        />
      ) : (
        <ProjectMessageCentre
          user={user}
          jobs={jobs}
          messages={messages}
          selectedJobId={projectId}
          onSelectJob={setProjectId}
        />
      )}
    </div>
  );
}

export default ProjectCommunicationPanel;
