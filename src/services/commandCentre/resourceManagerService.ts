/**
 * Project Command Centre — Resource Manager Service
 *
 * Manages team composition, utilisation tracking, and capacity planning.
 * Provides CRUD for team members, summary statistics, and over-allocation
 * detection with AI Advisor recommendation generation.
 * Persists to Firestore `projects/{projectId}/team_members/`.
 *
 * @module commandCentre/resourceManagerService
 */

import {
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
} from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '@/lib/firebase';
import { getDemoDoc, getDemoCol } from '@/demo-seed/demoFirestore';
import { recordAudit } from '@/services/commandCentre/commandCentreService';
import type { AIRecommendation } from '@/services/commandCentre/types';

// ── ID Generation ────────────────────────────────────────────────────────────

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

// ── Collection Constants ─────────────────────────────────────────────────────

const PROJECTS_COL = 'projects';
const TEAM_MEMBERS_COL = 'team_members';

// ── Firestore Path Helpers ───────────────────────────────────────────────────

function teamMembersCollection(projectId: string) {
  if (!projectId) throw new Error('projectId is required');
  return getDemoCol(PROJECTS_COL, projectId, TEAM_MEMBERS_COL);
}

function teamMemberDocument(projectId: string, memberId: string) {
  if (!projectId) throw new Error('projectId is required');
  if (!memberId) throw new Error('memberId is required');
  return getDemoDoc(PROJECTS_COL, projectId, TEAM_MEMBERS_COL, memberId);
}

// ── Team Member Interface ────────────────────────────────────────────────────

export type TeamMemberStatus = 'active' | 'part-time' | 'on_hold';

export interface TeamMember {
  id: string;
  projectId: string;
  name: string;
  role: string;
  firm: string;
  utilisationPercent: number;
  hoursLogged: number;
  hoursThisMonth: number;
  hoursBudget: number;
  status: TeamMemberStatus;
  consecutiveHighUtilWeeks?: number;
}

// ── Resource Stats Interface ─────────────────────────────────────────────────

export interface ResourceStats {
  totalMembers: number;
  averageUtilisation: number;
  hoursThisMonth: number;
  hoursBudget: number;
  pendingApprovals: number;
}

// ── Add Team Member Input ────────────────────────────────────────────────────

export interface AddTeamMemberData {
  name: string;
  role: string;
  firm: string;
  utilisationPercent?: number;
  hoursLogged?: number;
  hoursThisMonth?: number;
  hoursBudget?: number;
  status?: TeamMemberStatus;
  consecutiveHighUtilWeeks?: number;
  addedBy: string;
  addedByName: string;
}

// ── Over-Allocated Result ────────────────────────────────────────────────────

export interface OverAllocatedResult {
  overAllocatedMembers: TeamMember[];
  recommendation: AIRecommendation | null;
}

// ── Pure Function: isOverAllocated ───────────────────────────────────────────

/**
 * Pure function: determines if a team member is over-allocated.
 * A member is over-allocated when utilisationPercent > 90 AND
 * consecutiveHighUtilWeeks >= 2.
 */
export function isOverAllocated(member: TeamMember): boolean {
  return (
    member.utilisationPercent > 90 &&
    (member.consecutiveHighUtilWeeks ?? 0) >= 2
  );
}

// ── CRUD Operations ──────────────────────────────────────────────────────────

/**
 * Retrieves all team members for a project.
 */
export async function getTeamMembers(projectId: string): Promise<TeamMember[]> {
  try {
    const q = query(teamMembersCollection(projectId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ ...d.data(), id: d.id } as TeamMember));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `${PROJECTS_COL}/${projectId}/${TEAM_MEMBERS_COL}`);
    throw error;
  }
}

/**
 * Adds a new team member to the project. Validates required fields.
 * Records an audit trail entry on successful addition.
 */
export async function addTeamMember(
  projectId: string,
  data: AddTeamMemberData,
): Promise<TeamMember> {
  if (!data.name || !data.name.trim()) {
    throw new Error('Validation failed: Team member name is required');
  }
  if (!data.role || !data.role.trim()) {
    throw new Error('Validation failed: Team member role is required');
  }
  if (!data.firm || !data.firm.trim()) {
    throw new Error('Validation failed: Team member firm is required');
  }

  const id = generateId();

  const member: TeamMember = {
    id,
    projectId,
    name: data.name.trim(),
    role: data.role.trim(),
    firm: data.firm.trim(),
    utilisationPercent: data.utilisationPercent ?? 0,
    hoursLogged: data.hoursLogged ?? 0,
    hoursThisMonth: data.hoursThisMonth ?? 0,
    hoursBudget: data.hoursBudget ?? 0,
    status: data.status ?? 'active',
    consecutiveHighUtilWeeks: data.consecutiveHighUtilWeeks,
  };

  try {
    await addDoc(teamMembersCollection(projectId), member);

    // Record audit entry for team member addition
    void recordAudit({
      projectId,
      actorId: data.addedBy,
      actorName: data.addedByName,
      actionType: 'create',
      entityType: 'team_member',
      entityId: id,
      after: { name: member.name, role: member.role, firm: member.firm, status: member.status },
      timestamp: new Date().toISOString(),
    });

    return member;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${PROJECTS_COL}/${projectId}/${TEAM_MEMBERS_COL}`);
    throw error;
  }
}

/**
 * Removes a team member from the project.
 * Records an audit trail entry on successful removal.
 */
export async function removeTeamMember(
  projectId: string,
  memberId: string,
  actorId?: string,
  actorName?: string,
): Promise<void> {
  const docRef = teamMemberDocument(projectId, memberId);

  try {
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      throw new Error(`Team member ${memberId} not found in project ${projectId}`);
    }

    const existing = snap.data() as TeamMember;

    await deleteDoc(docRef);

    // Record audit entry for team member removal
    void recordAudit({
      projectId,
      actorId: actorId || 'system',
      actorName: actorName || 'System',
      actionType: 'delete',
      entityType: 'team_member',
      entityId: memberId,
      before: { name: existing.name, role: existing.role, firm: existing.firm, status: existing.status },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.DELETE, `${PROJECTS_COL}/${projectId}/${TEAM_MEMBERS_COL}/${memberId}`);
    throw error;
  }
}

// ── Statistics ───────────────────────────────────────────────────────────────

/**
 * Computes resource statistics for a project:
 * - totalMembers: count of all team members
 * - averageUtilisation: mean utilisationPercent across all members
 * - hoursThisMonth: sum of hours worked this month
 * - hoursBudget: sum of all hoursBudget allocations
 * - pendingApprovals: count of members with 'on_hold' status (awaiting approval)
 */
export async function getResourceStats(projectId: string): Promise<ResourceStats> {
  const members = await getTeamMembers(projectId);

  const totalMembers = members.length;
  const averageUtilisation =
    totalMembers > 0
      ? members.reduce((sum, m) => sum + m.utilisationPercent, 0) / totalMembers
      : 0;
  const hoursThisMonth = members.reduce((sum, m) => sum + m.hoursThisMonth, 0);
  const hoursBudget = members.reduce((sum, m) => sum + m.hoursBudget, 0);
  const pendingApprovals = members.filter((m) => m.status === 'on_hold').length;

  return {
    totalMembers,
    averageUtilisation: Math.round(averageUtilisation * 100) / 100,
    hoursThisMonth,
    hoursBudget,
    pendingApprovals,
  };
}

// ── Over-Allocation Detection ────────────────────────────────────────────────

/**
 * Checks for over-allocated team members. A member is over-allocated when
 * their utilisationPercent > 90 AND consecutiveHighUtilWeeks >= 2.
 *
 * When over-allocated members are found, generates an AI Advisor recommendation
 * suggesting resource rebalancing.
 */
export async function checkOverAllocated(projectId: string): Promise<OverAllocatedResult> {
  const members = await getTeamMembers(projectId);
  const overAllocatedMembers = members.filter(isOverAllocated);

  let recommendation: AIRecommendation | null = null;

  if (overAllocatedMembers.length > 0) {
    const memberNames = overAllocatedMembers.map((m) => m.name).join(', ');
    const memberCount = overAllocatedMembers.length;

    recommendation = {
      id: generateId(),
      projectId,
      category: 'risk_detection',
      title: `${memberCount} team member${memberCount > 1 ? 's' : ''} over-allocated`,
      explanation: `The following team member${memberCount > 1 ? 's have' : ' has'} been at >90% utilisation for 2+ consecutive weeks: ${memberNames}. Consider redistributing workload or bringing in additional resources to prevent burnout and delivery risks.`,
      suggestedActions: [
        {
          type: 'create_action',
          payload: {
            title: `Review resource allocation for over-utilised team members`,
            assigneeId: 'principal_agent',
            dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          },
        },
      ],
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
  }

  return { overAllocatedMembers, recommendation };
}

// ── Service Export ───────────────────────────────────────────────────────────

export const resourceManagerService = {
  getTeamMembers,
  addTeamMember,
  removeTeamMember,
  getResourceStats,
  checkOverAllocated,
  isOverAllocated,
};

export default resourceManagerService;
