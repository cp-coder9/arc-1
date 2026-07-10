/**
 * EA Tracker Service — Unit Tests
 *
 * Tests for Environmental Authorisation application lifecycle tracking:
 * stage transitions, decision branching, appeal paths, and regulatory
 * timeframe calculations based on NEMA EIA Regulations 2014.
 *
 * Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7, 16.8
 */

import { describe, expect, it } from 'vitest';

import type { EAApplication, EAStage } from '../types';
import {
  calculateRegulatoryTimeframes,
  getPermittedTransitions,
  transitionEAApplication,
} from '../services/eaTracker';

// ─── Test Fixtures ────────────────────────────────────────────────────────────

function createBaseApplication(overrides?: Partial<EAApplication>): EAApplication {
  return {
    id: 'ea-001',
    projectId: 'proj-001',
    applicationReferenceNumber: 'DEA/EIA/2026/001',
    applicantName: 'Test Developer (Pty) Ltd',
    eapName: 'Green Consulting',
    eapRegistrationNumber: 'EAP-2026-001',
    assessmentType: 'basic_assessment',
    competentAuthority: 'DFFE',
    listedActivities: [],
    screeningId: 'scr-001',
    applicationSubmissionDate: '2026-01-15',
    currentStage: 'pre_application',
    stageHistory: [{ stage: 'pre_application', date: '2026-01-10', actor: 'user-001' }],
    createdAt: '2026-01-10T00:00:00.000Z',
    updatedAt: '2026-01-10T00:00:00.000Z',
    ...overrides,
  };
}

const ACTOR_PARAMS = { actorId: 'user-001' };

// ─── getPermittedTransitions ──────────────────────────────────────────────────

describe('getPermittedTransitions', () => {
  describe('Basic Assessment transitions', () => {
    it('returns application_submitted from pre_application', () => {
      const result = getPermittedTransitions('basic_assessment', 'pre_application');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(['application_submitted']);
      }
    });

    it('returns acknowledgement_received from application_submitted', () => {
      const result = getPermittedTransitions('basic_assessment', 'application_submitted');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(['acknowledgement_received']);
      }
    });

    it('returns public_participation from acknowledgement_received', () => {
      const result = getPermittedTransitions('basic_assessment', 'acknowledgement_received');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(['public_participation']);
      }
    });

    it('returns decision branches from decision_issued', () => {
      const result = getPermittedTransitions('basic_assessment', 'decision_issued');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(['ea_granted', 'ea_refused']);
      }
    });

    it('returns appeal_period from ea_granted', () => {
      const result = getPermittedTransitions('basic_assessment', 'ea_granted');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(['appeal_period']);
      }
    });

    it('returns appeal_period from ea_refused', () => {
      const result = getPermittedTransitions('basic_assessment', 'ea_refused');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(['appeal_period']);
      }
    });

    it('returns appeal_lodged from appeal_period', () => {
      const result = getPermittedTransitions('basic_assessment', 'appeal_period');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(['appeal_lodged']);
      }
    });

    it('returns appeal_decision from appeal_lodged', () => {
      const result = getPermittedTransitions('basic_assessment', 'appeal_lodged');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(['appeal_decision']);
      }
    });

    it('returns empty array from terminal state appeal_decision', () => {
      const result = getPermittedTransitions('basic_assessment', 'appeal_decision');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual([]);
      }
    });

    it('returns empty for scoping stages in basic_assessment', () => {
      const result = getPermittedTransitions('basic_assessment', 'scoping_report_submitted');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual([]);
      }
    });
  });

  describe('Scoping & EIR transitions', () => {
    it('returns scoping_report_submitted from pre_application', () => {
      const result = getPermittedTransitions('scoping_and_eir', 'pre_application');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(['scoping_report_submitted']);
      }
    });

    it('returns authority_acceptance_scoping from scoping_report_submitted', () => {
      const result = getPermittedTransitions('scoping_and_eir', 'scoping_report_submitted');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(['authority_acceptance_scoping']);
      }
    });

    it('returns specialist_studies from authority_acceptance_scoping', () => {
      const result = getPermittedTransitions('scoping_and_eir', 'authority_acceptance_scoping');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(['specialist_studies']);
      }
    });

    it('returns eir_submitted from specialist_studies', () => {
      const result = getPermittedTransitions('scoping_and_eir', 'specialist_studies');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(['eir_submitted']);
      }
    });

    it('returns authority_review from eir_submitted', () => {
      const result = getPermittedTransitions('scoping_and_eir', 'eir_submitted');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(['authority_review']);
      }
    });

    it('returns decision branches from decision_issued', () => {
      const result = getPermittedTransitions('scoping_and_eir', 'decision_issued');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(['ea_granted', 'ea_refused']);
      }
    });

    it('returns empty for basic assessment stages in scoping_and_eir', () => {
      const result = getPermittedTransitions('scoping_and_eir', 'bar_submitted');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual([]);
      }
    });
  });

  describe('error handling', () => {
    it('returns error for missing assessment type', () => {
      const result = getPermittedTransitions(
        '' as 'basic_assessment',
        'pre_application',
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_INPUT');
      }
    });

    it('returns error for missing current stage', () => {
      const result = getPermittedTransitions(
        'basic_assessment',
        '' as EAStage,
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_INPUT');
      }
    });

    it('returns error for invalid assessment type', () => {
      const result = getPermittedTransitions(
        'invalid_type' as 'basic_assessment',
        'pre_application',
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_ASSESSMENT_TYPE');
      }
    });
  });
});

// ─── transitionEAApplication ──────────────────────────────────────────────────

describe('transitionEAApplication', () => {
  describe('valid sequential transitions', () => {
    it('transitions from pre_application to application_submitted (BA)', () => {
      const app = createBaseApplication();
      const result = transitionEAApplication(app, 'application_submitted', ACTOR_PARAMS);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.valid).toBe(true);
        expect(result.data.next.currentStage).toBe('application_submitted');
        expect(result.data.next.stageHistory).toHaveLength(2);
        expect(result.data.next.stageHistory[1].stage).toBe('application_submitted');
        expect(result.data.next.stageHistory[1].actor).toBe('user-001');
      }
    });

    it('transitions from pre_application to scoping_report_submitted (S&EIR)', () => {
      const app = createBaseApplication({
        assessmentType: 'scoping_and_eir',
      });
      const result = transitionEAApplication(app, 'scoping_report_submitted', ACTOR_PARAMS);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.valid).toBe(true);
        expect(result.data.next.currentStage).toBe('scoping_report_submitted');
      }
    });

    it('transitions through authority_review to decision_issued', () => {
      const app = createBaseApplication({
        currentStage: 'authority_review',
        stageHistory: [
          { stage: 'pre_application', date: '2026-01-10', actor: 'user-001' },
          { stage: 'authority_review', date: '2026-03-15', actor: 'user-001' },
        ],
      });
      const result = transitionEAApplication(app, 'decision_issued', ACTOR_PARAMS);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.valid).toBe(true);
        expect(result.data.next.currentStage).toBe('decision_issued');
      }
    });
  });

  describe('decision branching', () => {
    it('transitions to ea_granted from decision_issued', () => {
      const app = createBaseApplication({
        currentStage: 'decision_issued',
        stageHistory: [
          { stage: 'pre_application', date: '2026-01-10', actor: 'user-001' },
          { stage: 'decision_issued', date: '2026-05-01', actor: 'user-001' },
        ],
      });
      const result = transitionEAApplication(app, 'ea_granted', {
        actorId: 'user-001',
        decisionOutcome: 'ea_granted',
        decisionReferenceNumber: 'REF/2026/001',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.valid).toBe(true);
        expect(result.data.next.currentStage).toBe('ea_granted');
        expect(result.data.next.decisionOutcome).toBe('ea_granted');
        expect(result.data.next.decisionDate).toBeDefined();
        expect(result.data.next.decisionReferenceNumber).toBe('REF/2026/001');
      }
    });

    it('transitions to ea_refused from decision_issued', () => {
      const app = createBaseApplication({
        currentStage: 'decision_issued',
        stageHistory: [
          { stage: 'pre_application', date: '2026-01-10', actor: 'user-001' },
          { stage: 'decision_issued', date: '2026-05-01', actor: 'user-001' },
        ],
      });
      const result = transitionEAApplication(app, 'ea_refused', {
        actorId: 'user-001',
        decisionOutcome: 'ea_refused',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.valid).toBe(true);
        expect(result.data.next.currentStage).toBe('ea_refused');
        expect(result.data.next.decisionOutcome).toBe('ea_refused');
        expect(result.data.next.decisionDate).toBeDefined();
      }
    });
  });

  describe('appeal path', () => {
    it('transitions from ea_granted to appeal_period', () => {
      const app = createBaseApplication({
        currentStage: 'ea_granted',
        decisionOutcome: 'ea_granted',
        decisionDate: '2026-05-01',
        stageHistory: [
          { stage: 'pre_application', date: '2026-01-10', actor: 'user-001' },
          { stage: 'ea_granted', date: '2026-05-01', actor: 'user-001' },
        ],
      });
      const result = transitionEAApplication(app, 'appeal_period', ACTOR_PARAMS);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.valid).toBe(true);
        expect(result.data.next.currentStage).toBe('appeal_period');
        expect(result.data.next.appealPeriodEndDate).toBe('2026-05-21');
      }
    });

    it('transitions from appeal_period to appeal_lodged', () => {
      const app = createBaseApplication({
        currentStage: 'appeal_period',
        decisionOutcome: 'ea_refused',
        decisionDate: '2026-05-01',
        appealPeriodEndDate: '2026-05-21',
        stageHistory: [
          { stage: 'pre_application', date: '2026-01-10', actor: 'user-001' },
          { stage: 'appeal_period', date: '2026-05-02', actor: 'user-001' },
        ],
      });
      const result = transitionEAApplication(app, 'appeal_lodged', ACTOR_PARAMS);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.valid).toBe(true);
        expect(result.data.next.currentStage).toBe('appeal_lodged');
      }
    });

    it('transitions from appeal_lodged to appeal_decision', () => {
      const app = createBaseApplication({
        currentStage: 'appeal_lodged',
        stageHistory: [
          { stage: 'pre_application', date: '2026-01-10', actor: 'user-001' },
          { stage: 'appeal_lodged', date: '2026-05-15', actor: 'user-001' },
        ],
      });
      const result = transitionEAApplication(app, 'appeal_decision', ACTOR_PARAMS);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.valid).toBe(true);
        expect(result.data.next.currentStage).toBe('appeal_decision');
      }
    });
  });

  describe('invalid transitions', () => {
    it('rejects skipping stages (pre_application to authority_review)', () => {
      const app = createBaseApplication();
      const result = transitionEAApplication(app, 'authority_review', ACTOR_PARAMS);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.valid).toBe(false);
        expect(result.data.next.currentStage).toBe('pre_application');
      }
    });

    it('rejects backward transitions', () => {
      const app = createBaseApplication({
        currentStage: 'authority_review',
      });
      const result = transitionEAApplication(app, 'bar_submitted', ACTOR_PARAMS);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.valid).toBe(false);
      }
    });

    it('rejects transition from terminal state', () => {
      const app = createBaseApplication({
        currentStage: 'appeal_decision',
      });
      const result = transitionEAApplication(app, 'pre_application', ACTOR_PARAMS);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.valid).toBe(false);
      }
    });

    it('rejects scoping stage for basic assessment', () => {
      const app = createBaseApplication({
        currentStage: 'pre_application',
        assessmentType: 'basic_assessment',
      });
      const result = transitionEAApplication(app, 'scoping_report_submitted', ACTOR_PARAMS);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.valid).toBe(false);
      }
    });
  });

  describe('error handling', () => {
    it('returns error when application is null', () => {
      const result = transitionEAApplication(
        null as unknown as EAApplication,
        'application_submitted',
        ACTOR_PARAMS,
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_APPLICATION');
      }
    });

    it('returns error when actorId is missing', () => {
      const app = createBaseApplication();
      const result = transitionEAApplication(app, 'application_submitted', {
        actorId: '',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ACTOR_REQUIRED');
      }
    });

    it('returns error for invalid assessment type on application', () => {
      const app = createBaseApplication({ assessmentType: 'none' });
      const result = transitionEAApplication(app, 'application_submitted', ACTOR_PARAMS);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_ASSESSMENT_TYPE');
      }
    });
  });
});

// ─── calculateRegulatoryTimeframes ────────────────────────────────────────────

describe('calculateRegulatoryTimeframes', () => {
  describe('Basic Assessment timeframes', () => {
    it('calculates days elapsed since acknowledgement (107-day period)', () => {
      const app = createBaseApplication({
        assessmentType: 'basic_assessment',
        currentStage: 'public_participation',
        stageHistory: [
          { stage: 'pre_application', date: '2026-01-10', actor: 'user-001' },
          { stage: 'application_submitted', date: '2026-01-15', actor: 'user-001' },
          { stage: 'acknowledgement_received', date: '2026-01-20', actor: 'user-001' },
          { stage: 'public_participation', date: '2026-02-01', actor: 'user-001' },
        ],
      });

      // 30 days after acknowledgement
      const now = new Date('2026-02-19');
      const result = calculateRegulatoryTimeframes(app, now);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0].stage).toBe('authority_decision');
        expect(result.data[0].prescribedDays).toBe(107);
        expect(result.data[0].elapsedDays).toBe(30);
        expect(result.data[0].isOverdue).toBe(false);
        expect(result.data[0].daysRemaining).toBe(77);
        expect(result.data[0].warningActive).toBe(false);
      }
    });

    it('activates warning when within 14 days of expiry', () => {
      const app = createBaseApplication({
        assessmentType: 'basic_assessment',
        currentStage: 'authority_review',
        stageHistory: [
          { stage: 'acknowledgement_received', date: '2026-01-20', actor: 'user-001' },
        ],
      });

      // 97 days after acknowledgement → 10 days remaining → warning active
      const now = new Date('2026-04-27');
      const result = calculateRegulatoryTimeframes(app, now);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data[0].elapsedDays).toBe(97);
        expect(result.data[0].daysRemaining).toBe(10);
        expect(result.data[0].warningActive).toBe(true);
        expect(result.data[0].isOverdue).toBe(false);
      }
    });

    it('marks as overdue when prescribed period exceeded', () => {
      const app = createBaseApplication({
        assessmentType: 'basic_assessment',
        currentStage: 'authority_review',
        stageHistory: [
          { stage: 'acknowledgement_received', date: '2026-01-20', actor: 'user-001' },
        ],
      });

      // 110 days after acknowledgement → overdue
      const now = new Date('2026-05-10');
      const result = calculateRegulatoryTimeframes(app, now);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data[0].elapsedDays).toBe(110);
        expect(result.data[0].isOverdue).toBe(true);
        expect(result.data[0].daysRemaining).toBe(0);
        expect(result.data[0].warningActive).toBe(false);
      }
    });

    it('returns empty array when no acknowledgement in history', () => {
      const app = createBaseApplication({
        assessmentType: 'basic_assessment',
        currentStage: 'application_submitted',
        stageHistory: [
          { stage: 'pre_application', date: '2026-01-10', actor: 'user-001' },
          { stage: 'application_submitted', date: '2026-01-15', actor: 'user-001' },
        ],
      });

      const now = new Date('2026-02-19');
      const result = calculateRegulatoryTimeframes(app, now);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(0);
      }
    });
  });

  describe('Scoping & EIR timeframes', () => {
    it('calculates scoping acceptance timeframe (43 days)', () => {
      const app = createBaseApplication({
        assessmentType: 'scoping_and_eir',
        currentStage: 'scoping_report_submitted',
        stageHistory: [
          { stage: 'pre_application', date: '2026-01-10', actor: 'user-001' },
          { stage: 'scoping_report_submitted', date: '2026-02-01', actor: 'user-001' },
        ],
      });

      // 20 days after scoping submission
      const now = new Date('2026-02-21');
      const result = calculateRegulatoryTimeframes(app, now);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0].stage).toBe('scoping_acceptance');
        expect(result.data[0].prescribedDays).toBe(43);
        expect(result.data[0].elapsedDays).toBe(20);
        expect(result.data[0].daysRemaining).toBe(23);
        expect(result.data[0].isOverdue).toBe(false);
        expect(result.data[0].warningActive).toBe(false);
      }
    });

    it('calculates EIR decision timeframe (107 days from acceptance)', () => {
      const app = createBaseApplication({
        assessmentType: 'scoping_and_eir',
        currentStage: 'specialist_studies',
        stageHistory: [
          { stage: 'scoping_report_submitted', date: '2026-02-01', actor: 'user-001' },
          { stage: 'authority_acceptance_scoping', date: '2026-02-20', actor: 'user-001' },
          { stage: 'specialist_studies', date: '2026-03-01', actor: 'user-001' },
        ],
      });

      // 40 days after acceptance
      const now = new Date('2026-04-01');
      const result = calculateRegulatoryTimeframes(app, now);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(2);
        // Scoping acceptance timeframe
        const scopingTf = result.data.find((t) => t.stage === 'scoping_acceptance');
        expect(scopingTf).toBeDefined();
        expect(scopingTf!.prescribedDays).toBe(43);

        // EIR decision timeframe
        const eirTf = result.data.find((t) => t.stage === 'eir_decision');
        expect(eirTf).toBeDefined();
        expect(eirTf!.prescribedDays).toBe(107);
        expect(eirTf!.elapsedDays).toBe(40);
        expect(eirTf!.daysRemaining).toBe(67);
      }
    });

    it('activates warning on scoping timeframe within 14 days', () => {
      const app = createBaseApplication({
        assessmentType: 'scoping_and_eir',
        currentStage: 'scoping_report_submitted',
        stageHistory: [
          { stage: 'scoping_report_submitted', date: '2026-02-01', actor: 'user-001' },
        ],
      });

      // 35 days after submission → 8 days remaining → warning active
      const now = new Date('2026-03-08');
      const result = calculateRegulatoryTimeframes(app, now);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data[0].elapsedDays).toBe(35);
        expect(result.data[0].daysRemaining).toBe(8);
        expect(result.data[0].warningActive).toBe(true);
      }
    });

    it('marks scoping timeframe as overdue', () => {
      const app = createBaseApplication({
        assessmentType: 'scoping_and_eir',
        currentStage: 'scoping_report_submitted',
        stageHistory: [
          { stage: 'scoping_report_submitted', date: '2026-02-01', actor: 'user-001' },
        ],
      });

      // 50 days after submission → overdue
      const now = new Date('2026-03-23');
      const result = calculateRegulatoryTimeframes(app, now);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data[0].elapsedDays).toBe(50);
        expect(result.data[0].isOverdue).toBe(true);
        expect(result.data[0].daysRemaining).toBe(0);
        expect(result.data[0].warningActive).toBe(false);
      }
    });
  });

  describe('edge cases', () => {
    it('returns error when application is null', () => {
      const result = calculateRegulatoryTimeframes(
        null as unknown as EAApplication,
        new Date(),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_APPLICATION');
      }
    });

    it('warning is active exactly at 14 days remaining', () => {
      const app = createBaseApplication({
        assessmentType: 'basic_assessment',
        currentStage: 'authority_review',
        stageHistory: [
          { stage: 'acknowledgement_received', date: '2026-01-20', actor: 'user-001' },
        ],
      });

      // 93 days elapsed → 14 days remaining → warning active
      const now = new Date('2026-04-23');
      const result = calculateRegulatoryTimeframes(app, now);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data[0].elapsedDays).toBe(93);
        expect(result.data[0].daysRemaining).toBe(14);
        expect(result.data[0].warningActive).toBe(true);
        expect(result.data[0].isOverdue).toBe(false);
      }
    });

    it('warning is not active at 15 days remaining', () => {
      const app = createBaseApplication({
        assessmentType: 'basic_assessment',
        currentStage: 'authority_review',
        stageHistory: [
          { stage: 'acknowledgement_received', date: '2026-01-20', actor: 'user-001' },
        ],
      });

      // 92 days elapsed → 15 days remaining → warning not active
      const now = new Date('2026-04-22');
      const result = calculateRegulatoryTimeframes(app, now);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data[0].elapsedDays).toBe(92);
        expect(result.data[0].daysRemaining).toBe(15);
        expect(result.data[0].warningActive).toBe(false);
      }
    });

    it('exactly at prescribed period boundary (107 days elapsed)', () => {
      const app = createBaseApplication({
        assessmentType: 'basic_assessment',
        currentStage: 'authority_review',
        stageHistory: [
          { stage: 'acknowledgement_received', date: '2026-01-20', actor: 'user-001' },
        ],
      });

      // Exactly 107 days
      const now = new Date('2026-05-07');
      const result = calculateRegulatoryTimeframes(app, now);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data[0].elapsedDays).toBe(107);
        expect(result.data[0].daysRemaining).toBe(0);
        expect(result.data[0].isOverdue).toBe(false);
        expect(result.data[0].warningActive).toBe(true);
      }
    });
  });
});
