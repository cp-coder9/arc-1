export type UserRole = 'client' | 'architect' | 'admin' | 'freelancer' | 'bep' | 'contractor' | 'subcontractor' | 'supplier' | 'engineer' | 'quantity_surveyor' | 'town_planner' | 'energy_professional' | 'fire_engineer' | 'site_manager' | 'developer' | 'firm_admin' | 'platform_admin' | 'land_surveyor';

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
  // CPD Assessment Platform fields (Pack 10/12)
  professionalBody?: string;
  builtEnvironmentRole?: string;
  cpdCycleStart?: string;
  cpdCycleEnd?: string;
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
  selectedProfessionalId?: string;
  selectedBepId?: string;
  /** @deprecated Use selectedProfessionalId/selectedBepId for new writes. */
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
  professionalId?: string;
  bepId?: string;
  /** @deprecated Use professionalId/bepId for new writes. */
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
  jobTaskId?: string;
  architectId: string;
  assigneeId?: string; // UID of the assigned freelancer/user
  assigneeName: string;
  assigneeRole: string;
  deadline: string;
  notes: string;
  status: 'pending' | 'in-progress' | 'completed';
  submissionStatus?: 'not_submitted' | 'submitted' | 'changes_requested' | 'approved';
  submittedAt?: string | null;
  completedAt?: string | null;
  reviewFeedback?: string;
  reviewedAt?: string;
  paymentStatus?: 'not_ready' | 'review_pending' | 'ready_for_invoice' | 'invoice_created' | 'paid';
  createdAt: string;
  updatedAt?: string;
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
  | 'firm_invite_accepted'
  | 'firm_role_changed'
  | 'firm_member_removed'
  | 'firm_subscription_updated'
  | 'directory_invitation'
  | 'material_request_created'
  | 'material_quote_received'
  | 'procurement_order_updated'
  | 'cpd_course_published'
  | 'cpd_certificate_issued'
  | 'subscription_status_changed'
  | 'refund_processed'
  | 'contractor_delivery_update'
  | 'timesheet_due'
  | 'supervision_log_required'
  | 'registration_expiring'
  | 'cpd_shortfall'
  | 'invoice_ready_for_review';

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
    materialRequestId?: string;
    quoteId?: string;
    procurementOrderId?: string;
    courseId?: string;
    certificateId?: string;
    subscriptionId?: string;
    refundId?: string;
    deliveryId?: string;
    entityId?: string;
    timesheetId?: string;
    supervisionLogId?: string;
    registrationId?: string;
    invoiceReadinessId?: string;
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
export type ProjectCommunicationCaptureType =
  | 'chat'
  | 'voice_note'
  | 'document_upload'
  | 'drawing_comment'
  | 'approval_request'
  | 'site_photo'
  | 'site_voice_note'
  | 'rfi'
  | 'site_instruction'
  | 'payment_note'
  | 'closeout_evidence';

export type ProjectCommunicationStructuredStatus = 'raw' | 'converted' | 'linked' | 'archived';
export type ProjectCommunicationVisibility = 'job_participants' | 'project_team' | 'client_professional' | 'admin_only';

export interface ProjectRecordLink {
  recordType: string;
  recordId: string;
}

export interface ProjectCommunicationLocation {
  latitude: number;
  longitude: number;
  label?: string;
}

export interface Message {
  id: string;
  jobId: string;
  /** New project communication engine metadata; optional for legacy job-scoped messages. */
  projectId?: string;
  phase?: ProjectStage;
  captureType?: ProjectCommunicationCaptureType;
  structuredStatus?: ProjectCommunicationStructuredStatus;
  actionIds?: string[];
  recordLinks?: ProjectRecordLink[];
  aiTags?: string[];
  transcribedText?: string;
  visibility?: ProjectCommunicationVisibility;
  location?: ProjectCommunicationLocation;
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
export type PaymentType = 'escrow_deposit' | 'milestone_release' | 'refund' | 'platform_fee' | 'platform_fee_client_share' | 'platform_fee_payee_share';
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
  payerSurchargeAmount?: number;
  payeeDeductionAmount?: number;
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
 * The PRD canonical 8-stage project lifecycle from Brief through Close-Out.
 * `scoping` remains a legacy value for existing project documents and maps to the Brief stage.
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
  intake: 'Brief & Diagnostic',
  scoping: 'Brief & Diagnostic (Legacy Scoping)',
  appointment: 'Team Appointment',
  coordination: 'Design & Coordination',
  compliance: 'Compliance & Municipal',
  tender: 'Tender & Procurement',
  delivery: 'Construction Delivery',
  payments: 'Payments & Governance',
  closeout: 'Close-Out & Handover',
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
  leadProfessionalId?: string;
  leadBepId?: string;
  /** @deprecated Use leadProfessionalId/leadBepId for new writes. */
  leadArchitectId?: string;
  currentStage: ProjectStage;
  /** PRD stage-gate evidence flags used to block premature legal, financial, or professional progression. */
  stageGateEvidence?: Partial<Record<string, boolean>>;
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
  baselineStartDate?: string;
  baselineEndDate?: string;
  forecastEndDate?: string;
  progress: number;
  dependsOn?: string[];
  assignedTo?: string;
  phase: string;
  status: 'not_started' | 'in_progress' | 'completed' | 'delayed';
  isCritical?: boolean;
  recoveryPlan?: string;
  baselineChangeReason?: string;
  baselineChangeStatus?: 'pending_review' | 'approved' | 'rejected';
  humanApprovalRequired?: boolean;
  color?: string;
  createdAt: string;
  updatedAt?: string;
}

export type WeatherCondition = 'sunny' | 'cloudy' | 'rainy' | 'stormy';

export interface SiteLog {
  id: string;
  projectId: string;
  date: string;
  weather: WeatherCondition;
  weatherDetail?: string;
  temperature?: number;
  workDescription: string;
  labourOnSite?: Record<string, number>;
  labourCount?: number;
  plantOnSite?: string[];
  deliveries?: string[];
  visitors?: string[];
  safetyNotes?: string[];
  delayNotes?: string[];
  materialsUsed?: string[];
  issues?: string[];
  evidenceIds?: string[];
  photos: { url: string; caption: string }[];
  status: 'draft' | 'submitted';
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

// Agent workflow types for platform-wide agent orchestration
export type AgentOwnerType = 'user' | 'project';
export type AgentSurface = 'dashboard' | 'chat' | 'notification' | 'document' | 'workflow' | 'admin';
export type AgentActionStatus = 'draft' | 'suggested' | 'requires_approval' | 'approved' | 'rejected' | 'applied';

export interface AgentEvent {
  id: string;
  type: string;
  ownerType: AgentOwnerType;
  ownerId: string;
  jobId?: string;
  userId?: string;
  phase?: string;
  source: AgentSurface;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface AgentRecommendation {
  id: string;
  agentId: string;
  jobId?: string;
  userId?: string;
  surface: AgentSurface;
  title: string;
  summary: string;
  suggestedAction?: {
    label: string;
    actionType: string;
    payload: Record<string, unknown>;
  };
  status: AgentActionStatus;
  requiresHumanApproval: boolean;
  createdAt: string;
}


// Re-export toolset types from pack
export type {
  ToolboxUserRole,
  ToolboxFamilyId,
  CalculatorRiskStatus,
  CalculatorUseClass,
  CalculatorExportTarget,
  ToolboxContext,
  CalculatorDefinition,
  CalculatorRun,
  XAfenestrationInputs,
  RValueInputs,
  RationalMethodInputs,
  ConcreteOrderInputs,
  BrickBlockworkInputs,
  TenderRateBuildUpInputs,
  LabourProductivityInputs,
  ToolboxAgentRecommendation,
} from './types/toolboxCalculators';

export type {
  ArchitexComprehensiveRole,
  ArchitexWorkflowPhase,
  ToolCategory,
  ToolExportTarget,
  ToolContext,
  ToolDefinition,
  ToolRecommendation,
  ToolRunEnvelope,
  StaffActivityLogPayload,
  PlantAllocationPayload,
  ProcurementPackagePayload,
  DrawingComplianceCheckPayload,
  BomBoqQuotePayload,
  SnagItemPayload,
  ResourceMarketplaceListingPayload,
} from './types/comprehensiveToolsets';

// ── Pack 12: Practice Management & Professional Office Ops ────────────────

// Pipeline types
export type PipelineStatus = 'active' | 'won' | 'lost' | 'abandoned' | 'on_hold';

export interface PipelineProject {
  id: string;
  firmId: string;
  projectId: string;
  jobId?: string;
  title: string;
  stage: ProjectStage;
  status: PipelineStatus;
  estimatedValueCents: number;
  probability: number;
  expectedCloseDate?: string;
  closedAt?: string;
  closedReason?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
}

export interface PipelineForecast {
  totalValueCents: number;
  weightedValueCents: number;
  byStage: Record<ProjectStage, { count: number; value: number; weighted: number }>;
}

// Practice Task types
export type PracticeTaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type PracticeTaskStatus = 'todo' | 'in_progress' | 'review' | 'completed' | 'cancelled';

export interface PracticeTask {
  id: string;
  firmId: string;
  projectId?: string;
  title: string;
  description?: string;
  assigneeId?: string;
  assignedBy?: string;
  priority: PracticeTaskPriority;
  status: PracticeTaskStatus;
  dueDate?: string;
  slaDeadline?: string;
  estimatedHours?: number;
  actualHours?: number;
  tags?: string[];
  completedAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface WorkloadSummary {
  userId: string;
  displayName?: string;
  totalTasks: number;
  completedTasks: number;
  overdueTasks: number;
  totalEstimatedHours: number;
  totalActualHours: number;
}

// Timesheet types
export type TimesheetBillableStatus = 'billable' | 'non_billable' | 'internal';

export interface TimesheetEntry {
  id: string;
  userId: string;
  firmId: string;
  projectId?: string;
  workstage?: ProjectStage;
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  description: string;
  billable: TimesheetBillableStatus;
  hourlyRateCents?: number;
  totalValueCents?: number;
  tags?: string[];
  invoiced?: boolean;
  invoiceId?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface TimesheetSummary {
  periodStart: string;
  periodEnd: string;
  totalHours: number;
  billableHours: number;
  nonBillableHours: number;
  internalHours: number;
  totalValueCents: number;
  byProject: Record<string, { hours: number; valueCents: number }>;
  byUser: Record<string, { hours: number; valueCents: number }>;
}

export interface FeeReconciliation {
  timesheetEntryId: string;
  projectId: string;
  userId: string;
  hoursLogged: number;
  timesheetValueCents: number;
  feeChargedCents: number;
  varianceCents: number;
  variancePercent: number;
  reconciled: boolean;
}

// Registration Renewal types
export type RegistrationBody = 'SACAP' | 'ECSA' | 'SACQSP' | 'SACLAP' | 'SACPCMP';
export type RegistrationStatus = 'active' | 'expiring_soon' | 'expired' | 'renewed' | 'suspended';

export interface ProfessionalRegistration {
  id: string;
  userId: string;
  firmId: string;
  body: RegistrationBody;
  registrationNumber: string;
  expiryDate: string;
  status: RegistrationStatus;
  cpdPointsRequired: number;
  cpdPointsEarned: number;
  renewalReminderSent?: boolean;
  lastRenewedAt?: string;
  renewalSubmittedAt?: string;
  documents?: { name: string; url: string }[];
  createdAt: string;
  updatedAt?: string;
}

// Template Library types
export type TemplateCategory = 'appointment' | 'certificate' | 'report' | 'submission' | 'contract' | 'invoice' | 'general';

export interface PracticeTemplate {
  id: string;
  firmId: string;
  name: string;
  description?: string;
  category: TemplateCategory;
  version: number;
  fileUrl?: string;
  fileName?: string;
  roles: UserRole[];
  tags?: string[];
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
}

export interface TemplateVersion {
  id: string;
  templateId: string;
  version: number;
  fileUrl?: string;
  fileName?: string;
  changes?: string;
  createdBy: string;
  createdAt: string;
}

export interface InvoiceReadinessCheck {
  id: string;
  firmId: string;
  projectId: string;
  timesheetIds: string[];
  expenseIds?: string[];
  readyForInvoice: boolean;
  blockers: string[];
  warnings: string[];
  totalAmountCents: number;
  currency: string;
  invoiced: boolean;
  invoiceId?: string;
  checkedAt: string;
  createdAt: string;
  updatedAt: string;
}

export type SupervisionLogStatus = 'draft' | 'submitted' | 'reviewed' | 'signed_off' | 'rejected';

export interface CandidateSupervisionLog {
  id: string;
  candidateId: string;
  mentorId: string;
  firmId: string;
  projectId?: string;
  periodStart: string;
  periodEnd: string;
  hoursLogged: number;
  activities: string;
  category?: string;
  sacapCategory?: string;
  status: SupervisionLogStatus;
  mentorComments?: string;
  reviewedAt?: string;
  signedOffAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ============== Site Execution Types (Pack 9) ==============

export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type NCRStatus = string;
export type SnagStatus = string;
export type DelayWarningStatus = string;
export type DelayWarningCause = string;
export type SiteInstructionStatus = string;
export type EvidenceType = 'photo' | 'video' | 'document' | 'inspection_report' | 'test_certificate' | 'delivery_note';

export type SiteExecutionPhase =
  | 'construction_execution'
  | 'closeout'
  | 'defects_liability'
  | 'operations_post_occupancy';

export interface NonConformanceReport {
  id: string;
  projectId: string;
  title: string;
  description: string;
  severity: Severity;
  responsiblePartyId: string;
  correctiveAction: string;
  evidenceIds: string[];
  status: NCRStatus;
  blocksPayment: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface DrawingPin {
  drawingId: string;          // non-empty project drawing identifier
  x: number;                  // 0..1 inclusive
  y: number;                  // 0..1 inclusive
}

export interface SnagItem {
  id: string;
  projectId: string;
  location: string;
  description: string;
  priority: Severity;
  responsiblePartyId: string;
  dueDate: string;
  evidenceIds: string[];
  status: SnagStatus;
  blocksPayment: boolean;
  drawingPin?: DrawingPin;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface DelayEarlyWarning {
  id: string;
  projectId: string;
  cause: DelayWarningCause;
  description: string;
  noticeDeadline: string;
  likelyProgrammeImpactDays: number;
  status: DelayWarningStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface SiteInstruction {
  id: string;
  projectId: string;
  title: string;
  instruction: string;
  issuedBy: string;
  issuedByRole: UserRole;
  authorised: boolean;
  authorisedBy?: string;
  authorisedAt?: string;
  costImpact: 'none' | 'possible' | 'confirmed';
  timeImpact: 'none' | 'possible' | 'confirmed';
  linkedRfiId?: string;
  linkedDocumentIds: string[];
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  supersededById?: string;
  status: SiteInstructionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface FieldEvidence {
  id: string;
  projectId: string;
  type: EvidenceType;
  title: string;
  uri: string;
  location: string;
  gps: { lat: number; lng: number };
  capturedBy: string;
  capturedAt: string;
  linkedObjectId?: string;
}

export type BlockerSourceType = 'ncr' | 'snag' | 'instruction' | 'inspection' | 'delay_warning';

export interface PaymentBlocker {
  id: string;
  projectId: string;
  sourceObjectId: string;
  sourceType: 'ncr' | 'snag' | 'instruction' | 'inspection' | 'delay_warning';
  reason: string;
  severity: Severity;
  status: string;
  createdBy: string;
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

export interface InspectionRecord {
  id: string;
  projectId: string;
  type: string;
  inspector: string;
  date: string;
  location: string;
  findings: string;
  status: 'scheduled' | 'completed' | 'failed' | 'passed';
  evidenceIds: string[];
  createdAt: string;
}

export type FieldActionType =
  | 'create' | 'edit' | 'delete' | 'status_transition' | 'payment_release';

export interface SiteAuditRecord {
  id: string;
  projectId: string;
  actorId: string;
  actorRole: UserRole;
  action: string;
  actionType: FieldActionType;
  outcome: 'permitted' | 'denied';
  sourceObjectId: string;
  sourceObjectType: string;
  createdAt: string;
}
export interface SiteAgentRecommendation {
  id: string;
  projectId: string;
  agentKey: string;
  title: string;
  rationale: string;
  sourceObjectId: string;
  severity: Severity;
  status: string;
  createdAt: string;
}

export interface SiteProjectRecord {
  id: string;
  projectId: string;
  tenantId: string;
  phase: SiteExecutionPhase;
  moduleKey: string;
  recordType: string;
  title: string;
  status: string;
  payload: unknown;
  linkedRecordIds: string[];
  createdBy: string;
  createdAt: string;
}

export interface SiteInboxEvent {
  id: string;
  projectId: string;
  recipientRole: UserRole;
  title: string;
  sourceObjectId: string;
  sourceObjectType: string;
  priority: Severity;
  dueDate?: string;
  isRead: boolean;
  createdAt: string;
}

export interface ProgrammeImpact {
  id: string;
  projectId: string;
  sourceType: string;
  sourceId?: string;
  sourceObjectId: string;
  impactDays?: number;
  estimatedDays: number;
  requiresPlannerReview: boolean;
  description?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  createdBy: string;
  createdAt: string;
}

export type ProgrammeImpactSourceType = string;

export interface ComplianceScenario {
  id: string;
  projectId: string;
  title: string;
  nodes: unknown[];
  createdAt: string;
}

// ── Programme / Site Diary Types (from remote merge) ──────────────────────

export type ProgrammePhaseStatus = 'planned' | 'in_progress' | 'completed' | 'delayed' | 'cancelled';
export type MilestoneStatus = 'pending' | 'achieved' | 'missed' | 'revised';
export type TaskStatus = 'not_started' | 'in_progress' | 'completed' | 'delayed' | 'on_hold';

export interface ProgrammePhase {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  startDate: string;
  endDate: string;
  status: ProgrammePhaseStatus;
  order: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Milestone {
  id: string;
  projectId: string;
  phaseId: string;
  name: string;
  dueDate: string;
  status: MilestoneStatus;
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProgrammeTask {
  id: string;
  projectId: string;
  phaseId?: string;
  name: string;
  description?: string;
  assignedTo?: string;
  startDate: string;
  endDate: string;
  status: TaskStatus;
  dependsOn: string[];
  actualStartDate?: string;
  progress: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type SiteDiaryStatus = 'draft' | 'submitted' | 'reviewed' | 'approved';
export type SnagResolutionStatus = 'pending' | 'in_progress' | 'resolved' | 'verified_closed' | 'rejected';
export type OccupancyCertificateStatus = 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'issued';

export interface SiteDiaryEntry {
  id: string;
  projectId: string;
  date: string;
  weather?: string;
  labourCount?: number;
  plantCount?: Record<string, number>;
  notes?: string;
  activities: string[];
  issues: string[];
  staff: string[];
  status: SiteDiaryStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface SnagResolution {
  id: string;
  projectId: string;
  snagId: string;
  resolution: string;
  resolvedBy: string;
  resolvedAt: string;
  method?: string;
  evidenceIds: string[];
  verifiedBy?: string;
  verifiedAt?: string;
  status: SnagResolutionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface OccupancyCertificate {
  id: string;
  projectId: string;
  certificateNumber: string;
  issuingAuthority: string;
  status: OccupancyCertificateStatus;
  inspectionItems: InspectionChecklistItem[];
  notes?: string;
  documentUrl?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface InspectionChecklistItem {
  id: string;
  inspectionId: string;
  description: string;
  passed: boolean;
  notes?: string;
  inspectedBy?: string;
  inspectedAt?: string;
  comments?: string;
}

// ============== Field Tools Types (Pack 10 — Drawing Pins, Annotations, Checklists, Sync, Reports) ==============

// --- Photo Annotation Types ---

export type AnnotationShapeType = 'arrow' | 'text_note'; // extensible

export interface AnnotationShape {
  id: string;
  type: AnnotationShapeType;
  points: Array<{ x: number; y: number }>; // normalized 0..1
  style: { color: string; strokeWidth: number; fontSize?: number };
  text?: string; // for text_note
}

export interface PhotoAnnotation {
  evidenceId: string;       // links to FieldEvidence
  shapes: AnnotationShape[];
  flattenedUri?: string;    // Vercel Blob URI of rendered image
}

// --- Checklist Types ---

export type ResponseType = 'pass_fail_na' | 'numeric' | 'text';
export type PassFailNa = 'pass' | 'fail' | 'na';

export interface ChecklistItem {
  id: string;
  prompt: string;
  responseType: ResponseType;
  order: number;
}

export interface ChecklistTemplate {
  id: string;
  projectId: string;
  title: string;
  items: ChecklistItem[];
  createdBy: string;
  createdAt: string;
}

export interface ChecklistResponse {
  itemId: string;
  value: PassFailNa | number | string;
}

export interface ChecklistInstance {
  id: string;
  templateId: string;
  projectId: string;
  location: string;
  items: ChecklistItem[];
  responses: ChecklistResponse[];
  passCount?: number;
  failCount?: number;
  naCount?: number;
  status: 'in_progress' | 'completed';
}

// --- Offline Sync Queue Types ---

export interface QueuedCapture {
  clientId: string;            // client-generated idempotency key
  kind: 'field_issue' | 'photo_annotation' | 'checklist_response';
  payload: unknown;
  createdAt: string;           // ISO; defines transmission order
  attempts: number;            // retry accounting (max 5)
  status: 'queued' | 'failed';
}

// --- Field Report Types ---

export interface FieldIssueSummary {
  id: string;
  status: string;
  severity: string;
}

export interface EvidenceRef {
  id: string;
  type: string;
  uri: string;
}

export type FieldReportWeather = 'clear' | 'cloudy' | 'rain' | 'wind' | 'storm' | 'snow';

export interface FieldReport {
  projectId: string;
  date: string;
  timeZone: string;
  issues: FieldIssueSummary[];
  evidence: EvidenceRef[];
  weather: FieldReportWeather | 'not_recorded';
  paymentBlockingCount: number;
  outstandingHandoverSnags?: number;
}

// --- Field Issue view-model (normalizing adapter target) ---

/** The source record type a normalized Field_Issue was adapted from. */
export type FieldIssueSourceType = 'snag' | 'ncr' | 'inspection';

/**
 * Uniform view-model the Issue_Dashboard reads across all source record types.
 *
 * Existing `SnagItem`, `NonConformanceReport`, and `InspectionRecord` findings
 * are mapped into this single shape by the `fieldIssueService` adapter, so the
 * dashboard needs no per-type branching and existing records need no migration.
 *
 * `status` is always normalized to the canonical snag lifecycle enum
 * (`open`, `allocated`, `ready_for_reinspection`, `closed`, `rejected`).
 */
export interface FieldIssue {
  id: string;
  projectId: string;
  /** Which source record type this issue was adapted from. */
  sourceType: FieldIssueSourceType;
  /** Lifecycle status normalized to the snag state-machine enum. */
  status: SnagStatus;
  severity: Severity;
  /** Responsible-party identifier; `unassigned` when none is recorded. */
  responsiblePartyId: string;
  /** Free-text location ( empty string when the source carries none). */
  location: string;
  /** Optional pin-on-drawing reference (snags only). */
  drawingPin?: DrawingPin;
  description: string;
  /** Whether the issue currently blocks payment. */
  blocksPayment: boolean;
  evidenceIds: string[];
  createdAt: string;
  updatedAt: string;
}

// --- Field Issue Draft (checklist fail → issue conversion) ---

export interface FieldIssueDraft {
  prompt: string;
  checklistRef: { instanceId: string; itemId: string };
  evidenceIds: string[];
  location: string;
  severity: Severity;
}
