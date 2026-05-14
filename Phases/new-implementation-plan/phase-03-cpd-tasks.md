# Phase 3 Tasks — CPD Learning, Certificates, Knowledge Integration

| Priority | Task | Complexity estimate | Dependencies | Completion criteria |
|---|---|---:|---|---|
| P0 | Add CPD course, quiz, attempt, record, and certificate types in [src/types.ts](src/types.ts:658) | M | Phase 1 roles | Types model points, pass criteria, certificate URL, transcript metadata, and audit fields |
| P0 | Add CPD Firestore rules | M | CPD types | Published courses are readable, admin writes courses, server/admin creates records |
| P0 | Create CPD service with quiz scoring and record issuance | L | Rules | Passing attempts create records and failing attempts do not award points |
| P0 | Create certificate generator using [pdf-lib](package.json:52) patterns | M | CPD service | Certificate uploads to Blob and records URL on CPD record |
| P1 | Build CPD hub UI for professionals | L | CPD service | Course list, video URL, quiz, progress, and certificate state render correctly |
| P1 | Add CPD tracker to architect dashboard | S | CPD records | Annual points summary displays from records, not editable user fields |
| P1 | Build admin CPD course manager | L | CPD types | Admin can create, publish, archive, and view courses and quiz questions |
| P1 | Integrate sanitized transcripts with [src/services/knowledgeService.ts](src/services/knowledgeService.ts:89) | M | Admin CPD manager | Published transcript creates pending knowledge entry with CPD tags |
| P2 | Add CPD notifications and tests | M | Notification type updates | Certificate-issued notifications respect preferences and tests pass |

