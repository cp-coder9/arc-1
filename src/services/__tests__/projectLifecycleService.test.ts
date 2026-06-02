/**
 * Unit tests for projectLifecycleService
 * Tests the pure-function stage-transition logic.
 * Firestore operations are tested via integration tests.
 */

import {
  assertStageGateTransitionAllowed,
  canTransition,
  evaluateStageGateTransition,
  getMissingStageGateRequirements,
  getStageGateRequirements,
  stageIndex,
  stageToJobStatus,
  STAGE_GATE_REQUIREMENTS,
} from '../projectLifecycleService';
import { ProjectStage, PROJECT_STAGE_ORDER } from '../../types';

describe('projectLifecycleService', () => {
  describe('stageIndex', () => {
    it('returns correct index for each PRD canonical stage and treats scoping as legacy brief stage', () => {
      expect(stageIndex('intake')).toBe(0);
      expect(stageIndex('scoping')).toBe(0);
      expect(stageIndex('appointment')).toBe(1);
      expect(stageIndex('coordination')).toBe(2);
      expect(stageIndex('compliance')).toBe(3);
      expect(stageIndex('tender')).toBe(4);
      expect(stageIndex('delivery')).toBe(5);
      expect(stageIndex('payments')).toBe(6);
      expect(stageIndex('closeout')).toBe(7);
    });

    it('returns -1 for an invalid stage', () => {
      expect(stageIndex('nonexistent' as ProjectStage)).toBe(-1);
    });
  });

  describe('canTransition', () => {
    it('allows forward transitions of exactly one PRD stage and supports legacy scoping records', () => {
      expect(canTransition('intake', 'appointment')).toBe(true);
      expect(canTransition('scoping', 'appointment')).toBe(true);
      expect(canTransition('appointment', 'coordination')).toBe(true);
      expect(canTransition('coordination', 'compliance')).toBe(true);
      expect(canTransition('compliance', 'tender')).toBe(true);
      expect(canTransition('tender', 'delivery')).toBe(true);
      expect(canTransition('delivery', 'payments')).toBe(true);
      expect(canTransition('payments', 'closeout')).toBe(true);
    });

    it('disallows backward transitions', () => {
      expect(canTransition('appointment', 'intake')).toBe(false);
      expect(canTransition('appointment', 'scoping')).toBe(false);
      expect(canTransition('closeout', 'intake')).toBe(false);
      expect(canTransition('delivery', 'tender')).toBe(false);
    });

    it('disallows self-transitions', () => {
      expect(canTransition('intake', 'intake')).toBe(false);
      expect(canTransition('scoping', 'scoping')).toBe(false);
      expect(canTransition('compliance', 'compliance')).toBe(false);
    });

    it('disallows non-canonical scoping transitions and skipping stages for non-admin', () => {
      expect(canTransition('intake', 'scoping')).toBe(false);
      expect(canTransition('intake', 'coordination')).toBe(false);
      expect(canTransition('appointment', 'compliance')).toBe(false);
      expect(canTransition('scoping', 'tender')).toBe(false);
    });

    it('allows admin override to skip stages forward', () => {
      expect(canTransition('intake', 'appointment', true)).toBe(true);
      expect(canTransition('intake', 'compliance', true)).toBe(true);
      expect(canTransition('scoping', 'tender', true)).toBe(true);
      expect(canTransition('intake', 'closeout', true)).toBe(true);
    });

    it('disallows admin backward transitions even with override', () => {
      expect(canTransition('compliance', 'intake', true)).toBe(false);
      expect(canTransition('delivery', 'scoping', true)).toBe(false);
    });

    it('handles invalid stage gracefully', () => {
      expect(canTransition('invalid' as ProjectStage, 'appointment')).toBe(false);
      expect(canTransition('intake', 'invalid' as ProjectStage)).toBe(false);
    });
  });

  describe('stageToJobStatus', () => {
    it('maps the PRD brief stage and legacy scoping records to "open"', () => {
      expect(stageToJobStatus('intake')).toBe('open');
      expect(stageToJobStatus('scoping')).toBe('open');
    });

    it('maps middle stages to "in-progress"', () => {
      expect(stageToJobStatus('appointment')).toBe('in-progress');
      expect(stageToJobStatus('coordination')).toBe('in-progress');
      expect(stageToJobStatus('compliance')).toBe('in-progress');
      expect(stageToJobStatus('tender')).toBe('in-progress');
      expect(stageToJobStatus('delivery')).toBe('in-progress');
    });

    it('maps payments and closeout to "completed"', () => {
      expect(stageToJobStatus('payments')).toBe('completed');
      expect(stageToJobStatus('closeout')).toBe('completed');
    });
  });

  describe('PROJECT_STAGE_ORDER', () => {
    it('has exactly the 8 canonical PRD stages', () => {
      expect(PROJECT_STAGE_ORDER).toHaveLength(8);
    });

    it('starts with intake and ends with closeout', () => {
      expect(PROJECT_STAGE_ORDER[0]).toBe('intake');
      expect(PROJECT_STAGE_ORDER[7]).toBe('closeout');
    });

    it('contains all PRD canonical stages and excludes legacy scoping', () => {
      const expected: ProjectStage[] = [
        'intake', 'appointment', 'coordination',
        'compliance', 'tender', 'delivery', 'payments', 'closeout'
      ];
      expect(PROJECT_STAGE_ORDER).toEqual(expected);
      expect(PROJECT_STAGE_ORDER).not.toContain('scoping');
    });
  });

  describe('PRD stage-gate requirements', () => {
    it('defines governed requirements for every post-brief canonical stage', () => {
      expect(Object.keys(STAGE_GATE_REQUIREMENTS)).toEqual([
        'appointment',
        'coordination',
        'compliance',
        'tender',
        'delivery',
        'payments',
        'closeout',
      ]);

      expect(getStageGateRequirements('appointment').map(requirement => requirement.key)).toEqual([
        'clientBriefCompleted',
        'technicalBriefApproved',
      ]);
      expect(getStageGateRequirements('payments').map(requirement => requirement.key)).toEqual([
        'constructionEvidenceSubmitted',
        'paymentClaimCertified',
        'escrowReleaseApproved',
      ]);
      expect(getStageGateRequirements('intake')).toEqual([]);
      expect(getStageGateRequirements('scoping')).toEqual([]);
    });

    it('reports missing evidence for target stage progression', () => {
      expect(getMissingStageGateRequirements('coordination', {
        verifiedProfessionalAppointed: true,
      }).map(requirement => requirement.key)).toEqual([
        'appointmentAgreementSigned',
        'escrowPlanInitialized',
      ]);
    });

    it('blocks a valid stage transition when PRD gate evidence is missing', () => {
      const evaluation = evaluateStageGateTransition('intake', 'appointment', {
        clientBriefCompleted: true,
      });

      expect(evaluation.transitionRulePassed).toBe(true);
      expect(evaluation.transitionAllowed).toBe(false);
      expect(evaluation.missingRequirements.map(requirement => requirement.key)).toEqual(['technicalBriefApproved']);
      expect(() => assertStageGateTransitionAllowed(evaluation)).toThrow(/Stage gate blocked/);
    });

    it('allows stage progression when transition rule and all PRD gates pass', () => {
      const evaluation = evaluateStageGateTransition('intake', 'appointment', {
        clientBriefCompleted: true,
        technicalBriefApproved: true,
      });

      expect(evaluation.transitionAllowed).toBe(true);
      expect(() => assertStageGateTransitionAllowed(evaluation)).not.toThrow();
    });

    it('keeps admin override bound by PRD evidence gates', () => {
      const blocked = evaluateStageGateTransition('intake', 'compliance', {}, true);
      expect(blocked.transitionRulePassed).toBe(true);
      expect(blocked.transitionAllowed).toBe(false);
      expect(blocked.missingRequirements.map(requirement => requirement.key)).toEqual([
        'designPackageApproved',
        'drawingRegisterReady',
      ]);

      const allowed = evaluateStageGateTransition('intake', 'compliance', {
        designPackageApproved: true,
        drawingRegisterReady: true,
      }, true);
      expect(allowed.transitionAllowed).toBe(true);
    });

    it('reports invalid transitions separately from missing gate evidence', () => {
      const evaluation = evaluateStageGateTransition('coordination', 'appointment', {
        clientBriefCompleted: true,
        technicalBriefApproved: true,
      });

      expect(evaluation.transitionRulePassed).toBe(false);
      expect(evaluation.transitionAllowed).toBe(false);
      expect(() => assertStageGateTransitionAllowed(evaluation)).toThrow(/Invalid transition/);
    });
  });
});
