// @vitest-environment jsdom
/**
 * Property Tests for Escrow Integration
 *
 * Feature: pack-marketplace, Property 17: Payment release requires conjunction of conditions
 * Feature: pack-marketplace, Property 29: Escrow state machine rejects invalid transitions with blockers
 *
 * **Validates: Requirements 9.2, 9.6**
 */
import * as fc from 'fast-check';

// ── Types ────────────────────────────────────────────────────────────────────

type EscrowState = 'created' | 'funded_held' | 'released' | 'dispute_hold' | 'refunded';

interface ReleaseConditions {
  milestoneComplete: boolean;
  deliverableUploaded: boolean;
  deliverableDocId: string | null;
  aiReviewPassed: boolean;
  professionalSignOff: boolean;
}

interface EscrowTransitionResult {
  allowed: boolean;
  blockers?: string[];
  newState?: EscrowState;
}

interface AuditLogEntry {
  escrowId: string;
  transition: string;
  blocked: boolean;
  blockers: string[];
  timestamp: string;
}

// ── Escrow State Machine Logic ───────────────────────────────────────────────

const VALID_TRANSITIONS: Record<EscrowState, EscrowState[]> = {
  created: ['funded_held'],
  funded_held: ['released', 'dispute_hold', 'refunded'],
  released: [],
  dispute_hold: ['released', 'refunded'],
  refunded: [],
};

function evaluateReleaseConditions(conditions: ReleaseConditions): { canRelease: boolean; blockers: string[] } {
  const blockers: string[] = [];
  if (!conditions.milestoneComplete) {
    blockers.push('Milestone not marked complete by hiring party');
  }
  if (!conditions.deliverableUploaded || !conditions.deliverableDocId) {
    blockers.push('Deliverable not uploaded with valid document identifier');
  }
  if (!conditions.aiReviewPassed && !conditions.professionalSignOff) {
    blockers.push('Neither AI Review "passed" nor Professional sign-off recorded');
  }
  return { canRelease: blockers.length === 0, blockers };
}

function evaluateEscrowStateTransition(
  currentState: EscrowState,
  requestedState: EscrowState,
  conditions?: ReleaseConditions
): EscrowTransitionResult {
  const allowedNextStates = VALID_TRANSITIONS[currentState];
  if (!allowedNextStates.includes(requestedState)) {
    return {
      allowed: false,
      blockers: [`Cannot transition from "${currentState}" to "${requestedState}"`],
    };
  }
  if (requestedState === 'released' && currentState === 'funded_held') {
    if (!conditions) {
      return { allowed: false, blockers: ['Release conditions not provided'] };
    }
    const { canRelease, blockers } = evaluateReleaseConditions(conditions);
    if (!canRelease) {
      return { allowed: false, blockers };
    }
  }
  return { allowed: true, newState: requestedState };
}

const auditLog: AuditLogEntry[] = [];

function attemptTransition(
  escrowId: string,
  currentState: EscrowState,
  requestedState: EscrowState,
  conditions?: ReleaseConditions
): EscrowTransitionResult {
  const result = evaluateEscrowStateTransition(currentState, requestedState, conditions);
  if (!result.allowed) {
    auditLog.push({
      escrowId,
      transition: `${currentState} → ${requestedState}`,
      blocked: true,
      blockers: result.blockers ?? [],
      timestamp: new Date().toISOString(),
    });
  }
  return result;
}

// ── Arbitraries ──────────────────────────────────────────────────────────────

const escrowStateArb = fc.constantFrom<EscrowState>('created', 'funded_held', 'released', 'dispute_hold', 'refunded');
const allStatesArb = fc.constantFrom<EscrowState>('created', 'funded_held', 'released', 'dispute_hold', 'refunded');

const releaseConditionsArb: fc.Arbitrary<ReleaseConditions> = fc.record({
  milestoneComplete: fc.boolean(),
  deliverableUploaded: fc.boolean(),
  deliverableDocId: fc.option(fc.uuid(), { nil: null }),
  aiReviewPassed: fc.boolean(),
  professionalSignOff: fc.boolean(),
});

const invalidReleaseConditionsArb: fc.Arbitrary<ReleaseConditions> = releaseConditionsArb.filter(c => {
  const hasValidDoc = c.deliverableUploaded && c.deliverableDocId !== null;
  const hasApproval = c.aiReviewPassed || c.professionalSignOff;
  return !(c.milestoneComplete && hasValidDoc && hasApproval);
});

const escrowIdArb = fc.uuid().map(id => `esc-${id}`);

// ── Property 17: Payment release requires conjunction of conditions ──────────

// Feature: pack-marketplace, Property 17: Payment release requires conjunction of conditions
describe('Property 17: Payment release requires conjunction of conditions', () => {
  // **Validates: Requirements 5.6, 9.2**

  it('escrow releases funds if and only if all three conditions are satisfied', () => {
    fc.assert(
      fc.property(releaseConditionsArb, (conditions) => {
        const milestoneComplete = conditions.milestoneComplete;
        const hasValidDeliverable = conditions.deliverableUploaded && conditions.deliverableDocId !== null;
        const hasApproval = conditions.aiReviewPassed || conditions.professionalSignOff;
        const allMet = milestoneComplete && hasValidDeliverable && hasApproval;

        const result = evaluateEscrowStateTransition('funded_held', 'released', conditions);

        if (allMet) {
          expect(result.allowed).toBe(true);
          expect(result.newState).toBe('released');
        } else {
          expect(result.allowed).toBe(false);
          expect(result.blockers).toBeDefined();
          expect(result.blockers!.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('release is allowed when milestone complete + valid doc + AI review passed', () => {
    fc.assert(
      fc.property(fc.uuid(), (docId) => {
        const conditions: ReleaseConditions = {
          milestoneComplete: true,
          deliverableUploaded: true,
          deliverableDocId: docId,
          aiReviewPassed: true,
          professionalSignOff: false,
        };
        const result = evaluateEscrowStateTransition('funded_held', 'released', conditions);
        expect(result.allowed).toBe(true);
        expect(result.newState).toBe('released');
      }),
      { numRuns: 100 },
    );
  });

  it('release is allowed when milestone complete + valid doc + professional sign-off', () => {
    fc.assert(
      fc.property(fc.uuid(), (docId) => {
        const conditions: ReleaseConditions = {
          milestoneComplete: true,
          deliverableUploaded: true,
          deliverableDocId: docId,
          aiReviewPassed: false,
          professionalSignOff: true,
        };
        const result = evaluateEscrowStateTransition('funded_held', 'released', conditions);
        expect(result.allowed).toBe(true);
        expect(result.newState).toBe('released');
      }),
      { numRuns: 100 },
    );
  });

  it('release is blocked when any condition is missing', () => {
    fc.assert(
      fc.property(invalidReleaseConditionsArb, (conditions) => {
        const result = evaluateEscrowStateTransition('funded_held', 'released', conditions);
        expect(result.allowed).toBe(false);
        expect(result.blockers).toBeDefined();
        expect(result.blockers!.length).toBeGreaterThan(0);
        for (const blocker of result.blockers!) {
          expect(typeof blocker).toBe('string');
          expect(blocker.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 200 },
    );
  });
});

// ── Property 29: Escrow state machine rejects invalid transitions with blockers ─

// Feature: pack-marketplace, Property 29: Escrow state machine rejects invalid transitions with blockers
describe('Property 29: Escrow state machine rejects invalid transitions with blockers', () => {
  // **Validates: Requirements 9.6**

  it('invalid transitions are blocked with blockers array and logged', () => {
    fc.assert(
      fc.property(escrowStateArb, allStatesArb, escrowIdArb, (currentState, requestedState, escrowId) => {
        const allowedNextStates = VALID_TRANSITIONS[currentState];
        const isValidTransition = allowedNextStates.includes(requestedState);

        if (requestedState === 'released' && currentState === 'funded_held') return;
        if (requestedState === 'released' && currentState === 'dispute_hold') return;

        auditLog.length = 0;
        const result = attemptTransition(escrowId, currentState, requestedState);

        if (!isValidTransition) {
          expect(result.allowed).toBe(false);
          expect(result.blockers).toBeDefined();
          expect(Array.isArray(result.blockers)).toBe(true);
          expect(result.blockers!.length).toBeGreaterThan(0);
          expect(auditLog.length).toBe(1);
          expect(auditLog[0].escrowId).toBe(escrowId);
          expect(auditLog[0].blocked).toBe(true);
          expect(auditLog[0].blockers.length).toBeGreaterThan(0);
          expect(auditLog[0].timestamp.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('terminal states (released, refunded) reject all transitions', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<EscrowState>('released', 'refunded'),
        allStatesArb,
        escrowIdArb,
        (terminalState, requestedState, escrowId) => {
          auditLog.length = 0;
          const result = attemptTransition(escrowId, terminalState, requestedState);
          expect(result.allowed).toBe(false);
          expect(result.blockers).toBeDefined();
          expect(result.blockers!.length).toBeGreaterThan(0);
          expect(auditLog.length).toBe(1);
          expect(auditLog[0].blocked).toBe(true);
        }
      ),
      { numRuns: 100 },
    );
  });

  it('valid structural transitions from funded_held are allowed without release conditions check (for non-release)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<EscrowState>('dispute_hold', 'refunded'),
        escrowIdArb,
        (targetState, escrowId) => {
          auditLog.length = 0;
          const result = attemptTransition(escrowId, 'funded_held', targetState);
          expect(result.allowed).toBe(true);
          expect(result.newState).toBe(targetState);
          expect(auditLog.length).toBe(0);
        }
      ),
      { numRuns: 100 },
    );
  });
});
