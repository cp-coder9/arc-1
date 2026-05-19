# BEP / Architect Compatibility Inventory

Date: 2026-05-19

## Current state

The login page now exposes `BEP / Design Team` as the professional role choice. Architect is no longer presented as a separate user-role selection, but the codebase intentionally still keeps `architect` as a compatibility role/type and keeps several legacy Firestore field names.

## Compatibility principle

Do not rename Firestore fields abruptly. Keep legacy `architect*` names readable while introducing generic BEP/design-team aliases for new UI and future writes. This avoids breaking existing jobs, applications, invoices, reviews, file scans, and rules.

## Main legacy areas found

### Type model

- `UserRole` still includes `architect` for backwards compatibility.
- `Job.selectedArchitectId` still represents the selected professional/design lead.
- `Application.architectId` and `architectName` still represent the applicant professional.
- Several review, invoice, task, and project fields use `architectId` / `leadArchitectId`.
- SACAP-specific architect profile/verification interfaces remain correct where the statutory process is actually architect-specific.

### Firestore rules

Rules still reference:
- `selectedArchitectId`
- `architectId`
- `leadArchitectId`
- `architect_verifications`
- `architect_profiles`
- `hasRole('architect') || hasRole('bep')`

These must remain until every existing record has a compatibility alias or backfill.

### API/server profile sanitation

`api/index.ts` currently allows both `architect` and `bep` role profile field sets with mostly identical BEP/professional data fields. This is acceptable during migration.

### UI/tests/docs

Legacy component/test names still include:
- `ArchitectDashboard`
- `ArchitectProfile`
- `SACAPVerification`
- tests using `architect@example.com`, `architectId`, and `selectedArchitectId`
- docs referencing lead BEP/architect where compatibility is intentional

## Recommended migration plan

### Phase 1: Alias layer, no data migration

- Add helper naming functions:
  - `professionalIdFromJob(job)` reads `selectedProfessionalId ?? selectedBepId ?? selectedArchitectId`.
  - `applicationProfessionalId(application)` reads `professionalId ?? architectId`.
  - `leadProfessionalIdFromProject(project)` reads `leadProfessionalId ?? leadBepId ?? leadArchitectId`.
- Add write helpers that write both new and legacy fields where safe:
  - new: `selectedProfessionalId`, `professionalId`, `leadProfessionalId`
  - legacy mirror: `selectedArchitectId`, `architectId`, `leadArchitectId`
- Keep rules compatible with both fields.

### Phase 2: UI/docs cleanup

- Rename user-facing labels from Architect to BEP/design-team except statutory-specific contexts.
- Keep SACAP wording only for SACAP/architect registration checks.
- Rename or wrap `ArchitectDashboard` behind `BEPDashboard`/design-team routing after test coverage exists.

### Phase 3: Backfill and hard migration

- Create a one-off admin migration/backfill script that adds professional aliases to existing records.
- Update Firestore rules to allow both old and new fields during a transition window.
- After live verification, remove UI dependency on legacy field names but keep read fallback for archived records.

## Next concrete step

Implement the read alias helpers and static tests first. This provides compatibility without a risky production data migration.
