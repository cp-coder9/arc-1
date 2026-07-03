/**
 * Unit Tests — Project Membership Authorization
 *
 * Tests the project membership check that ensures users can only
 * access projects they belong to.
 *
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';
import { checkProjectMembership } from '../services/projectMembership';
import type { FirestoreDB } from '../services/accessControl';

// ─── Mock Firestore Helper ────────────────────────────────────────────────────

function createMockFirestore(
  projectData?: Record<string, unknown> | null,
  shouldThrow = false,
): FirestoreDB {
  return {
    collection(path: string) {
      return {
        doc(id: string) {
          return {
            async get() {
              if (shouldThrow) throw new Error('Firestore connection error');
              if (projectData === null) {
                return { exists: false, data: () => undefined };
              }
              return {
                exists: true,
                data: () => projectData ? { ...projectData } : undefined,
              };
            },
            async set() {},
            async update() {},
          };
        },
        where() {
          return {
            async get() {
              return { docs: [] };
            },
          };
        },
        async add(data: Record<string, unknown>) {
          return { id: 'mock_id' };
        },
      };
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Project Membership Check', () => {
  it('returns isMember: true when user is in teamMembers with active status', async () => {
    const db = createMockFirestore({
      name: 'Test Project',
      teamMembers: [
        { userId: 'user_001', status: 'active', role: 'architect' },
        { userId: 'user_002', status: 'active', role: 'client' },
      ],
    });

    const result = await checkProjectMembership(db, 'user_001', 'proj_001');
    expect(result.isMember).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('returns isMember: false when user is not in teamMembers', async () => {
    const db = createMockFirestore({
      name: 'Test Project',
      teamMembers: [
        { userId: 'user_001', status: 'active', role: 'architect' },
      ],
    });

    const result = await checkProjectMembership(db, 'user_999', 'proj_001');
    expect(result.isMember).toBe(false);
    expect(result.reason).toBe('User is not an active team member');
  });

  it('returns isMember: false when user has inactive status', async () => {
    const db = createMockFirestore({
      name: 'Test Project',
      teamMembers: [
        { userId: 'user_001', status: 'inactive', role: 'architect' },
      ],
    });

    const result = await checkProjectMembership(db, 'user_001', 'proj_001');
    expect(result.isMember).toBe(false);
    expect(result.reason).toBe('User is not an active team member');
  });

  it('returns isMember: false when project does not exist', async () => {
    const db = createMockFirestore(null);

    const result = await checkProjectMembership(db, 'user_001', 'nonexistent_proj');
    expect(result.isMember).toBe(false);
    expect(result.reason).toBe('Project not found');
  });

  it('returns isMember: false when teamMembers array is not defined', async () => {
    const db = createMockFirestore({
      name: 'Test Project',
      // No teamMembers field
    });

    const result = await checkProjectMembership(db, 'user_001', 'proj_001');
    expect(result.isMember).toBe(false);
    expect(result.reason).toBe('No team members defined');
  });

  it('returns isMember: false (fail closed) on Firestore error', async () => {
    const db = createMockFirestore(null, true);

    const result = await checkProjectMembership(db, 'user_001', 'proj_001');
    expect(result.isMember).toBe(false);
    expect(result.reason).toBe('Unable to verify project membership');
  });
});
