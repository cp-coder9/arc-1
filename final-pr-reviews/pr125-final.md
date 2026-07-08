## Hermes final pre-merge review — PR #125

Verdict: Changes still required before merge.

Latest head reviewed: `aa985671b68edc8c615e67db943f595a4dfd765a`
GitHub checks: passing.

What is fixed:
- Mounted `501` / `NOT_IMPLEMENTED` marketplace endpoints are gone.
- Dispute evidence placeholder fallback is gone; `src/lib/marketplace-api-router.ts:1218-1225` now requires evidence.
- Task application acceptance and quote acceptance now use Firestore transactions and write audit records in the transaction.
- Deliver/sign-off routes now include entity-level task owner / assigned freelancer checks.

Remaining final blockers:

1. Supplier quote response is still not entity-authorized.

Evidence:
- `src/lib/marketplace-api-router.ts:748-780` handles `PUT /quotes/:id/respond`.
- It checks only role permission at `:753`, fetches the quote at `:760-764`, then updates the quote at `:768-777`.
- It never verifies `quote.supplierId === uid` or that the quote is still `pending` before allowing the response.

Required fix: before updating, verify the authenticated user is the requested supplier and the quote is in the correct pre-response state.

2. Task application acceptance still uses stale application data inside the transaction.

Evidence:
- `src/lib/marketplace-api-router.ts:451-471` reads and validates the application before the transaction.
- The transaction at `:475-508` re-reads the task, but does not re-read/revalidate the application status or task linkage inside the transaction before `transaction.update(appRef, ...)` at `:488-489`.

Required fix: re-read `appRef` inside the transaction and re-check `app.taskId === id` and `app.status === 'pending'` before updating.

3. Certificate generation is still too broad for a commercial/compliance artefact.

Evidence:
- `src/lib/marketplace-api-router.ts:1131-1193` allows any user with `receive_certificate` permission to generate a certificate for any accepted project posting.
- It does not verify that `uid` is the posting client, accepted professional, project team member, or other certificate recipient before writing `marketplace_certificates` and `document_vault`.

Required fix: enforce entity/project authorization and recipient eligibility before issuing the certificate.

Merge note:
- PR #125 merges cleanly after PR #124 in a local sequence, but the sequence then conflicts hard at PR #126. Rebase/split overlapping marketplace code before batch merging.
