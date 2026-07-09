/**
 * Project Command Centre — Core Types
 *
 * Shared types, unions, and entity interfaces for the unified project management
 * workspace within Architex OS.
 *
 * @module commandCentre/types
 */

// ── View and Mode Types ──────────────────────────────────────────────────────

/** All navigable views within the Command Centre sidebar. */
export type CommandCentreView =
  | 'dashboard'
  | 'programme'
  | 'tasks'
  | 'milestones'
  | 'calendar'
  | 'team'
  | 'site-diary'
  | 'rfis'
  | 'issues'
  | 'quality'
  | 'budget'
  | 'valuations'
  | 'procurement'
  | 'contracts'
  | 'analytics'
  | 'ai-advisor'
  | 'documents'
  | 'settings'
  | 'actions'
  | 'notifications'
  | 'passport'
  | 'form-system'
  | 'audit-trail';

/** Scalable complexity mode: Simple (subset) or Full (all subsystems). */
export type ComplexityMode = 'simple' | 'full';

// ── Risk Types ───────────────────────────────────────────────────────────────

export type RiskCategory =
  | 'supply_chain'
  | 'resource'
  | 'quality'
  | 'compliance'
  | 'commercial'
  | 'safety'
  | 'health_and_safety';

export type RiskSeverity = 'critical' | 'high' | 'medium' | 'low';

export type RiskStatus = 'open' | 'mitigating' | 'escalated' | 'monitoring' | 'closed';

// ── Certificate and Contract Types ───────────────────────────────────────────

export type CertificateStatus = 'draft' | 'awaiting_signature' | 'certified' | 'paid';

export type ContractForm =
  | 'jbcc_pba'
  | 'jbcc_ns'
  | 'jbcc_mwa'
  | 'nec_ecc'
  | 'nec_psc'
  | 'nec_tsc'
  | 'custom';

export type ContractStatus = 'active' | 'expired' | 'terminated' | 'pending';

// ── Procurement Types ────────────────────────────────────────────────────────

export type ProcurementStatus = 'ordered' | 'in_transit' | 'delivered' | 'evaluating';

// ── AI Recommendation Types ──────────────────────────────────────────────────

export type RecommendationCategory =
  | 'schedule_optimisation'
  | 'risk_detection'
  | 'cost_savings'
  | 'compliance_alert'
  | 'supply_chain_risk';

// ── Priority (re-exported for Command Centre scope) ──────────────────────────

export type Priority = 'low' | 'medium' | 'high' | 'critical';

// ── Configuration and Integration ────────────────────────────────────────────

export interface CommandCentreConfig {
  projectId: string;
  complexityMode: ComplexityMode;
  contractValue: number;
  projectType: string;
  integrations: IntegrationStatus[];
}

export interface IntegrationStatus {
  module: 'specforge' | 'project_passport' | 'document_intelligence' | 'payment_gateway';
  connected: boolean;
  lastSyncAt?: string;
}

// ── Audit Trail ──────────────────────────────────────────────────────────────

export interface AuditEntry {
  id: string;
  projectId: string;
  actorId: string;
  actorName: string;
  actionType: 'create' | 'update' | 'delete' | 'status_change' | 'escalation';
  entityType: string;
  entityId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  timestamp: string;
}

// ── Calendar Event ───────────────────────────────────────────────────────────

export interface CalendarEvent {
  id: string;
  projectId: string;
  date: string;
  title: string;
  type: 'milestone' | 'inspection' | 'delivery' | 'meeting' | 'task_due';
  sourceEntityType: string;
  sourceEntityId: string;
  status?: string;
}

// ── Milestone ────────────────────────────────────────────────────────────────

export interface CommandCentreMilestone {
  id: string;
  projectId: string;
  name: string;
  plannedDate: string;
  actualDate?: string;
  status: 'complete' | 'on_track' | 'at_risk' | 'overdue' | 'pending';
  linkedCertificateId?: string;
  linkedCertificateName?: string;
  linkedActivityId?: string;
  category?: 'general' | 'nhbrc_inspection' | 'municipal_submission';
  nhbrcStage?: number;
  documentationChecklist?: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ── B-BBEE Procurement Scoring ───────────────────────────────────────────────

export interface BBBEEProcurementSummary {
  totalProcurementValue: number;
  bbbeeProcurementValue: number;
  bbbeePercent: number;
  supplierBreakdown: Array<{
    supplierId: string;
    supplierName: string;
    bbbeeLevel: number;
    orderValue: number;
  }>;
}

// ── Platform Integration Contracts ───────────────────────────────────────────

export interface PassportWriteback {
  source: 'command_centre';
  projectId: string;
  updates: {
    scheduleHealth?: 'on_track' | 'at_risk' | 'delayed';
    financialHealth?: 'healthy' | 'at_risk' | 'over_budget';
    riskProfile?: { level: Priority; openCount: number; criticalCount: number };
    milestoneProgress?: { total: number; completed: number; overdue: number };
    qualityScore?: number;
  };
  timestamp: string;
}

export interface SpecForgeLink {
  specForgeItemId: string;
  itemTitle: string;
  itemStatus: string;
  linkedEntityType: 'task' | 'procurement_order' | 'activity';
  linkedEntityId: string;
}

// ── Action Centre Event ──────────────────────────────────────────────────────

export interface CommandCentreAction {
  id: string;
  projectId: string;
  type: 'approval' | 'technical' | 'financial' | 'design' | 'planning';
  title: string;
  description: string;
  assigneeId: string;
  dueDate: string;
  priority: Priority;
  sourceSubsystem: string;
  sourceEntityId: string;
  status: 'pending' | 'completed' | 'overdue';
  createdAt: string;
}

// ── Task Board ───────────────────────────────────────────────────────────────

export interface TaskBoardItem {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  status: 'todo' | 'in_progress' | 'in_review' | 'done';
  assigneeId: string;
  assigneeName: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  dueDate: string;
  linkedSpecForgeItemId?: string;
  linkedActivityId?: string;
  linkedActivityName?: string;
  linkedProcurementOrderId?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ── Budget Controller ────────────────────────────────────────────────────────

export interface BudgetPackage {
  id: string;
  projectId: string;
  name: string;
  budgetAmount: number;
  committedAmount: number;
  spentAmount: number;
  progressPercent: number;
  variance: number;
  isOverBudget: boolean;
}

export interface BudgetSummary {
  contractSum: number;
  approvedVariations: number;
  spentToDate: number;
  forecastAtCompletion: number;
  costVariancePercent: number;
}

// ── Risk Register ────────────────────────────────────────────────────────────

export interface RiskItem {
  id: string;
  projectId: string;
  description: string;
  category: RiskCategory;
  severity: RiskSeverity;
  status: RiskStatus;
  ownerId: string;
  ownerName: string;
  mitigationPlan?: string;
  linkedBudgetPackageId?: string;
  linkedBudgetPackageName?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  aiGenerated?: boolean;
}

// ── Valuation / Payment Certificates ─────────────────────────────────────────

export interface PaymentCertificate {
  id: string;
  projectId: string;
  certificateNumber: number;
  period: string;
  grossValue: number;
  retentionAmount: number;
  retentionPercent: number;
  netCertifiedAmount: number;
  status: CertificateStatus;
  linkedMilestoneId?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ── Contract Register ────────────────────────────────────────────────────────

export interface ContractItem {
  id: string;
  projectId: string;
  reference: string;
  contractorSupplier: string;
  scope: string;
  value: number;
  form: ContractForm;
  startDate: string;
  expiryDate: string;
  status: ContractStatus;
  linkedProcurementOrderIds?: string[];
  linkedCertificateIds?: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ── Procurement ──────────────────────────────────────────────────────────────

export interface ProcurementOrder {
  id: string;
  projectId: string;
  orderNumber: string;
  description: string;
  supplierId: string;
  supplierName: string;
  value: number;
  expectedDeliveryDate: string;
  status: ProcurementStatus;
  bbbeeLevel?: number;
  linkedSpecForgeItemId?: string;
  linkedSpecForgeItemTitle?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ── AI Advisor ───────────────────────────────────────────────────────────────

export interface AIRecommendation {
  id: string;
  projectId: string;
  category: RecommendationCategory;
  title: string;
  explanation: string;
  suggestedActions: SuggestedAction[];
  status: 'pending' | 'accepted' | 'dismissed';
  createdAt: string;
}

export type SuggestedAction =
  | { type: 'create_task'; payload: Partial<TaskBoardItem> }
  | { type: 'create_risk'; payload: Partial<RiskItem> }
  | { type: 'send_notification'; payload: { recipientId: string; message: string } }
  | { type: 'update_programme'; payload: { activityId: string; change: Record<string, unknown> } }
  | { type: 'alert_procurement'; payload: { orderId: string; message: string } }
  | { type: 'create_action'; payload: { title: string; assigneeId: string; dueDate: string } };
