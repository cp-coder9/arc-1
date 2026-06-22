# Toolbox Implementation — Master Index

## Repository Map

```
docs/toolbox-implementation/
├── INDEX.md                          ← this file
├── _shared/                          ← shared architecture & conventions
├── _templates/                       ← PRD template
├── 01-fee-calculator/                ← 3 tools
├── 02-compliance/                    ← 8 tools
├── 03-estimating/                    ← 1 tool
├── 04-site-management/               ← 5 tools
├── 05-tendering/                     ← 1 tool
├── 06-document-control/              ← 4 tools
├── 07-procurement/                   ← 1 tool
├── 08-workforce/                     ← 1 tool
├── 09-plant-equipment/               ← 1 tool
├── 10-payment/                       ← 3 tools
├── 11-briefing/                      ← 2 tools
├── 12-closeout/                      ← 2 tools
├── 13-drawing/                       ← 2 tools
├── 14-freelancer/                    ← 3 tools
├── 15-supplier/                      ← 3 tools
├── 16-cpd/                           ← 2 tools
├── 17-admin-governance/              ← 8 tools
├── 18-proposal-client/               ← 1 tool
└── 19-general/                       ← 3 tools
```

## Total: 54 tool PRDs across 19 groups

## Execution Priority

| Phase | Tools | Branches |
|-------|-------|----------|
| **P0** | rfi-generator, snag-creator | 2 branches |
| **P1** | xa-compliance, energy-cert, fire-rational, valuation-cert, site-diary, tender-bid-bench, material-procurement, workforce-timesheet, plant-register, payment-claim-builder, boq-takeoff, fee-calculator, fenestration, rvalue, doc-control-issue | 15 branches |
| **P2** | soft-cost-estimator, feasibility-estimator, payment-dashboard, rfi-response, hs-compliance, snag-evidence-upload, warranty-upload, delivery-note, freelancer-timesheet, deliverable-submission, fire-compliance-check, shop-drawing-submission | 12 branches |
| **P3** | zoning-check, payment-rate-config, user-verification-console, fee-tariff-editor, stage-gate-review, catalogue-manager, quote-response, ai-drawing-checker, cad-upload-check | 9 branches |
| **P4** | sans-forms, drawing-register, cpd-standalone, staff-cpd-tracker | 4 branches |
| **P5** | brief-wizard, technical-brief, proposal-comparison, progress-viewer, package-scope-viewer, admin-governance, audit-trail-viewer, ai-review-queue, firm-document-register | 9 branches |
| **P6** | freelancer-resource-centre, platform-settings, system-health-monitor | 3 branches |

## Branch Workflow

```bash
git checkout main && git pull
git checkout -b toolbox/{tool-id}
# implement
npm run lint && npm test && npm run build
git add -A && git commit -m "toolbox: implement {tool label}"
git push origin toolbox/{tool-id}
```

## Key Files

| File | Purpose |
|------|---------|
| `src/components/tools/StandaloneToolRunner.tsx` | Main runner — add form cases here |
| `src/components/tools/forms/` | Extracted form components (target) |
| `src/services/tools/standaloneToolRegistry.ts` | Tool definitions |
| `src/services/tools/standaloneToolRunService.ts` | Run persistence |
| `src/components/tools/StandaloneToolTilesPage.tsx` | Tile grid + runner orchestration |
| `src/components/ProjectToolboxPage.tsx` | Mode toggle + workflow view |
