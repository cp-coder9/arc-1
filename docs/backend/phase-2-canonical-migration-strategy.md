# Phase 2 Canonical Collection Migration Strategy

Date: 2026-05-15  
Scope: design note for moving from compatibility collections/routes toward the canonical Phase 2 Firestore collections without unsafe data loss or irreversible workflow side effects.

## Current decision status

No production data migration should run until a human product/data owner confirms the canonical strategy. The unresolved confirmation is tracked in `docs/phase-reports/human-confirmations-required.md`: keep current compatibility stores, migrate to canonical collections, or dual-write during a transition window.

This note recommends a safe staged path that can be implemented once that decision is made.

## Collections in scope

| Compatibility/current source | Canonical target | Migration posture |
|---|---|---|
| `users/{userId}` role/trust/profile fields | `role_profiles/{userId}` plus safe `directory_profiles/{userId}` projection | Split private role fields from public directory fields. Never let clients self-assert trust, verification, rating, or approval fields. |
| `jobs/{jobId}` open marketplace project records | `project_briefs/{briefId}` and `marketplace_opportunities/{opportunityId}` | Backfill brief records first, then publish explicit opportunities only for eligible/open jobs. Preserve original `jobId` as compatibility metadata. |
| `jobs/{jobId}/fee_proposals/{professionalId}` | `proposals/{proposalId}` | Backfill top-level proposal records with deterministic IDs or source pointers. Preserve human review and `autoAppointment: false`. |
| `technical_briefs/{briefId}` or client-intake records | `client_briefs/{briefId}` and `project_briefs/{briefId}` | Map intake to client brief, then technical scope to project brief. Keep interpretations advisory. |
| `appointment_contracts/{contractId}` and appointment-like project state | `appointments/{appointmentId}` plus project stage history | Migrate only after legal/binding acceptance policy is confirmed. Draft contracts must stay drafts if acceptance authority is unresolved. |
| project/job lifecycle audit fields | `project_stage_history/{historyId}` or project subcollections | Backfill append-only history entries, never rewrite original audit logs. |

## Recommended staged migration

### Stage 0: Freeze assumptions and choose mode

Human owner selects one mode:

1. **Compatibility-only:** keep current collections and expose canonical API aliases that project from compatibility data.
2. **Dual-read:** canonical endpoints read canonical collections first, then compatibility collections as fallback.
3. **Dual-write:** trusted APIs write both compatibility and canonical collections until backfill and consumers are switched.
4. **Canonical-only:** after validation, stop compatibility writes and keep compatibility reads as historical or archived views.

Default recommendation: use dual-read first, then dual-write for new writes, then backfill, then cut reads to canonical after reconciliation passes.

### Stage 1: Add deterministic source pointers

Every canonical record created from a compatibility source should include deterministic traceability:

```json
{
  "sourceSystem": "legacy_jobs",
  "sourcePath": "jobs/job-1",
  "sourceId": "job-1",
  "migrationBatchId": "phase2-backfill-2026-05-15T00:00:00Z",
  "schemaVersion": 1,
  "migratedAt": "2026-05-15T00:00:00.000Z"
}
```

### Stage 2: Dry-run backfill report

Before writing data, run a dry-run job that reports:

- total source records by collection/status;
- target records that would be created, updated, skipped, or blocked;
- records missing required owner IDs, titles, statuses, verification links, or proposal scope/fee fields;
- possible duplicate proposals/appointments;
- records that would require legal or provider confirmation before migration.

Dry-run output must not mutate Firestore.

### Stage 3: Idempotent backfill

Backfill jobs should be idempotent and restartable:

- deterministic target ID where possible, or store `sourcePath` unique index equivalent;
- `schemaVersion` on each target record;
- no deletes of source records;
- no appointment/payment/signature side effects;
- no outbound provider calls;
- audit entry or migration ledger entry per batch summary, not per sensitive field if that would leak private data.

### Stage 4: Reconciliation gates

Do not switch production reads to canonical-only until reconciliation proves:

1. every active source record has a canonical counterpart or documented skip reason;
2. owner/client/professional IDs match across source and target;
3. proposal counts match by opportunity/brief/client/professional;
4. `autoAppointment` remains false for migrated proposals;
5. appointment/contract records are not promoted from draft to binding state;
6. directory projections exclude private verification/trust fields;
7. Firestore rules/indexes cover canonical reads and deny unsafe writes;
8. focused API tests pass for owner, assigned verified BEP, admin, intruder, and unverified-reader paths.

### Stage 5: Compatibility sunset

Only after canonical reads are stable:

- mark compatibility writes deprecated;
- keep compatibility reads available for support/audit during a retention window;
- document rollback procedure;
- export before/after counts and reconciliation checksums;
- get human sign-off before any deletion/archive job.

## API behavior during transition

Canonical routes should preserve the safe-read and advisory contract throughout migration:

- `GET /api/project-briefs` and `GET /api/project-briefs/:briefId` may dual-read compatibility brief/job sources only after applying owner, admin, or assigned verified BEP gates.
- `GET /api/marketplace/opportunities` and `GET /api/marketplace/opportunities/:id` must expose published/advisory opportunities only.
- `GET /api/proposals/:proposalId` must return `readOnly: true`, `advisoryOnly: true`, and `autoAppointment: false` for migrated proposal records.
- Appointment readiness may read migrated records, but must keep `createsAppointment`, `createsContract`, `createsSignature`, and `createsPayment` false unless a separate human-confirmed binding workflow is enabled.

## Tests to add before a real migration

- Pure mapper tests for each source-to-target shape.
- Dry-run report tests for skip/block reasons.
- Idempotency tests proving the same batch can run twice without duplicate targets.
- Reconciliation tests for count and owner/professional consistency.
- Security tests proving canonical API routes never broaden access during dual-read fallback.
- Static Firestore rules/index tests for every canonical target collection.

## Human confirmations still required

1. Final mode: compatibility-only, dual-read, dual-write, or canonical-only.
2. Whether top-level `proposals` fully replaces `jobs/*/fee_proposals`.
3. Whether `architect` remains a BEP subtype in persisted canonical data or is normalized to `bep` only.
4. Appointment legal status for migrated `appointment_contracts` and whether any in-app acceptance can be binding.
5. POPIA retention and archival policy for source collections after canonical cutover.
6. Provider verification data retention and evidence standards before migrating trust/verification-adjacent fields.
