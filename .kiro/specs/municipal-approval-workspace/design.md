# Design Document: Municipal Approval Readiness Workspace

## Overview

This design implements the Municipal Approval Readiness Workspace as a self-contained module within Module 4 (Compliance & Municipal Readiness). It follows the SpecForge workspace pattern: a header card, tabbed sub-views, stat cards, and deep integration with Project Passport, Action Centre, and the existing readiness pipeline.

The workspace surfaces existing municipal readiness infrastructure through a unified UI while adding four new engines: Land Use Scheme validation, Departmental Circulation Simulation, Submission Pack assembly, and Outcome Tracking.

## Architecture

### Module Structure

```
src/
├── components/
│   └── municipal-workspace/
│       ├── MunicipalApprovalWorkspace.tsx    # Main workspace component (route entry point)
│       ├── OverviewTab.tsx                    # Readiness overview dashboard
│       ├── LandUseCheckTab.tsx               # Land use scheme validation UI
│       ├── CirculationSimulatorTab.tsx        # Departmental simulation UI
│       ├── SubmissionPackTab.tsx             # Pack builder UI
│       ├── CertificateTab.tsx               # Certificate generation UI
│       └── OutcomeTrackingTab.tsx            # Outcome recording/timeline UI
├── services/
│   └── municipal-workspace/
│       ├── landUseSchemeService.ts           # Zone validation engine
│       ├── circulationSimulatorService.ts    # Departmental pre-check engine
│       ├── submissionPackService.ts          # Pack assembly + cross-reference
│       ├── certificateService.ts            # Certificate generation logic
│       ├── outcomeTrackingService.ts        # Outcome recording + analytics
│       └── workspaceOrchestratorService.ts  # Coordinates all sub-services
├── types/
│   └── municipalWorkspace.ts                # All new types for this module
└── data/
    └── land-use-schemes/
        ├── coj-zones.ts                      # Johannesburg zoning data
        ├── coct-zones.ts                     # Cape Town zoning data
        ├── tshwane-zones.ts                  # Tshwane zoning data
        └── index.ts                          # Scheme registry + lookup
```

### Integration Points

| Integration | Direction | Mechanism |
|-------------|-----------|-----------|
| Project Passport | Read + Write | Reads ProjectScopeFacts; writes assessment results, certificate records, outcomes |
| Readiness Pipeline | Read | Calls `assessMunicipalSubmissionReadiness()` to get existing pipeline output |
| SANS Calculators | Read | Consumes results from existing compliance calculators for Building Control & Fire department scores |
| Drawing Intelligence | Read | Consumes drawing analysis for completeness checks |
| Professional Verification | Read | Verifies SACAP/ECSA registration before accepting sign-offs |
| Action Centre | Write | Surfaces blockers, sign-off requests, and overdue items |
| SpecForge | Read + Write | Links compliance checks to specification items where relevant |
| Audit Trail | Write | Records all significant workspace actions |

### Data Flow

```
User enters workspace → Load ProjectScopeFacts from Passport
    → Run existing readiness pipeline (assessMunicipalSubmissionReadiness)
    → If land use input provided, run landUseSchemeService
    → Run circulationSimulatorService with all available data
    → Display unified results across tabs
    → User actions (sign-off, outcome record, pack export, cert generation)
    → Write back to Project Passport + Audit Trail
    → Surface actions in Action Centre
```

### Routing

```typescript
// In App.tsx route configuration
{
  path: '/compliance/municipal-approval-workspace',
  element: <MunicipalApprovalWorkspace />,
  roles: ['architect', 'engineer', 'town_planner', 'energy_professional', 'fire_engineer', 'quantity_surveyor', 'platform_admin'],
}
```

### Persistence (Firestore)

```
projects/{projectId}/municipal_workspace/
├── assessment           # Latest workspace assessment snapshot
├── land_use_checks/     # Historical land use check results
├── circulation_sims/    # Historical simulation results
├── sign_offs/           # Professional sign-off records
├── certificates/        # Generated certificate records
└── outcomes/            # Submission outcome records
```

## Components and Interfaces

### UI Component Pattern

The workspace follows the SpecForge pattern exactly:

```
┌─────────────────────────────────────────────────────────────────┐
│  Architex OS Header (breadcrumb: Compliance Hub > Municipal     │
│  Approval Workspace)                                            │
├────────┬────────────────────────────────────────────────────────┤
│  Mini  │  ┌──────────────────────────────────────────────────┐  │
│  Nav   │  │  Header Card                                     │  │
│        │  │  "MUNICIPAL APPROVAL READINESS" (xs, uppercase)  │  │
│        │  │  Project Name (2xl, bold)                        │  │
│        │  │  Municipality · Erf · Submission Type            │  │
│        │  ├──────────────────────────────────────────────────┤  │
│        │  │  Advisory Notice Banner (amber border)           │  │
│        │  │  "All assessments are indicative and advisory…"  │  │
│        │  ├──────────────────────────────────────────────────┤  │
│        │  │  Tabs: Overview | Land Use | Simulation |        │  │
│        │  │        Pack | Certificate | Outcomes             │  │
│        │  ├──────────────────────────────────────────────────┤  │
│        │  │  Active Tab Content                              │  │
│        │  └──────────────────────────────────────────────────┘  │
└────────┴────────────────────────────────────────────────────────┘
```

### Service Contracts

#### workspaceOrchestratorService.ts

The orchestrator coordinates all sub-services and integrates with the existing readiness pipeline:

```typescript
// Runs full workspace assessment — calls existing pipeline + new engines
function assessWorkspaceReadiness(project: ProjectScopeFacts, landUseInput?: LandUseCheckInput): WorkspaceAssessment;

// Writes results back to Project Passport
function persistWorkspaceResults(projectId: string, assessment: WorkspaceAssessment): Promise<void>;

// Generates Action Centre events from assessment blockers
function generateWorkspaceActions(assessment: WorkspaceAssessment): SubmissionInboxEvent[];
```

#### landUseSchemeService.ts

```typescript
// Validates project parameters against zone definition
function validateLandUse(input: LandUseCheckInput): LandUseCheckResult;

// Looks up zone definition from scheme database
function findZoneDefinition(municipalityId: MunicipalityType, zoneCode: string): ZoneDefinition | null;

// Lists all zones for a municipality
function listZones(municipalityId: MunicipalityType): ZoneDefinition[];

// Calculates required parking based on land use and GFA
function calculateRequiredParking(zone: ZoneDefinition, landUse: string, grossFloorArea: number): number;
```

#### circulationSimulatorService.ts

```typescript
// Runs full departmental simulation
function simulateCirculation(
  project: ProjectScopeFacts,
  landUseResult: LandUseCheckResult,
  readinessAssessment: ReadinessAssessment
): CirculationSimulationResult;

// Runs single department assessment
function assessDepartment(
  departmentId: DepartmentId,
  project: ProjectScopeFacts,
  supplementaryData: Record<string, unknown>
): DepartmentAssessment;
```

#### submissionPackService.ts

```typescript
// Determines required documents for municipality + submission type
function determineRequiredDocuments(municipality: MunicipalityType, submissionType: string): SubmissionPackDocument[];

// Assembles pack from project data, checking availability
function assembleSubmissionPack(
  project: ProjectScopeFacts,
  municipality: MunicipalityType,
  submissionType: string
): SubmissionPack;

// Validates cross-references across pack documents
function validateCrossReferences(pack: SubmissionPack, project: ProjectScopeFacts): string[];

// Exports assembled pack (returns document metadata for PDF generation)
function exportPack(pack: SubmissionPack): PackExportManifest;
```

#### certificateService.ts

```typescript
// Checks if all prerequisites for certificate generation are met
function checkCertificatePrerequisites(
  readinessScore: number,
  signOffs: ProfessionalSignOff[],
  packCompleteness: SubmissionPack['completeness'],
  departmentScores: DepartmentAssessment[]
): { ready: boolean; unmetConditions: string[] };

// Generates the certificate
function generateCertificate(
  projectId: string,
  projectName: string,
  erfNumber: string,
  municipality: MunicipalityType,
  readinessScore: number,
  departmentScores: Record<DepartmentId, number>,
  signOffs: ProfessionalSignOff[]
): MunicipalReadyCertificate;
```

#### outcomeTrackingService.ts

```typescript
// Records a new submission event
function recordSubmission(outcome: Omit<SubmissionOutcome, 'id'>): SubmissionOutcome;

// Updates outcome status
function updateOutcome(id: string, update: Partial<SubmissionOutcome>): SubmissionOutcome;

// Calculates first-time approval rate
function calculateApprovalRate(outcomes: SubmissionOutcome[]): { rate: number; total: number; firstTime: number };

// Gets all outcomes for a project
function getProjectOutcomes(projectId: string): SubmissionOutcome[];
```

## Data Models

### Land Use Scheme Types

```typescript
interface ZoneDefinition {
  id: string;
  municipalityId: MunicipalityType;
  schemeName: string;
  zoneCode: string;           // e.g., "SR1", "GB2"
  zoneName: string;           // e.g., "Single Residential Zone 1"
  permittedUses: string[];
  consentUses: string[];
  parameters: DevelopmentParameters;
}

interface DevelopmentParameters {
  maxCoverage: number;         // percentage (0-100)
  maxFAR: number;              // ratio (e.g., 0.6)
  maxHeight: number;           // metres
  buildingLines: {
    front: number;
    rear: number;
    sides: number;
    streetSide?: number;
  };
  maxDensity?: number;         // units per hectare
  parkingRatios: ParkingRequirement[];
}

interface ParkingRequirement {
  landUseType: string;
  ratioDescription: string;    // e.g., "1 bay per 25m² GLA"
  baysPerUnit: number;
  unitMeasure: string;         // "m²_gla" | "dwelling_unit" | "seat" | "bed"
}

interface LandUseCheckInput {
  municipalityId: MunicipalityType;
  zoneCode: string;
  proposedCoverage: number;
  proposedFAR: number;
  proposedHeight: number;
  proposedSetbacks: {
    front: number;
    rear: number;
    sides: number;
    streetSide?: number;
  };
  proposedParkingBays: number;
  proposedLandUse: string;
  grossFloorArea?: number;     // for parking ratio calculation
  dwellingUnits?: number;      // for density check
  erfArea: number;             // m²
}

interface LandUseCheckResult {
  status: 'pass' | 'fail' | 'zone_not_found';
  checks: LandUseParameterCheck[];
  consentRequired: boolean;
  consentUses: string[];
  zone?: ZoneDefinition;
}

interface LandUseParameterCheck {
  parameter: string;
  proposedValue: number;
  permittedMax: number;
  unit: string;
  status: 'pass' | 'fail';
  excess?: number;
}
```

### Circulation Simulator Types

```typescript
type DepartmentId =
  | 'town_planning'
  | 'building_control'
  | 'fire'
  | 'water_sanitation'
  | 'roads_transport'
  | 'electrical'
  | 'environmental'
  | 'heritage';

interface DepartmentAssessment {
  departmentId: DepartmentId;
  departmentName: string;
  confidenceScore: number;      // 0-100
  status: 'pass' | 'attention' | 'fail' | 'insufficient_data';
  checksTotal: number;
  checksPassed: number;
  dataGaps: string[];
  actionItems: string[];
}

interface CirculationSimulationResult {
  overallConfidence: number;
  departments: DepartmentAssessment[];
  simulatedAt: string;
  advisoryNotice: string;
}
```

### Submission Pack Types

```typescript
interface SubmissionPackDocument {
  id: string;
  title: string;
  category: 'form' | 'drawing' | 'supporting' | 'cover';
  sequenceNumber: number;
  status: 'included' | 'missing' | 'draft_only' | 'placeholder';
  sourceRef?: string;           // reference to drawing register or document store
  prePopulated: boolean;
}

interface SubmissionPack {
  municipality: MunicipalityType;
  submissionType: string;
  documents: SubmissionPackDocument[];
  coverSheet: { projectName: string; erfNumber: string; applicant: string };
  tableOfContents: string[];
  completeness: { total: number; included: number; missing: number };
  crossReferenceErrors: string[];
}
```

### Certificate Types

```typescript
interface MunicipalReadyCertificate {
  certificateNumber: string;
  projectId: string;
  projectName: string;
  erfNumber: string;
  municipality: MunicipalityType;
  issuedAt: string;
  overallReadinessScore: number;
  departmentScores: Record<DepartmentId, number>;
  professionalSignOffs: ProfessionalSignOff[];
  completenessStatement: string;
  advisoryDisclaimer: string;
}

interface ProfessionalSignOff {
  discipline: string;
  professionalName: string;
  registrationNumber: string;
  registrationBody: 'SACAP' | 'ECSA' | 'SACPLAN' | 'Other';
  signedAt: string;
  declaration: string;
  verified: boolean;
}
```

### Outcome Tracking Types

```typescript
type SubmissionOutcomeStatus =
  | 'submitted'
  | 'approved_first_time'
  | 'approved_with_conditions'
  | 'returned_for_amendments'
  | 'refused';

interface SubmissionOutcome {
  id: string;
  projectId: string;
  municipality: MunicipalityType;
  submissionType: string;
  referenceNumber: string;
  submissionDate: string;
  readinessScoreAtSubmission: number;
  departmentScoresAtSubmission: Record<DepartmentId, number>;
  outcome: SubmissionOutcomeStatus;
  returnReasons?: { department: DepartmentId; reason: string }[];
  timeToDecision?: number;     // days
  updatedAt: string;
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Land Use Validation Invariant

*For any* valid `LandUseCheckInput` and corresponding `ZoneDefinition`, each parameter check status SHALL be 'pass' if and only if the proposed value is at or below the zone's permitted maximum. When a parameter fails, the reported excess SHALL equal `proposedValue - permittedMax`. Additionally, `consentRequired` SHALL be true if and only if the proposed land use appears in the zone's `consentUses` list.

**Validates: Requirements 3.3, 3.4, 3.6**

### Property 2: Confidence Score Bounds and Formula

*For any* `DepartmentAssessment`, the `confidenceScore` SHALL be between 0 and 100 inclusive, and SHALL equal `(checksPassed / checksTotal) × 100` when no data gaps exist (i.e., `dataGaps.length === 0`).

**Validates: Requirements 4.2**

### Property 3: Data Gap Score Reduction

*For any* department assessment inputs, adding a data gap to the input SHALL result in a `confidenceScore` that is less than or equal to the score produced without that data gap, given the same checks passed and total.

**Validates: Requirements 4.3**

### Property 4: Certificate Prerequisites Gate

*For any* combination of readiness score, professional sign-offs, pack completeness, and department scores: the certificate generation function SHALL produce a certificate if and only if readiness score equals 100, all required sign-offs are present, submission pack has zero missing documents, and all department confidence scores are ≥ 70. When any condition is not met, `checkCertificatePrerequisites` SHALL return `ready: false` with an `unmetConditions` array listing exactly which conditions failed.

**Validates: Requirements 7.1, 7.6**

### Property 5: Submission Pack Completeness Invariant

*For any* assembled `SubmissionPack`, the `completeness.total` SHALL equal `completeness.included + completeness.missing`. All documents with status 'included' SHALL correspond to source documents with status 'available' or 'signed_off'. All required documents that are missing or have status 'draft' in the source SHALL appear with status 'missing' or 'draft_only' in the pack.

**Validates: Requirements 5.4, 5.6**

### Property 6: Cross-Reference Consistency

*For any* submission pack and project data, if a professional name appears on Form 1 but does not match any appointment record in the project scope facts, the cross-reference validator SHALL include an error string referencing that mismatch. Similarly, if a drawing number in the index does not match an uploaded drawing, an error SHALL be reported.

**Validates: Requirements 5.9**

### Property 7: Outcome Approval Rate Calculation

*For any* non-empty set of `SubmissionOutcome` records with terminal statuses (approved_first_time, approved_with_conditions, returned_for_amendments, or refused), the approval rate SHALL equal `(count of outcomes with status 'approved_first_time' / count of all terminal outcomes) × 100`, rounded to one decimal place.

**Validates: Requirements 8.4**

### Property 8: Zone Lookup Idempotence

*For any* `municipalityId` and `zoneCode`, calling `findZoneDefinition` multiple times with the same arguments SHALL always return the same `ZoneDefinition` object (or null), demonstrating referential transparency of the lookup function.

**Validates: Requirements 3.1, 3.2**

## Error Handling

### Land Use Scheme Engine

- **Zone not found**: When a zone code is not found in the database, return `{ status: 'zone_not_found' }` with a suggestion message to manually verify against the published scheme document. Do not throw.
- **Invalid input parameters**: If proposed values are negative or `erfArea` is zero, return a validation error before running checks. Use Zod schema validation at the service boundary.
- **Missing optional fields**: If `grossFloorArea` is not provided but parking calculation is needed, skip parking check and report it as a data gap rather than failing.

### Circulation Simulator

- **Incomplete data**: When input data for a department check is missing, report the data gap in `DepartmentAssessment.dataGaps[]` and reduce confidence proportionally. Never fail the entire simulation due to partial data.
- **External service failure**: If SANS calculator integration fails (network/timeout), mark affected department as `insufficient_data` and include the failure reason in `actionItems`.
- **Division by zero**: If `checksTotal` is 0 for a department, set `confidenceScore` to 0 and status to `insufficient_data`.

### Submission Pack Builder

- **Missing documents**: Flag as blockers in `completeness.missing` count and list in the pack's incomplete items. Do not prevent pack assembly — produce a partial pack with clear gap indicators.
- **Cross-reference mismatches**: Collect all mismatches into `crossReferenceErrors[]` array. Do not halt assembly on mismatch — report all errors for user resolution.
- **Export failure**: If PDF generation fails, return error metadata with the specific document that caused the failure. Allow retry of individual document export.

### Certificate Service

- **Prerequisites not met**: Return `{ ready: false, unmetConditions: string[] }` listing each unmet condition. Never generate a partial certificate.
- **Duplicate certificate request**: If a certificate already exists for the same project with the same readiness snapshot, return the existing certificate rather than generating a duplicate.

### Outcome Tracking

- **Invalid status transition**: Reject updates that attempt invalid status transitions (e.g., `refused` → `approved_first_time`). Return error with allowed transitions for current status.
- **Empty outcome set**: When calculating approval rate with no terminal outcomes, return `{ rate: 0, total: 0, firstTime: 0 }` rather than dividing by zero.

### General Error Strategy

- All services use typed error returns (discriminated unions) rather than thrown exceptions for expected error conditions.
- Unexpected errors (runtime exceptions) are caught at the orchestrator level, logged to the audit trail, and surfaced as user-friendly messages.
- Firestore write failures trigger retry with exponential backoff (max 3 attempts) before surfacing the error to the user.

## Testing Strategy

### Unit Tests (Vitest)

Unit tests cover specific examples, edge cases, and integration points:

- **Land Use Scheme**: Test specific zone lookups, boundary values (exactly at limit = pass), known municipality zone codes
- **Circulation Simulator**: Test individual department rule sets with known project configurations, verify status thresholds (pass ≥ 70, attention 40–69, fail < 40)
- **Submission Pack**: Test document ordering for each municipality, pre-population of Form 1–4 fields, cover sheet generation
- **Certificate**: Test prerequisite gate with various combinations of met/unmet conditions
- **Outcome Tracking**: Test status transition validation, timeline ordering
- **Role Access**: Test each role against workspace access and certificate generation permissions

### Property-Based Tests (fast-check)

Property-based tests verify universal correctness properties with minimum 100 iterations per property:

- **Library**: `fast-check` (TypeScript property-based testing library)
- **Configuration**: Minimum 100 iterations per property test
- **Tag format**: `Feature: municipal-approval-workspace, Property {N}: {title}`

Each correctness property from this design document maps to a single property-based test:

1. Land Use Validation Invariant — generate random `LandUseCheckInput` + `ZoneDefinition` pairs, verify pass/fail logic and excess calculations
2. Confidence Score Bounds — generate random `DepartmentAssessment` values, verify score is always 0–100 and formula holds when no gaps
3. Data Gap Score Reduction — generate assessments with/without gaps, verify monotonic score reduction
4. Certificate Prerequisites Gate — generate random combinations of prerequisites, verify gate logic is correct
5. Submission Pack Completeness — generate random document lists with various statuses, verify completeness arithmetic
6. Cross-Reference Consistency — generate packs with intentional mismatches, verify all are detected
7. Approval Rate Calculation — generate random outcome sets, verify rate formula
8. Zone Lookup Idempotence — generate random municipality + zone code pairs, verify repeated calls return same result

### Integration Tests

- Verify Firestore read/write for each workspace sub-collection
- Verify Action Centre event generation from workspace blockers
- Verify Project Passport write-back after assessment runs
- Verify professional verification service integration for sign-off acceptance

### End-to-End Tests (Playwright)

- Full workspace flow: load project → view overview → run land use check → view simulation → assemble pack → generate certificate
- Role access enforcement: verify restricted roles cannot access workspace
- Advisory language presence: verify disclaimer banner renders on all tabs
