/**
 * Unit tests for projectLifecycleService
 * Tests the pure-function stage-transition logic.
 * Firestore operations are tested via integration tests.
 */

import { canTransition, stageIndex, stageToJobStatus } from '../projectLifecycleService';
import { ProjectStage, PROJECT_STAGE_ORDER } from '../../types';

describe('projectLifecycleService', () => {
  describe('stageIndex', () => {
    it('returns correct index for each stage', () => {
      expect(stageIndex('intake')).toBe(0);
      expect(stageIndex('scoping')).toBe(1);
      expect(stageIndex('appointment')).toBe(2);
      expect(stageIndex('coordination')).toBe(3);
      expect(stageIndex('compliance')).toBe(4);
      expect(stageIndex('tender')).toBe(5);
      expect(stageIndex('delivery')).toBe(6);
      expect(stageIndex('payments')).toBe(7);
      expect(stageIndex('closeout')).toBe(8);
    });

    it('returns -1 for an invalid stage', () => {
      expect(stageIndex('nonexistent' as ProjectStage)).toBe(-1);
    });
  });

  describe('canTransition', () => {
    it('allows forward transitions of exactly one step', () => {
      expect(canTransition('intake', 'scoping')).toBe(true);
      expect(canTransition('scoping', 'appointment')).toBe(true);
      expect(canTransition('appointment', 'coordination')).toBe(true);
      expect(canTransition('coordination', 'compliance')).toBe(true);
      expect(canTransition('compliance', 'tender')).toBe(true);
      expect(canTransition('tender', 'delivery')).toBe(true);
      expect(canTransition('delivery', 'payments')).toBe(true);
      expect(canTransition('payments', 'closeout')).toBe(true);
    });

    it('disallows backward transitions', () => {
      expect(canTransition('scoping', 'intake')).toBe(false);
      expect(canTransition('closeout', 'intake')).toBe(false);
      expect(canTransition('delivery', 'tender')).toBe(false);
    });

    it('disallows self-transitions', () => {
      expect(canTransition('intake', 'intake')).toBe(false);
      expect(canTransition('compliance', 'compliance')).toBe(false);
    });

    it('disallows skipping stages for non-admin', () => {
      expect(canTransition('intake', 'appointment')).toBe(false);
      expect(canTransition('intake', 'compliance')).toBe(false);
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
      expect(canTransition('invalid' as ProjectStage, 'scoping')).toBe(false);
      expect(canTransition('intake', 'invalid' as ProjectStage)).toBe(false);
    });
  });

  describe('stageToJobStatus', () => {
    it('maps intake and scoping to "open"', () => {
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
    it('has exactly 9 stages', () => {
      expect(PROJECT_STAGE_ORDER).toHaveLength(9);
    });

    it('starts with intake and ends with closeout', () => {
      expect(PROJECT_STAGE_ORDER[0]).toBe('intake');
      expect(PROJECT_STAGE_ORDER[8]).toBe('closeout');
    });

    it('contains all defined stages', () => {
      const expected: ProjectStage[] = [
        'intake', 'scoping', 'appointment', 'coordination',
        'compliance', 'tender', 'delivery', 'payments', 'closeout'
      ];
      expect(PROJECT_STAGE_ORDER).toEqual(expected);
    });
  });
});
