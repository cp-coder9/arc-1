# Branch Strategy Analysis - 2026-05-27

Canonical integration branch recommendation: `phase-2-verification-workflows` until the current PRD readiness batch is pushed and reviewed, then merge to `main`.

## Remote branch divergence snapshot

| Branch | Ahead of HEAD | Behind HEAD | Recommendation |
|---|---:|---:|---|
| origin/main | 0 | 329 | no unique remote commits; safe to archive after backup and owner approval |
| origin/phase-1/lifecycle-foundation | 0 | 349 | no unique remote commits; safe to archive after backup and owner approval |
| origin/phase-2/design-team-coordination | 0 | 346 | no unique remote commits; safe to archive after backup and owner approval |
| origin/phase-3/tender-procurement | 0 | 345 | no unique remote commits; safe to archive after backup and owner approval |
| origin/phase-4/construction-delivery | 0 | 345 | no unique remote commits; safe to archive after backup and owner approval |
| origin/phase-5/payments-escrow | 0 | 344 | no unique remote commits; safe to archive after backup and owner approval |
| origin/phase-6/ai-agents-polish | 0 | 343 | no unique remote commits; safe to archive after backup and owner approval |

## Safety policy
- Do not delete remote branches automatically.
- Cherry-pick only after targeted diff review and green verification.
- Keep GitHub Actions on `main` and `phase-2-verification-workflows` until release branch is merged.
