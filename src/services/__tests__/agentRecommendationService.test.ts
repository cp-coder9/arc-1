import { describe, expect, it } from 'vitest';
import {
  recommendationsFromDocumentState,
  subscribeToRecommendations,
  generateFieldRecommendations,
  recommendNextActions,
} from '../agentRecommendationService';
import type { ReadinessReport, ReadinessFinding } from '../documentRegisterService';
import type { WorkflowEvent } from '../lifecycleTypes';
import type { AppointmentRecord } from '../appointmentService';
import type { KickoffPackage } from '../kickoffService';

describe('agentRecommendationService', () => {
  describe('recommendationsFromDocumentState', () => {
    it('generates recommendations from readiness reports with blockers', () => {
      const reports: ReadinessReport[] = [
        {
          checkName: 'municipal_submission',
          ready: false,
          findings: [{ code: 'MUNICIPAL_FORM_NOT_READY', priority: 'high', message: 'Form not ready', assignedRoles: ['architect'] }],
        },
      ];
      const events: WorkflowEvent[] = [];
      const recs = recommendationsFromDocumentState('proj-1', reports, events);
      expect(recs.length).toBeGreaterThan(0);
      expect(recs.some((r) => r.title.includes('municipal_submission'))).toBe(true);
    });

    it('includes event-based recommendations for high priority events', () => {
      const reports: ReadinessReport[] = [];
      const events: WorkflowEvent[] = [
        { id: 'evt-1', type: 'risk_detected', projectId: 'proj-1', title: 'Risk', detail: 'Critical issue', priority: 'critical', sourceModule: 'projects', assignedRoles: ['architect'], createdAt: new Date().toISOString() },
      ];
      const recs = recommendationsFromDocumentState('proj-1', reports, events);
      expect(recs.some((r) => r.id === 'rec-event-evt-1')).toBe(true);
      expect(recs.some((r) => r.requiresHumanApproval)).toBe(true);
    });

    it('returns empty array when no blockers or events', () => {
      const recs = recommendationsFromDocumentState('proj-1', [], []);
      expect(recs).toHaveLength(0);
    });
  });

  describe('recommendNextActions', () => {
    it('returns kickoff-related recommendations', () => {
      const appointment: AppointmentRecord = {
        appointmentId: 'appt-1',
        proposalSnapshot: { projectName: 'Test', clientId: 'c-1', professionalId: 'p-1', feeAmount: 100000, platformFee: { payerPlatformFee: 500, payeePlatformFee: 500 }, escrowMilestones: [] },
        projectFacts: { municipality: 'City', province: 'GP', professionalBody: 'SACAP', professionalRegistrationNumber: 'REG-001', landUseOrZoningKnown: true },
        status: 'confirmed',
        revision: 1,
        createdAtIso: new Date().toISOString(),
        requiresHumanApprovalBeforeFormalIssue: true,
        missingFacts: [],
      };
      const kickoff: KickoffPackage = {
        workspace: { projectId: 'proj-1', appointmentId: 'appt-1', projectName: 'Test', clientId: 'c-1', professionalId: 'p-1', phase: 'appointment_confirmed' as const, roles: [] },
        passport: { passportId: 'pp-1', projectId: 'proj-1', appointmentId: 'appt-1', facts: {} as any, complianceContext: [] },
        checklist: [],
        initialTasks: [{ id: 't-1', title: 'Initial task', phase: 'appointment' as const, ownerRole: 'architect' }],
        readiness: 'ready',
      };
      const recs = recommendNextActions(appointment, kickoff);
      expect(recs.length).toBeGreaterThanOrEqual(3);
      expect(recs.some((r) => r.id === 'rec-human-approve-appointment-letter')).toBe(true);
    });

    it('adds missing facts recommendation when facts are missing', () => {
      const appointment: AppointmentRecord = {
        appointmentId: 'appt-2',
        proposalSnapshot: { projectName: 'Test', clientId: 'c-1', professionalId: 'p-1', feeAmount: 100000, platformFee: { payerPlatformFee: 500, payeePlatformFee: 500 }, escrowMilestones: [] },
        projectFacts: { municipality: '', province: '', professionalBody: '', professionalRegistrationNumber: '', landUseOrZoningKnown: false },
        status: 'confirmed',
        revision: 1,
        createdAtIso: new Date().toISOString(),
        requiresHumanApprovalBeforeFormalIssue: false,
        missingFacts: ['Municipality is required', 'Province is required'],
      };
      const kickoff: KickoffPackage = {
        workspace: { projectId: 'proj-2', appointmentId: 'appt-2', projectName: 'Test', clientId: 'c-1', professionalId: 'p-1', phase: 'appointment_confirmed', roles: [] },
        passport: { projectId: 'proj-2', complianceContext: [], projectPhase: 'appointment' },
        checklist: [],
        initialTasks: [],
        readiness: { allRequiredFactsPresent: false, missingFacts: ['Municipality is required', 'Province is required'], hasAppointmentLetter: false, professionalConfirmed: true },
      };
      const recs = recommendNextActions(appointment, kickoff);
      expect(recs.some((r) => r.id === 'rec-request-missing-facts')).toBe(true);
    });

    it('adds zoning check when land use not known', () => {
      const appointment: AppointmentRecord = {
        appointmentId: 'appt-3',
        proposalSnapshot: { projectName: 'Test', clientId: 'c-1', professionalId: 'p-1', feeAmount: 100000, platformFee: { payerPlatformFee: 500, payeePlatformFee: 500 }, escrowMilestones: [] },
        projectFacts: { municipality: 'City', province: 'GP', professionalBody: 'SACAP', professionalRegistrationNumber: 'REG-001', landUseOrZoningKnown: false },
        status: 'confirmed',
        revision: 1,
        createdAtIso: new Date().toISOString(),
        requiresHumanApprovalBeforeFormalIssue: false,
        missingFacts: [],
      };
      const kickoff: KickoffPackage = {
        workspace: { projectId: 'proj-3', appointmentId: 'appt-3', projectName: 'Test', clientId: 'c-1', professionalId: 'p-1', phase: 'appointment_confirmed', roles: [] },
        passport: { projectId: 'proj-3', complianceContext: [], projectPhase: 'appointment' },
        checklist: [],
        initialTasks: [],
        readiness: { allRequiredFactsPresent: true, missingFacts: [], hasAppointmentLetter: false, professionalConfirmed: true },
      };
      const recs = recommendNextActions(appointment, kickoff);
      expect(recs.some((r) => r.id === 'rec-check-zoning')).toBe(true);
    });
  });

  describe('subscribeToRecommendations', () => {
    it('returns an unsubscribe function', () => {
      const unsubscribe = subscribeToRecommendations('proj-1');
      expect(typeof unsubscribe).toBe('function');
    });

    it('calls callback with empty array', () => {
      let called = false;
      subscribeToRecommendations('proj-1', (recs) => {
        called = true;
        expect(recs).toEqual([]);
      });
      expect(called).toBe(true);
    });
  });

  describe('generateFieldRecommendations', () => {
    it('returns empty array for any input', () => {
      const recs = generateFieldRecommendations({ someField: 'value' });
      expect(recs).toEqual([]);
    });
  });
});
