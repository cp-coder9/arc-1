// ─── Form System Types ──────────────────────────────────────────────────────
// All TypeScript interfaces and types for the Integrated Form System module.
// Consumed by services, hooks, and components throughout the form system.

import type { Timestamp } from 'firebase/firestore';
import type { ProjectPhase } from '@/services/lifecycleTypes';

// ─── Enums / Union Types ────────────────────────────────────────────────────

export type FormCategory =
  | 'municipal_submission'
  | 'sacap'
  | 'contract'
  | 'appointment_letter'
  | 'power_of_attorney'
  | 'company_resolution'
  | 'site_instruction'
  | 'variation_order'
  | 'payment_certificate'
  | 'compliance_declaration'
  | 'custom';

export type FormStatus =
  | 'draft'
  | 'awaiting_approval'
  | 'ready_for_export'
  | 'exported'
  | 'signed';

export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'date'
  | 'select'
  | 'multi_select'
  | 'radio'
  | 'checkbox'
  | 'id_number'
  | 'sacap_reg'
  | 'erf_number'
  | 'address'
  | 'phone'
  | 'email';

// ─── Validation ─────────────────────────────────────────────────────────────

export interface ValidationRule {
  type: string;
  value?: string | number | boolean;
  message: string;
}

export interface ValidationError {
  fieldId: string;
  fieldLabel: string;
  section: string;
  rule: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

// ─── Data Source & Field Mapping ────────────────────────────────────────────

export interface DataSourceRef {
  provider: 'project_passport' | 'user_profile' | 'client_record' | 'firm_record';
  path: string;
}

export interface FieldMapping {
  fieldId: string;
  dataSource: DataSourceRef;
  transformFn?: string;
}

// ─── Schema & Layout ────────────────────────────────────────────────────────

export interface ConditionalRule {
  fieldId: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'is_truthy';
  value?: string | boolean;
}

export interface LayoutConfig {
  columns?: number;
  orientation?: 'vertical' | 'horizontal';
}

export interface FormFieldDefinition {
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  validation?: ValidationRule[];
  options?: string[];
  placeholder?: string;
  dataSource?: DataSourceRef;
}

export interface FormSection {
  id: string;
  title: string;
  icon: string;
  fields: FormFieldDefinition[];
  conditionalOn?: ConditionalRule;
}

export interface FormSchema {
  sections: FormSection[];
  layout: LayoutConfig;
}

// ─── Signature Types ────────────────────────────────────────────────────────

export interface SignatureRequirement {
  role: string;
  credentialType?: string;
  order: number;
}

export interface SignatureRecord {
  signatoryId: string;
  signatoryName: string;
  signatoryRole: string;
  signedAt: Timestamp;
  signatureData: string;
  credentialVerified: boolean;
}

// ─── Core Document Types ────────────────────────────────────────────────────

export interface FormTemplate {
  id: string;
  name: string;
  category: FormCategory;
  formType: string;
  municipalities: string[];
  lifecycleStages: ProjectPhase[];
  version: number;
  isLatest: boolean;
  schema: FormSchema;
  fieldMappings: FieldMapping[];
  requiredSignatures: SignatureRequirement[];
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface FormFieldValue {
  value: string | string[] | boolean | null;
  source: 'auto_fill' | 'manual' | 'system';
  isOverridden: boolean;
  autoFillValue: string | null;
  lastModifiedBy: string;
  lastModifiedAt: Timestamp;
}

export interface FormInstance {
  id: string;
  templateId: string;
  templateVersion: number;
  projectId: string | null;
  createdBy: string;
  status: FormStatus;
  fields: Record<string, FormFieldValue>;
  signatures: Record<string, SignatureRecord>;
  collaborators: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ─── Collaboration Types ────────────────────────────────────────────────────

export interface FieldLock {
  fieldId: string;
  lockedBy: string;
  lockedByName: string;
  lockedAt: Timestamp;
  expiresAt: Timestamp;
}

// ─── Audit Types ────────────────────────────────────────────────────────────

export type AuditEventType =
  | 'created'
  | 'field_modified'
  | 'exported'
  | 'signed'
  | 'shared'
  | 'approval_granted'
  | 'approval_denied';

export interface AuditEvent {
  id: string;
  instanceId: string;
  eventType: AuditEventType;
  userId: string;
  userName: string;
  timestamp: Timestamp;
  details: Record<string, unknown>;
  snapshot?: string;
}

// ─── PDF Export Types ───────────────────────────────────────────────────────

export interface PdfExportOptions {
  instanceId: string;
  format: 'single' | 'batch';
  instanceIds?: string[];
  combineIntoOne?: boolean;
}

export interface PdfExportResult {
  success: boolean;
  url?: string;
  errors?: { fieldId: string; label: string; section: string }[];
}

// ─── Auto-Fill Resolver Types ───────────────────────────────────────────────

export interface ResolverContext {
  projectId: string | null;
  userId: string;
  clientId: string | null;
  fieldMappings: FieldMapping[];
}

export interface DataResolver {
  provider: DataSourceRef['provider'];
  resolve(path: string, ctx: ResolverContext): Promise<string | null>;
}

// ─── Hook & Filter Types ────────────────────────────────────────────────────

export interface TemplateFilters {
  category?: FormCategory;
  municipality?: string;
  lifecycleStage?: ProjectPhase;
  formType?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface FormDraft {
  id: string;
  instanceId: string;
  templateId: string;
  templateName: string;
  projectId: string | null;
  projectName: string | null;
  status: FormStatus;
  lastModifiedAt: Timestamp;
  createdAt: Timestamp;
  isStale: boolean;
}
