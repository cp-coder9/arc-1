// @vitest-environment node
/**
 * Unit Tests — Handover Transition Service
 *
 * Tests for validateHandoverEligibility() and executeHandoverTransition().
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7
 */

import { describe, expect, it } from 'vitest';

import type { ActorIdentity, ProjectHandoverData } from '../services/handoverTransition';
import {
  executeHandoverTransition,
  validateHandoverEligibility,
} from '../services/handoverTransition';

// ─── Test Helpers ─────────────────────────────────────────────────────────────

function createProjectData(overrides: Partial<ProjectHandoverData> = {}): ProjectHandoverData {
  return {
    projectId: 'proj_001',
    projectStatus: 'closeout',
    closeoutStatus: 'practical_completion',
    buildingName: 'Sandton Tower',
    physicalAddress: '123 Main Rd, Sandton, Gauteng',
    gpsCoordinates: { lat: -26.1076, lng: 28.0567 },
    constructionCompletionDate: '2025-06-01T00:00:00.000Z',
    mainContractorName: 'BuildCo (Pty) Ltd',
    principalAgentName: 'Arch Studio Inc',
    projectReferenceNumber: 'PRJ-2024-001',
    buildingType: 'commercial',
    grossFloorArea: 12500,
    numberOfStoreys: 8,
    warrantyItems: [
      {
        description: 'Structural waterproofing membrane',
        category: 'structural',
        supplierName: 'WaterSeal SA',
        warrantyPeriodMonths: 120,
        conditions: 'Annual inspection required',
      },
      {
        description: 'HVAC system - Carrier units',
        category: 'mechanical',
        supplierName: 'CoolAir Systems',
        warrantyPeriodMonths: 60,
      },
      {
        description: 'Electrical switchgear',
        category: 'electrical',
        supplierName: 'PowerGrid Ltd',
        warrantyPeriodMonths: 24,
        conditions: 'Excludes damage from power surges',
      },
    ],
    dlpDurationDays: 180,
    ...overrides,
  };
}

function createActor(overrides: Partial<ActorIdentity> = {}): ActorIdentity {
  return {
    uid: 'user_001',
    role: 'architect',
    displayName: 'John Smith',
    ...overrides,
  };
}

const NOW = new Date('2025-07-01T10:00:00.000Z');

// ─── validateHandoverEligibility Tests ────────────────────────────────────────

describe('validateHandoverEligibility', () => {
  describe('project closeout status checks (Requirement 1.5)', () => {
    it('returns eligible when closeoutStatus is practical_completion', () => {
      const result = validateHandoverEligibility(
        { status: 'closeout', closeoutStatus: 'practical_completion' },
        { uid: 'user_001', role: 'architect' },
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.eligible).toBe(true);
        expect(result.data.reason).toBeUndefined();
      }
    });

    it('returns ineligible when closeoutStatus is not practical_completion', () => {
      const result = validateHandoverEligibility(
        { status: 'active', closeoutStatus: 'in_progress' },
        { uid: 'user_001', role: 'architect' },
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.eligible).toBe(false);
        expect(result.data.reason).toContain('Practical completion must be certified');
      }
    });

    it('returns ineligible for empty closeoutStatus', () => {
      const result = validateHandoverEligibility(
        { status: 'active', closeoutStatus: '' },
        { uid: 'user_001', role: 'architect' },
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.eligible).toBe(false);
      }
    });
  });

  describe('actor role checks (Requirement 1.6)', () => {
    const eligibleRoles = ['architect', 'bep', 'cpm', 'client', 'developer', 'platform_admin'];

    it.each(eligibleRoles)('allows %s role to initiate handover', (role) => {
      const result = validateHandoverEligibility(
        { status: 'closeout', closeoutStatus: 'practical_completion' },
        { uid: 'user_001', role },
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.eligible).toBe(true);
      }
    });

    const ineligibleRoles = [
      'contractor',
      'subcontractor',
      'supplier',
      'freelancer',
      'quantity_surveyor',
      'engineer',
      'site_manager',
    ];

    it.each(ineligibleRoles)('rejects %s role from initiating handover', (role) => {
      const result = validateHandoverEligibility(
        { status: 'closeout', closeoutStatus: 'practical_completion' },
        { uid: 'user_001', role },
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.eligible).toBe(false);
        expect(result.data.reason).toContain('Insufficient permissions');
      }
    });
  });

  describe('input validation', () => {
    it('returns error for null project', () => {
      const result = validateHandoverEligibility(
        null as unknown as { status: string; closeoutStatus: string },
        { uid: 'user_001', role: 'architect' },
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_INPUT');
      }
    });

    it('returns error for null actor', () => {
      const result = validateHandoverEligibility(
        { status: 'closeout', closeoutStatus: 'practical_completion' },
        null as unknown as { uid: string; role: string },
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_INPUT');
      }
    });
  });

  describe('combined checks', () => {
    it('checks closeout status before role when both are invalid', () => {
      const result = validateHandoverEligibility(
        { status: 'active', closeoutStatus: 'in_progress' },
        { uid: 'user_001', role: 'contractor' },
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.eligible).toBe(false);
        // Should fail on closeout status first
        expect(result.data.reason).toContain('Practical completion');
      }
    });
  });
});

// ─── executeHandoverTransition Tests ──────────────────────────────────────────

describe('executeHandoverTransition', () => {
  describe('Building Passport creation (Requirement 1.1)', () => {
    it('creates a BuildingPassport with all project data fields', () => {
      const projectData = createProjectData();
      const actor = createActor();

      const result = executeHandoverTransition(projectData, actor, NOW);

      expect(result.success).toBe(true);
      if (result.success) {
        const bp = result.data.buildingPassport;
        expect(bp.buildingName).toBe('Sandton Tower');
        expect(bp.physicalAddress).toBe('123 Main Rd, Sandton, Gauteng');
        expect(bp.gpsCoordinates).toEqual({ lat: -26.1076, lng: 28.0567 });
        expect(bp.constructionCompletionDate).toBe('2025-06-01T00:00:00.000Z');
        expect(bp.mainContractorName).toBe('BuildCo (Pty) Ltd');
        expect(bp.principalAgentName).toBe('Arch Studio Inc');
        expect(bp.projectReferenceNumber).toBe('PRJ-2024-001');
        expect(bp.buildingType).toBe('commercial');
        expect(bp.grossFloorArea).toBe(12500);
        expect(bp.numberOfStoreys).toBe(8);
        expect(bp.sourceProjectId).toBe('proj_001');
      }
    });

    it('starts building passport with trial subscription status', () => {
      const result = executeHandoverTransition(createProjectData(), createActor(), NOW);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.buildingPassport.subscriptionStatus).toBe('trial');
      }
    });

    it('assigns a unique ID to the building passport', () => {
      const result = executeHandoverTransition(createProjectData(), createActor(), NOW);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.buildingPassport.id).toMatch(/^bld_/);
        expect(result.data.buildingPassport.id.length).toBeGreaterThan(4);
      }
    });

    it('sets createdAt and updatedAt timestamps', () => {
      const result = executeHandoverTransition(createProjectData(), createActor(), NOW);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.buildingPassport.createdAt).toBe(NOW.toISOString());
        expect(result.data.buildingPassport.updatedAt).toBe(NOW.toISOString());
      }
    });

    it('handles optional fields being absent', () => {
      const projectData = createProjectData({
        gpsCoordinates: undefined,
        buildingType: undefined,
        grossFloorArea: undefined,
        numberOfStoreys: undefined,
      });

      const result = executeHandoverTransition(projectData, createActor(), NOW);

      expect(result.success).toBe(true);
      if (result.success) {
        const bp = result.data.buildingPassport;
        expect(bp.gpsCoordinates).toBeUndefined();
        expect(bp.buildingType).toBeUndefined();
        expect(bp.grossFloorArea).toBeUndefined();
        expect(bp.numberOfStoreys).toBeUndefined();
      }
    });
  });

  describe('Warranty transfer (Requirement 1.3)', () => {
    it('creates warranty items for each item in the handover pack', () => {
      const result = executeHandoverTransition(createProjectData(), createActor(), NOW);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.warranties).toHaveLength(3);
      }
    });

    it('preserves warranty item details from source', () => {
      const result = executeHandoverTransition(createProjectData(), createActor(), NOW);

      expect(result.success).toBe(true);
      if (result.success) {
        const firstWarranty = result.data.warranties[0];
        expect(firstWarranty.description).toBe('Structural waterproofing membrane');
        expect(firstWarranty.category).toBe('structural');
        expect(firstWarranty.supplierName).toBe('WaterSeal SA');
        expect(firstWarranty.warrantyPeriodMonths).toBe(120);
        expect(firstWarranty.conditions).toBe('Annual inspection required');
      }
    });

    it('sets startDate to constructionCompletionDate', () => {
      const result = executeHandoverTransition(createProjectData(), createActor(), NOW);

      expect(result.success).toBe(true);
      if (result.success) {
        for (const warranty of result.data.warranties) {
          expect(warranty.startDate).toBe('2025-06-01T00:00:00.000Z');
        }
      }
    });

    it('calculates expiryDate from startDate + warrantyPeriodMonths', () => {
      const result = executeHandoverTransition(createProjectData(), createActor(), NOW);

      expect(result.success).toBe(true);
      if (result.success) {
        // First warranty: 120 months = 10 years from 2025-06-01
        const firstExpiry = new Date(result.data.warranties[0].expiryDate);
        expect(firstExpiry.getFullYear()).toBe(2035);
        expect(firstExpiry.getMonth()).toBe(5); // June (0-indexed)

        // Second warranty: 60 months = 5 years from 2025-06-01
        const secondExpiry = new Date(result.data.warranties[1].expiryDate);
        expect(secondExpiry.getFullYear()).toBe(2030);
        expect(secondExpiry.getMonth()).toBe(5);

        // Third warranty: 24 months = 2 years from 2025-06-01
        const thirdExpiry = new Date(result.data.warranties[2].expiryDate);
        expect(thirdExpiry.getFullYear()).toBe(2027);
        expect(thirdExpiry.getMonth()).toBe(5);
      }
    });

    it('marks all transferred warranties as sourceHandover: true', () => {
      const result = executeHandoverTransition(createProjectData(), createActor(), NOW);

      expect(result.success).toBe(true);
      if (result.success) {
        for (const warranty of result.data.warranties) {
          expect(warranty.sourceHandover).toBe(true);
        }
      }
    });

    it('initializes all warranties with active status', () => {
      const result = executeHandoverTransition(createProjectData(), createActor(), NOW);

      expect(result.success).toBe(true);
      if (result.success) {
        for (const warranty of result.data.warranties) {
          expect(warranty.status).toBe('active');
        }
      }
    });

    it('assigns unique IDs to each warranty', () => {
      const result = executeHandoverTransition(createProjectData(), createActor(), NOW);

      expect(result.success).toBe(true);
      if (result.success) {
        const ids = result.data.warranties.map((w) => w.id);
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(ids.length);
        for (const id of ids) {
          expect(id).toMatch(/^wty_/);
        }
      }
    });

    it('links warranties to the new building ID', () => {
      const result = executeHandoverTransition(createProjectData(), createActor(), NOW);

      expect(result.success).toBe(true);
      if (result.success) {
        const buildingId = result.data.buildingPassport.id;
        for (const warranty of result.data.warranties) {
          expect(warranty.buildingId).toBe(buildingId);
        }
      }
    });

    it('handles empty warranty items array', () => {
      const projectData = createProjectData({ warrantyItems: [] });
      const result = executeHandoverTransition(projectData, createActor(), NOW);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.warranties).toHaveLength(0);
      }
    });
  });

  describe('DLP record creation (Requirement 5.1)', () => {
    it('creates a DLP record with specified duration', () => {
      const result = executeHandoverTransition(
        createProjectData({ dlpDurationDays: 180 }),
        createActor(),
        NOW,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.dlp.durationDays).toBe(180);
      }
    });

    it('defaults to 90 days when dlpDurationDays is not specified', () => {
      const result = executeHandoverTransition(
        createProjectData({ dlpDurationDays: undefined }),
        createActor(),
        NOW,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.dlp.durationDays).toBe(90);
      }
    });

    it('sets DLP startDate to constructionCompletionDate', () => {
      const result = executeHandoverTransition(createProjectData(), createActor(), NOW);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.dlp.startDate).toBe('2025-06-01T00:00:00.000Z');
      }
    });

    it('calculates DLP endDate from startDate + durationDays', () => {
      const result = executeHandoverTransition(
        createProjectData({ dlpDurationDays: 90 }),
        createActor(),
        NOW,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        const endDate = new Date(result.data.dlp.endDate);
        const startDate = new Date('2025-06-01T00:00:00.000Z');
        const diffDays = Math.round(
          (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
        );
        expect(diffDays).toBe(90);
      }
    });

    it('sets DLP status to active', () => {
      const result = executeHandoverTransition(createProjectData(), createActor(), NOW);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.dlp.status).toBe('active');
      }
    });

    it('populates contractor and principal agent references', () => {
      const result = executeHandoverTransition(createProjectData(), createActor(), NOW);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.dlp.mainContractorRef).toBe('BuildCo (Pty) Ltd');
        expect(result.data.dlp.principalAgentRef).toBe('Arch Studio Inc');
      }
    });

    it('links DLP to the new building ID', () => {
      const result = executeHandoverTransition(createProjectData(), createActor(), NOW);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.dlp.buildingId).toBe(result.data.buildingPassport.id);
      }
    });
  });

  describe('Audit event generation (Requirement 1.4)', () => {
    it('generates audit events for both source project and new building', () => {
      const result = executeHandoverTransition(createProjectData(), createActor(), NOW);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.auditEvents).toHaveLength(2);

        const projectEvent = result.data.auditEvents.find(
          (e) => e.entityType === 'project',
        );
        const buildingEvent = result.data.auditEvents.find(
          (e) => e.entityType === 'building',
        );

        expect(projectEvent).toBeDefined();
        expect(buildingEvent).toBeDefined();
      }
    });

    it('project audit event references source project ID', () => {
      const result = executeHandoverTransition(createProjectData(), createActor(), NOW);

      expect(result.success).toBe(true);
      if (result.success) {
        const projectEvent = result.data.auditEvents.find(
          (e) => e.entityType === 'project',
        )!;
        expect(projectEvent.entityId).toBe('proj_001');
        expect(projectEvent.eventType).toBe('handover.transition_initiated');
      }
    });

    it('building audit event references new building ID', () => {
      const result = executeHandoverTransition(createProjectData(), createActor(), NOW);

      expect(result.success).toBe(true);
      if (result.success) {
        const buildingEvent = result.data.auditEvents.find(
          (e) => e.entityType === 'building',
        )!;
        expect(buildingEvent.entityId).toBe(result.data.buildingPassport.id);
        expect(buildingEvent.eventType).toBe('handover.building_passport_created');
      }
    });

    it('audit events contain actor identity', () => {
      const actor = createActor({ uid: 'actor_123', displayName: 'Jane Doe' });
      const result = executeHandoverTransition(createProjectData(), actor, NOW);

      expect(result.success).toBe(true);
      if (result.success) {
        for (const event of result.data.auditEvents) {
          expect(event.actorId).toBe('actor_123');
          expect(event.actorDisplayName).toBe('Jane Doe');
        }
      }
    });

    it('audit events contain warranty count in metadata', () => {
      const result = executeHandoverTransition(createProjectData(), createActor(), NOW);

      expect(result.success).toBe(true);
      if (result.success) {
        const projectEvent = result.data.auditEvents.find(
          (e) => e.entityType === 'project',
        )!;
        expect(projectEvent.metadata.warrantiesTransferred).toBe(3);

        const buildingEvent = result.data.auditEvents.find(
          (e) => e.entityType === 'building',
        )!;
        expect(buildingEvent.metadata.warrantiesTransferred).toBe(3);
      }
    });

    it('audit events have timestamp matching now parameter', () => {
      const result = executeHandoverTransition(createProjectData(), createActor(), NOW);

      expect(result.success).toBe(true);
      if (result.success) {
        for (const event of result.data.auditEvents) {
          expect(event.timestamp).toBe(NOW.toISOString());
        }
      }
    });
  });

  describe('eligibility enforcement', () => {
    it('rejects transition when closeout status is not practical_completion', () => {
      const projectData = createProjectData({ closeoutStatus: 'in_progress' });
      const result = executeHandoverTransition(projectData, createActor(), NOW);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INELIGIBLE');
      }
    });

    it('rejects transition when actor role is not permitted', () => {
      const actor = createActor({ role: 'contractor' });
      const result = executeHandoverTransition(createProjectData(), actor, NOW);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INELIGIBLE');
      }
    });
  });

  describe('input validation', () => {
    it('returns error for null project data', () => {
      const result = executeHandoverTransition(
        null as unknown as ProjectHandoverData,
        createActor(),
        NOW,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_INPUT');
      }
    });

    it('returns error for null actor', () => {
      const result = executeHandoverTransition(
        createProjectData(),
        null as unknown as ActorIdentity,
        NOW,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_INPUT');
      }
    });

    it('returns error for null date', () => {
      const result = executeHandoverTransition(
        createProjectData(),
        createActor(),
        null as unknown as Date,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_INPUT');
      }
    });
  });
});
