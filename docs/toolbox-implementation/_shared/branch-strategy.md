# Branch Strategy

## Branch Naming

Each tool gets its own branch off `main`:

```
toolbox/{tool-id}
```

For tools that share a refactor (e.g., extracting a common form component), create a shared refactor branch first:

```
toolbox/refactor/runner-form-extraction
```

## Priority Order

```
P0 — BROKEN (wrong form displayed):
  toolbox/rfi-generator          # uses site diary form — wrong
  toolbox/snag-creator           # uses site diary form — wrong

P1 — Core professional tools (needed by architects, engineers, QS, fire professionals):
  toolbox/site-diary-entry       # works, minor polish
  toolbox/tender-bid-bench       # works, minor polish
  toolbox/material-procurement   # works, minor polish
  toolbox/workforce-timesheet    # works, minor polish
  toolbox/plant-register         # works, minor polish
  toolbox/payment-claim-builder  # works, minor polish
  toolbox/xa-compliance-calc     # new form needed
  toolbox/energy-certificate     # new form needed
  toolbox/fire-rational-design   # new form needed
  toolbox/valuation-cert         # new form needed

P2 — Differentiate shared forms:
  toolbox/soft-cost-estimator
  toolbox/feasibility-estimator
  toolbox/payment-dashboard
  toolbox/rfi-response
  toolbox/hs-compliance
  toolbox/snag-evidence-upload
  toolbox/warranty-upload
  toolbox/delivery-note
  toolbox/freelancer-timesheet
  toolbox/deliverable-submission
  toolbox/fire-compliance-check
  toolbox/shop-drawing-submission

P3 — Medium complexity new forms:
  toolbox/zoning-check
  toolbox/payment-rate-config
  toolbox/user-verification-console
  toolbox/fee-tariff-editor
  toolbox/stage-gate-review
  toolbox/catalogue-manager
  toolbox/quote-response
  toolbox/ai-drawing-checker
  toolbox/cad-upload-check

P4 — Route to existing pages, simple runner form:
  toolbox/sans-forms
  toolbox/drawing-register
  toolbox/cpd-standalone
  toolbox/staff-cpd-tracker

P5 — Route to existing pages, minimal runner:
  toolbox/brief-wizard
  toolbox/technical-brief
  toolbox/proposal-comparison
  toolbox/progress-viewer
  toolbox/package-scope-viewer
  toolbox/admin-governance
  toolbox/audit-trail-viewer
  toolbox/ai-review-queue
  toolbox/firm-document-register

P6 — Low-impact / read-only:
  toolbox/freelancer-resource-centre
  toolbox/platform-settings
  toolbox/system-health-monitor
```

## Workflow Per Branch

```bash
git checkout main
git pull origin main
git checkout -b toolbox/{tool-id}

# implement + test
# verify: npm run lint && npm test
# verify: npm run build

git add -A
git commit -m "toolbox: implement {tool label}"
git push origin toolbox/{tool-id}
# create PR via gh CLI
```

Keep branches short-lived (1-3 commits). Merge conflicts are unlikely since each tool modifies only:
- `src/components/tools/StandaloneToolRunner.tsx` (one new case)
- `src/services/tools/standaloneToolRegistry.ts` (add calculatorId)
- New test files in `src/__tests__/tools/`
