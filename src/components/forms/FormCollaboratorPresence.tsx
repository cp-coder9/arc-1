// ─── FormCollaboratorPresence Component ──────────────────────────────────────
// Shows active collaborator avatars and which fields each is currently editing.
// Uses .collab-bar, .collab-avatar patterns from the design system.
// Requirements: 8.5

import React from 'react';
import type { FieldLock } from '@/services/forms/formTypes';

// ── Types ────────────────────────────────────────────────────────────────────

interface Props {
  collaborators: string[];
  locks: FieldLock[];
  currentUserId: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  'var(--teal)',
  'var(--amber)',
  'var(--deep)',
  '#8b5cf6',
  'var(--green)',
  'var(--red)',
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return (name.slice(0, 2) || '??').toUpperCase();
}

function getAvatarColor(index: number): string {
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
}

// ── Component ────────────────────────────────────────────────────────────────

export default function FormCollaboratorPresence({
  collaborators,
  locks,
  currentUserId,
}: Props) {
  // Filter to other collaborators (not current user)
  const otherCollaborators = collaborators.filter((c) => c !== currentUserId);

  if (otherCollaborators.length === 0) {
    return null;
  }

  // Build a map of collaborator → currently locked field (by other users)
  const locksByUser: Record<string, string> = {};
  for (const lock of locks) {
    if (lock.lockedBy !== currentUserId) {
      locksByUser[lock.lockedBy] = lock.lockedByName
        ? `${lock.lockedByName} editing ${lock.fieldId}`
        : lock.fieldId;
    }
  }

  // Build descriptive text
  const descriptions: string[] = [];
  for (const collab of otherCollaborators) {
    // Find the lock for this collaborator if any
    const userLock = locks.find((l) => l.lockedBy === collab);
    if (userLock) {
      const name = userLock.lockedByName || collab;
      descriptions.push(`${name} editing ${userLock.fieldId}`);
    }
  }

  return (
    <div className="collab-bar">
      {otherCollaborators.map((collab, index) => {
        const lock = locks.find((l) => l.lockedBy === collab);
        const displayName = lock?.lockedByName || collab;

        return (
          <div
            key={collab}
            className="collab-avatar"
            style={{ background: getAvatarColor(index) }}
            title={
              lock
                ? `${displayName} — editing ${lock.fieldId}`
                : `${displayName} — viewing`
            }
            aria-label={`${displayName} is ${lock ? `editing ${lock.fieldId}` : 'viewing'}`}
          >
            {getInitials(displayName)}
          </div>
        );
      })}

      <span className="collab-text">
        {descriptions.length > 0
          ? descriptions.join(' · ')
          : `${otherCollaborators.length} collaborator${otherCollaborators.length !== 1 ? 's' : ''} viewing`}
      </span>

      <span
        style={{
          marginLeft: 'auto',
          fontSize: 10,
          color: 'var(--teal)',
          fontWeight: 600,
        }}
      >
        ● Live
      </span>
    </div>
  );
}
