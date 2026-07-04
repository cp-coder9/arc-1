/**
 * FM Bridge — Building Passport Service
 *
 * Pure business logic for Building Passport CRUD operations, role-based access
 * control, access record management, and subscription-based access enforcement.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7
 */

import type { BuildingAccessRecord, BuildingPassport, FMBuildingRole } from '../types';

// ─── Service Result Pattern ───────────────────────────────────────────────────

export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string; details?: unknown } };

// ─── Access Control ───────────────────────────────────────────────────────────

/**
 * Determines if a role has modification (create/update/delete) permissions.
 *
 * Rules (Requirement 2.2, 2.4):
 * - building_owner and facility_manager can modify
 * - body_corporate_admin can read and grant limited access (read_only only)
 * - read_only users can only view data
 */
export function canModify(role: FMBuildingRole): boolean {
  return role === 'building_owner' || role === 'facility_manager';
}

/**
 * Determines if a role can grant access to other users.
 *
 * Rules (Requirement 2.3):
 * - building_owner and facility_manager can grant any role
 * - body_corporate_admin can only grant read_only access
 * - read_only users cannot grant access
 */
export function canGrantAccess(role: FMBuildingRole): boolean {
  return role === 'building_owner' || role === 'facility_manager' || role === 'body_corporate_admin';
}

/**
 * Validates that a user has active (non-revoked) access to a building with
 * optionally a required minimum role.
 *
 * Returns the matching access record on success, or a failure result.
 */
export function validateAccess(
  accessRecords: BuildingAccessRecord[],
  userId: string,
  requiredRole?: FMBuildingRole
): ServiceResult<BuildingAccessRecord> {
  // Find active (non-revoked) access record for this user
  const activeRecord = accessRecords.find(
    (record) => record.userId === userId && !record.revokedAt
  );

  if (!activeRecord) {
    return {
      success: false,
      error: {
        code: 'ACCESS_DENIED',
        message: 'User does not have access to this building',
        details: { userId },
      },
    };
  }

  if (requiredRole && activeRecord.role !== requiredRole) {
    return {
      success: false,
      error: {
        code: 'INSUFFICIENT_ROLE',
        message: `Required role '${requiredRole}' but user has '${activeRecord.role}'`,
        details: { userId, currentRole: activeRecord.role, requiredRole },
      },
    };
  }

  return { success: true, data: activeRecord };
}

// ─── Access Record Management ─────────────────────────────────────────────────

/**
 * Grants access to a user on a building.
 *
 * Rules (Requirement 2.3):
 * - building_owner and facility_manager can grant any role
 * - body_corporate_admin can only grant read_only access
 * - read_only users cannot grant access at all
 * - Creates an access record with: granted user, role, granted by, grant date
 */
export function grantAccess(
  buildingId: string,
  userId: string,
  role: FMBuildingRole,
  grantedBy: string,
  grantedByRole: FMBuildingRole,
  now: Date
): ServiceResult<BuildingAccessRecord> {
  // Validate the granting user has permission to grant access
  if (!canGrantAccess(grantedByRole)) {
    return {
      success: false,
      error: {
        code: 'GRANT_DENIED',
        message: 'User does not have permission to grant access',
        details: { grantedByRole },
      },
    };
  }

  // body_corporate_admin can only grant read_only access
  if (grantedByRole === 'body_corporate_admin' && role !== 'read_only') {
    return {
      success: false,
      error: {
        code: 'GRANT_ROLE_EXCEEDED',
        message: 'body_corporate_admin can only grant read_only access',
        details: { grantedByRole, requestedRole: role },
      },
    };
  }

  const accessRecord: BuildingAccessRecord = {
    id: `access_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    buildingId,
    userId,
    role,
    grantedBy,
    grantDate: now.toISOString(),
  };

  return { success: true, data: accessRecord };
}

/**
 * Revokes a user's access to a building by setting the revokedAt timestamp.
 *
 * Returns the updated access record with revokedAt set.
 */
export function revokeAccess(
  accessRecord: BuildingAccessRecord,
  now: Date
): ServiceResult<BuildingAccessRecord> {
  if (accessRecord.revokedAt) {
    return {
      success: false,
      error: {
        code: 'ALREADY_REVOKED',
        message: 'Access record has already been revoked',
        details: { revokedAt: accessRecord.revokedAt },
      },
    };
  }

  const updated: BuildingAccessRecord = {
    ...accessRecord,
    revokedAt: now.toISOString(),
  };

  return { success: true, data: updated };
}

// ─── Subscription Enforcement ─────────────────────────────────────────────────

/**
 * Enforces subscription-based access.
 *
 * Rules (Requirement 2.7):
 * - When subscription is 'lapsed', ALL users are forced to read-only mode
 * - When subscription is 'trial' or an active tier (basic, standard, premium),
 *   full access applies for permitted roles
 * - Read operations are always allowed regardless of subscription
 * - Write operations are blocked when subscription has lapsed
 */
export function enforceSubscriptionAccess(
  subscriptionStatus: string,
  operation: 'read' | 'write'
): ServiceResult<void> {
  // Read operations are always permitted
  if (operation === 'read') {
    return { success: true, data: undefined };
  }

  // Write operations blocked when subscription is lapsed
  if (subscriptionStatus === 'lapsed') {
    return {
      success: false,
      error: {
        code: 'SUBSCRIPTION_LAPSED',
        message: 'Building subscription has lapsed — all access is restricted to read-only until renewed',
        details: { subscriptionStatus, operation },
      },
    };
  }

  // Active tiers and trial allow full access for write operations
  return { success: true, data: undefined };
}

// ─── Building Passport CRUD ───────────────────────────────────────────────────

export interface CreatePassportInput {
  buildingName: string;
  physicalAddress: string;
  gpsCoordinates?: { lat: number; lng: number };
  constructionCompletionDate: string;
  mainContractorName: string;
  principalAgentName: string;
  projectReferenceNumber: string;
  buildingType?: string;
  grossFloorArea?: number;
  numberOfStoreys?: number;
  sourceProjectId: string;
  subscriptionStatus?: BuildingPassport['subscriptionStatus'];
}

export interface UpdatePassportInput {
  buildingName?: string;
  physicalAddress?: string;
  gpsCoordinates?: { lat: number; lng: number };
  buildingType?: string;
  grossFloorArea?: number;
  numberOfStoreys?: number;
}

/**
 * Creates a new Building Passport record.
 *
 * Requires the actor to have building_owner or facility_manager role.
 * Respects subscription-based access enforcement.
 */
export function createBuildingPassport(
  input: CreatePassportInput,
  actorRole: FMBuildingRole,
  subscriptionStatus: string,
  now: Date
): ServiceResult<BuildingPassport> {
  // Enforce subscription access for write operations
  const subscriptionCheck = enforceSubscriptionAccess(subscriptionStatus, 'write');
  if (!subscriptionCheck.success) {
    return subscriptionCheck as ServiceResult<BuildingPassport>;
  }

  // Only building_owner and facility_manager can create
  if (!canModify(actorRole)) {
    return {
      success: false,
      error: {
        code: 'MODIFY_DENIED',
        message: `Role '${actorRole}' does not have permission to create building passport records`,
        details: { actorRole },
      },
    };
  }

  const passport: BuildingPassport = {
    id: `bp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    buildingName: input.buildingName,
    physicalAddress: input.physicalAddress,
    gpsCoordinates: input.gpsCoordinates,
    constructionCompletionDate: input.constructionCompletionDate,
    mainContractorName: input.mainContractorName,
    principalAgentName: input.principalAgentName,
    projectReferenceNumber: input.projectReferenceNumber,
    buildingType: input.buildingType,
    grossFloorArea: input.grossFloorArea,
    numberOfStoreys: input.numberOfStoreys,
    sourceProjectId: input.sourceProjectId,
    subscriptionStatus: input.subscriptionStatus || 'trial',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  return { success: true, data: passport };
}

/**
 * Updates an existing Building Passport record.
 *
 * Requires the actor to have building_owner or facility_manager role (Requirement 2.4).
 * read_only users are rejected.
 * Respects subscription-based access enforcement.
 */
export function updateBuildingPassport(
  existing: BuildingPassport,
  input: UpdatePassportInput,
  actorRole: FMBuildingRole,
  subscriptionStatus: string,
  now: Date
): ServiceResult<BuildingPassport> {
  // Enforce subscription access for write operations
  const subscriptionCheck = enforceSubscriptionAccess(subscriptionStatus, 'write');
  if (!subscriptionCheck.success) {
    return subscriptionCheck as ServiceResult<BuildingPassport>;
  }

  // Enforce role-based access
  if (!canModify(actorRole)) {
    return {
      success: false,
      error: {
        code: 'MODIFY_DENIED',
        message: `Role '${actorRole}' does not have permission to modify building passport records`,
        details: { actorRole },
      },
    };
  }

  const updated: BuildingPassport = {
    ...existing,
    ...(input.buildingName !== undefined && { buildingName: input.buildingName }),
    ...(input.physicalAddress !== undefined && { physicalAddress: input.physicalAddress }),
    ...(input.gpsCoordinates !== undefined && { gpsCoordinates: input.gpsCoordinates }),
    ...(input.buildingType !== undefined && { buildingType: input.buildingType }),
    ...(input.grossFloorArea !== undefined && { grossFloorArea: input.grossFloorArea }),
    ...(input.numberOfStoreys !== undefined && { numberOfStoreys: input.numberOfStoreys }),
    updatedAt: now.toISOString(),
  };

  return { success: true, data: updated };
}

/**
 * Reads a Building Passport record.
 *
 * All roles with valid access (building_owner, facility_manager, body_corporate_admin, read_only)
 * can read. Subscription lapse does NOT block reads (Requirement 2.7).
 */
export function readBuildingPassport(
  passport: BuildingPassport,
  accessRecords: BuildingAccessRecord[],
  userId: string
): ServiceResult<BuildingPassport> {
  const accessCheck = validateAccess(accessRecords, userId);
  if (!accessCheck.success) {
    return accessCheck as ServiceResult<BuildingPassport>;
  }

  return { success: true, data: passport };
}

/**
 * Deletes (marks for deletion) a Building Passport record.
 *
 * Requires building_owner or facility_manager role.
 * Respects subscription-based access enforcement.
 */
export function deleteBuildingPassport(
  passport: BuildingPassport,
  actorRole: FMBuildingRole,
  subscriptionStatus: string
): ServiceResult<{ deletedId: string }> {
  // Enforce subscription access for write operations
  const subscriptionCheck = enforceSubscriptionAccess(subscriptionStatus, 'write');
  if (!subscriptionCheck.success) {
    return subscriptionCheck as ServiceResult<{ deletedId: string }>;
  }

  // Only building_owner and facility_manager can delete
  if (!canModify(actorRole)) {
    return {
      success: false,
      error: {
        code: 'MODIFY_DENIED',
        message: `Role '${actorRole}' does not have permission to delete building passport records`,
        details: { actorRole },
      },
    };
  }

  return { success: true, data: { deletedId: passport.id } };
}
