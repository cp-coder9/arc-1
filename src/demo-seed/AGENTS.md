# Demo Seed Data — AGENTS.md

## Purpose

Mock data seeding and Firestore persistence wrapper for the Architex demo sandbox. Provides realistic built-environment project data across all lifecycle stages for testing, training, and webinars.

## Ownership

- **Owner:** Demo feature
- **Files:** 8 files in `src/demo-seed/`
- **Dependencies:** `src/types.ts` (UserRole, SubmissionStatus, SubmissionIndexItem), `src/lib/firebase.ts`

## Local Contracts

1. **Seeding contract:** `seedAllData.ts#seedUserSandbox(uid)` writes ALL mock data under `/demo/{uid}/` in Firestore. Every seed replaces the entire sandbox — user changes since last seed are lost.
2. **Persistence contract:** `demoFirestore.ts` provides `useDemoDoc()`, `useDemoCol()`, `getDemoDoc()`, `getDemoCol()` that transparently prefix paths with `/demo/{uid}/` in demo mode. In live mode, these are pass-through.
3. **Import rule:** Every component that reads/writes Firestore in demo mode must use demoFirestore hooks instead of bare `doc(db, ...)`. This is what makes user data persist across page reloads.
4. **CPD data:** 6 articles, 4 assessments, 3 learning modules, 5 certificates (3 valid, 1 expiring soon, 1 expired)
5. **12 projects** across stages: brief_enquiry, shortlisted, appointed, concept_design, design_development, tender_documentation, construction, close_out
6. **`getProjectsForRole(role)`** filters projects by the demo role's involvement — used by dashboards to show relevant projects

## Key Types

| File | Exports |
|------|---------|
| `mockUsers.ts` | `MockUser`, `MOCK_USERS`, `MOCK_USER_LIST` |
| `mockProjects.ts` | `ProjectStage`, `MockProject`, `MOCK_PROJECTS`, `getProjectsForRole()` |
| `mockSubmissions.ts` | `MockSubmission`, `getSubmissionsForProject()` |
| `mockMessages.ts` | `MockMessage`, `getMessagesForProject()` |
| `mockCompliance.ts` | `MockComplianceCheck`, `MockFinding`, `getComplianceForProject()` |
| `mockCPD.ts` | `MockCPDArticle`, `MockCPDAssessment`, `MockCPDLearningModule`, `MockCPDCertificate` |
| `seedAllData.ts` | `seedUserSandbox(uid, force?)` |
| `demoFirestore.ts` | `useDemoDoc`, `useDemoCol`, `useDemoSubCol`, `useDemoStoragePath`, `getDemoDoc`, `getDemoCol`, `getDemoStorageRef`, `uploadDemoFile`, `buildDemoPathStr`, `buildDemoPath`, `getDemoPrefix` |

## Developer Notes

- When TypeScript model interfaces change, `mockProjects.ts` may throw type errors — update mock data to match
- Adding a new project: add to `MOCK_PROJECTS` array, add submissions/messages/compliance in respective files
- Storage uploads also go through `demoFirestore.ts` — not just Firestore reads/writes
- Batch commit limit: 500 writes per Firestore batch — seeder handles this automatically
- Demo Firebase project must not have analytics `measurementId` configured

## Child DOX Index

No child documents — single-directory module.
