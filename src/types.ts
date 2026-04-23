export type UserRole = 'client' | 'architect' | 'admin' | 'freelancer';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  bio?: string;
  professionalLabels?: string[]; // e.g. ['Engineer', 'Builder', 'Construction Worker']
  createdAt: string;
  updatedAt?: string;
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
}

export interface Application {
  id: string;
  jobId: string;
  architectId: string;
  architectName: string;
  proposal: string;
  portfolioUrl?: string;
  documents?: string[];
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
  
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
  type: 'client_to_architect' | 'architect_to_client';
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

export interface AIIssue {
  description: string;
  severity: 'low' | 'medium' | 'high';
  actionItem: string;
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
  traceLog: string;
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
  annotatedScreenshots?: { issueIndex: number; imageUrl: string }[];
  adminFeedback?: string;
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
  priority: 'low' | 'medium' | 'high' | 'urgent';
  attachments?: { name: string; url: string }[];
  comments?: {
    userId: string;
    userName: string;
    text: string;
    createdAt: string;
  }[];
  requirements?: string[];
  completedAt?: string;
}

export interface MunicipalCredential {
  id: string;
  userId: string;
  municipality: string;
  username: string;
  password?: string; // Should be encrypted in a real app, but for this demo...
  updatedAt: string;
}

export type LLMProvider = 'gemini' | 'nvidia' | 'openrouter';

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
  | 'invoice_paid';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: {
    jobId?: string;
    submissionId?: string;
    senderId?: string;
    applicationId?: string;
  };
  isRead: boolean;
  channels: ('in_app' | 'email' | 'push')[];
  createdAt: string;
  readAt?: string;
  deliveryStatus?: 'pending' | 'processing' | 'delivered' | 'failed';
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

// Architect verification types
export type VerificationStatus = 'pending' | 'verified' | 'rejected' | 'expired';

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
export interface ArchitectProfile {
  userId: string;
  sacapNumber: string;
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
export type MunicipalityType = 'COJ' | 'COCT' | 'Tshwane' | 'Ekurhuleni' | 'Mangaung' | 'eThekwini' | 'Other';

export interface CouncilSubmission {
  id: string;
  jobId?: string;
  userId: string;
  municipality: MunicipalityType;
  municipalityName?: string; // For 'Other'
  referenceNumber?: string;
  status: string; // Unified status
  rawStatus?: string; // Status as reported by the municipality
  submittedAt?: string;
  lastCheckedAt?: string;
  documents: { name: string; url: string }[];
  trackingHistory: TrackingEvent[];
  queries?: CouncilQuery[];
  erfNumber?: string;
  projectDescription?: string;
  source: 'manual' | 'ocr' | 'scraper' | 'shadow_tracker';
}

export interface TrackingEvent {
  status: string;
  timestamp: string;
  notes?: string;
  source: 'scraper' | 'ocr' | 'crowdsource' | 'shadow_tracker' | 'manual';
  actorId?: string;
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
  municipality: MunicipalityType;
  username: string;
  encryptedPassword: string;
  iv: string;
  authTag?: string; // For GCM
  lastUsed?: string;
  status: 'valid' | 'invalid' | 'unchecked';
  createdAt: string;
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
  context: 'submission' | 'chat' | 'certificate' | 'invoice' | 'test';
  jobId?: string;
  submissionId?: string;
};

export type KnowledgeSource = 'documentation' | 'human_feedback' | 'self_improvement' | 'web_search';
export type KnowledgeStatus = 'active' | 'pending_review' | 'rejected' | 'archived';

export interface SystemSettings {
  municipalTrackerEnabled: boolean;
  nvidiaApiKey?: string;
  nvidiaOcrModel?: string;
  xeroConnected?: boolean;
  lastScraperRun?: string;
}

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
  tags: string[]; // e.g. ['SANS 10400-K', 'wall thickness', 'DPC']
  createdAt: string;
  updatedAt?: string;
}
