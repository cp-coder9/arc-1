# Requirements Document

## Introduction

The CPD Assessment Platform is a fully functional subsystem within the Architex Built Environment OS. It currently uses generic shadcn/ui Card-based layouts and legacy terminology. This feature refines the CPD platform aesthetics and terminology to align with the SpecForge/Architex liquid glass design system, updates UI language to match South African professional body conventions, streamlines workflow labels, enhances XA integration, and aligns the monetization model with the broader platform.

## Glossary

- **CPD_Platform**: The Professional Compliance Learning subsystem within Architex, comprising the CPD Hub, Assessment Runner, Certificate Viewer, Analytics Dashboard, and Admin Manager components.
- **Glass_Design_System**: The Architex liquid glass visual language consisting of utility classes (glass-panel, glass-tile, glass-record, glass-icon-box, glass-pill) and composite components (DashboardSection, StatCard, GlassTable, GlassChart).
- **Design_Tokens**: The CSS custom properties defined in `src/index.css` under `@theme inline` that govern colours, radii, and typography across the platform (e.g., `--primary: #005b4e`, `--secondary: #aeefe3`, `--accent: #9b7bd4`).
- **Professional_Body**: A South African regulatory body governing built environment professionals (SACAP, ECSA, SACPLAN, SACQSP, SAICE).
- **Compliance_Credit**: The unit of continuing professional development recognition, replacing the legacy term "CPD Credit" to align with SACAP/ECSA regulatory terminology.
- **Accreditation_Status**: The workflow state of an assessment, progressing from "Prepared for Accreditation" to "Accredited by [Body]" after professional body review.
- **XA_Compliance_Hub**: The SANS 10400-XA energy compliance module within Architex that tracks education completion and checklist progress.
- **Evidence_Upload**: A user-initiated action to attach external compliance documentation (PDFs of conference certificates, attendance records, or published papers) for manual verification.
- **Composite_Components**: Tier 2 UI components (DashboardSection, StatCard, GlassTable, GlassChart) that compose glass utility primitives into reusable dashboard patterns.
- **Monetization_Model**: The pricing structure for CPD course access: free partner-sponsored modules, paid dedicated courses (R150–R400), and a 20% platform fee with 80% revenue share to content owners.

## Requirements

### Requirement 1: Unified UI Terminology — Primary Label Replacement

**User Story:** As a built environment professional, I want the platform to use "Professional Compliance Learning" terminology, so that the interface aligns with SACAP/ECSA regulatory language and professional expectations.

#### Acceptance Criteria

1. WHEN the CPD_Platform renders any navigation element, heading, or button label, THE CPD_Platform SHALL display "Professional Compliance Learning" in place of "CPD Assessment" text.
2. WHEN the CPD_Platform renders credit-related labels or descriptions, THE CPD_Platform SHALL display "Compliance Credit" in place of "CPD Credit" text.
3. THE CPD_Platform SHALL apply the terminology replacement consistently across all six CPD component files (CPDHub, CPDMainPage, CPDAssessmentRunner, CPDCertificateViewer, CPDAnalyticsDashboard, AdminCPDManager).

### Requirement 2: Unified UI Terminology — Certificate Verification Badge

**User Story:** As a learner viewing a certificate, I want to see a "Verified by [Body]" badge, so that the certificate clearly communicates its accreditation source.

#### Acceptance Criteria

1. WHEN a certificate is displayed and the certificate has an associated Professional_Body, THE CPD_Platform SHALL render a badge with the text "Verified by [Professional_Body name]" (e.g., "Verified by SACAP").
2. WHEN a certificate is displayed and the Professional_Body is ECSA, THE CPD_Platform SHALL render a badge with the text "Approved by ECSA" instead of "Verified by ECSA".
3. IF a certificate has no associated Professional_Body, THEN THE CPD_Platform SHALL render a generic "Verification Pending" badge.

### Requirement 3: Glass Design System Adoption — Layout Refactoring

**User Story:** As a platform user, I want the CPD interface to match the visual quality of other Architex tools, so that the experience feels cohesive and professional across the entire OS.

#### Acceptance Criteria

1. THE CPD_Platform SHALL replace all shadcn/ui Card-based section wrappers with DashboardSection Composite_Components for section-level containers.
2. THE CPD_Platform SHALL replace all inline metric display cards with StatCard Composite_Components.
3. THE CPD_Platform SHALL replace all tabular data displays with GlassTable Composite_Components.
4. THE CPD_Platform SHALL replace all chart containers with GlassChart Composite_Components.
5. THE CPD_Platform SHALL apply glass-panel, glass-tile, glass-record, glass-icon-box, and glass-pill utility classes as the primary surface styling mechanism across all CPD views.

### Requirement 4: Glass Design System Adoption — Token Compliance

**User Story:** As a design system maintainer, I want the CPD components to use only the existing Design_Tokens, so that theme consistency is maintained without introducing new colour values.

#### Acceptance Criteria

1. THE CPD_Platform SHALL reference only existing Design_Tokens for all colour values (--primary, --secondary, --accent, --background, --card, --foreground, and their variants).
2. THE CPD_Platform SHALL NOT introduce any new CSS custom properties or hardcoded colour values outside the established token system.
3. THE CPD_Platform SHALL use `lucide-react` as the exclusive icon library across all CPD component files.
4. THE CPD_Platform SHALL apply the same button styles (glass-button, glass-button-solid) and input styles (glass-input) used by other Architex tools.

### Requirement 5: Workflow Label Streamlining — Assessment Status

**User Story:** As a course administrator, I want assessment status labels to reflect accreditation workflow, so that learners understand the review state without implying content is unverified.

#### Acceptance Criteria

1. THE CPD_Platform SHALL NOT display an "AI-Generated" label on any assessment or course content.
2. WHEN an assessment has been created but not yet reviewed by a Professional_Body, THE CPD_Platform SHALL display the Accreditation_Status "Prepared for Accreditation".
3. WHEN an assessment has been reviewed and approved by a Professional_Body, THE CPD_Platform SHALL display the Accreditation_Status "Accredited by [Body name]".
4. WHEN the CPD_Platform renders a course listing, THE CPD_Platform SHALL display the Accreditation_Status badge adjacent to the course title.

### Requirement 6: Workflow Label Streamlining — Evidence Upload

**User Story:** As a learner with external CPD evidence, I want to upload supporting documents from the certificate view, so that I can submit conference certificates, attendance records, or published papers for manual verification.

#### Acceptance Criteria

1. WHEN a user views a certificate in the CPDCertificateViewer, THE CPD_Platform SHALL display an "Evidence Upload" button.
2. WHEN the user activates the "Evidence Upload" button, THE CPD_Platform SHALL present a file selection interface accepting PDF files.
3. WHEN the user submits a valid PDF file, THE CPD_Platform SHALL upload the file and associate it with the certificate record.
4. WHEN the upload completes successfully, THE CPD_Platform SHALL display a confirmation message and list the uploaded evidence item on the certificate view.
5. IF the user submits a file that is not a valid PDF, THEN THE CPD_Platform SHALL display an error message stating that only PDF files are accepted.

### Requirement 7: XA Integration — Education Completion Sync

**User Story:** As a professional completing SANS 10400-XA CPD modules, I want my progress to automatically update the XA Compliance Hub, so that my compliance education status stays current without manual intervention.

#### Acceptance Criteria

1. WHEN a user completes a SANS 10400-XA tagged CPD module, THE CPD_Platform SHALL update the XA_Compliance_Hub status to "Education Complete" for that user.
2. WHEN a user completes a SANS 10400-XA tagged CPD module, THE CPD_Platform SHALL trigger a notification in the Project Command Centre indicating XA education completion.
3. IF the XA_Compliance_Hub status update fails, THEN THE CPD_Platform SHALL log the failure and retry the update within 30 seconds.

### Requirement 8: XA Integration — Compliance Learning Path

**User Story:** As an energy professional, I want a guided learning path in the XA Hub, so that I understand what CPD modules unlock full XA checklist access.

#### Acceptance Criteria

1. THE CPD_Platform SHALL display a "Compliance Learning Path" section within the XA_Compliance_Hub interface.
2. THE CPD_Platform SHALL display a progress indicator showing the number of completed XA-tagged CPD modules out of the 3 required.
3. WHEN a user has completed fewer than 3 XA-tagged CPD modules, THE CPD_Platform SHALL display the message "Complete 3 CPD modules to unlock full XA checklist".
4. WHEN a user has completed 3 or more XA-tagged CPD modules, THE CPD_Platform SHALL unlock the full XA checklist and display "Learning Path Complete" status.

### Requirement 9: Monetization Model Alignment

**User Story:** As a platform operator, I want the CPD pricing model to align with the SpecForge model, so that revenue structure is consistent across all Architex product lanes.

#### Acceptance Criteria

1. WHEN a course is partner-sponsored, THE CPD_Platform SHALL display the course as "Free" with no price label.
2. WHEN a course is a paid dedicated course, THE CPD_Platform SHALL display the price in South African Rand within the range R150–R400 based on the course duration and credit value.
3. THE CPD_Platform SHALL apply a 20% platform fee on paid course transactions, with 80% allocated to the content owner.
4. WHEN the CPD_Platform displays course pricing, THE CPD_Platform SHALL categorise courses as either "Partner Sponsored" (free) or "Dedicated CPD Course" (paid).

### Requirement 10: Dark Theme Compatibility

**User Story:** As a user in a dark environment, I want the CPD interface to render correctly in the default dark theme, so that readability and contrast are maintained.

#### Acceptance Criteria

1. THE CPD_Platform SHALL render all text, icons, and surfaces using the dark theme Design_Tokens when the application theme is set to dark mode (the default).
2. THE CPD_Platform SHALL maintain a minimum contrast ratio of 4.5:1 between foreground text and background surfaces in both light and dark themes.
3. WHEN the user switches between light and dark themes, THE CPD_Platform SHALL update all CPD component surfaces without requiring a page reload.
