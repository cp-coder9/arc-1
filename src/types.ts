export type UserRole = 'client' | 'architect' | 'admin';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  bio?: string;
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
}

export interface AICategory {
  name: string;
  issues: AIIssue[];
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
  assigneeName: string;
  assigneeRole: string;
  deadline: string;
  notes: string;
  status: 'pending' | 'in-progress' | 'completed';
  createdAt: string;
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
  | 'council_update';

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
export interface CouncilSubmission {
  id: string;
  jobId: string;
  municipality: string;
  referenceNumber?: string;
  status: 'preparing' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'queries_raised';
  submittedAt?: string;
  documents: { name: string; url: string }[];
  trackingHistory: { status: string; timestamp: string; notes?: string }[];
  queries?: { raisedAt: string; description: string; response?: string }[];
}
