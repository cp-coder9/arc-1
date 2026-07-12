/**
 * FM Bridge Module — Type Definitions
 *
 * Domain types for the Post-Occupancy & Facility Management Bridge (P2.8).
 * Covers: Building Passport, Warranty Register, Asset Register,
 * Defects Liability Period, and Planned Preventive Maintenance.
 */

// ─── Enums / Unions ───────────────────────────────────────────────────────────

/** Roles specific to FM Bridge building access */
export type FMBuildingRole = 'building_owner' | 'facility_manager' | 'body_corporate_admin' | 'read_only';

/** FM Bridge subscription tiers */
export type FMSubscriptionTier = 'basic' | 'standard' | 'premium';

/** Warranty item categories */
export type WarrantyCategory = 'structural' | 'mechanical' | 'electrical' | 'plumbing' | 'finishes' | 'equipment' | 'other';

/** Warranty lifecycle statuses */
export type WarrantyStatus = 'active' | 'expired' | 'claimed' | 'voided';

/** Warranty claim progression stages */
export type WarrantyClaimStage = 'lodged' | 'acknowledged' | 'inspection_scheduled' | 'rectification_in_progress' | 'rectified' | 'closed';

/** Urgency level for warranty claims */
export type ClaimUrgency = 'routine' | 'urgent' | 'emergency';

/** Asset register categories */
export type AssetCategory = 'structural' | 'mechanical' | 'electrical' | 'plumbing' | 'fire_protection' | 'lifts' | 'security' | 'finishes' | 'landscaping' | 'other';

/** Asset condition ratings */
export type AssetCondition = 'excellent' | 'good' | 'fair' | 'poor' | 'failed';

/** Defect categories during DLP */
export type DefectCategory = 'structural' | 'mechanical' | 'electrical' | 'plumbing' | 'finishes' | 'external' | 'other';

/** Defect severity levels */
export type DefectSeverity = 'critical' | 'major' | 'minor' | 'cosmetic';

/** Defect progression stages */
export type DefectStage = 'logged' | 'notified' | 'inspection_scheduled' | 'rectification_in_progress' | 'rectified' | 'verified' | 'closed';

/** DLP lifecycle statuses */
export type DLPStatus = 'active' | 'expired' | 'all_defects_resolved';

/** Maintenance schedule frequency options */
export type MaintenanceFrequency = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'semi_annually' | 'annually' | 'custom';

/** Maintenance task priority levels */
export type MaintenancePriority = 'critical' | 'high' | 'medium' | 'low';

/** Maintenance occurrence lifecycle states */
export type MaintenanceState = 'scheduled' | 'in_progress' | 'completed' | 'verified';

// ─── Domain Interfaces ────────────────────────────────────────────────────────

/** Digital Building Passport — persistent record surviving project closure */
export interface BuildingPassport {
  id: string;
  buildingName: string;
  physicalAddress: string;
  gpsCoordinates?: { lat: number; lng: number };
  constructionCompletionDate: string;
  mainContractorName: string;
  principalAgentName: string;
  projectReferenceNumber: string;
  buildingType?: string;
  grossFloorArea?: number; // square metres
  numberOfStoreys?: number;
  sourceProjectId: string;
  subscriptionStatus: FMSubscriptionTier | 'trial' | 'lapsed';
  subscriptionRenewalDate?: string;
  subscriptionHolderId?: string;
  createdAt: string;
  updatedAt: string;
}

/** Access control record for a building */
export interface BuildingAccessRecord {
  id: string;
  buildingId: string;
  userId: string;
  role: FMBuildingRole;
  grantedBy: string;
  grantDate: string;
  revokedAt?: string;
}

/** Warranty register entry */
export interface WarrantyItem {
  id: string;
  buildingId: string;
  description: string;
  category: WarrantyCategory;
  supplierName: string;
  warrantyPeriodMonths: number;
  startDate: string;
  expiryDate: string;
  status: WarrantyStatus;
  conditions?: string; // max 1000 chars
  sourceHandover: boolean; // true if from handover transition
  createdAt: string;
  updatedAt: string;
}

/** Warranty claim record */
export interface WarrantyClaim {
  id: string;
  warrantyId: string;
  buildingId: string;
  claimDate: string;
  defectDescription: string; // max 2000 chars
  locationInBuilding: string; // max 500 chars
  photographicEvidence: string[]; // 0-10 references
  urgency: ClaimUrgency;
  stage: WarrantyClaimStage;
  stageHistory: { stage: WarrantyClaimStage; date: string; actor: string }[];
  createdAt: string;
  updatedAt: string;
}

/** Asset register entry */
export interface AssetItem {
  id: string;
  buildingId: string;
  assetIdentifier: string; // system-generated, unique per building
  description: string; // max 500 chars
  category: AssetCategory;
  locationInBuilding: string; // max 200 chars
  manufacturer?: string; // max 200 chars
  modelNumber?: string; // max 100 chars
  serialNumber?: string; // max 100 chars
  installationDate?: string;
  expectedUsefulLifeYears?: number; // 1-100
  replacementCostZAR?: number; // 0.01 - 999,999,999.99
  condition: AssetCondition;
  lastInspectionDate?: string;
  createdAt: string;
  updatedAt: string;
}

/** Defects Liability Period record */
export interface DLPRecord {
  id: string;
  buildingId: string;
  startDate: string;
  endDate: string;
  durationDays: number;
  mainContractorRef: string;
  principalAgentRef: string;
  status: DLPStatus;
  createdAt: string;
  updatedAt: string;
}

/** Defect record within a DLP */
export interface DefectRecord {
  id: string;
  dlpId: string;
  buildingId: string;
  description: string; // max 2000 chars
  locationInBuilding: string; // max 500 chars
  category: DefectCategory;
  severity: DefectSeverity;
  photographicEvidence: string[]; // 0-10
  dateDiscovered: string;
  responsibleTrade?: string; // max 200 chars
  stage: DefectStage;
  isPostDLP: boolean;
  stageHistory: { stage: DefectStage; date: string; actor: string }[];
  createdAt: string;
  updatedAt: string;
}

/** Planned Preventive Maintenance schedule entry */
export interface PPMScheduleEntry {
  id: string;
  buildingId: string;
  assetId: string;
  taskDescription: string; // max 500 chars
  frequency: MaintenanceFrequency;
  customIntervalDays?: number; // 1-3650 (for 'custom' frequency)
  responsibleParty: string; // max 200 chars
  estimatedDurationHours: number; // 0.25-999
  estimatedCostZAR: number; // 0.01-999,999.99
  priority: MaintenancePriority;
  createdAt: string;
  updatedAt: string;
}

/** Individual maintenance occurrence from a PPM schedule */
export interface MaintenanceOccurrence {
  id: string;
  scheduleId: string;
  buildingId: string;
  scheduledDate: string;
  state: MaintenanceState;
  completionDate?: string;
  actualCostZAR?: number;
  notes?: string; // max 1000 chars
  isOverdue: boolean;
  createdAt: string;
  updatedAt: string;
}
