# Requirements Document

## Introduction

The Professional Fee Proposal Builder is a multi-profession fee calculator and proposal builder tool within the Architex OS platform. It provides each of 12 built environment professions with a purpose-built calculator workspace, plus shared proposal generation, terms management, and run history tools. The tool lives under Toolboxes > Proposal & Appointment, operates standalone (no project required), but deeply integrates with Project Passport, Action Centre, Appointment workflow, and SpecForge when linked to a project.

This tool is distinct from the existing `feeEstimatorService.ts` which remains as a simpler client-facing soft-cost estimator. The Professional Fee Proposal Builder serves registered professionals calculating guideline fees per South African council body tariffs (SACAP, ECSA, SACQSP, SACPLAN, SAGC, SACLAP, SACPCMP). However, a client-facing "What will it cost?" estimation view is also provided, using the soft-cost estimator engine to give clients indicative professional fee ranges before appointment.

## Glossary

- **Fee_Engine**: The calculation module that computes professional fees for a given profession using that profession's formula type, inputs, complexity factor, stage weightings, and discount.
- **Profession_Profile**: A configuration record defining a specific profession's formula type, service stages, default weightings, discipline factor, applicable tariff source, and terminology.
- **Calculator_Workspace**: The UI view for a single profession providing all inputs, stage/sub-task selectors, and fee result display.
- **Proposal_Builder**: The module that assembles a fee calculation result into a formal proposal document with project details, client details, terms, and validity period.
- **Terms_Library**: A version-controlled collection of profession-specific terms and conditions templates with editable clauses.
- **Run_Record**: An immutable snapshot of a calculator execution including all inputs, outputs, metadata, and the source version used.
- **Source_Version**: A versioned record of fee guide/tariff data from an official council body, with status tracking (demo-seed, draft, verified, retired).
- **Platform_Spine**: The shared data bus connecting Project Passport, SpecForge, Action Centre, and Audit Trail.

## Requirements

### Requirement 1: Multi-Profession Calculator Engine

**User Story:** As a built environment professional, I want a fee calculator tailored to my profession's formula and tariff guidelines, so that I can produce accurate guideline-based fee calculations.

#### Acceptance Criteria

1. THE Fee_Engine SHALL support 12 distinct Profession_Profiles.
2. WHEN calculating for Architect, apply sliding scale formula per SACAP guidelines.
3. WHEN calculating for engineers, apply percentage-of-discipline-portion formula.
4. WHEN calculating for Fire Engineer, apply hybrid formula (base + hourly).
5. WHEN calculating for QS, support three fee basis options.
6. WHEN calculating for Town Planner, apply hybrid formula.
7. WHEN calculating for Land Surveyor, apply area/unit + beacon rates.
8. WHEN calculating for Interior Designer, apply design fee + procurement markup.
9. WHEN calculating for CPM, support three fee basis options.
10. WHEN a fee calculation completes, produce a complete result with all fee components.
11. FOR ALL valid inputs, serializing to JSON and back SHALL produce equivalent object.

### Requirement 2: Profession-Specific Stage Weighting

**User Story:** As a professional, I want to select and weight service stages specific to my profession.

### Requirement 3: SACAP Complexity Classification and Discount Controls

**User Story:** As a professional, I want complexity determined by official SACAP classification and discount with justification.

### Requirement 4: Editable Tariff Parameters

**User Story:** As a professional, I want to override default tariff values.

### Requirement 5: Fee Source Version Management

**User Story:** As a platform administrator, I want fee guide tariff values to be version-controlled.

### Requirement 6: Proposal Builder

**User Story:** As a professional, I want to generate a formal fee proposal document.

### Requirement 7: Terms and Conditions Library

**User Story:** As a professional, I want access to profession-specific terms templates.

### Requirement 8: Run Persistence and History

**User Story:** As a professional, I want to save, reopen, and export my fee calculations.

### Requirement 9: Platform Integration

**User Story:** As an Architex platform user, I want fee proposals to integrate with the project lifecycle.

### Requirement 10: Role-Based Access

**User Story:** As a platform administrator, I want profession-specific access controls.

### Requirement 11: Fee Guide Source Monitoring

**User Story:** As a platform administrator, I want automated monitoring of official council body tariff publications.

### Requirement 12: UI/UX Shell Integration

**User Story:** As an Architex user, I want the Fee Proposal Builder to render within the platform shell.

### Requirement 13: Disclaimers and Professional Responsibility

**User Story:** As a platform operator, I want clear disclaimers and professional responsibility gates.

### Requirement 14: Client-Facing Fee Estimation View

**User Story:** As a client, I want to estimate what professional fees might cost.

### Requirement 15: SACAP Gazetted Fee Table Integration

**User Story:** As an architect, I want the calculator to use official SACAP gazetted fee tables.
