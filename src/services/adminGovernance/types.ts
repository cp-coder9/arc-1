export type AdminRole = 'platform_admin' | 'finance_admin' | 'verification_reviewer' | 'tariff_editor' | 'audit_viewer' | 'ai_review_moderator' | 'super_admin';
export type TariffStatus = 'draft' | 'in_review' | 'published' | 'superseded';
export type VerificationStatus = 'self_declared' | 'uploaded' | 'manual_review' | 'manually_verified' | 'externally_verified' | 'rejected' | 'expired';
export type ReviewStatus = 'queued' | 'in_review' | 'approved' | 'rejected' | 'needs_more_info';
export type PaymentProviderStatus = 'draft' | 'configured' | 'webhook_pending' | 'active' | 'disabled';
export type PolicyDecision = 'allowed' | 'requires_review' | 'blocked';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export interface AdminActor { id: string; role: AdminRole; tenantScopes: string[]; canViewSensitiveAudit: boolean; }
export interface TariffLine { code: string; description: string; formula: 'sliding_scale' | 'percentage' | 'hourly' | 'fixed' | 'unit'; value: number; unit: string; }
export interface TariffVersion { id: string; profession: string; sourceName: string; sourceRef: string; effectiveFrom: string; status: TariffStatus; version: number; lines: TariffLine[]; publishedBy?: string; supersededBy?: string; }
export interface VerificationCase { id: string; subjectId: string; subjectType: 'user' | 'company' | 'professional_registration' | 'supplier' | 'subcontractor' | 'freelancer'; evidenceRefs: string[]; status: VerificationStatus; badgeLabel: string; expiryDate?: string; reviewerId?: string; providerRef?: string; notes: string[]; }
export interface AuditEvent { id: string; tenantId: string; projectId?: string; userId: string; objectRef: string; eventType: string; payload: Record<string, unknown>; redactedFields: string[]; previousHash?: string; hash: string; timestamp: string; }
export interface ReviewQueueItem { id: string; tenantId: string; sourceType: 'ai_takeoff' | 'compliance_check' | 'municipal_readiness' | 'cpd_draft' | 'quote_award' | 'payment_release' | 'agent_message' | 'verification_flag'; sourceRef: string; risk: RiskLevel; proposedAction: string; status: ReviewStatus; reviewerRole: AdminRole; decisionBy?: string; decisionNote?: string; }
export interface PaymentProviderConfig { id: string; providerName: 'PayFast' | 'Yoco' | 'Stripe' | 'ManualEFT' | 'Other'; mode: 'test' | 'live' | 'manual'; status: PaymentProviderStatus; enabledScopes: string[]; settlementCurrency: 'ZAR' | 'USD' | 'GBP' | 'EUR'; platformFeePercent: number; webhookConfigured: boolean; providerRef?: string; }
export interface PolicyGateDecision { id: string; policyCode: string; actionRef: string; decision: PolicyDecision; reason: string; requiredReviewerRole?: AdminRole; }
