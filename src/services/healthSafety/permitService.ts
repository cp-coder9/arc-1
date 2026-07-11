/**
 * Permit Service — Permit-to-Work System
 *
 * Manages permit lifecycle state machine, approval routing, time-window enforcement,
 * and expiry detection per Construction Regulations 2014 (Reg 13, 14).
 */

import type { Permit, PermitState } from './hsTypes';
import type { WorkflowEvent } from '../lifecycleTypes';
import { PermitRequestSchema } from './hsSchemas';
import { InvalidStateTransitionError } from './hsErrors';

/** Valid state transitions for the permit lifecycle. */
const VALID_TRANSITIONS: Record<PermitState, PermitState[]> = {
  draft: ['submitted'],
  submitted: ['approved', 'rejected'],
  approved: ['active'],
  active: ['expired', 'closed'],
  expired: ['closed'],
  closed: [],
  rejected: ['draft'],
};

/**
 * Creates a new permit request in 'submitted' state.
 * Validates input against PermitRequestSchema.
 */
export function requestPermit(
  input: Omit<Permit, 'id' | 'state' | 'createdAt' | 'updatedAt'>
): Permit {
  PermitRequestSchema.parse(input);

  const now = new Date().toISOString();
  return {
    ...input,
    id: `hs-ptw-${Date.now()}`,
    state: 'submitted',
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Approves a permit. Only valid from 'submitted' state.
 */
export function approvePermit(permit: Permit, approverId: string): Permit {
  if (permit.state !== 'submitted') {
    throw new InvalidStateTransitionError('Permit', permit.state, 'approved');
  }

  return {
    ...permit,
    state: 'approved',
    approvedBy: approverId,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Rejects a permit. Only valid from 'submitted' state.
 */
export function rejectPermit(permit: Permit): Permit {
  if (permit.state !== 'submitted') {
    throw new InvalidStateTransitionError('Permit', permit.state, 'rejected');
  }

  return {
    ...permit,
    state: 'rejected',
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Transitions a permit to a new state with validation.
 * Throws InvalidStateTransitionError for invalid transitions.
 */
export function transitionPermitState(permit: Permit, newState: PermitState, actor: string): Permit {
  const allowed = VALID_TRANSITIONS[permit.state];
  if (!allowed.includes(newState)) {
    throw new InvalidStateTransitionError('Permit', permit.state, newState);
  }

  return {
    ...permit,
    state: newState,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Checks if an active permit has exceeded its valid time window.
 *
 * Returns { expired: true, event } if now > validTo for an 'active' permit.
 * Returns { expired: false } otherwise.
 */
export function checkPermitExpiry(
  permit: Permit,
  now: Date
): { expired: boolean; event?: WorkflowEvent } {
  if (permit.state !== 'active' || !permit.validTo) {
    return { expired: false };
  }

  const validTo = new Date(permit.validTo);
  if (now > validTo) {
    return {
      expired: true,
      event: {
        id: `evt-permit-expired-${permit.id}`,
        projectId: permit.projectId,
        sourceModule: 'health_safety',
        type: 'permit_expired',
        priority: 'high',
        title: `Permit ${permit.id} has expired`,
        detail: `${permit.type} permit at ${permit.location} expired at ${permit.validTo}. Requires formal close-out or renewal.`,
        createdAt: now.toISOString(),
        assignedRoles: ['site_manager'],
      },
    };
  }

  return { expired: false };
}

/**
 * Closes out a permit recording close-out details.
 * Valid from 'active' or 'expired' state.
 */
export function closeOutPermit(
  permit: Permit,
  actor: string,
  conditionsMet: boolean
): Permit {
  if (permit.state !== 'active' && permit.state !== 'expired') {
    throw new InvalidStateTransitionError('Permit', permit.state, 'closed');
  }

  return {
    ...permit,
    state: 'closed',
    closeOutBy: actor,
    closeOutAt: new Date().toISOString(),
    closeOutConditionsMet: conditionsMet,
    updatedAt: new Date().toISOString(),
  };
}
