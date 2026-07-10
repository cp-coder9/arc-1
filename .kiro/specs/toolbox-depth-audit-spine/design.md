# Design Document: Toolbox Depth Audit Spine

## Overview

This design describes the technical architecture for a full audit of the toolbox tile registry, classification of every tool's implementation depth, placeholder enforcement, and the reusable ToolRun persistence/export/audit spine infrastructure. The system builds upon the existing `src/services/toolboxEngine/` and `src/services/toolbox/` modules, extending them with an automated classification audit service, enhanced enforcement in the engine pipeline, Firestore-backed persistence with cursor pagination, enriched export templates, and coverage tests.

## Architecture

### High-Level Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Toolbox Depth Audit Spine                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐  │
│  │  Classification   │    │   ToolboxEngine   │    │   Coverage Test  │  │
│  │   Audit Service   │    │   (enhanced)      │    │   Suite          │  │
│  └────────┬─────────┘    └────────┬─────────┘    └────────┬─────────┘  │
│           │                       │                        │            │
│           ▼                       ▼                        ▼            │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                     Shared Infrastructure                         │  │
│  │  ┌─────────┐  ┌──────────┐  ┌─────────┐  ┌──────────────────┐   │  │
│  │  │Registry │  │Guideline │  │Export    │  │Integration       │   │  │
│  │  │(Defn +  │  │Table     │  │Service   │  │Event Bus         │   │  │
│  │  │ Tool)   │  │Store     │  │(enhanced)│  │(retry + backoff) │   │  │
│  │  └─────────┘  └──────────┘  └─────────┘  └──────────────────┘   │  │
│  │  ┌─────────────────┐  ┌────────────────┐  ┌──────────────────┐  │  │
│  │  │Firestore        │  │Audit Snapshot  │  │Project Assignment│  │  │
│  │  │Repository       │  │(SHA-256)       │  │Service           │  │  │
│  │  │(cursor paging)  │  │                │  │(enhanced)        │  │  │
│  │  └─────────────────┘  └────────────────┘  └──────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Execution Pipeline (Enhanced)

```
User Request
    │
    ▼
┌─────────────────────┐
│ 1. Resolve Definition │ ← definitionRegistry.getCalculatorDefinition(id)
│    NO_DEFINITION?     │ → ToolRunError (Req 2.1)
└──────────┬────────────┘
           ▼
┌─────────────────────┐
│ 2. Validate Input    │ ← definition.inputSchema.safeParse(input)
│    + Schedule rows   │ ← definition.scheduleSchema?.safeParse(row)
│    INVALID?          │ → ToolRunError INVALID_INPUT / INVALID_SCHEDULE_ROW
└──────────┬────────────┘
           ▼
┌─────────────────────┐
│ 3. Resolve Tables    │ ← tableResolver.resolveTables(tableRefs, store)
│    MISSING_TABLE?    │ → ToolRunError (Req 8.3)
└──────────┬────────────┘
           ▼
┌─────────────────────┐
│ 4. Compute           │ ← definition.compute(ctx)
│    Empty output?     │ → ToolRunError GENERIC_OUTPUT_DETECTED (Req 2.5)
│    Exception?        │ → ToolRun failed + COMPUTE_FAILED (Req 2.6)
└──────────┬────────────┘
           ▼
┌─────────────────────┐
│ 5. Preview check     │ ← status === 'preview'?  add previewDisclaimer
└──────────┬────────────┘
           ▼
┌─────────────────────┐
│ 6. Persist ToolRun   │ ← FirestoreToolRunRepository.save()
│    Retry once on fail│   (1s delay, Req 3.8)
└──────────┬────────────┘
           ▼
┌─────────────────────┐
│ 7. Generate Exports  │ ← JSON + CSV + HTML (Req 4)
└──────────┬────────────┘
           ▼
┌─────────────────────┐
│ 8. Emit Events       │ ← GovernanceProfile.downstreamWriteBack
│    Retry 3x backoff  │   (1s, 2s, 4s — Req 6.6)
└──────────┬────────────┘
           ▼
┌─────────────────────┐
│ 9. Issue / Lock      │ ← SHA-256 snapshot + locked=true (Req 10)
└─────────────────────┘
```

## Components and Interfaces

### 1. Classification Audit Service

**File:** `src/services/toolbox/auditClassificationService.ts`

Scans the Tool_Registry and Definition_Registry to produce a structured classification report.

```typescript
// Types
export type ClassificationGrade =
  | 'production'
  | 'partial'
  | 'placeholder'
  | 'metadata-only'
  | 'route-shell'
  | 'missing';

export interface ClassificationEntry {
  toolId: string;
  label: string;
  grade: ClassificationGrade;
  reasons: string[];
  missingCapabilities: string[];
}

export type ClassificationReport = ClassificationEntry[];

// Service interface
export interface AuditClassificationService {
  classifyAll(): ClassificationReport;
  classifyTool(toolId: string): ClassificationEntry;
}
```

**Classification logic (decision tree):**

1. Tool has no `calculatorDefinitionId` → `missing`
2. `calculatorDefinitionId` does not resolve in Definition_Registry → `metadata-only`
3. Definition has only `route` and no `compute`/`inputSchema` → `route-shell`
4. Definition has `status: 'preview'` and compute produces empty results → `placeholder`
5. Definition has `status: 'full'|'preview'` but missing clauseSet/tableRefs/reportTemplateId → `partial`
6. Definition has `status: 'full'` with compute, inputSchema, tableRefs, reportTemplateId → `production`

### 2. Enhanced ToolboxEngine

**File:** `src/services/toolboxEngine/engine.ts` (extend existing)

The existing `ToolboxEngine` class is enhanced with:

- **Input validation gate** using the definition's Zod `inputSchema` and optional `scheduleSchema`
- **Table resolution gate** via `tableResolver.resolveTables()`
- **Generic output detection** — reject results where all outputs are empty/zero
- **Preview disclaimer injection** for `status: 'preview'` definitions
- **Retry on persistence failure** (1 attempt after 1s delay)
- **Governance-aware event emission** respecting `GovernanceProfile.downstreamWriteBack`

```typescript
// Enhanced engine methods
export class ToolboxEngine {
  async runTool(params: RunToolParams): Promise<ToolRun>;
  async reviseRun(runId: string, input: unknown, ctx: ToolContext, assignment: ProjectAssignment): Promise<ToolRun>;
  async reassignRun(runId: string, assignment: ProjectAssignment, ctx: ToolContext): Promise<ToolRun>;
  async issueRun(runId: string, ctx: ToolContext): Promise<ToolRun>;
}

// New error codes (extend existing)
export type ToolRunErrorCode =
  | 'NO_DEFINITION'
  | 'INVALID_INPUT'
  | 'INVALID_SCHEDULE_ROW'
  | 'GENERIC_OUTPUT_DETECTED'
  | 'COMPUTE_FAILED'
  | 'UNSUPPORTED_JURISDICTION'
  | 'RUN_LOCKED'
  | 'REASSIGNMENT_NOT_PERMITTED';

export class ToolRunError extends Error {
  constructor(public readonly code: ToolRunErrorCode, message: string, public readonly details?: unknown) {
    super(message);
  }
}
```

### 3. Firestore ToolRun Repository

**File:** `src/services/toolboxEngine/firestoreRepository.ts` (new)

Replaces the `InMemoryToolRunRepository` for production. Implements cursor-based pagination.

```typescript
export class FirestoreToolRunRepository implements ToolRunRepository {
  // Collection: tenants/{tenantId}/toolRuns/{runId}
  // Demo mode: demo/{uid}/toolRuns/{runId}

  async save(run: ToolRun): Promise<ToolRun>;
  async getById(id: string, tenantId: string): Promise<ToolRun | undefined>;
  async listByTool(params: ListByToolParams): Promise<PaginatedResult<ToolRun>>;
  async listByProject(params: ListByProjectParams): Promise<PaginatedResult<ToolRun>>;
  async listByUser(params: ListByUserParams): Promise<PaginatedResult<ToolRun>>;
}

export interface PaginatedResult<T> {
  items: T[];
  cursor: string | null;  // createdAt of last item for startAfter
  hasMore: boolean;
}

export interface ListByToolParams {
  tenantId: string;
  userId: string;
  toolId: string;
  pageSize?: number;  // default 20, max 50
  cursor?: string;    // startAfter createdAt
}

export interface ListByProjectParams {
  tenantId: string;
  projectId: string;
  pageSize?: number;
  cursor?: string;
}
```

**Firestore indexes required:**
- `tenants/{tenantId}/toolRuns` — composite: `userId` ASC, `toolId` ASC, `createdAt` DESC
- `tenants/{tenantId}/toolRuns` — composite: `assignment.projectId` ASC, `createdAt` DESC

**Retry logic:** On save failure, wait 1000ms then retry once. If second attempt fails, throw `PersistenceError` but preserve output in the returned ToolRun object's in-memory state.

### 4. Enhanced Export Service

**File:** `src/services/toolboxEngine/exportService.ts` (extend existing)

The current export service produces basic JSON/CSV/HTML. Enhancements:

- **HTML export** uses `reportTemplateId` to select template, includes source versions, clause outcomes, disclaimers, Architex branding, ZA currency formatting
- **CSV export** produces one row per schedule line item with structured headers
- **Filename pattern:** `{toolId}_{runId}_{timestamp}.{ext}`

```typescript
export interface ExportRecord {
  id: string;
  format: 'json' | 'csv' | 'html';
  filename: string;  // pattern: {toolId}_{runId}_{ISO-timestamp}.{ext}
  mimeType: string;
  content: string;
  createdAt: string;
}

export class ExportService {
  createJson(run: ToolRun): ExportRecord;
  createCsv(run: ToolRun, definition: CalculatorDefinition): ExportRecord;
  createHtml(run: ToolRun, definition: CalculatorDefinition, context: ExportContext): ExportRecord;
}

export interface ExportContext {
  userName: string;
  userRole: string;
  projectAssignment: ProjectAssignment;
}
```

**HTML template structure:**
1. Header: Architex branding, tool name, run date
2. Context: user name/role, project assignment
3. Input parameters table
4. Results: lineResults table + aggregates summary
5. Clause outcomes: pass/fail/advisory table with clauseRef citations
6. Source versions: table id, version, effectiveFrom, status
7. Disclaimer: "Results are advisory only. Professional sign-off is required before regulatory submission."

### 5. Enhanced Audit Snapshot Service

**File:** `src/services/toolboxEngine/auditSnapshot.ts` (extend existing)

Current implementation uses FNV-1a. Upgrade to SHA-256 per Requirement 10.

```typescript
export class AuditSnapshotService {
  create(run: ToolRun, reason: string): AuditSnapshot;
  verify(run: ToolRun): boolean;
}

export interface AuditSnapshot {
  hash: string;         // SHA-256 hex
  algorithm: 'sha256';
  reason: string;
  createdAt: string;
  locked: boolean;
}
```

**Hash computation:**
```
SHA-256(UTF-8(runId | toolId | toolVersion | sortedInput | sortedOutput | issuedAt))
```
- Fields joined by pipe `|` delimiter
- Input/output: `JSON.stringify(value, Object.keys(value).sort())`
- issuedAt in ISO 8601 UTC format

### 6. Enhanced Integration Event Bus

**File:** `src/services/toolboxEngine/integrationEvents.ts` (extend existing)

Add governance-aware emission and retry with exponential backoff.

```typescript
export class IntegrationEventBus {
  async emitForRun(run: ToolRun, governance: GovernanceProfile, message: string): Promise<IntegrationEventResult[]>;
}

export interface IntegrationEventResult {
  event: IntegrationEvent;
  status: 'delivered' | 'pending_retry' | 'failed';
  attempts: number;
}
```

**Retry strategy:**
- Attempt 1: immediate
- Attempt 2: after 1000ms
- Attempt 3: after 2000ms
- Attempt 4: after 4000ms
- After 4 attempts total (3 retries): mark `failed`, emit Action Centre alert

### 7. Enhanced Project Assignment Service

**File:** `src/services/toolboxEngine/projectAssignment.ts` (extend existing)

Add validation, access checks, and reassignment logic.

```typescript
export class ProjectAssignmentService {
  none(): ProjectAssignment;
  internal(projectId: string, projectName: string): ProjectAssignment;
  external(externalReference: string, notes?: string): ProjectAssignment;
  
  async validate(assignment: ProjectAssignment, ctx: ToolContext): Promise<ValidationResult>;
  canReassign(currentMode: ProjectAssignment['mode']): boolean;
}

export interface ValidationResult {
  valid: boolean;
  error?: { code: string; message: string };
}
```

**Reassignment rules:**
- `none` → `internal-project` or `external-reference`: allowed
- `internal-project` or `external-reference` → any: rejected (`REASSIGNMENT_NOT_PERMITTED`)

### 8. Guideline Table Resolution

**File:** `src/services/toolbox/engine/tableResolver.ts` (existing — no changes needed)

The existing `resolveTable` and `resolveTables` functions already implement:
- Resolution by id + jurisdiction
- Latest non-superseded version selection
- Pinned version replay for deterministic re-execution
- `CalculatorError('MISSING_TABLE')` on resolution failure

**Enhancement needed:** Add jurisdiction validation — if input supplies a jurisdiction not available in any version of a required table, throw `CalculatorError('UNSUPPORTED_JURISDICTION')`.

## Data Models

### ToolRun (Firestore document)

```typescript
interface ToolRun {
  id: string;                    // e.g. 'run_abc123'
  tenantId: string;
  userId: string;
  toolId: string;                // FK to STANDALONE_TOOL_REGISTRY
  toolVersion: string;           // e.g. '1.0.0'
  role: string;                  // user role at time of execution
  assignment: ProjectAssignment;
  status: ToolRunStatus;         // 'draft' | 'completed' | 'issued' | 'superseded' | 'failed'
  input: unknown;                // validated (parsed) input
  output?: CalculationResult;    // computed output
  error?: string;                // populated on failure
  exports: ExportRecord[];
  auditSnapshot?: AuditSnapshot;
  locked: boolean;               // true when issued
  previewDisclaimer?: string;    // populated for preview tools
  supersedesRunId?: string;      // FK to the run this supersedes
  createdAt: string;             // ISO 8601
  updatedAt: string;             // ISO 8601
  issuedAt?: string;             // ISO 8601, set on issue
}
```

### ProjectAssignment

```typescript
interface ProjectAssignment {
  mode: 'none' | 'internal-project' | 'external-reference';
  projectId?: string;            // required when mode = 'internal-project'
  projectName?: string;
  externalReference?: string;    // 1-200 chars, required when mode = 'external-reference'
  notes?: string;                // max 500 chars
}
```

### GovernanceProfile

```typescript
interface GovernanceProfile {
  requiresProfessionalConfirmation: boolean;
  allowsAiDraft: boolean;
  locksOnIssue: boolean;
  downstreamWriteBack: Array<'ProjectRecord' | 'Inbox' | 'AuditTrail'>;
}
```

### ClassificationReport

```typescript
interface ClassificationEntry {
  toolId: string;
  label: string;
  grade: ClassificationGrade;
  reasons: string[];
  missingCapabilities: string[];
}
```

## File Structure

```
src/services/toolbox/
├── auditClassificationService.ts          [NEW] Classification audit logic
├── auditClassificationService.test.ts     [NEW] Audit service tests
├── types.ts                               [EXISTING] Core contracts (no changes)
├── engine/
│   ├── runCalculator.ts                   [EXISTING] Enhanced with validation gates
│   ├── tableResolver.ts                   [EXISTING] Add jurisdiction validation
│   ├── methodProviders.ts                 [EXISTING] No changes
│   └── index.ts                           [EXISTING] Re-export
├── tables/
│   ├── guidelineTableStore.ts             [EXISTING] No changes
│   ├── seed.ts                            [EXISTING] Extended with new table data
│   └── index.ts                           [EXISTING] Re-export
└── definitions/
    ├── definitionRegistry.ts              [EXISTING] No changes
    ├── index.ts                           [EXISTING] Register new definitions
    ├── feeCalculator.ts                   [EXISTING] Enhanced to production grade
    ├── fenestrationN.ts                   [EXISTING] Enhanced to production grade
    ├── rvalue.ts                          [EXISTING] Enhanced to production grade
    ├── xaEnergyCompliance.ts              [EXISTING] Enhanced to production grade
    ├── fireComplianceCheck.ts             [EXISTING] Enhanced to production grade
    ├── boqTakeoff.ts                      [EXISTING] Enhanced to production grade
    ├── materialProcurement.ts             [EXISTING] Enhanced to production grade
    ├── proposalComparison.ts              [EXISTING] Enhanced to production grade
    ├── softCostEstimator.ts               [EXISTING] Enhanced to production grade
    ├── paymentClaimBuilder.ts             [EXISTING] Enhanced to production grade
    ├── workforceTimesheet.ts              [EXISTING] Enhanced to production grade
    ├── plantRegister.ts                   [EXISTING] Enhanced to production grade
    ├── tenderBidBench.ts                  [NEW] Tender bid bench definition
    └── coverage.test.ts                   [EXISTING] Enhanced with full wiring checks

src/services/toolboxEngine/
├── engine.ts                              [EXISTING] Enhanced pipeline
├── types.ts                               [EXISTING] Add ToolRunError, new codes
├── repository.ts                          [EXISTING] Interface updated with pagination
├── firestoreRepository.ts                 [NEW] Firestore-backed repository
├── firestoreRepository.test.ts            [NEW] Repository tests
├── exportService.ts                       [EXISTING] Enhanced templates
├── auditSnapshot.ts                       [EXISTING] Upgraded to SHA-256
├── integrationEvents.ts                   [EXISTING] Add retry + backoff
├── projectAssignment.ts                   [EXISTING] Add validation + reassignment
├── historyService.ts                      [EXISTING] Enhanced with cursor pagination
├── ids.ts                                 [EXISTING] No changes
├── firestoreMapper.ts                     [EXISTING] Add locked field
└── index.ts                               [EXISTING] Re-export
```

## API Endpoints

All endpoints added to `src/lib/api-router.ts` under the `/api/toolbox/` prefix.

### Run a tool
```
POST /api/toolbox/run
Body: { toolId, input, assignment, issueImmediately? }
Response: ToolRun
Errors: NO_DEFINITION, INVALID_INPUT, INVALID_SCHEDULE_ROW, COMPUTE_FAILED, GENERIC_OUTPUT_DETECTED
```

### Get run history by tool
```
GET /api/toolbox/history/:toolId?pageSize=20&cursor=<createdAt>
Response: { items: ToolRun[], cursor: string | null, hasMore: boolean }
```

### Get run history by project
```
GET /api/toolbox/history/project/:projectId?pageSize=20&cursor=<createdAt>
Response: { items: ToolRun[], cursor: string | null, hasMore: boolean }
```

### Get a single run
```
GET /api/toolbox/runs/:runId
Response: ToolRun
```

### Get export for a run
```
GET /api/toolbox/runs/:runId/export/:format
Response: ExportRecord (content as string)
```

### Issue a run
```
POST /api/toolbox/runs/:runId/issue
Response: ToolRun (with auditSnapshot, locked=true)
```

### Revise a run
```
POST /api/toolbox/runs/:runId/revise
Body: { input, assignment }
Response: ToolRun (new run, original → superseded)
```

### Reassign a run
```
PATCH /api/toolbox/runs/:runId/assignment
Body: { assignment: ProjectAssignment }
Response: ToolRun
Errors: RUN_LOCKED, REASSIGNMENT_NOT_PERMITTED
```

### Run classification audit
```
GET /api/toolbox/audit/classification
Response: ClassificationReport
```

## Correctness Properties

### Property 1: Classification Completeness
Every tool in `STANDALONE_TOOL_REGISTRY` receives exactly one classification grade. No tool is omitted from the report.

**Validates: Requirements 1.1, 1.9**

**Test:** `classifyAll().length === STANDALONE_TOOL_REGISTRY.length` and every entry has exactly one valid grade.

### Property 2: Classification Determinism
For a fixed registry and definition state, `classifyAll()` always produces the same report regardless of invocation order.

**Validates: Requirements 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8**

**Test:** Run `classifyAll()` 10 times, assert deep equality across all runs.

### Property 3: Validation Gate Soundness
No `compute` function is ever called with input that fails the definition's `inputSchema`. If `safeParse` returns `success: false`, the engine throws `INVALID_INPUT` before `compute` is reached.

**Validates: Requirements 7.1, 7.2, 7.3, 7.4**

**Test:** For random invalid inputs (generated via Zod schema negation), assert engine rejects with `INVALID_INPUT` and never invokes `compute`.

### Property 4: Generic Output Rejection
A ToolRun with `completed` status never has empty lineResults AND empty clauseResults AND all-zero aggregates. Such results are caught and the run is marked `failed` with `GENERIC_OUTPUT_DETECTED`.

**Validates: Requirements 2.5**

**Test:** Generate CalculationResults with all-empty/zero fields, assert engine rejects them.

### Property 5: Immutability After Issue
Once a ToolRun has `locked: true`, no mutation other than `status → superseded` is permitted. Any attempt returns `RUN_LOCKED`.

**Validates: Requirements 10.2, 10.3, 10.4**

**Test:** Issue a run, attempt to modify input/output/assignment fields, assert all rejected.

### Property 6: Audit Hash Determinism
For a given (runId, toolId, toolVersion, input, output, issuedAt), the SHA-256 hash is always identical.

**Validates: Requirements 10.1, 10.5**

**Test:** Compute hash 100 times with same inputs, assert all equal.

### Property 7: Pagination Consistency
Cursor-based pagination produces no duplicate items and no gaps when iterating through the full result set.

**Validates: Requirements 3.3, 3.4, 3.6**

**Test:** Insert N runs, paginate through all with pageSize=5, collect all items, assert count=N and no duplicate ids.

### Property 8: Retry Idempotency
If a ToolRun save succeeds on retry, the final persisted document is identical to what would have been persisted on the first attempt.

**Validates: Requirements 3.8**

**Test:** Simulate first-write failure, assert retry produces the same document content.

### Property 9: Export Filename Uniqueness
No two ExportRecords for the same ToolRun have the same filename.

**Validates: Requirements 4.5**

**Test:** Generate exports for a run, assert all filenames are distinct (different extensions guarantee this).

### Property 10: Coverage Integrity
Every Tool_Registry entry with a `calculatorDefinitionId` resolves to a registered definition, and every registered definition has a corresponding registry entry. This is a bidirectional invariant.

**Validates: Requirements 15.1, 15.2, 15.3**

**Test:** The coverage test asserts both directions and fails on any mismatch.

## Calculator Definition Enhancements (Priority Tool Groups)

### Group 1: Professional Fees & Proposals (Req 11)

| Definition | id | Key Enhancement |
|---|---|---|
| `feeCalculator.ts` | `fee_calculator_v1` | Bracket interpolation across 7 bodies, stage apportionment, 8+ table refs |
| `proposalComparison.ts` | `proposal_comparison_v1` | Weighted normalised scoring matrix, weights sum to 100% |
| `softCostEstimator.ts` | `soft_cost_estimator_v1` | Professional + municipal fees + contingency, 6 aggregates |

### Group 2: SANS/NBR Compliance (Req 12)

| Definition | id | Key Enhancement |
|---|---|---|
| `fenestrationN.ts` | `fenestration_n_v1` | Per-room 5%/10% checks, ClauseResult per room |
| `rvalue.ts` | `rvalue_calc_v1` | Material layer summation, climate zone comparison |
| `xaEnergyCompliance.ts` | `xa_energy_v1` | Whole-building envelope: roof, walls, glazing ratio |
| `fireComplianceCheck.ts` | `fire_compliance_v1` | Travel distance, exit width, FRR, compartment area, sprinklers |

### Group 3: BoQ/BoM/Takeoff (Req 13)

| Definition | id | Key Enhancement |
|---|---|---|
| `boqTakeoff.ts` | `boq_takeoff_v1` | Rate build-up, contingency, JBCC/GCC sections, invalid-row skip |
| `materialProcurement.ts` | `material_procurement_v1` | Priority grouping, VAT at 15%, order value calc |

### Group 4: Contractor Commercial (Req 14)

| Definition | id | Key Enhancement |
|---|---|---|
| `paymentClaimBuilder.ts` | `payment_claim_v1` | Net claim per cert, retention, platform fee, escrow calc |
| `workforceTimesheet.ts` | `workforce_timesheet_v1` | Grade-based OT, PAYE/UIF/SDL deductions |
| `plantRegister.ts` | `plant_register_v1` | Active/standby cost, internal/external hire |
| `tenderBidBench.ts` | `tender_bid_bench_v1` | BoQ pricing, margin, total bid price |

### Common patterns across all enhanced definitions:

1. **Zod inputSchema** — strict validation with meaningful error messages
2. **Zod scheduleSchema** — per-row validation, invalid rows excluded with warnings
3. **tableRefs** — minimum 1 versioned guideline table per definition
4. **clauseSet** — at least 1 ClauseCheckDef per compliance tool; advisory clauses for commercial tools
5. **reportTemplateId** — non-empty, matching an HTML export template
6. **source** — GuidelineSource citing SANS/tariff provenance with version and status
7. **disclaimers** — at least one advisory notice

## South African Context Implementation

### Currency Formatting

```typescript
export function formatZAR(amount: number): string {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  // Output: "R 1 250 000,00"
}
```

### Clause Reference Format

All SANS references follow: `SANS {number}-{part} {clause}` (e.g., "SANS 10400-XA 4.3.2")

### Tariff References

Professional body tariffs cite: `{body} {year} GG No. {gazette_number}`
- SACAP 2024 GG No. 12345
- ECSA 2024 GG No. 12346
- SACQSP 2024 GG No. 12347

### Default Jurisdiction

`jurisdiction` defaults to `'ZA'` in all table resolutions. If supplied and not matching any available table version's jurisdiction, the engine fails with `UNSUPPORTED_JURISDICTION`.

## Coverage Test Design

**File:** `src/services/toolbox/definitions/coverage.test.ts` (enhance existing)

```typescript
describe('Toolbox Registry Coverage', () => {
  // Req 15.1: Every registry entry with calculatorDefinitionId resolves
  it('every registry tile resolves to a registered definition');
  
  // Req 15.2: Every definition has a registry entry
  it('every registered definition has a registry tile');
  
  // Req 15.3: No unwired tiles (except admin_governance exclusions)
  it('no registry tile lacks calculatorDefinitionId unless excluded');
  
  // Req 15.4: Every compute function runs without throwing
  it('every definition compute executes within 5s with sample input');
  
  // Req 15.5: New additions detected
  it('fails on new tile without definition');
  
  // Req 15.6: Reports specific toolId on failure
  // (inherent in assertion message formatting)
});

// Exclusion array
export const COVERAGE_EXCLUSIONS: string[] = [
  // Only admin_governance category tools may be excluded
];
```

## Error Handling

| Error Code | HTTP | When | User Message |
|---|---|---|---|
| `NO_DEFINITION` | 400 | Tool has no registered Calculator_Definition | "This tool is not yet available." |
| `INVALID_INPUT` | 422 | Top-level input fails Zod validation | Field-specific error messages |
| `INVALID_SCHEDULE_ROW` | 422 | Schedule row fails validation | Row index + field errors |
| `GENERIC_OUTPUT_DETECTED` | 500 | Compute returns all-empty/zero | "Tool produced no meaningful output." |
| `COMPUTE_FAILED` | 500 | Compute throws unhandled exception | "Calculation failed. Input preserved for diagnostics." |
| `UNSUPPORTED_JURISDICTION` | 400 | Jurisdiction not in table set | Lists available jurisdictions |
| `RUN_LOCKED` | 409 | Attempt to modify issued run | "This run is locked. Use revision workflow." |
| `REASSIGNMENT_NOT_PERMITTED` | 409 | Reassign from non-`none` mode | "Cannot reassign from current mode." |
| `MISSING_TABLE` | 500 | Required guideline table not found | "Required reference data unavailable: {tableId}" |

## Security Considerations

- **Tenant isolation:** All Firestore queries include `tenantId` in the path. No cross-tenant data access.
- **Role checks:** Engine validates `tool.roles.includes(context.userRole)` before execution.
- **Project access:** Internal project assignment validates user has read access to the project.
- **Immutability:** Locked runs reject all mutations at the service layer; Firestore rules enforce `locked == true` prevents writes except status → superseded.
- **Demo isolation:** Demo mode writes to `demo/{uid}/` path — sandboxed per user.
- **Input sanitization:** All inputs pass through Zod schemas before any computation or persistence.

## Performance Considerations

- **Computation timeout:** Calculator definitions should complete within 5000ms (coverage test enforces this).
- **Pagination:** Default page size 20, max 50 — prevents over-fetching.
- **Export pre-generation:** Exports generated once on completion, served from cache on subsequent requests.
- **Guideline table caching:** `GuidelineTableStore` singleton caches all versions in memory after first hydration.
- **Lazy registration:** Calculator definitions registered at module-load time via tree-shaking-friendly side effects.

## Migration and Rollout

1. **Phase 1:** Deploy enhanced engine + Firestore repository alongside existing InMemoryRepository (feature flag: `USE_FIRESTORE_RUNS`)
2. **Phase 2:** Run classification audit to baseline current state
3. **Phase 3:** Enhance priority tool group definitions to production grade
4. **Phase 4:** Enable Firestore persistence for all runs
5. **Phase 5:** Run coverage test in CI — fail builds on regression

The existing `InMemoryToolRunRepository` remains as the test double. Production wires `FirestoreToolRunRepository`. The toggle is at the composition root (`src/services/toolboxEngine/index.ts`).

## Testing Strategy

### Unit Tests (Vitest)

1. **AuditClassificationService** — test each grade path with mock registry/definitions
2. **ToolboxEngine** — test validation gates, generic output detection, preview disclaimer injection, retry on failure
3. **FirestoreToolRunRepository** — test CRUD with Firestore mocks, pagination, demo path switching
4. **ExportService** — test JSON/CSV/HTML generation, filename patterns, template rendering
5. **AuditSnapshotService** — test SHA-256 determinism, lock enforcement
6. **IntegrationEventBus** — test retry backoff, failure escalation
7. **ProjectAssignmentService** — test validation, reassignment rules
8. **Each Calculator Definition** — test compute with valid inputs, edge cases, clause outcomes, missing table errors

### Property-Based Tests (Vitest + fast-check)

Properties 1–10 from the Correctness Properties section are encoded as property-based tests using `fast-check` generators for:
- Random tool registry configurations
- Random valid/invalid inputs per Zod schema
- Random ToolRun states for immutability checks
- Random pagination sequences

### Integration Tests

- Coverage test (`coverage.test.ts`) — registry ↔ definition bidirectional wiring
- End-to-end engine run with real definitions and guideline table store
- Firestore persistence round-trip (using Firebase emulator)

### Test File Locations

- `src/services/toolbox/auditClassificationService.test.ts`
- `src/services/toolboxEngine/engine.test.ts`
- `src/services/toolboxEngine/firestoreRepository.test.ts`
- `src/services/toolbox/definitions/coverage.test.ts`
- `src/services/toolbox/definitions/*.test.ts` (per definition)

## Dependencies

### Existing (no new packages needed)
- `zod` — input/schedule validation (already in project)
- `firebase/firestore` — persistence (already in project)
- `@/lib/firebase` — client Firestore instance

### Built-in (Node.js)
- `crypto.subtle` (browser) / `crypto` (Node) — SHA-256 for audit snapshots

## Requirements Traceability

| Requirement | Design Component |
|---|---|
| Req 1 (Classification Audit) | AuditClassificationService |
| Req 2 (Placeholder Enforcement) | ToolboxEngine validation gates |
| Req 3 (Persistence) | FirestoreToolRunRepository |
| Req 4 (Export Pipeline) | Enhanced ExportService |
| Req 5 (Project Assignment) | Enhanced ProjectAssignmentService |
| Req 6 (Downstream Writeback) | Enhanced IntegrationEventBus |
| Req 7 (Input Validation) | ToolboxEngine Zod validation gate |
| Req 8 (Versioned Sources) | tableResolver + GuidelineTableStore |
| Req 9 (SA Context) | formatZAR, jurisdiction defaults, clause format |
| Req 10 (Audit Snapshot) | Enhanced AuditSnapshotService (SHA-256) |
| Req 11 (Fees/Proposals) | Enhanced feeCalculator, proposalComparison, softCostEstimator |
| Req 12 (SANS Compliance) | Enhanced fenestrationN, rvalue, xaEnergy, fireCompliance |
| Req 13 (BoQ/BoM) | Enhanced boqTakeoff, materialProcurement |
| Req 14 (Contractor Commercial) | Enhanced paymentClaimBuilder, workforceTimesheet, plantRegister, tenderBidBench |
| Req 15 (Coverage Test) | Enhanced coverage.test.ts |
