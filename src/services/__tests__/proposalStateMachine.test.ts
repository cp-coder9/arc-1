import {
  ProposalStateMachine,
  createProposalStateMachine,
  createProposalFromCalculator,
  VALID_TRANSITIONS,
  ALL_PROPOSAL_STATES,
  PROPOSAL_STATE_INFO,
  approveProposal,
  acceptProposal,
  rejectProposal,
  requestRevision,
  withdrawProposal,
  convertToAppointment,
  attachTerms,
} from '../proposalStateMachine';
import type { ProposalStatus } from '../../types/proposalBuilder';

describe('ProposalStateMachine', () => {
  const actor = { id: 'user-1', role: 'architect' };
  const clientActor = { id: 'client-1', role: 'client' };

  describe('initialization', () => {
    it('starts in draft state by default', () => {
      const machine = new ProposalStateMachine('prop-1');
      expect(machine.currentState).toBe('draft');
      expect(machine.isTerminal).toBe(false);
      expect(machine.isMutable).toBe(true);
    });

    it('starts in calculator_completed when using factory', () => {
      const machine = createProposalFromCalculator('prop-2');
      expect(machine.currentState).toBe('calculator_completed');
    });

    it('creates initial audit trail entry', () => {
      const machine = new ProposalStateMachine('prop-3');
      const history = machine.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0].to).toBe('draft');
      expect(history[0].reason).toBe('Proposal created');
    });
  });

  describe('state info', () => {
    it('provides state info for every state', () => {
      ALL_PROPOSAL_STATES.forEach((state) => {
        const info = PROPOSAL_STATE_INFO[state];
        expect(info).toBeDefined();
        expect(info.label).toBeTruthy();
        expect(typeof info.isTerminal).toBe('boolean');
      });
    });

    it('identifies terminal states correctly', () => {
      expect(PROPOSAL_STATE_INFO.accepted.isTerminal).toBe(true);
      expect(PROPOSAL_STATE_INFO.rejected.isTerminal).toBe(true);
      expect(PROPOSAL_STATE_INFO.withdrawn.isTerminal).toBe(true);
      expect(PROPOSAL_STATE_INFO.converted_to_appointment.isTerminal).toBe(true);
      expect(PROPOSAL_STATE_INFO.draft.isTerminal).toBe(false);
      expect(PROPOSAL_STATE_INFO.issued.isTerminal).toBe(false);
    });

    it('identifies mutable states correctly', () => {
      expect(PROPOSAL_STATE_INFO.draft.isMutable).toBe(true);
      expect(PROPOSAL_STATE_INFO.calculator_completed.isMutable).toBe(true);
      expect(PROPOSAL_STATE_INFO.terms_attached.isMutable).toBe(true);
      expect(PROPOSAL_STATE_INFO.issued.isMutable).toBe(false);
      expect(PROPOSAL_STATE_INFO.accepted.isMutable).toBe(false);
    });
  });

  describe('transitions', () => {
    it('validates transitions for every state', () => {
      ALL_PROPOSAL_STATES.forEach((state) => {
        const next = VALID_TRANSITIONS[state];
        expect(Array.isArray(next)).toBe(true);
      });
    });

    it('rejects invalid transitions', () => {
      const machine = new ProposalStateMachine('prop-1');
      expect(() => machine.transition('accepted', actor)).toThrow('Invalid state transition');
    });

    it('rejects transition to same state when not valid', () => {
      const machine = new ProposalStateMachine('prop-1');
      // draft -> draft is not valid
      expect(machine.validNextStates).not.toContain('draft');
    });

    it('allows draft → calculator_completed', () => {
      const machine = new ProposalStateMachine('prop-1');
      expect(machine.canTransitionTo('calculator_completed')).toBe(true);
      machine.transition('calculator_completed', actor, 'Fee calculation completed.');
      expect(machine.currentState).toBe('calculator_completed');
    });

    it('allows draft → withdrawn (terminal)', () => {
      const machine = new ProposalStateMachine('prop-1');
      machine.transition('withdrawn', actor, 'Withdrawn by professional.');
      expect(machine.currentState).toBe('withdrawn');
      expect(machine.isTerminal).toBe(true);
      expect(machine.validNextStates).toHaveLength(0);
    });
  });

  describe('full lifecycle — happy path', () => {
    it('completes the full draft → issued → accepted → converted_to_appointment flow', () => {
      const machine = new ProposalStateMachine('full-lifecycle-1');

      // draft → calculator_completed
      machine.transition('calculator_completed', actor);
      expect(machine.currentState).toBe('calculator_completed');

      // calculator_completed → terms_attached
      machine.transition('terms_attached', actor, 'Terms added.');
      expect(machine.currentState).toBe('terms_attached');

      // terms_attached → professional_approved
      machine.transition('professional_approved', actor, 'Professional reviewed.');
      expect(machine.currentState).toBe('professional_approved');

      // professional_approved → issued
      machine.transition('issued', actor, 'Issued to client.');
      expect(machine.currentState).toBe('issued');

      // issued → accepted
      machine.transition('accepted', clientActor, 'Client accepted.');
      expect(machine.currentState).toBe('accepted');
      expect(machine.isTerminal).toBe(true);

      // accepted → converted_to_appointment
      machine.transition('converted_to_appointment', actor, 'Converted.');
      expect(machine.currentState).toBe('converted_to_appointment');
    });
  });

  describe('full lifecycle — rejection path', () => {
    it('completes draft → issued → rejected flow', () => {
      const machine = new ProposalStateMachine('reject-lifecycle-1');
      machine.transition('calculator_completed', actor);
      machine.transition('terms_attached', actor);
      machine.transition('professional_approved', actor);
      machine.transition('issued', actor);
      machine.transition('rejected', clientActor, 'Client rejected the proposal.');
      expect(machine.currentState).toBe('rejected');
      expect(machine.isTerminal).toBe(true);
      // Cannot transition further
      expect(() => machine.transition('accepted', clientActor)).toThrow();
    });
  });

  describe('full lifecycle — revision path', () => {
    it('completes draft → issued → revision_requested flow', () => {
      const machine = new ProposalStateMachine('revision-lifecycle-1');
      machine.transition('calculator_completed', actor);
      machine.transition('terms_attached', actor);
      machine.transition('professional_approved', actor);
      machine.transition('issued', actor);
      machine.transition('revision_requested', clientActor, 'Client requested changes.');
      expect(machine.currentState).toBe('revision_requested');
      // revision_requested → draft (new revision)
      machine.transition('draft', actor, 'Creating revised proposal.');
      expect(machine.currentState).toBe('draft');
    });
  });

  describe('audit trail', () => {
    it('records every state change with metadata', () => {
      const machine = new ProposalStateMachine('audit-1');
      machine.transition('calculator_completed', actor, 'Calc done.', { fee: 100000 });

      const history = machine.getHistory();
      expect(history).toHaveLength(2);
      expect(history[1].from).toBe('draft');
      expect(history[1].to).toBe('calculator_completed');
      expect(history[1].actorId).toBe('user-1');
      expect(history[1].reason).toBe('Calc done.');
      expect(history[1].metadata).toEqual({ fee: 100000 });
      expect(history[1].timestamp).toBeTruthy();
    });

    it('tracks version number', () => {
      const machine = new ProposalStateMachine('version-1');
      expect(machine.trail.version).toBe(1);
      machine.transition('calculator_completed', actor);
      expect(machine.trail.version).toBe(2);
      machine.transition('terms_attached', actor);
      expect(machine.trail.version).toBe(3);
    });

    it('serializes and deserializes correctly', () => {
      const machine = new ProposalStateMachine('serial-1');
      machine.transition('calculator_completed', actor);
      machine.transition('terms_attached', actor);

      const serialized = machine.serialize();
      const restored = ProposalStateMachine.fromAuditTrail(serialized);

      expect(restored.currentState).toBe('terms_attached');
      expect(restored.getHistory()).toHaveLength(3);
      expect(restored.trail.version).toBe(3);
    });

    it('returns recent history', () => {
      const machine = new ProposalStateMachine('recent-1');
      machine.transition('calculator_completed', actor);
      machine.transition('terms_attached', actor);
      machine.transition('professional_approved', actor);
      machine.transition('issued', actor);

      const recent = machine.getRecentHistory(2);
      expect(recent).toHaveLength(2);
      expect(recent[0].to).toBe('professional_approved');
      expect(recent[1].to).toBe('issued');
    });
  });

  describe('convenience functions', () => {
    it('attachTerms transitions from calculator_completed → terms_attached', () => {
      const machine = createProposalFromCalculator('conven-1');
      const entry = attachTerms(machine, actor);
      expect(machine.currentState).toBe('terms_attached');
      expect(entry.from).toBe('calculator_completed');
      expect(entry.to).toBe('terms_attached');
    });

    it('approveProposal transitions from terms_attached → professional_approved', () => {
      const machine = createProposalFromCalculator('conven-2');
      attachTerms(machine, actor);
      const entry = approveProposal(machine, actor);
      expect(machine.currentState).toBe('professional_approved');
    });

    it('approveProposal transitions from professional_approved → issued', () => {
      const machine = createProposalFromCalculator('conven-3');
      attachTerms(machine, actor);
      approveProposal(machine, actor);
      const entry = approveProposal(machine, actor);
      expect(machine.currentState).toBe('issued');
    });

    it('acceptProposal transitions from issued → accepted', () => {
      const machine = new ProposalStateMachine('conven-4');
      machine.transition('calculator_completed', actor);
      machine.transition('terms_attached', actor);
      machine.transition('professional_approved', actor);
      machine.transition('issued', actor);
      const entry = acceptProposal(machine, clientActor);
      expect(machine.currentState).toBe('accepted');
    });

    it('rejectProposal transitions from issued → rejected', () => {
      const machine = new ProposalStateMachine('conven-5');
      machine.transition('calculator_completed', actor);
      machine.transition('terms_attached', actor);
      machine.transition('professional_approved', actor);
      machine.transition('issued', actor);
      const entry = rejectProposal(machine, clientActor, 'Too expensive.');
      expect(machine.currentState).toBe('rejected');
      expect(entry.reason).toContain('Too expensive.');
    });

    it('requestRevision transitions from issued → revision_requested', () => {
      const machine = new ProposalStateMachine('conven-6');
      machine.transition('calculator_completed', actor);
      machine.transition('terms_attached', actor);
      machine.transition('professional_approved', actor);
      machine.transition('issued', actor);
      const entry = requestRevision(machine, clientActor, 'Need more detail.');
      expect(machine.currentState).toBe('revision_requested');
    });

    it('withdrawProposal works from multiple states', () => {
      // From draft
      const m1 = new ProposalStateMachine('withdraw-1');
      withdrawProposal(m1, actor);
      expect(m1.currentState).toBe('withdrawn');

      // From issued
      const m2 = new ProposalStateMachine('withdraw-2');
      m2.transition('calculator_completed', actor);
      m2.transition('terms_attached', actor);
      m2.transition('professional_approved', actor);
      m2.transition('issued', actor);
      withdrawProposal(m2, actor, 'Project cancelled.');
      expect(m2.currentState).toBe('withdrawn');
    });

    it('convertToAppointment transitions from accepted → converted_to_appointment', () => {
      const machine = new ProposalStateMachine('conven-7');
      machine.transition('calculator_completed', actor);
      machine.transition('terms_attached', actor);
      machine.transition('professional_approved', actor);
      machine.transition('issued', actor);
      machine.transition('accepted', clientActor);
      const entry = convertToAppointment(machine, actor);
      expect(machine.currentState).toBe('converted_to_appointment');
    });

    it('throws when approving from wrong state', () => {
      const machine = new ProposalStateMachine('err-1');
      // Can't approve from draft
      expect(() => approveProposal(machine, actor)).toThrow();
    });
  });

  describe('terminal states', () => {
    it('rejected state has no valid transitions', () => {
      const machine = new ProposalStateMachine('term-1');
      machine.transition('calculator_completed', actor);
      machine.transition('terms_attached', actor);
      machine.transition('professional_approved', actor);
      machine.transition('issued', actor);
      machine.transition('rejected', clientActor);
      expect(machine.isTerminal).toBe(true);
      expect(machine.validNextStates).toHaveLength(0);
      expect(() => machine.transition('accepted', clientActor)).toThrow();
    });

    it('withdrawn state has no valid transitions', () => {
      const machine = new ProposalStateMachine('term-2');
      machine.transition('withdrawn', actor);
      expect(machine.isTerminal).toBe(true);
      expect(() => machine.transition('draft', actor)).toThrow();
    });

    it('converted_to_appointment has no valid transitions', () => {
      const machine = new ProposalStateMachine('term-3');
      machine.transition('calculator_completed', actor);
      machine.transition('terms_attached', actor);
      machine.transition('professional_approved', actor);
      machine.transition('issued', actor);
      machine.transition('accepted', clientActor);
      machine.transition('converted_to_appointment', actor);
      expect(machine.isTerminal).toBe(true);
      expect(machine.validNextStates).toHaveLength(0);
    });
  });

  describe('error handling', () => {
    it('throws descriptive error with valid next states', () => {
      const machine = new ProposalStateMachine('err-2');
      try {
        machine.transition('issued', actor);
        fail('Expected error');
      } catch (e: unknown) {
        const msg = (e as Error).message;
        expect(msg).toContain('Invalid state transition');
        expect(msg).toContain('"draft"');
        expect(msg).toContain('"issued"');
        expect(msg).toContain('calculator_completed');
      }
    });

    it('throws from terminal states when transition attempted', () => {
      const machine = new ProposalStateMachine('err-3');
      machine.transition('withdrawn', actor);
      expect(() => machine.transition('draft', actor)).toThrow('Invalid state transition');
    });
  });

  describe('time tracking', () => {
    it('timeInCurrentState returns milliseconds', () => {
      const machine = new ProposalStateMachine('time-1');
      const time = machine.timeInCurrentState();
      expect(typeof time).toBe('number');
      expect(time).toBeGreaterThanOrEqual(0);
    });
  });

  describe('factory functions', () => {
    it('createProposalStateMachine starts at draft', () => {
      const machine = createProposalStateMachine('factory-1');
      expect(machine.currentState).toBe('draft');
    });

    it('createProposalFromCalculator starts at calculator_completed', () => {
      const machine = createProposalFromCalculator('factory-2');
      expect(machine.currentState).toBe('calculator_completed');
    });
  });
});
