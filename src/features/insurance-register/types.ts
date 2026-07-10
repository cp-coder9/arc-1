/**
 * Insurance Register Module — Type Definitions
 *
 * Project-level insurance policy tracking, expiry management,
 * claims notification, and compliance checking types.
 */

// ─── Enumerations ─────────────────────────────────────────────────────────────

export type InsurancePolicyType = 'CAR' | 'PI' | 'public_liability' | 'SASRIA' | 'LDI';
export type PolicyStatus = 'active' | 'expired' | 'cancelled' | 'pending_renewal';
export type ClaimNotificationStatus =
  | 'reported'
  | 'notified_to_insurer'
  | 'under_investigation'
  | 'claim_lodged'
  | 'settled'
  | 'rejected'
  | 'withdrawn';
export type ClaimCategory =
  | 'property_damage'
  | 'third_party_property_damage'
  | 'third_party_bodily_injury'
  | 'professional_negligence'
  | 'latent_defect'
  | 'other';
export type ContractForm = 'JBCC_PBA' | 'NEC_ECC' | 'GCC_2025' | 'FIDIC';

// ─── Core Domain Interfaces ───────────────────────────────────────────────────

export interface InsurancePolicy {
  id: string;
  projectId: string;
  policyType: InsurancePolicyType;
  insurerName: string;          // max 200 chars
  policyNumber: string;         // max 100 chars
  policyholderName: string;     // max 200 chars
  inceptionDate: string;        // ISO date
  expiryDate: string;           // ISO date, must be after inception
  sumInsured: number;           // 1.00 – 999,999,999,999.99 ZAR
  excessAmount: number;         // 0.00 – 999,999,999.99 ZAR
  brokerContactName: string;    // max 200 chars
  brokerPhone?: string;         // valid SA format
  brokerEmail?: string;         // valid email
  status: PolicyStatus;
  notificationPeriodDays?: number; // custom notification period for claims
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface InsuranceComplianceResult {
  policyType: InsurancePolicyType;
  status: 'compliant' | 'non_compliant' | 'expiring_soon';
  policy?: InsurancePolicy;
  minimumRequired?: number;
  shortfall?: number;
}

export interface InsuranceComplianceSummary {
  overallStatus: 'compliant' | 'partially_compliant' | 'non_compliant';
  activePolicies: number;
  expiredPolicies: number;
  nonCompliantTypes: number;
  lastCheckDate: string;
  results: InsuranceComplianceResult[];
}

export interface ClaimsNotification {
  id: string;
  projectId: string;
  incidentDate: string;
  discoveryDate: string;        // must be >= incidentDate
  affectedPolicyId: string;
  affectedPolicyType: InsurancePolicyType;
  description: string;          // max 2000 chars
  estimatedLoss: number;        // 0.01 – 999,999,999.99 ZAR
  locationOnSite: string;       // max 500 chars
  category?: ClaimCategory;
  evidenceRefs: string[];       // max 20 references
  status: ClaimNotificationStatus;
  notificationDeadline: string; // calculated ISO date
  linkedRiskEventId?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClaimsSummary {
  totalByPolicyType: Record<InsurancePolicyType, number>;
  totalEstimatedLoss: number;
  countByStatus: Record<ClaimNotificationStatus, number>;
  totalSettledAmount: number;
}

// ─── Service Interfaces ───────────────────────────────────────────────────────

export interface ContractDataSheet {
  contractForm: ContractForm;
  minimumSumInsured?: Partial<Record<InsurancePolicyType, number>>;
  sasriaRequired?: boolean;
  ldiRequired?: boolean;
}

export interface InsuranceRegisterService {
  registerPolicy(projectId: string, policy: Omit<InsurancePolicy, 'id' | 'status' | 'createdAt' | 'updatedAt'>, actorId: string): Promise<InsurancePolicy>;
  updatePolicy(projectId: string, policyId: string, updates: Partial<InsurancePolicy>, actorId: string): Promise<InsurancePolicy>;
  cancelPolicy(projectId: string, policyId: string, actorId: string): Promise<InsurancePolicy>;
  getProjectPolicies(projectId: string): Promise<InsurancePolicy[]>;
  getPolicyById(projectId: string, policyId: string): Promise<InsurancePolicy | null>;
  getExpiringPolicies(projectId: string, withinDays: number): Promise<InsurancePolicy[]>;
  processExpiryNotifications(projectId: string): Promise<void>;
}

export interface PolicyCheckerService {
  getRequiredTypes(projectId: string, contractForm: ContractForm, contractDataSheet?: ContractDataSheet): InsurancePolicyType[];
  checkCompliance(projectId: string): Promise<InsuranceComplianceSummary>;
  getMinimumSumInsured(contractDataSheet: ContractDataSheet, policyType: InsurancePolicyType): number | null;
}

export interface ClaimsNotificationService {
  registerClaim(projectId: string, claim: Omit<ClaimsNotification, 'id' | 'status' | 'notificationDeadline' | 'createdAt' | 'updatedAt'>, actorId: string): Promise<ClaimsNotification>;
  transitionStatus(projectId: string, claimId: string, newStatus: ClaimNotificationStatus, actorId: string): Promise<ClaimsNotification>;
  getClaimsSummary(projectId: string): Promise<ClaimsSummary>;
  getOverdueNotifications(projectId: string): Promise<ClaimsNotification[]>;
}
