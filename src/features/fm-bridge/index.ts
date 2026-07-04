/**
 * FM Bridge Module — Public Exports
 *
 * Post-Occupancy & Facility Management Bridge (P2.8).
 * Provides building passport, warranty tracking, asset register,
 * DLP management, and planned preventive maintenance scheduling.
 */

// ─── Types ────────────────────────────────────────────────────────────────────
export type {
  FMBuildingRole,
  FMSubscriptionTier,
  WarrantyCategory,
  WarrantyStatus,
  WarrantyClaimStage,
  ClaimUrgency,
  AssetCategory,
  AssetCondition,
  DefectCategory,
  DefectSeverity,
  DefectStage,
  DLPStatus,
  MaintenanceFrequency,
  MaintenancePriority,
  MaintenanceState,
  BuildingPassport,
  BuildingAccessRecord,
  WarrantyItem,
  WarrantyClaim,
  AssetItem,
  DLPRecord,
  DefectRecord,
  PPMScheduleEntry,
  MaintenanceOccurrence,
} from './types';

// ─── Schemas ──────────────────────────────────────────────────────────────────
export {
  WarrantyCategorySchema,
  AssetCategorySchema,
  AssetConditionSchema,
  DefectCategorySchema,
  DefectSeveritySchema,
  MaintenanceFrequencySchema,
  MaintenancePrioritySchema,
  ClaimUrgencySchema,
  CreateWarrantyItemSchema,
  CreateAssetItemSchema,
  LogDefectSchema,
  CreatePPMScheduleSchema,
  LodgeWarrantyClaimSchema,
} from './schemas';

// ─── Services ─────────────────────────────────────────────────────────────────
export {
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
} from './services/buildingPassport';

export type {
  ServiceResult,
  CreatePassportInput,
  UpdatePassportInput,
} from './services/buildingPassport';

// ─── Services ─────────────────────────────────────────────────────────────────
export {
  validateHandoverEligibility,
  executeHandoverTransition,
} from './services/handoverTransition';
export type {
  ServiceResult,
  ProjectHandoverData,
  ActorIdentity,
  HandoverTransitionResult,
} from './services/handoverTransition';
