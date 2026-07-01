import type { UserRole } from '@/types';

// ─── Trust Score Engine ───────────────────────────────────────────────────────

export type TrustScoreFactorType =
  | 'professional_registration'  // 25%
  | 'cpd_compliance'             // 20%
  | 'project_completion_rate'    // 15%
  | 'ai_audit_pass_rate'         // 15%
  | 'client_ratings'             // 10%
  | 'tool_mastery'              // 10%
  | 'dispute_free';             // 5%

export interface TrustScoreFactor {
  factor: TrustScoreFactorType;
  weight: number;
  rawScore: number;        // 0–100 for this factor
  weightedScore: number;   // rawScore * weight
  insufficientData: boolean;
}

export interface TrustScore {
  userId: string;
  overallScore: number;       // 0–100, rounded integer
  factors: TrustScoreFactor[];
  calculatedAt: string;       // ISO-8601
  badges: TrustBadge[];
}

export type TrustBadge = 'top_10_percent';

// ─── Compliance Search Engine ─────────────────────────────────────────────────

export interface ComplianceSearchQuery {
  searchText?: string;
  tools?: string[];                // CalculatorDefinition tool IDs
  sansReferences?: string[];
  disciplines?: string[];
  region?: string;
  minTrustScore?: number;          // defaults to 75
}

export interface ComplianceSearchResult {
  userId: string;
  displayName: string;
  registrationNumber: string;
  cpdStatus: 'compliant' | 'non_compliant';
  trustScore: number;
  toolUsageHistory: Record<string, number>;  // toolId → count
  municipalApprovalCount: number;
  disputeCount: number;
  badges: string[];
}

export interface AutoSuggestion {
  type: 'tool' | 'sans_clause' | 'discipline' | 'region';
  label: string;
  value: string;
}

// ─── Project Marketplace ──────────────────────────────────────────────────────

export interface ProjectPosting {
  id: string;
  clientId: string;
  title: string;                    // max 150 chars
  description: string;              // max 5000 chars
  location: string;
  municipality: string;
  budgetRange: { min: number; max: number };  // ZAR, min >= 1000, max <= 999999999
  sansReferences: string[];         // 1–20
  requiredTools: string[];          // 1–10 CalculatorDefinition IDs
  expiryDate: string;               // ISO-8601, 7–180 days from creation
  status: ProjectPostingStatus;
  createdAt: string;
  updatedAt: string;
}

export type ProjectPostingStatus = 'draft' | 'published' | 'accepted' | 'expired' | 'withdrawn';

export interface ProjectProposal {
  id: string;
  postingId: string;
  professionalId: string;
  registrationNumber: string;
  cpdPointsEarned: number;
  cpdPointsRequired: number;
  trustScore: number;
  toolUsageHistory: Record<string, number>;
  recentProjects: RecentProject[];  // max 10
  feeAmount: number;                // ZAR
  milestonePlan: ProposalMilestone[];
  status: ProposalStatus;
  createdAt: string;
}

export type ProposalStatus = 'submitted' | 'pending_acceptance' | 'accepted' | 'rejected' | 'withdrawn';

export interface ProposalMilestone {
  title: string;
  targetDate: string;               // ISO-8601
  amount: number;                    // ZAR
}

export interface RecentProject {
  projectId: string;
  title: string;
  completedAt: string;
  rating?: number;
}

// ─── Task Marketplace ─────────────────────────────────────────────────────────

export interface TaskPosting {
  id: string;
  professionalId: string;
  title: string;                    // 5–200 chars
  description: string;              // 20–5000 chars
  estimatedHours: number;           // 0.5–200
  paymentAmount: number;            // ZAR 100–999999.99
  requiredTools: string[];          // ≥1 CalculatorDefinition IDs
  deliverableFormat: DeliverableFormat;
  deadline: string;                 // ISO-8601, future, max 365 days
  status: TaskPostingStatus;
  assignedFreelancerId?: string;
  createdAt: string;
}

export type DeliverableFormat = 'pdf' | 'image' | 'certificate' | 'datasheet' | 'model' | 'other';
export type TaskPostingStatus = 'open' | 'in_progress' | 'delivered' | 'completed' | 'failed' | 'cancelled';

export interface TaskApplication {
  id: string;
  taskId: string;
  freelancerId: string;
  trustScore: number;
  verificationStatus: string;
  toolUsageHistory: Record<string, number>;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
}

export interface TaskDeliverable {
  id: string;
  taskId: string;
  freelancerId: string;
  files: DeliverableFile[];
  submissionNumber: number;         // 1–4 (initial + 3 resubmissions)
  aiReviewStatus: 'pending' | 'passed' | 'rejected';
  aiReviewReasons?: string[];
  professionalSignOff: boolean;
  submittedAt: string;
}

export interface DeliverableFile {
  fileId: string;
  fileName: string;
  format: DeliverableFormat;
  sizeBytes: number;
}

// ─── Supplier & Material Marketplace ──────────────────────────────────────────

export interface MaterialListing {
  id: string;
  supplierId: string;
  productName: string;              // max 150 chars
  description: string;              // max 2000 chars
  sansComplianceReference: string;
  leadTimeDays: number;             // 1–365
  warrantyTerms: string;            // max 1000 chars
  deliveryZones: string[];          // ≥1
  unitPriceZar: number;             // 0.01–999999999.99
  certificationDocuments: CertificationDoc[];  // 1–5, max 20MB each
  status: 'active' | 'suspended' | 'expired';
  createdAt: string;
}

export interface CertificationDoc {
  fileId: string;
  fileName: string;
  format: 'pdf' | 'image';
  sizeBytes: number;
}

export interface QuoteRequest {
  id: string;
  contractorId: string;
  supplierId: string;
  listingId: string;
  linkedProjectId: string;
  quantity: number;
  deliveryAddress: string;
  status: QuoteRequestStatus;
  quotedAmount?: number;
  createdAt: string;
  expiresAt: string;               // 7 days from creation
}

export type QuoteRequestStatus = 'pending' | 'quoted' | 'accepted' | 'expired' | 'cancelled';

// ─── Freelancer Hub ───────────────────────────────────────────────────────────

export interface FreelancerProfile {
  userId: string;
  skills: FreelancerSkill[];       // max 20, each linked to CalculatorDefinition
  cpdStatus: 'compliant' | 'non_compliant';
  taskHistory: TaskHistoryEntry[];
  availability: 'available' | 'partially_available' | 'unavailable';
  yearsExperience: number;         // 0–60
  trustScore: number;              // 0–100
  completedTaskCount: number;
  averageRating: number;           // 1.0–5.0
  badges: string[];
  createdAt: string;
  updatedAt: string;
}

export interface FreelancerSkill {
  toolId: string;                  // CalculatorDefinition ID
  label: string;
}

export interface TaskHistoryEntry {
  taskId: string;
  title: string;
  completedAt: string;
  rating: number;                  // 1–5
}

export interface FreelancerProfileView {
  profile: FreelancerProfile;
  toolUsageFrequency: Record<string, number>;  // last 12 months
  aiAuditPassRate: number;                     // percentage, last 12 months
  disputeHistory: DisputeEntry[];              // max 10 most recent
}

export interface DisputeEntry {
  disputeId: string;
  createdAt: string;
  status: string;
  outcome?: string;
}

// ─── Firm Collaboration ───────────────────────────────────────────────────────

export interface FirmCollaborationPosting {
  id: string;
  firmId: string;
  createdByUserId: string;
  title: string;                   // 1–150 chars
  description: string;             // 1–5000 chars
  requiredDisciplines: string[];   // ≥1
  teamSize: number;                // 1–50
  budgetPerRole: Record<string, number>;  // role → ZAR amount
  timeline: { startDate: string; endDate: string };
  linkedTools: string[];           // CalculatorDefinition IDs
  status: 'draft' | 'published' | 'in_progress' | 'completed' | 'cancelled';
  teamMembers: CollaborationMember[];
  createdAt: string;
}

export interface CollaborationMember {
  userId: string;
  role: string;
  invitedAt: string;
  acceptedAt?: string;
  rating?: number;                // 1–5, set on completion
}

export interface CollaborationInvite {
  id: string;
  collaborationId: string;
  inviteeUserId: string;
  trustScore: number;
  registrationStatus: string;
  status: 'pending' | 'accepted' | 'rejected';
}

// ─── Marketplace RBAC ─────────────────────────────────────────────────────────

export type MarketplaceAction =
  | 'create_project_posting'
  | 'search_professionals'
  | 'accept_proposal'
  | 'receive_certificate'
  | 'apply_project'
  | 'create_task'
  | 'hire_freelancer'
  | 'post_collaboration'
  | 'apply_task'
  | 'create_freelancer_profile'
  | 'create_material_listing'
  | 'respond_quote'
  | 'search_suppliers'
  | 'request_quote'
  | 'resolve_dispute'
  | 'manage_verification'
  | 'access_analytics';

export interface RbacCheckResult {
  allowed: boolean;
  requiredRoles?: UserRole[];
  reason?: string;
}

// ─── Compliance Certificate ───────────────────────────────────────────────────

export interface ComplianceCertificateData {
  certificateId: string;          // unique, non-guessable
  projectId: string;
  projectTitle: string;
  professionals: CertificateProfessional[];
  sansReferences: string[];
  toolsUsed: string[];
  milestoneAuditResults: MilestoneAuditResult[];
  escrowConfirmations: EscrowConfirmation[];
  generatedAt: string;
  documentVaultFileId: string;
}

export interface CertificateProfessional {
  userId: string;
  displayName: string;
  registrationNumber: string;
}

export interface MilestoneAuditResult {
  milestoneId: string;
  title: string;
  aiAuditStatus: 'passed' | 'failed';
  signOffBy: string;              // AI audit ID or Professional user ID
}

export interface EscrowConfirmation {
  milestoneId: string;
  amount: number;                 // ZAR
  recipientUserId: string;
  releasedAt: string;             // ISO-8601
}

// ─── Error Handling ───────────────────────────────────────────────────────────

export interface MarketplaceError {
  code: string;                    // Machine-readable error code
  message: string;                 // Human-readable message
  details?: {
    field?: string;                // For validation errors
    reason?: string;               // Specific failure reason
    requiredRoles?: UserRole[];    // For access denied errors
    blockers?: string[];           // For escrow transition errors
    missingItems?: string[];       // For certificate generation failures
  };
}
