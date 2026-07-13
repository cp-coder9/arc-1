/**
 * Unit tests for Permit state machine edge cases.
 *
 * Validates: Requirements 9.1, 9.2
 */

import { describe, it, expect } from 'vitest';
import {
  requestPermit,
  approvePermit,
  transitionPermitState,
  checkPermitExpiry,
  closeOutPermit,
} from '../permitService';
import { InvalidStateTransitionError } from '../hsErrors';
import type { Permit } from '../hsTypes';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makePermit(overrides: Partial<Permit> = {}): Permit {
  return {
    id: 'hs-ptw-test-1',
    projectId: 'proj-1',
    type: 'excavation',
    location: 'Site A - Trench 1',
    hazards: ['Cave-in', 'Underground services'],
    precautions: ['Shoring installed', 'Service scan completed'],
    responsiblePersons: ['John Smith'],
    requestedBy: 'user-1',
    state: 'submitted',
    createdAt: '2026-01-01T08:00:00.000Z',
    updatedAt: '2026-01-01T08:00:00.000Z',
    ...overrides,
  };
}

// ─── 1. Invalid Transitions Throw InvalidStateTransitionError ───────────────

describe('Permit State Machine — Invalid Transitions', () => {
  it('approvePermit from "draft" state throws InvalidStateTransitionError', () => {
    const permit = makePermit({ state: 'draft' });
    expect(() => approvePermit(permit, 'approver-1')).toThrow(InvalidStateTransitionError);
  });

  it('transitionPermitState from "closed" to any state throws InvalidStateTransitionError', () => {
    const permit = makePermit({ state: 'closed' });
    expect(() => transitionPermitState(permit, 'draft', 'actor-1')).toThrow(InvalidStateTransitionError);
    expect(() => transitionPermitState(permit, 'submitted', 'actor-1')).toThrow(InvalidStateTransitionError);
    expect(() => transitionPermitState(permit, 'approved', 'actor-1')).toThrow(InvalidStateTransitionError);
    expect(() => transitionPermitState(permit, 'active', 'actor-1')).toThrow(InvalidStateTransitionError);
    expect(() => transitionPermitState(permit, 'expired', 'actor-1')).toThrow(InvalidStateTransitionError);
  });

  it('closeOutPermit from "submitted" state throws InvalidStateTransitionError', () => {
    const permit = makePermit({ state: 'submitted' });
    expect(() => closeOutPermit(permit, 'actor-1', true)).toThrow(InvalidStateTransitionError);
  });

  it('approvePermit from "active" state throws InvalidStateTransitionError', () => {
    const permit = makePermit({ state: 'active' });
    expect(() => approvePermit(permit, 'approver-1')).toThrow(InvalidStateTransitionError);
  });
});

// ─── 2. Reject → Draft → Resubmit Flow ─────────────────────────────────────

describe('Permit State Machine — Reject → Draft → Resubmit Flow', () => {
  it('supports rejected → draft → submitted lifecycle', () => {
    // Start with a submitted permit
    const submitted = makePermit({ state: 'submitted' });

    // Transition to rejected
    const rejected = transitionPermitState(submitted, 'rejected', 'reviewer-1');
    expect(rejected.state).toBe('rejected');

    // Transition back to draft
    const draft = transitionPermitState(rejected, 'draft', 'requester-1');
    expect(draft.state).toBe('draft');

    // Resubmit (draft → submitted)
    const resubmitted = transitionPermitState(draft, 'submitted', 'requester-1');
    expect(resubmitted.state).toBe('submitted');
  });
});

// ─── 3. All Valid State Transitions in Lifecycle ────────────────────────────

describe('Permit State Machine — Valid Transitions', () => {
  it('draft → submitted', () => {
    const permit = makePermit({ state: 'draft' });
    const result = transitionPermitState(permit, 'submitted', 'actor-1');
    expect(result.state).toBe('submitted');
  });

  it('submitted → approved', () => {
    const permit = makePermit({ state: 'submitted' });
    const result = transitionPermitState(permit, 'approved', 'actor-1');
    expect(result.state).toBe('approved');
  });

  it('approved → active', () => {
    const permit = makePermit({ state: 'approved' });
    const result = transitionPermitState(permit, 'active', 'actor-1');
    expect(result.state).toBe('active');
  });

  it('active → expired', () => {
    const permit = makePermit({ state: 'active' });
    const result = transitionPermitState(permit, 'expired', 'actor-1');
    expect(result.state).toBe('expired');
  });

  it('expired → closed', () => {
    const permit = makePermit({ state: 'expired' });
    const result = transitionPermitState(permit, 'closed', 'actor-1');
    expect(result.state).toBe('closed');
  });

  it('active → closed (direct close-out)', () => {
    const permit = makePermit({ state: 'active' });
    const result = transitionPermitState(permit, 'closed', 'actor-1');
    expect(result.state).toBe('closed');
  });
});

// ─── 4. checkPermitExpiry Only Checks Active Permits ────────────────────────

describe('Permit State Machine — checkPermitExpiry', () => {
  it('permit in "submitted" state with past validTo returns { expired: false }', () => {
    const permit = makePermit({
      state: 'submitted',
      validTo: '2026-01-01T10:00:00.000Z',
    });
    const now = new Date('2026-01-02T10:00:00.000Z'); // past validTo

    const result = checkPermitExpiry(permit, now);
    expect(result.expired).toBe(false);
    expect(result.event).toBeUndefined();
  });

  it('permit in "active" state with past validTo returns { expired: true, event }', () => {
    const permit = makePermit({
      state: 'active',
      validTo: '2026-01-01T10:00:00.000Z',
    });
    const now = new Date('2026-01-02T10:00:00.000Z'); // past validTo

    const result = checkPermitExpiry(permit, now);
    expect(result.expired).toBe(true);
    expect(result.event).toBeDefined();
    expect(result.event!.type).toBe('permit_expired');
    expect(result.event!.priority).toBe('high');
  });

  it('permit in "active" state with future validTo returns { expired: false }', () => {
    const permit = makePermit({
      state: 'active',
      validTo: '2026-01-10T10:00:00.000Z',
    });
    const now = new Date('2026-01-05T10:00:00.000Z'); // before validTo

    const result = checkPermitExpiry(permit, now);
    expect(result.expired).toBe(false);
    expect(result.event).toBeUndefined();
  });
});

// ─── 5. closeOutPermit Records Details Correctly ────────────────────────────

describe('Permit State Machine — closeOutPermit', () => {
  it('close from "active" → state is "closed" with close-out details populated', () => {
    const permit = makePermit({ state: 'active' });

    const result = closeOutPermit(permit, 'closer-1', true);

    expect(result.state).toBe('closed');
    expect(result.closeOutBy).toBe('closer-1');
    expect(result.closeOutAt).toBeDefined();
    expect(result.closeOutConditionsMet).toBe(true);
  });

  it('close from "expired" → state is "closed" with close-out details populated', () => {
    const permit = makePermit({ state: 'expired' });

    const result = closeOutPermit(permit, 'closer-2', false);

    expect(result.state).toBe('closed');
    expect(result.closeOutBy).toBe('closer-2');
    expect(result.closeOutAt).toBeDefined();
    expect(result.closeOutConditionsMet).toBe(false);
  });
});

// ─── Property-Based Tests ───────────────────────────────────────────────────

import fc from 'fast-check';

/**
 * Property 18: Permit close-out records details
 *
 * Validates: Requirements 9.5
 */
describe('Property 18: Permit close-out records details', () => {
  const validCloseStates = fc.constantFrom('active' as const, 'expired' as const);
  const invalidCloseStates = fc.constantFrom('draft' as const, 'submitted' as const, 'approved' as const, 'closed' as const, 'rejected' as const);

  it('closeOutPermit from active/expired state produces closed state with correct close-out details', () => {
    fc.assert(
      fc.property(
        validCloseStates,
        fc.string({ minLength: 1 }),
        fc.boolean(),
        (state, actor, conditionsMet) => {
          const permit = makePermit({ state });

          const result = closeOutPermit(permit, actor, conditionsMet);

          // State must be 'closed'
          expect(result.state).toBe('closed');

          // closeOutBy must equal the actor
          expect(result.closeOutBy).toBe(actor);

          // closeOutAt must be a non-empty string (ISO timestamp)
          expect(typeof result.closeOutAt).toBe('string');
          expect(result.closeOutAt!.length).toBeGreaterThan(0);

          // closeOutConditionsMet must equal the input conditionsMet
          expect(result.closeOutConditionsMet).toBe(conditionsMet);
        }
      )
    );
  });

  it('closeOutPermit from invalid states throws InvalidStateTransitionError', () => {
    fc.assert(
      fc.property(
        invalidCloseStates,
        fc.string({ minLength: 1 }),
        fc.boolean(),
        (state, actor, conditionsMet) => {
          const permit = makePermit({ state });

          expect(() => closeOutPermit(permit, actor, conditionsMet)).toThrow(
            InvalidStateTransitionError
          );
        }
      )
    );
  });
});


/**
 * Property 17: Permit time-window enforcement and expiry transition
 *
 * For any Permit in 'active' state with a validTo timestamp:
 * - If now > validTo → checkPermitExpiry returns { expired: true } with a high-priority WorkflowEvent
 * - If now <= validTo → checkPermitExpiry returns { expired: false } with no event
 *
 * Validates: Requirements 9.3, 9.4
 */
describe('Property 17: Permit time-window enforcement and expiry transition', () => {
  // Constrain dates to a reasonable range to avoid overflow
  const reasonableDate = fc.integer({
    min: new Date('2000-01-01T00:00:00.000Z').getTime(),
    max: new Date('2100-12-31T23:59:59.999Z').getTime(),
  }).map((ts) => new Date(ts));

  it('active permit with now > validTo returns expired with high-priority event', () => {
    fc.assert(
      fc.property(
        reasonableDate,
        fc.integer({ min: 1, max: 365 * 24 * 60 * 60 * 1000 }), // 1ms to 1 year offset
        (validToDate, offsetMs) => {
          // now is strictly after validTo
          const now = new Date(validToDate.getTime() + offsetMs);

          const permit = makePermit({
            state: 'active',
            validTo: validToDate.toISOString(),
          });

          const result = checkPermitExpiry(permit, now);

          // Must report expired
          expect(result.expired).toBe(true);

          // Must include a WorkflowEvent
          expect(result.event).toBeDefined();

          // Event priority must be 'high'
          expect(result.event!.priority).toBe('high');
        }
      )
    );
  });

  it('active permit with now <= validTo returns not expired with no event', () => {
    fc.assert(
      fc.property(
        reasonableDate,
        fc.integer({ min: 0, max: 365 * 24 * 60 * 60 * 1000 }), // 0ms to 1 year offset
        (validToDate, offsetMs) => {
          // now is at or before validTo
          const now = new Date(validToDate.getTime() - offsetMs);

          const permit = makePermit({
            state: 'active',
            validTo: validToDate.toISOString(),
          });

          const result = checkPermitExpiry(permit, now);

          // Must report not expired
          expect(result.expired).toBe(false);

          // Must not include an event
          expect(result.event).toBeUndefined();
        }
      )
    );
  });
});
