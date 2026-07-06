/**
 * H&S Dashboard Service — Unit Tests + Property Tests
 *
 * Validates: Requirements 10.2, 10.3, 10.4
 */

import fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import { getDashboardData, getRoleView } from '../hsDashboardService';
import type { DashboardParams, HSDashboardData, HSViewRole } from '../hsDashboardService';
import type { SafetyFile, HSPlan, Permit, Incident, HazardEntry, Induction } from '../hsTypes';
import { MANDATORY_SAFETY_FILE_SECTIONS } from '../hsConstants';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeSafetyFile(completeSections: number, totalSections = 8): SafetyFile {
  const sections = MANDATORY_SAFETY_FILE_SECTIONS.slice(0, totalSections).map((s, i) => ({
    sectionId: s.sectionId,
    title: s.title,
    regulationRef: s.regulationRef,
    status: (i < completeSections ? 'complete' : 'incomplete') as 'complete' | 'incomplete',
    version: i < completeSections ? 1 : 0,
    linkedRecordIds: [],
  }));

  return {
    id: `sf-${Date.now()}-${Math.random()}`,
    projectId: 'proj-1',
    tenantId: 'tenant-1',
    sections,
    complianceScore: Math.round((completeSections / totalSections) * 100),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function makePlan(state: HSPlan['state']): HSPlan {
  return {
    id: `plan-${Date.now()}-${Math.random()}`,
    projectId: 'proj-1',
    version: 1,
    state,
    submittedBy: 'user-1',
    submittedAt: new Date().toISOString(),
  };
}

function makePermit(state: Permit['state']): Permit {
  return {
    id: `permit-${Date.now()}-${Math.random()}`,
    projectId: 'proj-1',
    type: 'excavation',
    location: 'Zone A',
    hazards: ['collapse'],
    precautions: ['shoring'],
    responsiblePersons: ['user-1'],
    requestedBy: 'user-1',
    state,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function makeIncident(state: Incident['state']): Incident {
  return {
    id: `inc-${Date.now()}-${Math.random()}`,
    projectId: 'proj-1',
    date: '2025-01-15',
    time: '09:30',
    location: 'Building A',
    personsInvolved: ['worker-1'],
    injuryClassification: 'first_aid',
    description: 'Minor cut',
    immediateActions: 'First aid applied',
    isSection24Notifiable: false,
    state,
    correctiveActions: [],
    reportedBy: 'user-1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function makeHazard(residualRisk: HazardEntry['residualRisk']): HazardEntry {
  const likelihoodMap = { low: 1, medium: 2, high: 3, critical: 5 } as const;
  const severityMap = { low: 1, medium: 3, high: 4, critical: 5 } as const;
  const likelihood = likelihoodMap[residualRisk] as 1 | 2 | 3 | 4 | 5;
  const severity = severityMap[residualRisk] as 1 | 2 | 3 | 4 | 5;

  return {
    id: `haz-${Date.now()}-${Math.random()}`,
    projectId: 'proj-1',
    description: 'Test hazard',
    activity: 'Excavation',
    location: 'Zone A',
    likelihood,
    severity,
    riskRating: likelihood * severity,
    residualRisk,
    existingControls: ['barrier'],
    additionalControls: [],
    responsiblePerson: 'user-1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function makeInduction(): Induction {
  return {
    id: `ind-${Date.now()}-${Math.random()}`,
    projectId: 'proj-1',
    inducteeId: 'worker-1',
    inducteeName: 'Worker One',
    type: 'site',
    date: '2025-01-15',
    acknowledged: true,
    conductedBy: 'user-1',
    createdAt: new Date().toISOString(),
  };
}

function emptyParams(): DashboardParams {
  return {
    safetyFiles: [],
    plans: [],
    permits: [],
    incidents: [],
    hazards: [],
    inductions: [],
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('hsDashboardService', () => {
  describe('getDashboardData', () => {
    it('returns zero-state dashboard for empty project data', () => {
      const result = getDashboardData('health_safety', emptyParams());

      expect(result.safetyFileCompletion).toBe(0);
      expect(result.pendingPlanApprovals).toBe(0);
      expect(result.overduePermits).toBe(0);
      expect(result.upcomingInductions).toBe(0);
      expect(result.openInvestigations).toBe(0);
      expect(result.highCriticalHIRA).toBe(0);
    });

    it('aggregates safetyFileCompletion across multiple safety files', () => {
      // File 1: 4 of 8 sections complete → 50%
      // File 2: 8 of 8 sections complete → 100%
      // Average: (50 + 100) / 2 = 75%
      const params: DashboardParams = {
        ...emptyParams(),
        safetyFiles: [makeSafetyFile(4, 8), makeSafetyFile(8, 8)],
      };

      const result = getDashboardData('health_safety', params);
      expect(result.safetyFileCompletion).toBe(75);
    });

    it('counts pendingPlanApprovals correctly across multiple plans', () => {
      const params: DashboardParams = {
        ...emptyParams(),
        plans: [
          makePlan('pending_approval'),
          makePlan('pending_approval'),
          makePlan('approved'),
        ],
      };

      const result = getDashboardData('health_safety', params);
      expect(result.pendingPlanApprovals).toBe(2);
    });

    it('counts overduePermits from expired permits', () => {
      const params: DashboardParams = {
        ...emptyParams(),
        permits: [
          makePermit('expired'),
          makePermit('active'),
          makePermit('active'),
        ],
      };

      const result = getDashboardData('health_safety', params);
      expect(result.overduePermits).toBe(1);
    });

    it('counts openInvestigations from under_investigation and corrective_actions incidents', () => {
      const params: DashboardParams = {
        ...emptyParams(),
        incidents: [
          makeIncident('under_investigation'),
          makeIncident('corrective_actions'),
          makeIncident('closed'),
          makeIncident('reported'),
        ],
      };

      const result = getDashboardData('health_safety', params);
      expect(result.openInvestigations).toBe(2);
    });

    it('counts highCriticalHIRA from high and critical hazards', () => {
      const params: DashboardParams = {
        ...emptyParams(),
        hazards: [
          makeHazard('high'),
          makeHazard('critical'),
          makeHazard('low'),
          makeHazard('medium'),
        ],
      };

      const result = getDashboardData('health_safety', params);
      expect(result.highCriticalHIRA).toBe(2);
    });

    it('detects metric changes when data changes between calls', () => {
      const params1: DashboardParams = {
        ...emptyParams(),
        safetyFiles: [makeSafetyFile(4, 8)],
        plans: [makePlan('pending_approval')],
        permits: [makePermit('active')],
      };

      const result1 = getDashboardData('health_safety', params1);

      const params2: DashboardParams = {
        ...emptyParams(),
        safetyFiles: [makeSafetyFile(6, 8)],
        plans: [makePlan('approved')],
        permits: [makePermit('expired')],
      };

      const result2 = getDashboardData('health_safety', params2);

      // Values should change when inputs change
      expect(result2.safetyFileCompletion).not.toBe(result1.safetyFileCompletion);
      expect(result2.pendingPlanApprovals).not.toBe(result1.pendingPlanApprovals);
      expect(result2.overduePermits).not.toBe(result1.overduePermits);
    });
  });

  describe('getRoleView', () => {
    const fullData = getDashboardData('health_safety', {
      safetyFiles: [makeSafetyFile(4, 8)],
      plans: [makePlan('pending_approval')],
      permits: [makePermit('expired')],
      incidents: [makeIncident('under_investigation')],
      hazards: [makeHazard('high')],
      inductions: [makeInduction()],
    });

    it('health_safety role gets full operational view', () => {
      const view = getRoleView('health_safety', fullData);
      expect(view).toEqual(fullData);
    });

    it('contractor role gets file compliance, approvals, and permits', () => {
      const view = getRoleView('contractor', fullData);
      expect(view).toEqual({
        safetyFileCompletion: fullData.safetyFileCompletion,
        pendingPlanApprovals: fullData.pendingPlanApprovals,
        overduePermits: fullData.overduePermits,
      });
    });

    it('client role gets plan approval status and compliance scores only', () => {
      const view = getRoleView('client', fullData);
      expect(view).toEqual({
        pendingPlanApprovals: fullData.pendingPlanApprovals,
        safetyFileCompletion: fullData.safetyFileCompletion,
      });
    });

    it('architect role gets minimal/empty view', () => {
      const view = getRoleView('architect', fullData);
      expect(view).toEqual({});
    });
  });
});


// ─── Property-Based Tests ───────────────────────────────────────────────────

/**
 * Property 19: Dashboard role-differentiated aggregation
 *
 * For any set of project H&S data and any role in {health_safety, contractor, client, architect},
 * the dashboard service SHALL return a view containing only the metrics appropriate for that role.
 * The H&S Officer view SHALL include ALL keys from HSDashboardData.
 * The Contractor view SHALL include only: safetyFileCompletion, pendingPlanApprovals, overduePermits.
 * The Client view SHALL include only: pendingPlanApprovals, safetyFileCompletion.
 * The Architect view SHALL be empty (empty object).
 *
 * **Validates: Requirements 10.2, 10.4**
 */
describe('Property 19: Dashboard role-differentiated aggregation', () => {
  // ─── Arbitraries ────────────────────────────────────────────────────────────

  // Generate a SafetyFile with random number of complete sections
  const arbSafetyFile: fc.Arbitrary<SafetyFile> = fc
    .integer({ min: 0, max: 8 })
    .map((completeSections) => {
      const sections = MANDATORY_SAFETY_FILE_SECTIONS.map((s, i) => ({
        sectionId: s.sectionId,
        title: s.title,
        regulationRef: s.regulationRef,
        status: (i < completeSections ? 'complete' : 'incomplete') as 'complete' | 'incomplete',
        version: i < completeSections ? 1 : 0,
        linkedRecordIds: [],
      }));

      return {
        id: `sf-${Date.now()}-${Math.random()}`,
        projectId: 'proj-1',
        tenantId: 'tenant-1',
        sections,
        complianceScore: Math.round((completeSections / 8) * 100),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    });

  const arbHSPlanState = fc.constantFrom<HSPlan['state']>(
    'draft', 'submitted', 'pending_approval', 'approved', 'rejected'
  );

  const arbHSPlan: fc.Arbitrary<HSPlan> = arbHSPlanState.map((state) => ({
    id: `plan-${Date.now()}-${Math.random()}`,
    projectId: 'proj-1',
    version: 1,
    state,
    submittedBy: 'user-1',
    submittedAt: new Date().toISOString(),
  }));

  const arbPermitState = fc.constantFrom<Permit['state']>(
    'draft', 'submitted', 'approved', 'active', 'expired', 'closed', 'rejected'
  );

  const arbPermit: fc.Arbitrary<Permit> = arbPermitState.map((state) => ({
    id: `permit-${Date.now()}-${Math.random()}`,
    projectId: 'proj-1',
    type: 'excavation' as const,
    location: 'Zone A',
    hazards: ['collapse'],
    precautions: ['shoring'],
    responsiblePersons: ['user-1'],
    requestedBy: 'user-1',
    state,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));

  const arbIncidentState = fc.constantFrom<Incident['state']>(
    'reported', 'under_investigation', 'corrective_actions', 'closed'
  );

  const arbIncident: fc.Arbitrary<Incident> = arbIncidentState.map((state) => ({
    id: `inc-${Date.now()}-${Math.random()}`,
    projectId: 'proj-1',
    date: '2025-01-15',
    time: '09:30',
    location: 'Building A',
    personsInvolved: ['worker-1'],
    injuryClassification: 'first_aid' as const,
    description: 'Minor cut',
    immediateActions: 'First aid applied',
    isSection24Notifiable: false,
    state,
    correctiveActions: [],
    reportedBy: 'user-1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));

  const arbResidualRisk = fc.constantFrom<HazardEntry['residualRisk']>(
    'low', 'medium', 'high', 'critical'
  );

  const arbHazard: fc.Arbitrary<HazardEntry> = arbResidualRisk.map((residualRisk) => {
    const likelihoodMap = { low: 1, medium: 2, high: 3, critical: 5 } as const;
    const severityMap = { low: 1, medium: 3, high: 4, critical: 5 } as const;
    const likelihood = likelihoodMap[residualRisk] as 1 | 2 | 3 | 4 | 5;
    const severity = severityMap[residualRisk] as 1 | 2 | 3 | 4 | 5;

    return {
      id: `haz-${Date.now()}-${Math.random()}`,
      projectId: 'proj-1',
      description: 'Test hazard',
      activity: 'Excavation',
      location: 'Zone A',
      likelihood,
      severity,
      riskRating: likelihood * severity,
      residualRisk,
      existingControls: ['barrier'],
      additionalControls: [],
      responsiblePerson: 'user-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  });

  const arbInduction: fc.Arbitrary<Induction> = fc.constant({
    id: `ind-${Date.now()}-${Math.random()}`,
    projectId: 'proj-1',
    inducteeId: 'worker-1',
    inducteeName: 'Worker One',
    type: 'site' as const,
    date: '2025-01-15',
    acknowledged: true,
    conductedBy: 'user-1',
    createdAt: new Date().toISOString(),
  });

  // Generate a full DashboardParams with random data
  const arbDashboardParams: fc.Arbitrary<DashboardParams> = fc.record({
    safetyFiles: fc.array(arbSafetyFile, { minLength: 0, maxLength: 5 }),
    plans: fc.array(arbHSPlan, { minLength: 0, maxLength: 5 }),
    permits: fc.array(arbPermit, { minLength: 0, maxLength: 5 }),
    incidents: fc.array(arbIncident, { minLength: 0, maxLength: 5 }),
    hazards: fc.array(arbHazard, { minLength: 0, maxLength: 5 }),
    inductions: fc.array(arbInduction, { minLength: 0, maxLength: 5 }),
  });

  // All keys expected in a full HSDashboardData
  const ALL_DASHBOARD_KEYS: (keyof HSDashboardData)[] = [
    'safetyFileCompletion',
    'pendingPlanApprovals',
    'overduePermits',
    'upcomingInductions',
    'openInvestigations',
    'highCriticalHIRA',
  ];

  // ─── Property: H&S Officer view includes ALL keys from HSDashboardData ─────

  describe('H&S Officer (health_safety) gets full operational view', () => {
    it('view contains ALL keys from HSDashboardData', () => {
      fc.assert(
        fc.property(arbDashboardParams, (params) => {
          const data = getDashboardData('health_safety', params);
          const view = getRoleView('health_safety', data);

          // H&S Officer must see every key
          for (const key of ALL_DASHBOARD_KEYS) {
            expect(view).toHaveProperty(key);
          }

          // Values must match the full dashboard data
          expect(view).toEqual(data);
        }),
        { numRuns: 200 }
      );
    });
  });

  // ─── Property: Contractor view includes only specific keys ─────────────────

  describe('Contractor view includes only: safetyFileCompletion, pendingPlanApprovals, overduePermits', () => {
    it('view contains exactly the contractor-scoped keys', () => {
      fc.assert(
        fc.property(arbDashboardParams, (params) => {
          const data = getDashboardData('contractor', params);
          const view = getRoleView('contractor', data);

          const viewKeys = Object.keys(view).sort();
          const expectedKeys = ['overduePermits', 'pendingPlanApprovals', 'safetyFileCompletion'];

          expect(viewKeys).toEqual(expectedKeys);

          // Values must match the dashboard data for those keys
          expect(view.safetyFileCompletion).toBe(data.safetyFileCompletion);
          expect(view.pendingPlanApprovals).toBe(data.pendingPlanApprovals);
          expect(view.overduePermits).toBe(data.overduePermits);
        }),
        { numRuns: 200 }
      );
    });

    it('view does NOT contain upcomingInductions, openInvestigations, or highCriticalHIRA', () => {
      fc.assert(
        fc.property(arbDashboardParams, (params) => {
          const data = getDashboardData('contractor', params);
          const view = getRoleView('contractor', data);

          expect(view).not.toHaveProperty('upcomingInductions');
          expect(view).not.toHaveProperty('openInvestigations');
          expect(view).not.toHaveProperty('highCriticalHIRA');
        }),
        { numRuns: 200 }
      );
    });
  });

  // ─── Property: Client view includes only specific keys ─────────────────────

  describe('Client view includes only: pendingPlanApprovals, safetyFileCompletion', () => {
    it('view contains exactly the client-scoped keys', () => {
      fc.assert(
        fc.property(arbDashboardParams, (params) => {
          const data = getDashboardData('client', params);
          const view = getRoleView('client', data);

          const viewKeys = Object.keys(view).sort();
          const expectedKeys = ['pendingPlanApprovals', 'safetyFileCompletion'];

          expect(viewKeys).toEqual(expectedKeys);

          // Values must match the dashboard data for those keys
          expect(view.pendingPlanApprovals).toBe(data.pendingPlanApprovals);
          expect(view.safetyFileCompletion).toBe(data.safetyFileCompletion);
        }),
        { numRuns: 200 }
      );
    });

    it('view does NOT contain overduePermits, upcomingInductions, openInvestigations, or highCriticalHIRA', () => {
      fc.assert(
        fc.property(arbDashboardParams, (params) => {
          const data = getDashboardData('client', params);
          const view = getRoleView('client', data);

          expect(view).not.toHaveProperty('overduePermits');
          expect(view).not.toHaveProperty('upcomingInductions');
          expect(view).not.toHaveProperty('openInvestigations');
          expect(view).not.toHaveProperty('highCriticalHIRA');
        }),
        { numRuns: 200 }
      );
    });
  });

  // ─── Property: Architect view is empty ─────────────────────────────────────

  describe('Architect view is empty (empty object)', () => {
    it('view is an empty object with no keys', () => {
      fc.assert(
        fc.property(arbDashboardParams, (params) => {
          const data = getDashboardData('architect', params);
          const view = getRoleView('architect', data);

          expect(view).toEqual({});
          expect(Object.keys(view)).toHaveLength(0);
        }),
        { numRuns: 200 }
      );
    });
  });

  // ─── Property: All roles tested together ───────────────────────────────────

  describe('role-differentiation is consistent across all roles simultaneously', () => {
    const arbRole = fc.constantFrom<HSViewRole>('health_safety', 'contractor', 'client', 'architect');

    it('each role always gets its designated subset of keys', () => {
      fc.assert(
        fc.property(arbDashboardParams, arbRole, (params, role) => {
          const data = getDashboardData(role, params);
          const view = getRoleView(role, data);
          const viewKeys = Object.keys(view).sort();

          switch (role) {
            case 'health_safety':
              expect(viewKeys).toEqual(ALL_DASHBOARD_KEYS.slice().sort());
              break;
            case 'contractor':
              expect(viewKeys).toEqual(['overduePermits', 'pendingPlanApprovals', 'safetyFileCompletion']);
              break;
            case 'client':
              expect(viewKeys).toEqual(['pendingPlanApprovals', 'safetyFileCompletion']);
              break;
            case 'architect':
              expect(viewKeys).toEqual([]);
              break;
          }
        }),
        { numRuns: 200 }
      );
    });
  });
});
