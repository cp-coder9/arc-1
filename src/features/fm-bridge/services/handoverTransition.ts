/**
 * FM Bridge — Handover Transition Service
 *
 * Manages the transition of construction project data into an operational
 * Building Passport when a project reaches practical completion.
 *
 * Pure functions — no direct persistence imports.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7
 */

import type { AuditEvent } from '../../p2-shared/types';
import type {
  BuildingPassport,
  DLPRecord,
  WarrantyCategory,
  WarrantyItem,
} from '../types';

// ─── Service Result Type ──────────────────────────────────────────────────────

export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string; details?: unknown } };

// ─── Input Types ──────────────────────────────────────────────────────────────

/** Data required from the source construction project for handover */
export interface ProjectHandoverData {
  projectId: string;
  projectStatus: string;
  closeoutStatus: string;
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
  warrantyItems: Array<{
    description: string;
    category: WarrantyCategory;
    supplierName: string;
    warrantyPeriodMonths: number;
    conditions?: string;
  }>;
  /** DLP duration in days — defaults to 90 if not specified */
  dlpDurationDays?: number;
}

/** Identity of the actor initiating the handover */
export interface ActorIdentity {
  uid: string;
  role: string;
  displayName: string;
}

/** Output of a successful handover transition */
export interface HandoverTransitionResult {
  buildingPassport: BuildingPassport;
  warranties: WarrantyItem[];
  dlp: DLPRecord;
  auditEvents: AuditEvent[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Roles permitted to initiate handover transition (Requirement 1.1, 1.6) */
const ELIGIBLE_ROLES = [
  'architect',
  'bep',
  'cpm',
  'client',
  'developer',
  'platform_admin',
] as const;

/** Default DLP duration when not specified in contract data (Requirement 5.1) */
const DEFAULT_DLP_DURATION_DAYS = 90;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Generates a unique ID for a new record */
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Calculates a date offset by a given number of months from a start date.
 * Uses calendar month addition (e.g., Jan 15 + 2 months = Mar 15).
 */
function addMonths(startDate: string, months: number): string {
  const date = new Date(startDate);
  date.setMonth(date.getMonth() + months);
  return date.toISOString();
}

/**
 * Calculates a date offset by a given number of days from a start date.
 */
function addDays(startDate: string, days: number): string {
  const date = new Date(startDate);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Validates whether a project and actor are eligible for handover transition.
 *
 * Rules:
 * - Project must have closeoutStatus === 'practical_completion' (Requirement 1.5)
 * - Actor must hold one of the eligible roles (Requirement 1.6)
 *
 * @param project - Project status data
 * @param actor - Actor identity with role
 * @returns Eligibility result with reason if ineligible
 */
export function validateHandoverEligibility(
  project: { status: string; closeoutStatus: string },
  actor: { uid: string; role: string },
): ServiceResult<{ eligible: boolean; reason?: string }> {
  // Validate inputs exist
  if (!project || !actor) {
    return {
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'Project and actor data are required',
      },
    };
  }

  // Check project closeout status (Requirement 1.5)
  if (project.closeoutStatus !== 'practical_completion') {
    return {
      success: true,
      data: {
        eligible: false,
        reason:
          'Practical completion must be certified before transition can proceed. ' +
          `Current closeout status: "${project.closeoutStatus}"`,
      },
    };
  }

  // Check actor role (Requirement 1.6)
  if (!ELIGIBLE_ROLES.includes(actor.role as (typeof ELIGIBLE_ROLES)[number])) {
    return {
      success: true,
      data: {
        eligible: false,
        reason:
          'Insufficient permissions. Only architect, bep, cpm, client, developer, or platform_admin roles ' +
          'may initiate the handover transition.',
      },
    };
  }

  return {
    success: true,
    data: { eligible: true },
  };
}

/**
 * Executes the handover transition: creates a Building Passport, transfers
 * warranty items, creates a DLP record, and generates audit events.
 *
 * Precondition: caller has already validated eligibility via validateHandoverEligibility().
 *
 * @param projectData - Full project handover data
 * @param actor - Identity of the initiating user
 * @param now - Current timestamp (injected for testability)
 * @returns ServiceResult with building passport, warranties, DLP record, and audit events
 */
export function executeHandoverTransition(
  projectData: ProjectHandoverData,
  actor: ActorIdentity,
  now: Date,
): ServiceResult<HandoverTransitionResult> {
  // Validate inputs
  if (!projectData || !actor || !now) {
    return {
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'Project data, actor, and current date are required',
      },
    };
  }

  // Re-validate eligibility as a safety check
  const eligibility = validateHandoverEligibility(
    { status: projectData.projectStatus, closeoutStatus: projectData.closeoutStatus },
    { uid: actor.uid, role: actor.role },
  );

  if (!eligibility.success) {
    return eligibility as ServiceResult<HandoverTransitionResult>;
  }

  if (eligibility.success && !eligibility.data.eligible) {
    return {
      success: false,
      error: {
        code: 'INELIGIBLE',
        message: eligibility.data.reason || 'Project is not eligible for handover',
      },
    };
  }

  const timestamp = now.toISOString();
  const buildingId = generateId('bld');

  // 1. Create Building Passport (Requirement 1.1)
  const buildingPassport: BuildingPassport = {
    id: buildingId,
    buildingName: projectData.buildingName,
    physicalAddress: projectData.physicalAddress,
    gpsCoordinates: projectData.gpsCoordinates,
    constructionCompletionDate: projectData.constructionCompletionDate,
    mainContractorName: projectData.mainContractorName,
    principalAgentName: projectData.principalAgentName,
    projectReferenceNumber: projectData.projectReferenceNumber,
    buildingType: projectData.buildingType,
    grossFloorArea: projectData.grossFloorArea,
    numberOfStoreys: projectData.numberOfStoreys,
    sourceProjectId: projectData.projectId,
    subscriptionStatus: 'trial',
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  // 2. Transfer warranty items (Requirement 1.3)
  const warranties: WarrantyItem[] = projectData.warrantyItems.map((item) => {
    const startDate = projectData.constructionCompletionDate;
    const expiryDate = addMonths(startDate, item.warrantyPeriodMonths);

    return {
      id: generateId('wty'),
      buildingId,
      description: item.description,
      category: item.category,
      supplierName: item.supplierName,
      warrantyPeriodMonths: item.warrantyPeriodMonths,
      startDate,
      expiryDate,
      status: 'active' as const,
      conditions: item.conditions,
      sourceHandover: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  });

  // 3. Create DLP record (Requirement 5.1)
  const dlpDurationDays = projectData.dlpDurationDays ?? DEFAULT_DLP_DURATION_DAYS;
  const dlpStartDate = projectData.constructionCompletionDate;
  const dlpEndDate = addDays(dlpStartDate, dlpDurationDays);

  const dlp: DLPRecord = {
    id: generateId('dlp'),
    buildingId,
    startDate: dlpStartDate,
    endDate: dlpEndDate,
    durationDays: dlpDurationDays,
    mainContractorRef: projectData.mainContractorName,
    principalAgentRef: projectData.principalAgentName,
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  // 4. Generate audit events (Requirement 1.4)
  const auditEvents: AuditEvent[] = [
    // Audit event in source project
    {
      id: generateId('aud'),
      entityType: 'project',
      entityId: projectData.projectId,
      eventType: 'handover.transition_initiated',
      actorId: actor.uid,
      actorDisplayName: actor.displayName,
      metadata: {
        targetBuildingId: buildingId,
        transitionDate: timestamp,
        documentsTransferred: 0, // placeholder — documents handled by adapter layer
        warrantiesTransferred: warranties.length,
        assetsCreated: 0, // placeholder — assets handled by adapter layer
      },
      timestamp,
    },
    // Audit event in new building passport
    {
      id: generateId('aud'),
      entityType: 'building',
      entityId: buildingId,
      eventType: 'handover.building_passport_created',
      actorId: actor.uid,
      actorDisplayName: actor.displayName,
      metadata: {
        sourceProjectId: projectData.projectId,
        sourceProjectRef: projectData.projectReferenceNumber,
        transitionDate: timestamp,
        warrantiesTransferred: warranties.length,
        dlpDurationDays,
        buildingName: projectData.buildingName,
      },
      timestamp,
    },
  ];

  return {
    success: true,
    data: {
      buildingPassport,
      warranties,
      dlp,
      auditEvents,
    },
  };
}
