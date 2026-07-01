# Implementation Plan: CPD Aesthetic Refinement

## Overview

Refactor the 6 existing CPD components to adopt the Architex liquid glass design system, update all terminology to "Professional Compliance Learning" language, add evidence upload and XA completion sync services, and align monetization display. Each component is refactored in-place, preserving existing Firestore logic while replacing shadcn/ui Card wrappers with composite components (DashboardSection, StatCard, GlassTable, GlassChart) and applying glass utility classes.

## Tasks

- [x] 1. Create new services and shared utilities
  - [x] 1.1 Create `evidenceUploadService.ts`
    - Create `src/services/evidenceUploadService.ts` with `EvidenceItem` interface, `UploadEvidenceInput`, `UploadEvidenceResult` types
    - Implement `uploadEvidence()` — validate PDF MIME type, upload to Vercel Blob via base64 JSON to `/api/files/upload`, create Firestore document in `cpd_evidence` collection
    - Implement `getEvidenceForCertificate()` — query Firestore for evidence items by certificateId
    - Reject non-PDF files with error "Only PDF files are accepted"
    - Reject files exceeding 50MB with "File too large" message
    - _Requirements: 6.2, 6.3, 6.4, 6.5_

  - [x] 1.2 Create `xaCompletionSyncService.ts`
    - Create `src/services/xaCompletionSyncService.ts` with `XACompletionStatus` interface
    - Implement `syncXACompletion()` — update `users/{userId}/xa_compliance` Firestore document, trigger Project Command Centre notification when education complete, retry on failure (max 3 attempts, 30s interval)
    - Implement `getXACompletionStatus()` — read current XA completion status for learning path UI
    - Set `educationComplete: true` when `completedModules.length >= 3`
    - _Requirements: 7.1, 7.2, 7.3, 8.1, 8.2, 8.3, 8.4_

  - [x] 1.3 Create shared badge and pricing utility functions
    - Create `src/services/cpdDisplayUtils.ts` with:
      - `getCertificateBadge(certificate)` — returns "Approved by ECSA" for ECSA, "Verification Pending" for missing body, "Verified by {body}" for all others
      - `getAccreditationBadge(course)` — returns "Prepared for Accreditation" or "Accredited by {body}"
      - `getCoursePricingLabel(course)` — returns "Partner Sponsored" (free) or "R{amount} — Dedicated CPD Course" (paid)
      - `calculatePlatformFee(price)` — returns { platformFeeRand, contentOwnerNetRand } at 20/80 split
    - _Requirements: 2.1, 2.2, 2.3, 5.2, 5.3, 9.1, 9.3, 9.4_

- [x] 2. Refactor CPDMainPage — navigation and layout shell
  - [x] 2.1 Refactor `src/components/cpd/CPDMainPage.tsx`
    - Remove `Card`, `CardContent`, `CardHeader` imports
    - Import `DashboardSection` from `@/components/composite`
    - Wrap sub-navigation in `glass-panel` class
    - Replace navigation buttons with `glass-button` / `glass-button-solid` classes
    - Update "CPD Hub" label to "Compliance Hub"
    - Replace all "CPD Assessment" text with "Professional Compliance Learning"
    - Ensure `lucide-react` is the exclusive icon library
    - _Requirements: 1.1, 1.3, 3.1, 3.5, 4.3, 4.4_

- [x] 3. Refactor CPDHub — main dashboard view
  - [x] 3.1 Refactor `src/components/cpd/CPDHub.tsx`
    - Remove `Card`, `CardContent`, `CardHeader`, `CardTitle`, `CardDescription` imports
    - Import `DashboardSection`, `StatCard`, `GlassTable` from `@/components/composite`
    - Replace section wrappers with `<DashboardSection title="..." icon={...}>`
    - Replace local `MetricCard` helper with `<StatCard label="..." value={...} icon={...} />`
    - Replace course listing with `<GlassTable>` using columns for title, provider, credits, status, price
    - Replace records listing with `<GlassTable>`
    - Replace certificate listing with `<GlassTable>`
    - Apply `glass-panel`, `glass-tile`, `glass-record`, `glass-pill` utility classes
    - Update terminology: "CPD Credit" → "Compliance Credit", remove "AI-Generated" labels
    - Add accreditation status badges using `getAccreditationBadge()`
    - Add pricing labels using `getCoursePricingLabel()`
    - _Requirements: 1.1, 1.2, 1.3, 3.1, 3.2, 3.3, 3.5, 4.1, 4.2, 4.3, 4.4, 5.1, 5.4, 9.1, 9.2, 9.4_

  - [ ]* 3.2 Write property test for course pricing categorisation
    - **Property 5: Course Pricing Categorisation**
    - Generate CPDCourse objects with `assessmentPriceRand` as 0, null, undefined, or positive numbers in [150, 400]
    - Verify "Partner Sponsored" for zero/null/undefined, "Dedicated CPD Course" for positive values
    - **Validates: Requirements 9.1, 9.4**

  - [ ]* 3.3 Write property test for platform fee calculation
    - **Property 6: Platform Fee Calculation**
    - Generate random positive numbers (150–400, 2 decimal precision)
    - Verify `platformFeeRand === price * 0.20`, `contentOwnerNetRand === price * 0.80`, and sum equals original price (within 2 decimal precision)
    - **Validates: Requirements 9.3**

- [x] 4. Refactor CPDAssessmentRunner — assessment and results views
  - [x] 4.1 Refactor `src/components/cpd/CPDAssessmentRunner.tsx`
    - Remove `Card` imports, import `DashboardSection`, `StatCard` from `@/components/composite`
    - Replace course landing and results sections with `<DashboardSection>`
    - Replace metric tiles with `<StatCard>`
    - Remove all "AI-Generated" labels
    - Display accreditation status badge adjacent to course title using `getAccreditationBadge()`
    - Display pricing using `getCoursePricingLabel()` with "Partner Sponsored" / "Dedicated CPD Course" labels
    - Apply glass utility classes throughout
    - Integrate `syncXACompletion()` call on completion of XA-tagged modules
    - Replace "CPD Assessment" → "Professional Compliance Learning", "CPD Credit" → "Compliance Credit"
    - _Requirements: 1.1, 1.2, 1.3, 3.1, 3.2, 3.5, 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 5.4, 7.1, 7.2, 9.1, 9.2, 9.4_

  - [ ]* 4.2 Write property test for accreditation status badge
    - **Property 2: Accreditation Status Badge Correctness**
    - Generate CPDCourse objects with random `accreditationReference` (string or falsy) and `professionalBodies` arrays
    - Verify "Prepared for Accreditation" when reference is falsy, "Accredited by {body}" when non-empty
    - **Validates: Requirements 5.2, 5.3**

- [x] 5. Refactor CPDCertificateViewer — certificate and evidence views
  - [x] 5.1 Refactor `src/components/cpd/CPDCertificateViewer.tsx`
    - Remove `Card` imports, import `DashboardSection` from `@/components/composite`
    - Replace section wrappers with `<DashboardSection>`
    - Add "Evidence Upload" button with file picker accepting PDF only
    - Integrate `uploadEvidence()` and `getEvidenceForCertificate()` from `evidenceUploadService`
    - Display uploaded evidence items as `glass-record` rows
    - Show confirmation message on successful upload
    - Show error "Only PDF files are accepted" for non-PDF files
    - Add "Verified by [Body]" / "Approved by ECSA" / "Verification Pending" badge using `getCertificateBadge()`
    - Apply glass utility classes throughout
    - Replace all "CPD" terminology with updated labels
    - _Requirements: 1.1, 1.3, 2.1, 2.2, 2.3, 3.1, 3.5, 4.1, 4.3, 4.4, 6.1, 6.2, 6.3, 6.4, 6.5_

  - [ ]* 5.2 Write property test for certificate verification badge
    - **Property 1: Certificate Verification Badge Correctness**
    - Generate random strings for `professionalBody`, including "ECSA", empty string, null, undefined, and arbitrary SA body names
    - Verify "Approved by ECSA" for ECSA, "Verification Pending" for falsy, "Verified by {body}" for all others
    - **Validates: Requirements 2.1, 2.2, 2.3**

  - [ ]* 5.3 Write property test for evidence file validation
    - **Property 3: Evidence File Validation**
    - Generate files with random MIME types (application/json, image/png, text/plain, etc.)
    - Verify all non-PDF files are rejected with appropriate error message
    - Verify no Firestore document or Blob upload is created for rejected files
    - **Validates: Requirements 6.5**

- [x] 6. Checkpoint — Core components complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Refactor CPDAnalyticsDashboard — charts and tables
  - [x] 7.1 Refactor `src/components/cpd/CPDAnalyticsDashboard.tsx`
    - Remove `Card` imports, import `DashboardSection`, `GlassTable`, `GlassChart` from `@/components/composite`
    - Replace chart containers with `<GlassChart>`
    - Replace analytics tables with `<GlassTable>`
    - Replace section headings with `<DashboardSection>`
    - Apply glass utility classes throughout
    - Replace all "CPD" terminology with updated labels
    - _Requirements: 1.1, 1.2, 1.3, 3.1, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4_

- [x] 8. Refactor AdminCPDManager — admin tables and status management
  - [x] 8.1 Refactor `src/components/cpd/AdminCPDManager.tsx`
    - Remove `Card` imports, import `DashboardSection`, `GlassTable` from `@/components/composite`
    - Replace admin tables with `<GlassTable>`
    - Replace section containers with `<DashboardSection>`
    - Apply `glass-pill` utility class to status badges
    - Apply glass utility classes throughout
    - Replace all "CPD" terminology with updated labels
    - _Requirements: 1.1, 1.2, 1.3, 3.1, 3.3, 3.5, 4.1, 4.2, 4.3, 4.4_

- [x] 9. XA Compliance Hub learning path UI
  - [x] 9.1 Add XA Learning Path section to XA Compliance Hub
    - Add "Compliance Learning Path" section using `DashboardSection`
    - Display progress indicator: completed XA-tagged modules out of 3 required
    - Show "Complete 3 CPD modules to unlock full XA checklist" when count < 3
    - Show "Learning Path Complete" and unlock full checklist when count >= 3
    - Integrate `getXACompletionStatus()` for reading current status
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [ ]* 9.2 Write property test for XA learning path threshold
    - **Property 4: XA Learning Path Threshold**
    - Generate non-negative integers (0–100) representing completed module counts
    - Verify message/unlock state switches correctly at threshold 3
    - **Validates: Requirements 8.3, 8.4**

- [x] 10. Dark theme compliance and token verification
  - [x] 10.1 Verify dark theme compatibility across all refactored components
    - Ensure all CPD components use only existing Design_Tokens (--primary, --secondary, --accent, --background, --card, --foreground and variants)
    - Verify no new CSS custom properties or hardcoded colour values introduced
    - Verify minimum 4.5:1 contrast ratio in dark theme
    - Confirm theme switching works without page reload
    - Remove any non-lucide-react icon imports
    - _Requirements: 4.1, 4.2, 10.1, 10.2, 10.3_

  - [ ]* 10.2 Write unit tests for terminology and design system compliance
    - Render each CPD component and assert "CPD Assessment" / "CPD Credit" do not appear
    - Verify DashboardSection, StatCard, GlassTable, GlassChart are used (no Card wrappers remain)
    - Query DOM for expected glass utility classes
    - Verify only lucide-react icon imports in CPD files
    - _Requirements: 1.1, 1.2, 1.3, 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.3_

- [x] 11. Final checkpoint — All tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties using `fast-check` via Vitest
- Unit tests validate specific examples and edge cases
- All 6 CPD component files are: CPDHub, CPDMainPage, CPDAssessmentRunner, CPDCertificateViewer, CPDAnalyticsDashboard, AdminCPDManager
- Composite components (DashboardSection, StatCard, GlassTable, GlassChart) already exist in `src/components/composite/`
- Terminology changes are display-only — no Firestore field name changes

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1", "5.1"] },
    { "id": 2, "tasks": ["3.1", "4.1", "5.2", "5.3"] },
    { "id": 3, "tasks": ["3.2", "3.3", "4.2", "7.1", "8.1"] },
    { "id": 4, "tasks": ["9.1"] },
    { "id": 5, "tasks": ["9.2", "10.1"] },
    { "id": 6, "tasks": ["10.2"] }
  ]
}
```
