# Technical Design Document — Integrated Form System

## Overview

The Integrated Form System is a deeply embedded Architex OS module providing automated construction document creation, intelligent auto-fill from platform data (Project Passport, user profiles, client records), manual form entry, PDF export, digital signatures, collaborative editing, and full audit trail. It integrates with the 8-stage project lifecycle and respects 17-role access control.

Key design decisions:
- Form templates stored as JSON schema in Firestore (defining fields, layout, validation, data source mappings)
- Auto-fill uses a resolver chain pattern (Project Passport → User Profile → Client Record → Firm → fallback empty)
- PDF generation via server-side rendering with the existing pdf-vendor library
- Real-time collaboration via Firestore document listeners for field lock state
- Audit trail writes are atomic with field modifications (transaction-based)
- Form instances stored per-project in Firestore with denormalized template metadata

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Architex OS App Shell                              │
├──────────┬──────────────────────────────────────────────────────────────┤
│ Tool Nav │  FormSystemWorkspace (React)                                   │
│  - Library│  ┌────────────────────────────────────────────────────────┐  │
│  - Drafts │  │ Header Card · Project Toggles · Tab Navigation         │  │
│  - Export │  ├────────────────────────────────────────────────────────┤  │
│  - Audit  │  │ Active Tab Content:                                    │  │
│           │  │  - Template Library (search/filter/select)             │  │
│           │  │  - Form Editor (auto-fill + manual fields)            │  │
│           │  │  - Drafts List                                        │  │
│           │  │  - Export/Sign                                        │  │
│           │  │  - Audit Trail Viewer                                 │  │
│           │  └────────────────────────────────────────────────────────┘  │
└──────────┴──────────────────────────────────────────────────────────────┘
```

### Service Layer Architecture

```
┌─────────────────────── Client (React) ───────────────────────┐
│  FormSystemWorkspace.tsx                                       │
│  ├── useFormTemplateLibrary()    (hook: search/filter)        │
│  ├── useFormInstance()           (hook: field state + collab) │
│  ├── useAutoFill()              (hook: resolver invocation)   │
│  └── useFormDrafts()            (hook: draft list + resume)   │
└───────────────────────────────────────────────────────────────┘
                              │ API calls
                              ▼
┌─────────────────────── Server (Express) ─────────────────────┐
│  /api/forms/*                                                 │
│  ├── POST /templates          (admin: create template)        │
│  ├── GET  /templates          (search/filter library)         │
│  ├── POST /instances          (create form from template)     │
│  ├── PATCH /instances/:id     (update field values)           │
│  ├── POST /instances/:id/export (generate PDF)                │
│  ├── POST /instances/:id/sign   (apply digital signature)     │
│  ├── GET  /instances/:id/audit  (audit trail)                 │
│  ├── POST /instances/:id/share  (share with collaborator)     │
│  └── GET  /drafts             (user's draft list)             │
└───────────────────────────────────────────────────────────────┘
                              │ Firestore
                              ▼
┌─────────────────────── Data Layer ────────────────────────────┐
│  Collections:                                                  │
│  ├── form_templates/{templateId}                              │
│  ├── form_instances/{instanceId}                              │
│  │   ├── /fields (subcollection for real-time field state)    │
│  │   ├── /locks  (subcollection for field-level locking)      │
│  │   └── /audit  (subcollection for immutable audit events)   │
│  └── form_drafts/{userId}/drafts/{draftId}                    │
└───────────────────────────────────────────────────────────────┘
```

### Integration Points

```
Form System ──writes──▶ Document Register (on PDF export)
Form System ──writes──▶ Municipal Readiness (municipal form ready for submission)
Form System ──writes──▶ Project Passport (form completion record)
Form System ──writes──▶ Action Centre (pending actions)
Form System ──reads───▶ Project Passport (auto-fill project data)
Form System ──reads───▶ User Profile (auto-fill professional data)
Form System ──reads───▶ Client Records (auto-fill client data)
Form System ──reads───▶ Lifecycle Engine (stage-based recommendations)
```

## Components and Interfaces

### Firestore Collections

#### form_templates/{templateId}

```typescript
interface FormTemplate {
  id: string;
  name: string;
  category: FormCategory;
  formType: string;
  municipalities: string[];        // applicable municipality IDs
  lifecycleStages: ProjectPhase[]; // applicable stages
  version: number;
  isLatest: boolean;
  schema: FormSchema;              // field definitions + layout
  fieldMappings: FieldMapping[];   // auto-fill data source configs
  requiredSignatures: SignatureRequirement[];
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

#### form_instances/{instanceId}

```typescript
interface FormInstance {
  id: string;
  templateId: string;
  templateVersion: number;
  projectId: string | null;        // null for standalone
  createdBy: string;
  status: FormStatus;
  fields: Record<string, FormFieldValue>;
  signatures: Record<string, SignatureRecord>;
  collaborators: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### Supporting Types

```typescript
type FormCategory =
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

type FormStatus = 'draft' | 'awaiting_approval' | 'ready_for_export' | 'exported' | 'signed';

interface FormSchema {
  sections: FormSection[];
  layout: LayoutConfig;
}

interface FormSection {
  id: string;
  title: string;
  icon: string;
  fields: FormFieldDefinition[];
  conditionalOn?: ConditionalRule;  // e.g., company resolution only if juristic person
}

interface FormFieldDefinition {
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  validation?: ValidationRule[];
  options?: string[];              // for select/radio fields
  placeholder?: string;
  dataSource?: DataSourceRef;      // auto-fill mapping
}

type FieldType =
  | 'text' | 'textarea' | 'number' | 'date'
  | 'select' | 'multi_select' | 'radio' | 'checkbox'
  | 'id_number' | 'sacap_reg' | 'erf_number'
  | 'address' | 'phone' | 'email';

interface FormFieldValue {
  value: string | string[] | boolean | null;
  source: 'auto_fill' | 'manual' | 'system';
  isOverridden: boolean;
  autoFillValue: string | null;    // original auto-fill for revert
  lastModifiedBy: string;
  lastModifiedAt: Timestamp;
}

interface FieldMapping {
  fieldId: string;
  dataSource: DataSourceRef;
  transformFn?: string;            // optional transform (e.g., formatDate)
}

interface DataSourceRef {
  provider: 'project_passport' | 'user_profile' | 'client_record' | 'firm_record';
  path: string;                    // dot-notation path to value (e.g., 'address.physical')
}
```

### Signature & Audit Types

```typescript
interface SignatureRequirement {
  role: string;                    // e.g., 'architect', 'client'
  credentialType?: string;         // e.g., 'sacap_registration'
  order: number;                   // sequential signing order
}

interface SignatureRecord {
  signatoryId: string;
  signatoryName: string;
  signatoryRole: string;
  signedAt: Timestamp;
  signatureData: string;           // base64 canvas capture or crypto hash
  credentialVerified: boolean;
}

interface AuditEvent {
  id: string;
  instanceId: string;
  eventType: 'created' | 'field_modified' | 'exported' | 'signed' | 'shared' | 'approval_granted' | 'approval_denied';
  userId: string;
  userName: string;
  timestamp: Timestamp;
  details: Record<string, unknown>; // event-specific payload
  snapshot?: string;               // reference to version snapshot doc
}

interface FieldLock {
  fieldId: string;
  lockedBy: string;
  lockedByName: string;
  lockedAt: Timestamp;
  expiresAt: Timestamp;            // auto-release after 5 min inactivity
}
```

## Low-Level Design

### Auto-Fill Resolver Chain

The Auto_Fill_Engine uses a chain-of-responsibility pattern. Each resolver attempts to resolve field values from its data source, falling through to the next if empty.

```typescript
// src/services/forms/autoFillEngine.ts

interface ResolverContext {
  projectId: string | null;
  userId: string;
  clientId: string | null;
  fieldMappings: FieldMapping[];
}

interface DataResolver {
  provider: DataSourceRef['provider'];
  resolve(path: string, ctx: ResolverContext): Promise<string | null>;
}

async function resolveAutoFill(
  template: FormTemplate,
  ctx: ResolverContext
): Promise<Record<string, FormFieldValue>> {
  const resolvers: DataResolver[] = [
    new ProjectPassportResolver(),
    new UserProfileResolver(),
    new ClientRecordResolver(),
    new FirmRecordResolver(),
  ];

  const results: Record<string, FormFieldValue> = {};

  for (const mapping of template.fieldMappings) {
    const resolver = resolvers.find(r => r.provider === mapping.dataSource.provider);
    const value = resolver
      ? await resolver.resolve(mapping.dataSource.path, ctx)
      : null;

    results[mapping.fieldId] = {
      value,
      source: value ? 'auto_fill' : 'manual',
      isOverridden: false,
      autoFillValue: value,
      lastModifiedBy: value ? 'system' : '',
      lastModifiedAt: Timestamp.now(),
    };
  }

  return results;
}
```

### PDF Generation Pipeline

```typescript
// src/services/forms/pdfExportService.ts

interface PdfExportOptions {
  instanceId: string;
  format: 'single' | 'batch';
  instanceIds?: string[];          // for batch
  combineIntoOne?: boolean;
}

interface PdfExportResult {
  success: boolean;
  url?: string;                    // Vercel Blob URL
  errors?: { fieldId: string; label: string; section: string }[];
}

async function exportFormToPdf(options: PdfExportOptions): Promise<PdfExportResult> {
  // 1. Load FormInstance + FormTemplate
  // 2. Validate required fields (warn on empty, block if critical)
  // 3. Render template layout with field values into PDF
  // 4. Embed signatures as images
  // 5. Upload to Vercel Blob
  // 6. Record export event in audit trail
  // 7. Write to Document Register + Project Passport
  // 8. Update Municipal Readiness if municipal form
  return { success: true, url: blobUrl };
}
```

### Validation Engine

```typescript
// src/services/forms/formValidationService.ts

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

interface ValidationError {
  fieldId: string;
  fieldLabel: string;
  section: string;
  rule: string;
  message: string;
}

function validateField(
  field: FormFieldDefinition,
  value: string | null,
  context: { municipalityProfile?: MunicipalityProfile }
): ValidationError | null {
  // Dispatch by field type:
  // - id_number → validateSAId(value)
  // - sacap_reg → validateSACAPReg(value)
  // - erf_number → validateErfNumber(value, context.municipalityProfile)
  // - required check → value !== null && value !== ''
}

function validateSAId(value: string): boolean {
  // 13 digits + Luhn check digit
  if (!/^\d{13}$/.test(value)) return false;
  return luhnCheck(value);
}

function validateSACAPReg(value: string): boolean {
  // Format: PrArch followed by up to 10 digits, or similar prefixes
  return /^(PrArch|PrSArch|PrTechArch|SrArchTech|CandArch)\s?\d{1,10}$/i.test(value);
}
```

### Real-Time Collaboration (Field Locking)

```typescript
// src/services/forms/collaborationService.ts

// Client-side: subscribe to field locks via Firestore onSnapshot
function subscribeToFieldLocks(
  instanceId: string,
  onUpdate: (locks: FieldLock[]) => void
): () => void {
  const locksRef = collection(db, `form_instances/${instanceId}/locks`);
  return onSnapshot(locksRef, (snapshot) => {
    const locks = snapshot.docs.map(d => d.data() as FieldLock);
    // Filter expired locks (> 5 min since lockedAt)
    const activeLocks = locks.filter(l => l.expiresAt.toMillis() > Date.now());
    onUpdate(activeLocks);
  });
}

// Acquire lock when user focuses a field
async function acquireFieldLock(
  instanceId: string,
  fieldId: string,
  userId: string,
  userName: string
): Promise<boolean> {
  const lockRef = doc(db, `form_instances/${instanceId}/locks/${fieldId}`);
  return runTransaction(db, async (txn) => {
    const existing = await txn.get(lockRef);
    if (existing.exists()) {
      const lock = existing.data() as FieldLock;
      if (lock.lockedBy !== userId && lock.expiresAt.toMillis() > Date.now()) {
        return false; // locked by another user
      }
    }
    txn.set(lockRef, {
      fieldId,
      lockedBy: userId,
      lockedByName: userName,
      lockedAt: Timestamp.now(),
      expiresAt: Timestamp.fromMillis(Date.now() + 5 * 60 * 1000),
    });
    return true;
  });
}

// Release lock on blur
async function releaseFieldLock(instanceId: string, fieldId: string): Promise<void> {
  await deleteDoc(doc(db, `form_instances/${instanceId}/locks/${fieldId}`));
}
```

### Service Layer File Structure

```
src/services/forms/
├── formTemplateService.ts        // CRUD for form templates, search/filter
├── formInstanceService.ts        // Create, update, status transitions
├── autoFillEngine.ts             // Resolver chain + data source queries
├── formValidationService.ts      // Field validation + export validation
├── pdfExportService.ts           // PDF generation + Vercel Blob upload
├── collaborationService.ts       // Field locking + presence
├── formAuditService.ts           // Audit event recording + snapshots
├── formIntegrationService.ts     // Document Register, Municipal Readiness, Passport writes
├── signatureService.ts           // Signature capture, credential validation
├── formPermissionService.ts      // Role-based access checks
└── formTypes.ts                  // All TypeScript interfaces/types
```

### API Endpoints

```typescript
// Added to src/lib/api-router.ts (or new src/lib/forms-api-router.ts)

// Template management (admin)
router.post('/api/forms/templates', requireRole(['platform_admin']), createTemplate);
router.get('/api/forms/templates', authenticate, searchTemplates);
router.get('/api/forms/templates/:id', authenticate, getTemplate);
router.patch('/api/forms/templates/:id', requireRole(['platform_admin']), updateTemplate);

// Form instances
router.post('/api/forms/instances', authenticate, createFormInstance);
router.get('/api/forms/instances/:id', authenticate, getFormInstance);
router.patch('/api/forms/instances/:id/fields', authenticate, updateFields);
router.delete('/api/forms/instances/:id', authenticate, deleteFormInstance);

// Export & signatures
router.post('/api/forms/instances/:id/export', authenticate, exportToPdf);
router.post('/api/forms/instances/:id/sign', authenticate, applySignature);

// Collaboration
router.post('/api/forms/instances/:id/share', authenticate, shareForm);
router.delete('/api/forms/instances/:id/share/:userId', authenticate, revokeShare);

// Drafts
router.get('/api/forms/drafts', authenticate, getUserDrafts);

// Audit
router.get('/api/forms/instances/:id/audit', authenticate, getAuditTrail);

// Auto-fill preview
router.post('/api/forms/auto-fill-preview', authenticate, previewAutoFill);
```

### Component Structure

```
src/components/forms/
├── FormSystemWorkspace.tsx        // Main workspace (workspace template pattern)
├── FormTemplateLibrary.tsx        // Template browser with search/filter
├── FormEditor.tsx                 // Form filling UI with sections/fields
├── FormFieldRenderer.tsx          // Field type → input component dispatcher
├── AutoFillIndicator.tsx          // Visual badge showing auto-fill vs manual
├── FormDraftsList.tsx             // User's saved drafts
├── FormExportDialog.tsx           // Export options + validation summary
├── FormSignatureCapture.tsx       // Signature pad + credential check
├── FormAuditViewer.tsx            // Timeline of audit events
├── FormCollaboratorPresence.tsx   // Active collaborator avatars + locks
├── FormProjectSelector.tsx        // Project context picker
└── FormApprovalWorkflow.tsx       // Approval chain status + actions
```

### React Hooks

```typescript
// src/hooks/useFormTemplateLibrary.ts
function useFormTemplateLibrary(filters: TemplateFilters): {
  templates: FormTemplate[];
  loading: boolean;
  totalPages: number;
  search: (query: string) => void;
}

// src/hooks/useFormInstance.ts
function useFormInstance(instanceId: string): {
  instance: FormInstance | null;
  updateField: (fieldId: string, value: string) => Promise<void>;
  locks: FieldLock[];
  collaborators: { userId: string; name: string; activeField: string }[];
}

// src/hooks/useAutoFill.ts
function useAutoFill(templateId: string, projectId: string | null): {
  resolvedFields: Record<string, FormFieldValue>;
  resolving: boolean;
  reResolve: (newProjectId: string) => Promise<void>;
}

// src/hooks/useFormDrafts.ts
function useFormDrafts(userId: string): {
  drafts: FormDraft[];
  loading: boolean;
  deleteDraft: (draftId: string) => Promise<void>;
}
```

### Registration & Navigation

The Form System workspace is registered as a tool within the **Compliance + Municipal Readiness** module (Module 4) and also accessible from **Project Passport** (Module 1) via a "Forms" action.

```typescript
// src/navigation/toolNavRegistry.ts addition
'form-system': {
  name: 'Form System',
  subtitle: 'Auto-fill & manage construction documents',
  sections: [
    {
      label: 'Forms',
      items: [
        { id: 'library', icon: Library, label: 'Template Library' },
        { id: 'drafts', icon: FileEdit, label: 'My Drafts' },
        { id: 'recent', icon: Clock, label: 'Recent Forms' },
      ],
    },
    {
      label: 'Management',
      items: [
        { id: 'export', icon: Download, label: 'Export Queue' },
        { id: 'approvals', icon: CheckCircle, label: 'Approvals' },
        { id: 'audit', icon: Shield, label: 'Audit Trail' },
      ],
    },
  ],
}
```

### Auto-Save & Draft Persistence

```typescript
// Debounced auto-save (30s inactivity trigger)
function useAutoSave(instanceId: string, fields: Record<string, FormFieldValue>) {
  const timeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(async () => {
      try {
        await saveDraft(instanceId, fields);
      } catch (err) {
        // Retain in localStorage, show notification, retry in 60s
        localStorage.setItem(`form_draft_${instanceId}`, JSON.stringify(fields));
        showNotification('Auto-save failed. Will retry shortly.');
        setTimeout(() => retryAutoSave(instanceId), 60000);
      }
    }, 30000);

    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, [fields]);
}
```

### Permission Matrix

| Role | Create/Edit | Export | View | Approve |
|------|------------|--------|------|---------|
| architect, engineer, qs, town_planner, energy_pro, fire_engineer | ✅ All | ✅ | ✅ | ✅ (if designated) |
| contractor, subcontractor | ✅ Construction admin only | ✅ Own | ✅ Project forms | ❌ |
| client | ❌ | ❌ | ✅ Own project | ❌ |
| freelancer, developer, site_manager, bep, supplier | ❌ (unless elevated) | ❌ | ✅ Project forms | ❌ |
| firm_admin | ✅ All | ✅ | ✅ | ✅ + configure workflows |
| platform_admin | ✅ All + templates | ✅ | ✅ | ✅ |

### Lifecycle Stage → Template Mapping

| Stage | Recommended Form Categories |
|-------|---------------------------|
| Brief | — |
| Appoint | appointment_letter, contract, power_of_attorney |
| Design | — |
| Comply | municipal_submission, compliance_declaration, sacap |
| Procure | — |
| Build | site_instruction, variation_order, payment_certificate |
| Pay | payment_certificate |
| Close-out | compliance_declaration, payment_certificate |

## Data Models

All data models are defined above in the Components and Interfaces section. Key Firestore collections:

- `form_templates/{templateId}` — FormTemplate documents with schema, field mappings, signature requirements
- `form_instances/{instanceId}` — FormInstance documents with field values, status, collaborators
- `form_instances/{instanceId}/locks/{fieldId}` — Real-time field locks for collaboration
- `form_instances/{instanceId}/audit/{eventId}` — Immutable audit trail events
- `form_drafts/{userId}/drafts/{draftId}` — Per-user draft references

Relationships:
- FormInstance → FormTemplate (templateId + templateVersion)
- FormInstance → Project (projectId, nullable for standalone)
- FormInstance → User (createdBy, collaborators[])
- AuditEvent → FormInstance (instanceId)
- FieldLock → User (lockedBy)

## Correctness Properties

### Property 1: Auto-fill Determinism
Given the same project, user, and client context, the Auto_Fill_Engine must produce identical field values on repeated invocations.
**Validates: Requirements 2.6**

### Property 2: Override Preservation
When project context is switched, all fields marked `isOverridden: true` must retain their manual values — only non-overridden fields may change.
**Validates: Requirements 4.3**

### Property 3: Audit Completeness
Every field modification (auto-fill, manual, override, revert) must produce exactly one audit event with correct before/after values.
**Validates: Requirements 6.2**

### Property 4: Lock Exclusivity
At most one user may hold an active (non-expired) lock on any given field at any point in time.
**Validates: Requirements 8.2**

### Property 5: Signature Immutability
Once a signature is applied, all fields in the signed form must be read-only until the signature is explicitly revoked.
**Validates: Requirements 12.6**

### Property 6: Version Snapshot Consistency
Every audit event's snapshot must reconstruct the exact field state that existed at that event's timestamp.
**Validates: Requirements 6.4**

### Property 7: Template Version Isolation
Existing FormInstances must continue using their original template version even when a newer version is published.
**Validates: Requirements 1.7**

## Error Handling

| Scenario | Handling |
|----------|----------|
| Auto-fill data source unavailable | Leave field empty, mark as requiring manual entry, log warning |
| PDF generation failure | Display error with reason, preserve FormInstance unchanged, allow retry |
| Auto-save failure (network) | Retain state in localStorage, show notification, retry after 60s |
| Field lock acquisition failure | Show "field locked by [user]" indicator, prevent edit, poll for release |
| Signature credential validation failure | Reject signature, display specific credential requirement not met |
| Integration write failure (Doc Register, Municipal Readiness) | Queue operation, notify user of pending status, retry within 5 min |
| Concurrent field modification conflict | Last-write-wins for same user; lock-based prevention for different users |
| Template version mismatch | Use instance's stored templateVersion, not latest; warn if template has updates |
| Batch export partial failure | Export successful forms, report failures individually, allow selective retry |
| Permission denied | Deny action, display notification, record in audit trail |

## Testing Strategy

### Unit Tests (Vitest)
- `autoFillEngine.test.ts` — Resolver chain with mocked data sources, empty project, multiple clients
- `formValidationService.test.ts` — SA ID Luhn check, SACAP format, required fields, geographic validation
- `formPermissionService.test.ts` — All role × action combinations from permission matrix
- `collaborationService.test.ts` — Lock acquisition, expiry, release, conflict scenarios
- `formAuditService.test.ts` — Event creation, immutability enforcement, snapshot generation
- `pdfExportService.test.ts` — Template rendering, signature embedding, error scenarios

### Integration Tests
- Form creation → auto-fill → field override → export → Document Register entry
- Multi-user collaboration: lock acquisition, field edit, lock release
- Draft persistence: create → save → navigate away → resume → verify state
- Lifecycle stage change → recommended template update

### E2E Tests (Playwright)
- Full form workflow: select template → auto-fill → manual override → sign → export PDF
- Collaborative editing: two browser contexts, field locking visible in both
- Draft save/resume across page reload
- Role-based access: client cannot create forms, contractor restricted to construction admin
