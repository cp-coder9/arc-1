/**
 * Zod validation schemas for all data models
 * Used for runtime validation of form inputs and API responses
 */

import { z } from 'zod';

// Enums
export const UserRoleEnum = z.enum(['client', 'architect', 'admin', 'freelancer', 'bep', 'contractor']);
export const JobCategoryEnum = z.enum(['Residential', 'Commercial', 'Industrial', 'Renovation', 'Interior', 'Landscape']);
export const JobStatusEnum = z.enum(['open', 'in-progress', 'completed', 'cancelled']);
export const ApplicationStatusEnum = z.enum(['pending', 'accepted', 'rejected']);
export const SubmissionStatusEnum = z.enum([
  'processing',
  'pending_ai',
  'ai_reviewing',
  'ai_failed',
  'ai_passed',
  'admin_reviewing',
  'admin_rejected',
  'approved'
]);
export const NotificationTypeEnum = z.enum([
  'job_application',
  'application_accepted',
  'drawing_submitted',
  'ai_review_complete',
  'admin_approval',
  'admin_rejection',
  'payment_released',
  'message',
  'milestone_due',
  'council_update',
  'invoice_sent',
  'invoice_paid',
  'firm_invite',
  'firm_role_changed',
  'firm_member_removed'
]);
export const PaymentTypeEnum = z.enum([
  'escrow_deposit',
  'milestone_release',
  'refund',
  'platform_fee'
]);
export const PaymentStatusEnum = z.enum(['pending', 'completed', 'failed', 'refunded']);
export const VerificationStatusEnum = z.enum(['pending', 'verified', 'rejected', 'expired']);
export const DisciplineEnum = z.enum(['architecture', 'structure', 'fire', 'accessibility', 'energy', 'drainage', 'electrical', 'mechanical', 'planning', 'documentation', 'environmental', 'nhbrc', 'coordination']);
export const StandardFamilyEnum = z.enum(['NBR', 'SANS10400', 'SANS10160', 'SANS10100', 'SANS10162', 'SANS10142', 'SANS10252', 'MunicipalBylaw', 'NHBRC', 'ProfessionalCoordination', 'Other']);
export const AutonomyLabelEnum = z.enum(['autonomous_check', 'professional_review_required', 'competent_person_required', 'municipal_confirmation_required', 'insufficient_information']);
export const ResponsiblePartyEnum = z.enum(['architect', 'structural_engineer', 'civil_engineer', 'fire_engineer', 'electrical_engineer', 'mechanical_engineer', 'energy_professional', 'client', 'contractor', 'municipality', 'admin']);
export const RiskStatusEnum = z.enum(['ready_for_admin_review', 'ready_for_professional_review', 'requires_minor_corrections', 'requires_major_corrections', 'requires_specialist_design', 'not_assessable_insufficient_information', 'ai_review_failed']);
export const ExecutionModeEnum = z.enum(['basic_ai_screen', 'council_readiness', 'fire_plan_review', 'engineering_coordination', 'full_professional_review', 'resubmission_delta_review', 'specialist_pack_review']);

// User schemas
export const UserProfileSchema = z.object({
  uid: z.string().min(1, 'User ID is required'),
  email: z.string().email('Invalid email address'),
  displayName: z.string().min(2, 'Name must be at least 2 characters').max(100),
  role: UserRoleEnum,
  bio: z.string().max(2000).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().optional(),
});

export const UserProfileUpdateSchema = UserProfileSchema.pick({
  displayName: true,
  bio: true,
}).partial();

// Job schemas
export const JobSchema = z.object({
  id: z.string().optional(),
  clientId: z.string().min(1),
  title: z.string().min(5, 'Title must be at least 5 characters').max(200),
  description: z.string().min(20, 'Description must be at least 20 characters').max(5000),
  requirements: z.array(z.string().min(1)).min(1, 'At least one requirement is required'),
  deadline: z.string().datetime(),
  budget: z.number().min(1000, 'Budget must be at least R1,000').max(100000000, 'Budget too large'),
  category: JobCategoryEnum,
  location: z.string().max(200).optional(),
  status: JobStatusEnum.default('open'),
  selectedArchitectId: z.string().optional(),
  createdAt: z.string().datetime().optional(),
});

export const JobCreateSchema = JobSchema.omit({
  id: true,
  clientId: true,
  status: true,
  selectedArchitectId: true,
  createdAt: true,
});

// Application schemas
export const ApplicationSchema = z.object({
  id: z.string().optional(),
  jobId: z.string().min(1),
  architectId: z.string().min(1),
  architectName: z.string().min(1),
  proposal: z.string().min(50, 'Proposal must be at least 50 characters').max(5000),
  portfolioUrl: z.string().url('Invalid URL').optional(),
  documents: z.array(z.string().url()).optional(),
  status: ApplicationStatusEnum.default('pending'),
  createdAt: z.string().datetime().optional(),
});

export const ApplicationCreateSchema = ApplicationSchema.omit({
  id: true,
  jobId: true,
  architectId: true,
  architectName: true,
  status: true,
  createdAt: true,
});

// Submission schemas
export const AIIssueSchema = z.object({
  description: z.string(),
  regulationStipulation: z.string().optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  actionItem: z.string(),
  discipline: DisciplineEnum.optional(),
  standardFamily: StandardFamilyEnum.optional(),
  reference: z.string().optional(),
  confidence: z.enum(['low', 'medium', 'high']).optional(),
  autonomyLabel: AutonomyLabelEnum.optional(),
  responsibleParty: ResponsiblePartyEnum.optional(),
  evidence: z.string().optional(),
  requiresProfessionalSignoff: z.boolean().optional(),
  boundingBox: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }).optional(),
  annotatedImageUrl: z.string().optional(),
}).passthrough();

export const AICategorySchema = z.object({
  name: z.string(),
  issues: z.array(AIIssueSchema),
});

export const TraceLogSchema = z.object({
  timestamp: z.string().datetime(),
  actor: z.string(),
  action: z.string(),
  details: z.string(),
});

export const KnowledgeCitationSchema = z.object({
  knowledgeId: z.string(),
  title: z.string(),
  content: z.string(),
  source: z.enum(['documentation', 'human_feedback', 'self_improvement', 'web_search']),
  sourceUrl: z.string().optional(),
  pdfUrl: z.string().optional(),
  pdfPageNumber: z.number().optional(),
  tags: z.array(z.string()).default([]),
}).passthrough();

export const DrawingReferenceSchema = z.object({
  url: z.string(),
  name: z.string(),
  type: z.string().optional(),
}).passthrough();

export const FindingSchema = z.object({
  title: z.string(),
  description: z.string(),
  discipline: DisciplineEnum,
  standardFamily: StandardFamilyEnum,
  reference: z.string(),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  confidence: z.enum(['low', 'medium', 'high']),
  autonomyLabel: AutonomyLabelEnum,
  responsibleParty: ResponsiblePartyEnum,
  actionItem: z.string(),
  evidence: z.string(),
  sourceCitations: z.array(KnowledgeCitationSchema).default([]),
  drawingReferences: z.array(DrawingReferenceSchema).default([]),
  requiresProfessionalSignoff: z.boolean(),
}).passthrough();

export const SignOffRequirementSchema = z.object({
  discipline: DisciplineEnum,
  responsibleParty: ResponsiblePartyEnum,
  requirement: z.string(),
  reason: z.string(),
  standardFamily: StandardFamilyEnum.optional(),
  reference: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
}).passthrough();

export const OrchestratorResultSchema = z.object({
  status: z.string(),
  feedback: z.string(),
  categories: z.array(AICategorySchema).optional(),
  traceLog: z.string().optional(),
}).passthrough();

export const OrchestratorResultV2Schema = OrchestratorResultSchema.extend({
  riskStatus: RiskStatusEnum.optional(),
  findings: z.array(FindingSchema).optional(),
  signOffChecklist: z.array(SignOffRequirementSchema).optional(),
  submissionIndex: z.array(DrawingReferenceSchema.extend({ detectedType: z.string() })).optional(),
  mode: ExecutionModeEnum.optional(),
  disclaimers: z.array(z.string()).optional(),
}).passthrough();

export const SubmissionSchema = z.object({
  id: z.string().optional(),
  jobId: z.string().min(1),
  architectId: z.string().min(1),
  drawingUrl: z.string().url('Drawing URL must be valid'),
  drawingName: z.string().min(1, 'Drawing name is required'),
  status: SubmissionStatusEnum,
  aiFeedback: z.string().optional(),
  aiStructuredFeedback: z.array(AICategorySchema).optional(),
  findings: z.array(FindingSchema).optional(),
  signOffChecklist: z.array(SignOffRequirementSchema).optional(),
  riskStatus: RiskStatusEnum.optional(),
  executionMode: ExecutionModeEnum.optional(),
  adminFeedback: z.string().optional(),
  traceability: z.array(TraceLogSchema),
  createdAt: z.string().datetime().optional(),
});

export const SubmissionCreateSchema = SubmissionSchema.omit({
  id: true,
  jobId: true,
  architectId: true,
  status: true,
  aiFeedback: true,
  aiStructuredFeedback: true,
  adminFeedback: true,
  traceability: true,
  createdAt: true,
});

// Review schemas
export const ReviewSchema = z.object({
  id: z.string().optional(),
  jobId: z.string().min(1),
  fromId: z.string().min(1),
  toId: z.string().min(1),
  rating: z.number().min(1).max(5),
  categories: z.object({
    communication: z.number().min(1).max(5).optional(),
    quality: z.number().min(1).max(5).optional(),
    timeliness: z.number().min(1).max(5).optional(),
    professionalism: z.number().min(1).max(5).optional(),
  }).optional(),
  comment: z.string().min(10, 'Comment must be at least 10 characters').max(2000),
  type: z.enum(['client_to_architect', 'architect_to_client', 'to_bep', 'from_bep', 'to_freelancer']),
  isPublic: z.boolean().default(true),
  createdAt: z.string().datetime().optional(),
});

export const ReviewCreateSchema = ReviewSchema.omit({
  id: true,
  jobId: true,
  fromId: true,
  createdAt: true,
});

// Notification schemas
export const NotificationSchema = z.object({
  id: z.string().optional(),
  userId: z.string().min(1),
  type: NotificationTypeEnum,
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(1000),
  data: z.object({
    jobId: z.string().optional(),
    projectId: z.string().optional(),
    submissionId: z.string().optional(),
    senderId: z.string().optional(),
    applicationId: z.string().optional(),
    firmId: z.string().optional(),
    firmInviteId: z.string().optional(),
  }).optional(),
  isRead: z.boolean().default(false),
  channels: z.array(z.enum(['in_app', 'email', 'push'])).default(['in_app']),
  createdAt: z.string().datetime().optional(),
  readAt: z.string().datetime().optional(),
});

export const NotificationCreateSchema = NotificationSchema.omit({
  id: true,
  userId: true,
  isRead: true,
  createdAt: true,
  readAt: true,
});

// Message schemas
export const MessageSchema = z.object({
  id: z.string().optional(),
  jobId: z.string().min(1),
  senderId: z.string().min(1),
  senderRole: UserRoleEnum,
  content: z.string().min(1, 'Message cannot be empty').max(5000),
  attachments: z.array(z.object({
    name: z.string(),
    url: z.string().url(),
    type: z.string(),
  })).optional(),
  isRead: z.boolean().default(false),
  readAt: z.string().datetime().optional(),
  createdAt: z.string().datetime().optional(),
});

export const MessageCreateSchema = MessageSchema.omit({
  id: true,
  jobId: true,
  senderId: true,
  senderRole: true,
  isRead: true,
  readAt: true,
  createdAt: true,
});

// JobCard schemas
export const JobCardSchema = z.object({
  id: z.string().optional(),
  jobId: z.string().min(1),
  architectId: z.string().min(1),
  assigneeId: z.string().optional(),
  assigneeName: z.string().min(1),
  assigneeRole: z.string().min(1),
  deadline: z.string().datetime(),
  notes: z.string().max(2000),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  estimatedHours: z.number().min(0).optional(),
  attachments: z.array(z.object({
    name: z.string(),
    url: z.string().url(),
  })).optional(),
  status: z.enum(['pending', 'in-progress', 'completed']).default('pending'),
  createdAt: z.string().datetime().optional(),
});

// Payment schemas
export const PaymentSchema = z.object({
  id: z.string().optional(),
  jobId: z.string().min(1),
  payerId: z.string().min(1),
  payeeId: z.string().min(1),
  amount: z.number().min(0),
  type: PaymentTypeEnum,
  milestone: z.enum(['initial', 'draft', 'final']).optional(),
  status: PaymentStatusEnum,
  payfastReference: z.string().optional(),
  receiptUrl: z.string().url().optional(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.string().datetime().optional(),
});

// Architect verification schemas
export const ArchitectVerificationSchema = z.object({
  userId: z.string().min(1),
  status: VerificationStatusEnum,
  certificateUrl: z.string().url().optional(),
  sacapNumber: z.string().min(1, 'SACAP number is required'),
  submittedAt: z.string().datetime(),
  reviewedAt: z.string().datetime().optional(),
  reviewedBy: z.string().optional(),
  rejectionReason: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
  lastVerifiedAt: z.string().datetime().optional(),
});

export const VerificationSubmitSchema = ArchitectVerificationSchema.pick({
  sacapNumber: true,
}).extend({
  certificateUrl: z.string().url('Certificate file is required'),
});

// Architect profile schemas
export const ArchitectProfileSchema = z.object({
  userId: z.string().min(1),
  sacapNumber: z.string().min(1),
  yearsExperience: z.number().min(0).max(100).optional(),
  specializations: z.array(z.string()).max(20).default([]),
  portfolioImages: z.array(z.object({
    url: z.string().url(),
    title: z.string().max(200),
    description: z.string().max(1000).optional(),
  })).max(50).default([]),
  completedJobs: z.number().default(0),
  averageRating: z.number().min(0).max(5).default(0),
  totalReviews: z.number().default(0),
  website: z.string().url().optional(),
  linkedIn: z.string().url().optional(),
  updatedAt: z.string().datetime().optional(),
});

// Council submission schemas
export const CouncilSubmissionSchema = z.object({
  id: z.string().optional(),
  jobId: z.string().min(1),
  municipality: z.string().min(1),
  referenceNumber: z.string().optional(),
  status: z.enum(['preparing', 'submitted', 'under_review', 'approved', 'rejected', 'queries_raised']),
  submittedAt: z.string().datetime().optional(),
  documents: z.array(z.object({
    name: z.string(),
    url: z.string().url(),
  })),
  trackingHistory: z.array(z.object({
    status: z.string(),
    timestamp: z.string().datetime(),
    notes: z.string().optional(),
  })).default([]),
  queries: z.array(z.object({
    raisedAt: z.string().datetime(),
    description: z.string(),
    response: z.string().optional(),
  })).optional(),
});

// Search and filter schemas
export const JobSearchFiltersSchema = z.object({
  query: z.string().max(200).optional(),
  category: JobCategoryEnum.optional(),
  minBudget: z.number().min(0).optional(),
  maxBudget: z.number().min(0).optional(),
  location: z.string().max(200).optional(),
  deadlineWithin: z.number().min(1).optional(), // days
  postedWithin: z.number().min(1).optional(), // days
  sortBy: z.enum(['budget_asc', 'budget_desc', 'deadline', 'posted', 'relevance']).default('posted'),
});

// Form validation helpers
export const validateForm = <T extends z.ZodType>(schema: T, data: unknown): { success: true; data: z.infer<T> } | { success: false; errors: z.ZodError } => {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error };
};

export const getFieldErrors = (error: z.ZodError): Record<string, string> => {
  const errors: Record<string, string> = {};
  error.errors.forEach((err) => {
    const path = err.path.join('.');
    errors[path] = err.message;
  });
  return errors;
};
