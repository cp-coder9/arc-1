# Phase 4 AI Governance and Human Sign-off Policy

This policy implements the Phase 4 requirement that AI may assist professional workflows but must not certify, sign, approve compliance, release money, or replace responsible human judgement.

## Durable AI action log fields

Every persisted AI output used by technical briefs, checklist recommendations, compliance forms, drawing checks, or municipal summaries must store:

- `projectId`
- `actionKind`
- `actorUid` for the initiating human or service account
- `target.type` and `target.id`
- `prompt.provider`, `prompt.model`, and `prompt.promptVersion`
- optional prompt runtime metadata such as `temperature`, `requestId`, and token usage
- `sourceReferences[]` with durable evidence IDs and optional hashes/URLs
- normalized `confidence` from `0` to `1`
- `outputSummary`
- normalized risk `flags[]`
- `status`: `advisory`, `requires_review`, `human_confirmed`, or `rejected`
- `requiresHumanConfirmation`
- immutable `createdAt`

AI action logs are append-only governance artifacts. Corrections must be represented by a new log or a human review resolution, not by editing the original AI output.

## Review queue rules

An AI output must create or update an `ai_review_queue` item when either condition is true:

1. confidence is below `0.72`
2. one or more risk flags are present

Priority rules:

- `critical`: legal/compliance-risk flags such as `legal_or_compliance_risk`
- `high`: confidence below `0.45`
- `medium`: confidence below `0.72`
- `low`: flagged output that does not otherwise meet the higher priority rules

Critical items are assigned to admin governance review. Non-critical technical/compliance items are assigned to a BEP or compliance reviewer depending on the workflow context.

## Human-only sign-off controls

The following domains require explicit human sign-off records:

- compliance declarations
- professional certificates
- municipal submission confirmations
- escrow release confirmations
- appointment acceptance

AI and system actors cannot create human sign-off records. Compliance, professional certificate, and municipal submission sign-offs require a verified BEP, verified architect, or admin governance override. Escrow release requires a client or admin signer until the legal/payment provider operating model is finalized.

Each sign-off stores `humanConfirmed: true`, `aiMayNotSign: true`, immutable timestamp metadata, the target workflow item, and any advisory AI log IDs the signer reviewed.

## Municipal/checklist governance gaps still needing human confirmation

Before production launch, humans must confirm:

- launch municipality list and whether each portal permits API, manual upload, or browser automation
- accepted evidence standards for municipal status changes
- checklist template source authority by municipality, stage, and discipline
- compliance form authority, versioning rules, and retention periods
- who may override an AI review queue item and what audit reason is mandatory

## Implementation reference

The service guardrails are implemented in `src/services/aiGovernanceService.ts` with unit coverage in `src/services/__tests__/aiGovernanceService.test.ts`. Persistence route contracts are documented in `docs/backend/ai-governance-api-contract-examples.md`, and project-scoped AI issue routing/review contracts are documented in `docs/backend/ai-issue-review-api-contract-examples.md`.
