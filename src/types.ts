export type UserRole = 'client' | 'architect' | 'admin' | 'freelancer' | 'bep' | 'contractor' | 'subcontractor' | 'supplier';

export type FirmRole = 'owner' | 'admin' | 'coordinator' | 'staff' | 'billing_viewer';
export type FirmMemberStatus = 'invited' | 'active' | 'suspended' | 'removed';
export type FirmSubscriptionStatus = 'trial' | 'active' | 'past_due' | 'cancelled' | 'none';
export type FirmInviteStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export interface Firm {
  id: string;
  name: string;
  slug?: string;
  description?: string;
  ownerId: string;
  primaryContactEmail?: string;
  billingEmail?: string;
  subscriptionStatus: FirmSubscriptionStatus;
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
}

export interface FirmMember {
  id: string;
  firmId: string;
  userId: string;
  email: string;
  displayName?: string;
  role: FirmRole;
  status: FirmMemberStatus;
  invitedBy?: string;
  invitedAt?: string;
  acceptedAt?: string;
  removedBy?: string;
  removedAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface FirmInvite {
  id: string;
  firmId: string;
  email: string;
  invitedUid?: string;
  role: FirmRole;
  status: FirmInviteStatus;
  invitedBy: string;
  invitedAt: string;
  acceptedBy?: string;
  acceptedAt?: string;
  revokedBy?: string;
  revokedAt?: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface FirmAuditEvent {
  id: string;
  firmId: string;
  actorId: string;
  type: 'firm_created' | 'member_invited' | 'invite_accepted' | 'role_changed' | 'member_removed';
  targetUserId?: string;
  targetInviteId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  bio?: string;
  nhbrcNumber?: string;
  cidbGrading?: string;
  hasPIInsurance?: boolean;
  tradeLicense?: string;
  professionalLabels?: string[]; // e.g. ['Engineer', 'Builder', 'Construction Worker']
  professionalLabel?: string;
  region?: string;
  averageRating?: number;
  totalReviews?: number;
  completedJobs?: number;
  createdAt: string;
  updatedAt?: string;
  notificationPreferences?: NotificationPreferences;
  primaryFirmId?: string;
  firmMembershipIds?: string[];
  firmRole?: FirmRole;
  firmStatus?: FirmMemberStatus;
  subscriptionStatus?: FirmSubscriptionStatus;
  billingRole?: FirmRole | 'none';
}

export type JobCategory = 'Residential' | 'Commercial' | 'Industrial' | 'Renovation' | 'Interior' | 'Landscape';

export interface Job {
  id: string;
  clientId: string;
  title: string;
  description: string;
  requirements: string[];
  deadline: string;
  budget: number;
  category: JobCategory;
  location?: string;
  status: 'open' | 'in-progress' | 'completed' | 'cancelled';
  selectedArchitectId?: string;
  createdAt: string;
  updatedAt?: string;
  cancelledAt?: string;
  cancellationReason?: string;
  statusHistory?: JobStatusHistory[];
}

export interface JobStatusHistory {
  status: Job['status'];
  timestamp: string;
  actorId: string;
  note?: string;
}

export interface Application {
  id: string;
  jobId: string;
  architectId: string;
  architectName: string;
  proposal: string;
  portfolioUrl?: string;
  documents?: string[];
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn';
  createdAt: string;
  updatedAt?: string;
  withdrawnAt?: string;
  notes?: string;
  
  // Denormalized profile fields
  sacapNumber?: string;
  specializations?: string[];
  completedJobs?: number;
  averageRating?: number;
  portfolioThumbnail?: string;
}

export interface Review {
  id: string;
  jobId: string;
  fromId: string;
  toId: string;
  rating: number;
  comment: string;
  status: 'pending_admin' | 'approved';
  type: 'client_to_architect' | 'architect_to_client' | 'to_bep' | 'from_bep' | 'to_freelancer';
  createdAt: string;
}

export type SubmissionStatus = 
  | 'processing'
  | 'pending_ai' 
  | 'ai_reviewing' 
  | 'ai_failed' 
  | 'ai_passed' 
  | 'admin_reviewing' 
  | 'admin_rejected' 
  | 'approved';

export interface TraceLog {
  timestamp: string;
  actor: string;
  action: string;
  details: string;
}

export type Discipline =
  | 'architecture'
  | 'structure'
  | 'fire'
  | 'accessibility'
  | 'energy'
  | 'drainage'
  | 'electrical'
  | 'mechanical'
  | 'planning'
  | 'documentation'
  | 'environmental'
  | 'nhbrc'
  | 'coordination';

export interface DisciplineInfo {
  key: Discipline;
  label: string;
  sacapCategory: string;
  requiredFor: JobCategory[];
  icon: string;
}

export const DISCIPLINE_REGISTRY: DisciplineInfo[] = [
  { key: 'architecture', label: 'Architecture', sacapCategory: 'Professional Architect', requiredFor: ['Residential', 'Commercial', 'Industrial'], icon: 'Building2' },
  { key: 'structure', label: 'Structural Engineering', sacapCategory: 'Pr Eng (Structural)', requiredFor: ['Residential', 'Commercial', 'Industrial'], icon: 'Hammer' },
  { key: 'fire', label: 'Fire Engineering', sacapCategory: 'Fire Consultant', requiredFor: ['Commercial', 'Industrial'], icon: 'Flame' },
  { key: 'electrical', label: 'Electrical Engineering', sacapCategory: 'Pr Eng (Electrical)', requiredFor: ['Commercial', 'Industrial'], icon: 'Zap' },
  { key: 'mechanical', label: 'Mechanical Engineering', sacapCategory: 'Pr Eng (Mechanical)', requiredFor: ['Commercial', 'Industrial'], icon: 'Cog' },
  { key: 'energy', label: 'Energy Compliance', sacapCategory: 'Energy Consultant', requiredFor: ['Residential', 'Commercial'], icon: 'Sun' },
  { key: 'drainage', label: 'Civil / Drainage', sacapCategory: 'Pr Eng (Civil)', requiredFor: ['Residential', 'Commercial'], icon: 'Droplets' },
  { key: 'accessibility', label: 'Accessibility', sacapCategory: 'Accessibility Consultant', requiredFor: ['Commercial'], icon: 'Accessibility' },
  { key: 'environmental', label: 'Environmental', sacapCategory: 'Environmental Consultant', requiredFor: ['Industrial'], icon: 'TreePine' },
  { key: 'planning', label: 'Town Planning', sacapCategory: 'Town Planner', requiredFor: ['Residential', 'Commercial'], icon: 'Map' },
  { key: 'nhbrc', label: 'NHBRC Enrolment', sacapCategory: 'NHBRC Registered Builder', requiredFor: ['Residential'], icon: 'ShieldCheck' },
  { key: 'documentation', label: 'Documentation', sacapCategory: 'Draughtsperson', requiredFor: ['Residential', 'Commercial', 'Industrial'], icon: 'FileText' },
  { key: 'coordination', label: 'Professional Coordination', sacapCategory: 'Lead Consultant', requiredFor: ['Commercial', 'Industrial'], icon: 'Users' },
];

export type StandardFamily =
  | 'NBR'
  | 'SANS10400'
  | 'SANS10160'
  | 'SANS10100'
  | 'SANS10162'
  | 'SANS10142'
  | 'SANS10252'
  | 'MunicipalBylaw'
  | 'NHBRC'
  | 'ProfessionalCoordination'
  | 'Other';

export type AutonomyLabel =
  | 'autonomous_check'
  | 'professional_review_required'
  | 'competent_person_required'
  | 'municipal_confirmation_required'
  | 'insufficient_information';

export type ResponsibleParty =
  | 'architect'
  | 'structural_engineer'
  | 'civil_engineer'
  | 'fire_engineer'
  | 'electrical_engineer'
  | 'mechanical_engineer'
  | 'energy_professional'
  | 'client'
  | 'contractor'
  | 'municipality'
  | 'admin';

export type RiskStatus =
  | 'ready_for_admin_review'
  | 'ready_for_professional_review'
  | 'requires_minor_corrections'
  | 'requires_major_corrections'
  | 'requires_specialist_design'
  | 'not_assessable_insufficient_information'
  | 'ai_review_failed';

export type ExecutionMode =
  | 'basic_ai_screen'
  | 'council_readiness'
  | 'fire_plan_review'
  | 'engineering_coordination'
  | 'full_professional_review'
  | 'resubmission_delta_review'
  | 'specialist_pack_review';

export interface DrawingReference {
  url: string;
  name: string;
  type?: string;
}

export interface SubmissionIndexItem extends DrawingReference {
  detectedType: string;
}

export interface SignOffRequirement {
  discipline: Discipline;
  responsibleParty: ResponsibleParty;
  requirement: string;
  reason: string;
  standardFamily?: StandardFamily;
  reference?: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

export interface Finding {
  title: string;
  description: string;
  discipline: Discipline;
  standardFamily: StandardFamily;
  reference: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: 'low' | 'medium' | 'high';
  autonomyLabel: AutonomyLabel;
  responsibleParty: ResponsibleParty;
  actionItem: string;
  evidence: string;
  sourceCitations: KnowledgeCitation[];
  drawingReferences: DrawingReference[];
  requiresProfessionalSignoff: boolean;
}

export interface AIIssue {
  description: string;
  regulationStipulation: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  actionItem: string;
  discipline?: Discipline;
  standardFamily?: StandardFamily;
  reference?: string;
  confidence?: 'low' | 'medium' | 'high';
  autonomyLabel?: AutonomyLabel;
  responsibleParty?: ResponsibleParty;
  evidence?: string;
  requiresProfessionalSignoff?: boolean;
  boundingBox?: { x: number; y: number; width: number; height: number };
  annotatedImageUrl?: string;
}

export interface AICategory {
  name: string;
  issues: AIIssue[];
}

export interface AIReviewResult {
 status: 'passed' | 'failed';
 feedback: string;
 categories: AICategory[];
 visualReportUrl?: string;
 traceLog: string;
 citations?: KnowledgeCitation[];
 knowledgeSources?: string[];
 riskStatus?: RiskStatus;
 findings?: Finding[];
 signOffChecklist?: SignOffRequirement[];
 submissionIndex?: SubmissionIndexItem[];
 mode?: ExecutionMode;
 disclaimers?: string[];
}

export interface AIProgress {
 percentage: number;
 agentName: string;
 activity: string;
 completedAgents: string[];
 thought?: string;
 mode?: ExecutionMode;
 discipline?: Discipline;
 plannedAgents?: string[];
}

export interface Submission {
  id: string;
  jobId: string;
  architectId: string;
  drawingUrl: string;
  drawingName: string;
  status: SubmissionStatus;
  aiFeedback?: string;
  aiStructuredFeedback?: AICategory[];
  findings?: Finding[];
  signOffChecklist?: SignOffRequirement[];
  riskStatus?: RiskStatus;
  executionMode?: ExecutionMode;
  architectComment?: string;
  annotatedScreenshots?: { issueIndex: number; imageUrl: string }[];

  adminFeedback?: string;
  visualReportUrl?: string;
  traceability: TraceLog[];
  createdAt: string;
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  description: string;
  systemPrompt: string;
  temperature: number;
  status: 'online' | 'offline' | 'maintenance';
  discipline?: Discipline;
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
  standardsCoverage?: string[];
  executionModes?: ExecutionMode[];
  requiresHumanReview?: boolean;
  version?: string;
  approvedBy?: string;
  currentActivity?: string;
  lastActive: string;
  llmProvider?: LLMProvider | 'global';
  llmModel?: string;
  llmApiKey?: string;
  llmBaseUrl?: string;
  authorizationType?: 'bearer' | 'api_key' | 'custom';
  authorizationValue?: string;
  authorizationHeader?: string;
}

export type WorkflowAgentRole =
  | 'briefing_agent'
  | 'matching_agent'
  | 'tender_agent'
  | 'construction_agent';

export interface WorkflowAgentConfig {
  role: WorkflowAgentRole;
  name: string;
  description: string;
  systemPrompt: string;
  activeInStages: ProjectStage[];
  triggerEvents: string[];
  temperature: number;
}

export interface SystemLog {
  id: string;
  timestamp: string;
  level: 'info' | 'warning' | 'error' | 'critical';
  source: string;
  message: string;
  metadata?: any;
}

export interface DelegatedTask {
  id: string;
  jobId: string;
  architectId: string;
  assigneeId?: string; // UID of the assigned freelancer/user
  assigneeName: string;
  assigneeRole: string;
  deadline: string;
  notes: string;
  status: 'pending' | 'in-progress' | 'completed';
  createdAt: string;
}

export interface JobCard extends DelegatedTask {
  assigneeId?: string;
  priority: 'low' | 'medium' | 'high';
  estimatedHours?: number;
  attachments?: { name: string; url: string }[];
  requirements?: string[];
}

export type LLMProvider = 'gemini' | 'openai' | 'openrouter' | 'nvidia';

export interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  model: string;
  baseUrl?: string;
}

// Notification types
export type NotificationType = 
  | 'job_application' 
  | 'application_accepted' 
  | 'drawing_submitted' 
  | 'ai_review_complete' 
  | 'admin_approval' 
  | 'admin_rejection' 
  | 'payment_released' 
  | 'message'
  | 'milestone_due'
  | 'council_update'
  | 'invoice_sent'
  | 'invoice_paid'
  | 'firm_invite'
  | 'firm_role_changed'
  | 'firm_member_removed'
  | 'directory_invitation';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: {
    jobId?: string;
    projectId?: string;
    submissionId?: string;
    senderId?: string;
    applicationId?: string;
    firmId?: string;
    firmInviteId?: string;
    invitationId?: string;
    workPackageId?: string;
    discipline?: string;
  };
  isRead: boolean;
  channels: ('in_app' | 'email' | 'push')[];
  createdAt: string;
  readAt?: string;
  deliveryStatus?: 'pending' | 'processing' | 'delivered' | 'failed';
}

export interface Dispute {
  id: string;
  jobId: string;
  filedBy: string;
  filedAgainst?: string;
  reason: string;
  requestedResolution: string;
  status: 'open' | 'in_mediation' | 'resolved' | 'rejected';
  adminNotes?: string;
  resolution?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface NotificationPreferences {
  in_app: boolean;
  email: boolean;
  push: boolean;
}

// Message types
export interface Message {
  id: string;
  jobId: string;
  senderId: string;
  senderRole: UserRole;
  content: string;
  attachments?: { name: string; url: string; type: string }[];
  isRead: boolean;
  readAt?: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  jobId: string;
  clientId: string;
  architectId: string;
  lastMessageAt: string;
  lastMessage?: string;
  unreadCount: { [userId: string]: number };
}

// Payment types
export type PaymentType = 'escrow_deposit' | 'milestone_release' | 'refund' | 'platform_fee';
export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded';

export interface Payment {
  id: string;
  jobId: string;
  payerId: string;
  payeeId: string;
  amount: number;
  type: PaymentType;
  milestone?: 'initial' | 'draft' | 'final';
  status: PaymentStatus;
  payfastReference?: string;
  receiptUrl?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt?: string;
}

export interface Escrow {
  jobId: string;
  totalAmount: number;
  heldAmount: number;
  releasedAmount: number;
  platformFeeAmount: number;
  refundedAmount?: number;
  status: 'pending' | 'funded' | 'partially_released' | 'fully_released' | 'partially_refunded' | 'refunded';
  milestones?: {
    initial: { percentage: number; status: string; released: boolean; releasedAt?: string; amount?: number };
    draft: { percentage: number; status: string; released: boolean; releasedAt?: string; amount?: number };
    final: { percentage: number; status: string; released: boolean; releasedAt?: string; amount?: number };
  };
  createdAt: string;
  updatedAt?: string;
}

export interface EscrowMilestone {
  id: string;
  name: string;
  stage: ProjectStage;
  percentage: number;
  amount: number;
  status: 'pending' | 'funded' | 'release_requested' | 'released' | 'disputed';
  releaseConditions?: string[];
  requestedAt?: string;
  releasedAt?: string;
  approvedBy?: string;
}

export interface EscrowV2 extends Omit<Escrow, 'milestones'> {
  milestones: EscrowMilestone[];
  linkedProjectId?: string;
}

export interface LedgerEntry {
  id: string;
  projectId: string;
  jobId: string;
  type: PaymentType | 'invoice_payment';
  amount: number;
  direction: 'credit' | 'debit';
  description: string;
  payerId: string;
  payeeId: string;
  paymentId?: string;
  escrowMilestoneId?: string;
  createdAt: string;
}

// Architect verification types
export type VerificationStatus = 'pending' | 'verified' | 'rejected' | 'expired';

export type VerificationSubjectType = 'bep' | 'contractor' | 'subcontractor' | 'supplier' | 'freelancer' | 'admin';
export type VerificationSource = 'professional_body_api' | 'public_register' | 'automated_browser_agent' | 'manual_admin_review' | 'document_upload' | 'privyseal' | 'other';

export interface UserVerification {
  id: string;
  userId: string;
  subjectType: VerificationSubjectType;
  status: VerificationStatus;
  source: VerificationSource;
  registrationNumber?: string;
  statutoryBody?: string;
  evidenceDocumentIds?: string[];
  evidenceUrls?: string[];
  submittedAt: string;
  submittedBy: string;
  reviewedAt?: string;
  reviewedBy?: string;
  rejectionReason?: string;
  expiresAt?: string;
  lastVerifiedAt?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt?: string;
}

export interface ArchitectVerification {
  userId: string;
  status: VerificationStatus;
  certificateUrl?: string;
  sacapNumber: string;
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  rejectionReason?: string;
  expiresAt?: string;
  lastVerifiedAt?: string;
}

// Architect profile
export type SACAPStatus = 'unverified' | 'verified' | 'pending' | 'failed';

export interface ArchitectProfile {
  userId: string;
  sacapNumber: string;
  sacapStatus?: SACAPStatus;
  sacapLastVerifiedAt?: string;
  sacapRegistrationType?: string;
  yearsExperience?: number;
  specializations: string[];
  portfolioImages: { url: string; title: string; description?: string }[];
  completedJobs: number;
  averageRating: number;
  totalReviews: number;
  website?: string;
  linkedIn?: string;
  updatedAt?: string;
}

// Council submission types
export type MunicipalityType = 'COJ' | 'COCT' | 'ETH' | 'NMB' | 'Tshwane' | 'Ekurhuleni' | 'Mangaung' | 'Other';

export interface TrackingEvent {
  status: 'preparing' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'queries_raised' | string;
  timestamp: string;
  notes?: string;
  source: 'manual' | 'scraper' | 'ocr' | 'shadow' | string;
  actorId?: string;
}

export interface CouncilSubmission {
  id: string;
  jobId: string;
  municipality: MunicipalityType | string;
  municipalityName?: string;
  userId: string;
  referenceNumber?: string;
  status: 'preparing' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'queries_raised' | string;
  rawStatus?: string;
  lastCheckedAt?: string;
  submittedAt?: string;
  documents: { name: string; url: string }[];
  source: 'manual' | 'scraper' | 'ocr' | 'shadow_tracker';
  trackingHistory: TrackingEvent[];
  queries?: CouncilQuery[];
  erfNumber?: string;
  projectDescription?: string;
}

export interface CouncilQuery {
  raisedAt: string;
  description: string;
  response?: string;
  respondedAt?: string;
  attachments?: { name: string; url: string }[];
}

export interface MunicipalCredential {
  id: string;
  userId: string;
  municipality: MunicipalityType | string;
  username: string;
  encryptedPassword?: string;
  password?: string; // Obfuscated base64 for demo
  iv?: string;
  authTag?: string; // For GCM
  lastUsed?: string;
  status: 'valid' | 'invalid' | 'unchecked';
  createdAt: string;
  updatedAt?: string;
}

export interface CrowdsourceUpdate {
  id: string;
  municipality: MunicipalityType;
  officeLocation?: string;
  department?: string;
  statusUpdate: string;
  backlogLevel: 'low' | 'medium' | 'high';
  reportedBy: string; // userId
  timestamp: string;
}

// Invoicing types
export interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  jobId: string;
  clientId: string;
  architectId: string;
  items: InvoiceItem[];
  subtotal: number;
  taxAmount: number;
  taxRate: number;
  totalAmount: number;
  currency: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  dueDate: string;
  createdAt: string;
  updatedAt?: string;
  paidAt?: string;
  pdfUrl?: string;
  notes?: string;
}

export type UploadedFile = {
  id: string;
  url: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  uploadedBy: string;
  uploadedAt: string;
  context: 'submission' | 'chat' | 'certificate' | 'invoice' | 'test' | 'knowledge_base' | 'site_log' | 'brief';
  jobId?: string;
  submissionId?: string;
};

export type KnowledgeSource = 'documentation' | 'human_feedback' | 'self_improvement' | 'web_search';
export type KnowledgeStatus = 'active' | 'pending_review' | 'rejected' | 'archived';

export interface AgentKnowledge {
  id: string;
  agentId: string;
  agentRole: string;
  title: string;
  content: string; // Human-readable markdown
  source: KnowledgeSource;
  status: KnowledgeStatus;
  submittedBy: string; // userId
  submittedByRole: UserRole | 'system';
  reviewedBy?: string; // admin userId
  reviewedAt?: string;
  relatedSubmissionId?: string;
  relatedJobId?: string;
  searchQuery?: string; // if source is web_search
  sourceUrl?: string; // if from documentation or web
  pdfUrl?: string; // if uploaded from PDF
  pdfPageNumber?: number; // page number in PDF
  tags: string[]; // e.g. ['SANS 10400-K', 'wall thickness', 'DPC']
  standardFamily?: StandardFamily;
  standardPart?: string;
  municipality?: string;
  province?: string;
  discipline?: Discipline;
  effectiveDate?: string;
  reviewDate?: string;
  version?: string;
  disclaimer?: string;
  confidence?: 'low' | 'medium' | 'high';
  createdAt: string;
  updatedAt?: string;
  usageCount?: number; // Track how often this knowledge is used
  lastUsedAt?: string;
}

export interface KnowledgeCitation {
  knowledgeId: string;
  title: string;
  content: string;
  source: KnowledgeSource;
  sourceUrl?: string;
  pdfUrl?: string;
  pdfPageNumber?: number;
  tags: string[];
}

// --- Project Lifecycle Types ------------------------------------------------

/**
 * The 9-stage project lifecycle from Intake to Close-out.
 * Each stage represents a major phase in the architectural project delivery process.
 */
export type ProjectStage =
  | 'intake'
  | 'scoping'
  | 'appointment'
  | 'coordination'
  | 'compliance'
  | 'tender'
  | 'delivery'
  | 'payments'
  | 'closeout';

/** Canonical ordering of project stages (forward-only transitions). */
export const PROJECT_STAGE_ORDER: ProjectStage[] = [
  'intake',
  'scoping',
  'appointment',
  'coordination',
  'compliance',
  'tender',
  'delivery',
  'payments',
  'closeout',
];

/** Human-readable labels for each project stage. */
export const PROJECT_STAGE_LABELS: Record<ProjectStage, string> = {
  intake: 'Intake',
  scoping: 'Scoping & Briefing',
  appointment: 'Appointment',
  coordination: 'Design Coordination',
  compliance: 'Compliance Review',
  tender: 'Tender & Procurement',
  delivery: 'Construction Delivery',
  payments: 'Payments & Escrow',
  closeout: 'Close-out',
};

/** Icon names (lucide-react) for each project stage. */
export const PROJECT_STAGE_ICONS: Record<ProjectStage, string> = {
  intake: 'ClipboardList',
  scoping: 'Search',
  appointment: 'UserCheck',
  coordination: 'Users',
  compliance: 'ShieldCheck',
  tender: 'FileText',
  delivery: 'HardHat',
  payments: 'CreditCard',
  closeout: 'CheckCircle2',
};

/** A record of a stage transition in the project's history. */
export interface StageHistoryEntry {
  stage: ProjectStage;
  enteredAt: string;
  exitedAt?: string;
  actorId: string;
  note?: string;
}

/**
 * A Project wraps a Job with lifecycle tracking, stage metadata, and a team roster.
 * Created when a client accepts an architect's application.
 */
export interface Project {
  id: string;
  jobId: string;
  clientId: string;
  leadArchitectId?: string;
  currentStage: ProjectStage;
  stageHistory: StageHistoryEntry[];
  teamMembers: ProjectTeamMember[];
  firmId?: string;
  firmAccessEnabled?: boolean;
  firmSharedBy?: string;
  firmSharedAt?: string;
  createdAt: string;
  updatedAt?: string;
}

/** A member of the project team, tracked by discipline and status. */
export interface ProjectTeamMember {
  userId: string;
  role: UserRole | string;
  discipline?: Discipline;
  joinedAt: string;
  status: 'invited' | 'active' | 'removed';
}

// --- Tender & Procurement Types ---------------------------------------------

export type TenderStatus = 'draft' | 'published' | 'closed' | 'evaluating' | 'awarded' | 'cancelled';

export interface TenderPackage {
  id: string;
  projectId: string;
  jobId: string;
  title: string;
  description: string;
  scope: string[];
  documents: { name: string; url: string }[];
  deadline: string;
  estimatedBudget?: number;
  requiredDisciplines: Discipline[];
  requiredCertifications?: string[];
  status: TenderStatus;
  createdBy: string;
  awardedBidId?: string;
  awardedContractorId?: string;
  aiComparisonReport?: string;
  createdAt: string;
  updatedAt?: string;
}

export type BidStatus = 'submitted' | 'shortlisted' | 'rejected' | 'awarded' | 'withdrawn';

export interface BidLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Bid {
  id: string;
  tenderPackageId: string;
  contractorId: string;
  contractorName: string;
  totalAmount: number;
  lineItems: BidLineItem[];
  proposedTimeline: string;
  proposedStartDate: string;
  methodology: string;
  qualifications: string;
  attachments: { name: string; url: string }[];
  verificationId: string;
  status: BidStatus;
  aiScore?: number;
  aiNotes?: string;
  createdAt: string;
  updatedAt?: string;
}

// --- Construction Delivery Types --------------------------------------------

export interface GanttTask {
  id: string;
  projectId: string;
  title: string;
  startDate: string;
  endDate: string;
  progress: number;
  dependsOn?: string[];
  assignedTo?: string;
  phase: string;
  status: 'not_started' | 'in_progress' | 'completed' | 'delayed';
  color?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface SiteLog {
  id: string;
  projectId: string;
  date: string;
  weather: 'sunny' | 'cloudy' | 'rainy' | 'stormy';
  temperature?: number;
  workDescription: string;
  labourCount?: number;
  materialsUsed?: string[];
  issues?: string[];
  photos: { url: string; caption: string }[];
  createdBy: string;
  createdAt: string;
}

export type RFIStatus = 'open' | 'responded' | 'closed' | 'overdue';
export type RFIPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface RFI {
  id: string;
  projectId: string;
  number: number;
  subject: string;
  question: string;
  attachments: { name: string; url: string }[];
  requestedBy: string;
  assignedTo: string;
  priority: RFIPriority;
  status: RFIStatus;
  response?: string;
  responseAttachments?: { name: string; url: string }[];
  respondedBy?: string;
  respondedAt?: string;
  dueDate: string;
  createdAt: string;
  updatedAt?: string;
}

export interface SiteInspection {
  id: string;
  projectId: string;
  inspectionType: 'foundation' | 'dpc' | 'roof' | 'final' | 'custom';
  date: string;
  inspector: string;
  checklist: InspectionItem[];
  overallResult: 'pass' | 'fail' | 'conditional';
  notes?: string;
  photos: { url: string; caption: string }[];
  createdAt: string;
}

export interface InspectionItem {
  item: string;
  standard?: string;
  result: 'pass' | 'fail' | 'na';
  comment?: string;
}
