/**
 * FM Bridge — Building Passport Service Tests
 *
 * Unit tests for CRUD operations, role-based access control,
 * access record management, and subscription enforcement.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7
 */
import {
  canModify,
  canGrantAccess,
  validateAccess,
  grantAccess,
  revokeAccess,
  enforceSubscriptionAccess,
  createBuildingPassport,
  updateBuildingPassport,
  readBuildingPassport,
  deleteBuildingPassport,
} from '../services/buildingPassport';
import type { BuildingAccessRecord, BuildingPassport, FMBuildingRole } from '../types';

// ─── Test Helpers ─────────────────────────────────────────────────────────────

const now = new Date('2026-06-15T10:00:00.000Z');

function makeAccessRecord(overrides: Partial<BuildingAccessRecord> = {}): BuildingAccessRecord {
  return {
    id: 'access-1',
    buildingId: 'building-1',
    userId: 'user-1',
    role: 'building_owner',
    grantedBy: 'admin-1',
    grantDate: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makePassport(overrides: Partial<BuildingPassport> = {}): BuildingPassport {
  return {
    id: 'bp-1',
    buildingName: 'Test Building',
    physicalAddress: '123 Main St, Cape Town',
    constructionCompletionDate: '2025-12-01',
    mainContractorName: 'Builder Co',
    principalAgentName: 'Agent Co',
    projectReferenceNumber: 'PRJ-001',
    sourceProjectId: 'project-1',
    subscriptionStatus: 'standard',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// ─── canModify ────────────────────────────────────────────────────────────────

describe('canModify', () => {
  it('returns true for building_owner', () => {
    expect(canModify('building_owner')).toBe(true);
  });

  it('returns true for facility_manager', () => {
    expect(canModify('facility_manager')).toBe(true);
  });

  it('returns false for body_corporate_admin', () => {
    expect(canModify('body_corporate_admin')).toBe(false);
  });

  it('returns false for read_only', () => {
    expect(canModify('read_only')).toBe(false);
  });
});

// ─── canGrantAccess ───────────────────────────────────────────────────────────

describe('canGrantAccess', () => {
  it('returns true for building_owner', () => {
    expect(canGrantAccess('building_owner')).toBe(true);
  });

  it('returns true for facility_manager', () => {
    expect(canGrantAccess('facility_manager')).toBe(true);
  });

  it('returns true for body_corporate_admin', () => {
    expect(canGrantAccess('body_corporate_admin')).toBe(true);
  });

  it('returns false for read_only', () => {
    expect(canGrantAccess('read_only')).toBe(false);
  });
});

// ─── validateAccess ───────────────────────────────────────────────────────────

describe('validateAccess', () => {
  it('returns success for user with active access', () => {
    const records = [makeAccessRecord({ userId: 'user-1' })];
    const result = validateAccess(records, 'user-1');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.userId).toBe('user-1');
    }
  });

  it('returns failure for user with no access record', () => {
    const records = [makeAccessRecord({ userId: 'user-1' })];
    const result = validateAccess(records, 'user-unknown');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('ACCESS_DENIED');
    }
  });

  it('returns failure for user with revoked access', () => {
    const records = [makeAccessRecord({ userId: 'user-1', revokedAt: '2026-06-01T00:00:00.000Z' })];
    const result = validateAccess(records, 'user-1');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('ACCESS_DENIED');
    }
  });

  it('validates required role when specified', () => {
    const records = [makeAccessRecord({ userId: 'user-1', role: 'read_only' })];
    const result = validateAccess(records, 'user-1', 'building_owner');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INSUFFICIENT_ROLE');
    }
  });

  it('succeeds when user has the required role', () => {
    const records = [makeAccessRecord({ userId: 'user-1', role: 'facility_manager' })];
    const result = validateAccess(records, 'user-1', 'facility_manager');

    expect(result.success).toBe(true);
  });

  it('returns failure for empty access records', () => {
    const result = validateAccess([], 'user-1');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('ACCESS_DENIED');
    }
  });
});

// ─── grantAccess ──────────────────────────────────────────────────────────────

describe('grantAccess', () => {
  it('allows building_owner to grant any role', () => {
    const result = grantAccess('building-1', 'user-2', 'facility_manager', 'user-1', 'building_owner', now);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.buildingId).toBe('building-1');
      expect(result.data.userId).toBe('user-2');
      expect(result.data.role).toBe('facility_manager');
      expect(result.data.grantedBy).toBe('user-1');
      expect(result.data.grantDate).toBe(now.toISOString());
      expect(result.data.revokedAt).toBeUndefined();
    }
  });

  it('allows facility_manager to grant any role', () => {
    const result = grantAccess('building-1', 'user-2', 'body_corporate_admin', 'user-1', 'facility_manager', now);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.role).toBe('body_corporate_admin');
    }
  });

  it('allows body_corporate_admin to grant read_only only', () => {
    const result = grantAccess('building-1', 'user-2', 'read_only', 'user-1', 'body_corporate_admin', now);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.role).toBe('read_only');
    }
  });

  it('rejects body_corporate_admin granting non-read_only role', () => {
    const result = grantAccess('building-1', 'user-2', 'facility_manager', 'user-1', 'body_corporate_admin', now);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('GRANT_ROLE_EXCEEDED');
    }
  });

  it('rejects read_only user granting access', () => {
    const result = grantAccess('building-1', 'user-2', 'read_only', 'user-1', 'read_only', now);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('GRANT_DENIED');
    }
  });

  it('generates a unique access record id', () => {
    const result1 = grantAccess('building-1', 'user-2', 'read_only', 'user-1', 'building_owner', now);
    const result2 = grantAccess('building-1', 'user-3', 'read_only', 'user-1', 'building_owner', now);

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);
    if (result1.success && result2.success) {
      expect(result1.data.id).not.toBe(result2.data.id);
    }
  });
});

// ─── revokeAccess ─────────────────────────────────────────────────────────────

describe('revokeAccess', () => {
  it('sets revokedAt on an active access record', () => {
    const record = makeAccessRecord();
    const result = revokeAccess(record, now);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.revokedAt).toBe(now.toISOString());
      expect(result.data.id).toBe(record.id);
      expect(result.data.userId).toBe(record.userId);
    }
  });

  it('rejects revoking an already-revoked record', () => {
    const record = makeAccessRecord({ revokedAt: '2026-05-01T00:00:00.000Z' });
    const result = revokeAccess(record, now);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('ALREADY_REVOKED');
    }
  });
});

// ─── enforceSubscriptionAccess ────────────────────────────────────────────────

describe('enforceSubscriptionAccess', () => {
  it('allows read operations when subscription is lapsed', () => {
    const result = enforceSubscriptionAccess('lapsed', 'read');
    expect(result.success).toBe(true);
  });

  it('blocks write operations when subscription is lapsed', () => {
    const result = enforceSubscriptionAccess('lapsed', 'write');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('SUBSCRIPTION_LAPSED');
    }
  });

  it('allows write operations when subscription is trial', () => {
    const result = enforceSubscriptionAccess('trial', 'write');
    expect(result.success).toBe(true);
  });

  it('allows write operations when subscription is basic', () => {
    const result = enforceSubscriptionAccess('basic', 'write');
    expect(result.success).toBe(true);
  });

  it('allows write operations when subscription is standard', () => {
    const result = enforceSubscriptionAccess('standard', 'write');
    expect(result.success).toBe(true);
  });

  it('allows write operations when subscription is premium', () => {
    const result = enforceSubscriptionAccess('premium', 'write');
    expect(result.success).toBe(true);
  });

  it('allows read operations for any active tier', () => {
    const tiers = ['basic', 'standard', 'premium', 'trial'];
    for (const tier of tiers) {
      const result = enforceSubscriptionAccess(tier, 'read');
      expect(result.success).toBe(true);
    }
  });
});

// ─── createBuildingPassport ───────────────────────────────────────────────────

describe('createBuildingPassport', () => {
  const input = {
    buildingName: 'New Building',
    physicalAddress: '456 Oak Ave, Johannesburg',
    constructionCompletionDate: '2026-01-15',
    mainContractorName: 'Builder Ltd',
    principalAgentName: 'Agent Ltd',
    projectReferenceNumber: 'PRJ-002',
    sourceProjectId: 'project-2',
    buildingType: 'Commercial',
    grossFloorArea: 5000,
    numberOfStoreys: 10,
  };

  it('creates a passport for building_owner', () => {
    const result = createBuildingPassport(input, 'building_owner', 'trial', now);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.buildingName).toBe('New Building');
      expect(result.data.physicalAddress).toBe('456 Oak Ave, Johannesburg');
      expect(result.data.grossFloorArea).toBe(5000);
      expect(result.data.numberOfStoreys).toBe(10);
      expect(result.data.subscriptionStatus).toBe('trial');
      expect(result.data.createdAt).toBe(now.toISOString());
      expect(result.data.updatedAt).toBe(now.toISOString());
      expect(result.data.id).toMatch(/^bp_/);
    }
  });

  it('creates a passport for facility_manager', () => {
    const result = createBuildingPassport({ ...input, subscriptionStatus: 'standard' }, 'facility_manager', 'standard', now);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.subscriptionStatus).toBe('standard');
    }
  });

  it('rejects creation by body_corporate_admin', () => {
    const result = createBuildingPassport(input, 'body_corporate_admin', 'standard', now);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('MODIFY_DENIED');
    }
  });

  it('rejects creation by read_only user', () => {
    const result = createBuildingPassport(input, 'read_only', 'standard', now);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('MODIFY_DENIED');
    }
  });

  it('rejects creation when subscription is lapsed', () => {
    const result = createBuildingPassport(input, 'building_owner', 'lapsed', now);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('SUBSCRIPTION_LAPSED');
    }
  });

  it('defaults subscription status to trial when not provided', () => {
    const inputWithoutStatus = { ...input };
    const result = createBuildingPassport(inputWithoutStatus, 'building_owner', 'trial', now);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.subscriptionStatus).toBe('trial');
    }
  });
});

// ─── updateBuildingPassport ───────────────────────────────────────────────────

describe('updateBuildingPassport', () => {
  const existing = makePassport();

  it('updates passport fields for building_owner', () => {
    const result = updateBuildingPassport(
      existing,
      { buildingName: 'Renamed Building', grossFloorArea: 8000 },
      'building_owner',
      'standard',
      now
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.buildingName).toBe('Renamed Building');
      expect(result.data.grossFloorArea).toBe(8000);
      expect(result.data.updatedAt).toBe(now.toISOString());
      // Unchanged fields preserved
      expect(result.data.physicalAddress).toBe(existing.physicalAddress);
      expect(result.data.mainContractorName).toBe(existing.mainContractorName);
    }
  });

  it('updates passport fields for facility_manager', () => {
    const result = updateBuildingPassport(
      existing,
      { physicalAddress: '789 New Street' },
      'facility_manager',
      'premium',
      now
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.physicalAddress).toBe('789 New Street');
    }
  });

  it('rejects update by read_only user (Requirement 2.4)', () => {
    const result = updateBuildingPassport(
      existing,
      { buildingName: 'Should Fail' },
      'read_only',
      'standard',
      now
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('MODIFY_DENIED');
    }
  });

  it('rejects update by body_corporate_admin', () => {
    const result = updateBuildingPassport(
      existing,
      { buildingName: 'Should Fail' },
      'body_corporate_admin',
      'standard',
      now
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('MODIFY_DENIED');
    }
  });

  it('rejects update when subscription is lapsed (Requirement 2.7)', () => {
    const result = updateBuildingPassport(
      existing,
      { buildingName: 'Should Fail' },
      'building_owner',
      'lapsed',
      now
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('SUBSCRIPTION_LAPSED');
    }
  });
});

// ─── readBuildingPassport ─────────────────────────────────────────────────────

describe('readBuildingPassport', () => {
  const passport = makePassport();

  it('allows read for user with active access', () => {
    const records = [makeAccessRecord({ userId: 'user-1', role: 'read_only' })];
    const result = readBuildingPassport(passport, records, 'user-1');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(passport);
    }
  });

  it('allows read for building_owner', () => {
    const records = [makeAccessRecord({ userId: 'user-1', role: 'building_owner' })];
    const result = readBuildingPassport(passport, records, 'user-1');

    expect(result.success).toBe(true);
  });

  it('allows read for body_corporate_admin', () => {
    const records = [makeAccessRecord({ userId: 'user-1', role: 'body_corporate_admin' })];
    const result = readBuildingPassport(passport, records, 'user-1');

    expect(result.success).toBe(true);
  });

  it('rejects read for user without access', () => {
    const records = [makeAccessRecord({ userId: 'user-1' })];
    const result = readBuildingPassport(passport, records, 'user-unknown');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('ACCESS_DENIED');
    }
  });

  it('rejects read for user with revoked access', () => {
    const records = [makeAccessRecord({ userId: 'user-1', revokedAt: '2026-06-01T00:00:00.000Z' })];
    const result = readBuildingPassport(passport, records, 'user-1');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('ACCESS_DENIED');
    }
  });
});

// ─── deleteBuildingPassport ───────────────────────────────────────────────────

describe('deleteBuildingPassport', () => {
  const passport = makePassport();

  it('allows deletion by building_owner', () => {
    const result = deleteBuildingPassport(passport, 'building_owner', 'standard');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.deletedId).toBe(passport.id);
    }
  });

  it('allows deletion by facility_manager', () => {
    const result = deleteBuildingPassport(passport, 'facility_manager', 'premium');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.deletedId).toBe(passport.id);
    }
  });

  it('rejects deletion by read_only user', () => {
    const result = deleteBuildingPassport(passport, 'read_only', 'standard');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('MODIFY_DENIED');
    }
  });

  it('rejects deletion by body_corporate_admin', () => {
    const result = deleteBuildingPassport(passport, 'body_corporate_admin', 'standard');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('MODIFY_DENIED');
    }
  });

  it('rejects deletion when subscription is lapsed', () => {
    const result = deleteBuildingPassport(passport, 'building_owner', 'lapsed');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('SUBSCRIPTION_LAPSED');
    }
  });
});
