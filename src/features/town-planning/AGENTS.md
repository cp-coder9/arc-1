# Town Planning Feature Module

## Purpose

SPLUMA (Spatial Planning and Land Use Management Act) workflow management for South African land use applications. Covers the full lifecycle from application preparation through municipal decision, conditions compliance, and appeal.

## Ownership

- **Domain**: Compliance + Municipal Readiness (Module 4)
- **Primary roles**: `town_planner`, `architect`, `admin`, `developer`
- **Integration**: Writes to Project Passport, surfaces deadlines to Action Centre

## Local Contracts

### State Machine
Applications progress through stages:
```
preparation → submission → acknowledgement → circulation → advertising
→ comment_period → hearing → decision → conditions_compliance
```
Any stage → `withdrawn` is always permitted.

### Sequential Dependency Chain
```
SPLUMA (Land Use) → SDP (Site Development Plan) → Building Plan
```
Each step must complete (or be marked N/A) before the next can proceed.

### Conditions Register
Forward-only transitions: `outstanding → in_progress → fulfilled/waived`. No reverse.

### Access Control
Role-permission matrix in `types.ts`. Admin/platform_admin have full access. Town planner has workflow permissions. Client has view + comment only.

## Work Guidance

- All services use dependency injection for Firestore (testable without emulator)
- Zod schemas validate all external input before processing
- South African public holidays calculated per Public Holidays Act 36/1994
- Working day calculations exclude weekends and public holidays
- Reference numbers follow format: `TP-{TYPE}-{YEAR}-{SEQ}`

## Verification

```bash
npx tsc --noEmit -p tsconfig.app.json   # Zero type errors
npm test -- src/features/town-planning   # Unit + integration tests
```

## Child DOX Index

None (flat module structure with services/, adapters/, components/, __tests__/).
