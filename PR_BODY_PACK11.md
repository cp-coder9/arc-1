## Summary
Implements the complete **Architex Closeout, Handover & Occupancy** module (Pack 11) — the project completion layer that handles everything from practical completion through to defects liability period closure.

## Changes

### New Services (6 files, ~1,800 LOC)
| Service | Purpose |
|---------|---------|
| `practicalCompletionService.ts` | PC certification, precondition evaluation, client acceptance workflow, Firestore persistence |
| `defectsCloseoutService.ts` | Patent/latent defect tracking, categorization, closeout verification, liability linking |
| `occupationReadinessService.ts` | OC verification, insurance transition checks, utility handover checklist, statutory approvals |
| `handoverPackService.ts` | As-built drawings, warranties register, O&M manuals, keys/access handover, compliance bundle |
| `finalAccountReadinessService.ts` | Variations incorporation, claims settlement, retention reconciliation, final payment certificate |
| `defectsLiabilityService.ts` | Liability period tracking, defect reporting, contractor recall workflow, retention release trigger |

### Test Suites (6 files, ~650 LOC)
Each service has a comprehensive test suite covering all pure functions, validation logic, and edge cases.

### Frontend
- **CloseoutWizard.tsx**: Upgraded from 4-step wizard to a 7-tab integrated layout covering all closeout stages with real-time evaluation and blocker display.

### Firestore Collections
`practical_completions`, `defects`, `occupation_readiness`, `handover_packs`, `final_accounts`, `defects_liability`, `liability_defects`, `contractor_recalls`

### Guardrails Enforced
- No internal record implies municipal approval
- PC/FC certificates require authorised professional sign-off
- Unresolved critical snags/NCRs block closeout/payment
- Retention release linked to Finance pack and 3rd-party provider status
- As-built, warranty, compliance documents indexed and versioned

🤖 Generated with [Claude Code](https://claude.com/claude-code)
