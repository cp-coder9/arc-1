# Error Findings Verification & Repair Plan

> **Generated:** 2026-05-06  
> **Workspace:** `e:/arc-1/arc-1` (Architex — architectural marketplace)  
> **Log source environment:** Linux (`/home/gmt/repo-analysis/arc-1/`) — differs from workspace (Windows)

---

## 1. Implementation Status Update

> **Updated:** 2026-05-06T00:06:39.626Z  
> **Scope of this update:** Documentation update only, reflecting the completed repair subtask. The original verification context is preserved below, with implemented items marked and stale status claims revised.

| Area | Original State | Implemented State | Remaining Status |
|---|---|---|---|
| Dependencies | Audit listed 19 vulnerabilities, including critical [`protobufjs`](package.json) plus safe direct findings for [`postcss`](package.json), [`fast-xml-parser`](package.json), [`hono`](package.json), and [`uuid`](package.json). | [`package.json`](package.json) and [`package-lock.json`](package-lock.json) were updated by safe [`npm audit fix`](package.json:1) and [`npm install`](package.json:21). Explicit dev dependencies [`@testing-library/dom`](package.json:64) and [`cross-env`](package.json:73) were added. | Safe direct findings are remediated. [`npm audit --omit=dev`](package.json:1) still exits 1 because 12 production vulnerabilities remain behind force-only breaking-change paths. |
| Jest tests | 8 suites failed / 39 tests failed in the supplied artifact. | Targeted failing suites were rewritten or repaired, and full Jest now passes. | Unit/integration test suite is green: 13 suites / 105 tests. Existing Gemini retry/failure tests still emit expected console warnings/errors. |
| Playwright config | [`playwright.config.ts`](playwright.config.ts) used Windows-only [`cmd /c`](playwright.config.ts:38). | [`playwright.config.ts`](playwright.config.ts) now uses [`cross-env`](package.json:73) for a cross-platform web server command. | [`npm run test:e2e`](package.json:19) was not run in the repair subtask. |
| Build warning | Build succeeded with a >1000 kB chunk-size warning. | [`vite.config.ts`](vite.config.ts) expanded [`manualChunks`](vite.config.ts:28) to split Firebase, React, Framer Motion, UI libraries, Google AI, PDF, icons, markdown, and date-fns chunks. | [`npm run build`](package.json:11) passes with no >1000 kB chunk-size warning. A non-fatal circular chunk warning remains: markdown-vendor -> react -> markdown-vendor. |
| Tooling environment | Original logs came from a Linux analysis environment, while this workspace is Windows. | [`npm install`](package.json:21) completed, but with Node engine warnings because the environment used Node v25.6.0 while [`package.json`](package.json:5) requires Node 20.x. | Node version mismatch remains an environment risk. |
| Source-control verification | No diff state was documented. | [`git`](package.json:1) was unavailable in the terminal: 'git' is not recognized. | No terminal diff was captured. |

---

## 2. Executive Summary

Six error artifacts were supplied in the [`Errors/`](Errors/) directory. The original verification cross-referenced every logged finding against the repository files, installed packages, and configuration. The completed repair subtask addressed the safe dependency updates, failing targeted Jest tests, Playwright command portability, and Vite chunking warning.

| Category | Original Log Claim | Original Verification | Current Implementation Status |
|---|---|---|---|
| npm audit vulnerabilities | 19 total, 1 critical | Critical [`protobufjs`](package.json) and safe direct package findings were reproducible before repair. | ✅ Safe direct findings remediated by [`npm audit fix`](package.json:1) / [`npm install`](package.json:21). ⚠️ 12 production audit findings remain because remediation requires force-only breaking changes. |
| Build warnings | 1 chunk-size warning over 1000 kB | Confirmed: large main bundle chunk. | ✅ [`npm run build`](package.json:11) now passes with no >1000 kB chunk warning after [`manualChunks`](vite.config.ts:28) expansion. ⚠️ Non-fatal circular chunk warning remains. |
| Lint / TypeScript | No errors | Confirmed clean lint/typecheck in original log. | ✅ [`npm run lint`](package.json:15) passed after repairs. |
| E2E / Playwright | Failed with `/bin/sh: 1: cmd: not found` | Confirmed Linux/Windows shell mismatch in [`playwright.config.ts`](playwright.config.ts). | ✅ Config repaired with [`cross-env`](package.json:73). ⚠️ [`npm run test:e2e`](package.json:19) was not executed. |
| Jest unit/integration tests | 8 suites failed, 39 tests failed | Confirmed; most failures were test-source API drift and incomplete mocks. | ✅ Targeted Jest command passed: 4 suites / 41 tests. ✅ Full [`npm test -- --runInBand`](package.json:16) passed: 13 suites / 105 tests. |

**Current key takeaway:** The dominant original root causes were repaired for the targeted Jest suites. The primary remaining risks are audit findings that require breaking force-only dependency paths, the Node v25.6.0 vs Node 20.x engine mismatch, unexecuted E2E tests, and a non-fatal circular Rollup chunk warning.

---

## 3. Artifact Inventory

| File | Size | Content | Current Relevance |
|---|---:|---|---|
| [arc-1-analysis-audit.json](Errors/arc-1-analysis-audit.json) | 11,705 B | Original npm audit v2 report — 19 vulnerabilities | Historical baseline; safe direct findings are now remediated. |
| [arc-1-analysis-audit (1).json](<Errors/arc-1-analysis-audit (1).json>) | 11,705 B | Exact duplicate of [arc-1-analysis-audit.json](Errors/arc-1-analysis-audit.json) | Historical duplicate; can still be deleted if desired. |
| [arc-1-analysis-build.log](Errors/arc-1-analysis-build.log) | 915 B | Original [`vite build`](package.json:11) output — success with 1 chunk warning | Stale for chunk-size status; current build no longer has the >1000 kB warning. |
| [arc-1-analysis-e2e.log](Errors/arc-1-analysis-e2e.log) | 187 B | Original Playwright failure — shell command error | Config cause repaired, but E2E was not rerun. |
| [arc-1-analysis-lint.log](Errors/arc-1-analysis-lint.log) | 39 B | Original [`tsc --noEmit`](package.json:15) clean output | Still consistent with current [`npm run lint`](package.json:15) pass. |
| [arc-1-analysis-test.log](Errors/arc-1-analysis-test.log) | 68,364 B | Original Jest results — 8 failed / 5 passed suites | Stale for current test status; Jest now passes. |

---

## 4. Finding-by-Finding Verification and Repair Status

### 4.1 npm Audit Vulnerabilities

| # | Package / Chain | Original Severity | Original State | Implemented Repair | Current Status |
|---|---|---|---|---|---|
| 1 | [`protobufjs`](package.json) | Critical | Vulnerable version below fixed threshold. | Safe [`npm audit fix`](package.json:1) / [`npm install`](package.json:21) updated lockfile dependency resolution. | ✅ Remediated. |
| 2 | [`postcss`](package.json) | Moderate | Safe direct finding. | Safe dependency update applied. | ✅ Remediated. |
| 3 | [`fast-xml-parser`](package.json) | Moderate | Safe direct finding. | Safe dependency update applied. | ✅ Remediated. |
| 4 | [`hono`](package.json) | Moderate | Safe direct finding. | Safe dependency update applied. | ✅ Remediated. |
| 5 | [`uuid`](package.json) | Moderate | Safe direct finding. | Safe dependency update applied. | ✅ Remediated. |
| 6 | [`@testing-library/dom`](package.json:64) | Test dependency fragility, not audit finding | Missing peer/direct dependency caused component test failures in the artifact environment. | Added explicit dev dependency. | ✅ Implemented. |
| 7 | [`cross-env`](package.json:73) | Portability dependency | Needed to remove Windows-only Playwright command. | Added explicit dev dependency. | ✅ Implemented. |
| 8 | [`firebase-admin`](package.json:43) transitive chains | Low / production audit findings | Audit fix path requires downgrade to 10.3.0. | Force-only downgrade intentionally not applied. | ⚠️ Remaining production audit findings. |
| 9 | [`shadcn`](package.json:54) transitive chain | Moderate / production audit finding | Audit fix path requires downgrade to 3.8.3. | Force-only downgrade intentionally not applied. | ⚠️ Remaining production audit finding. |

**Current audit summary:** Safe direct findings were remediated. [`npm audit --omit=dev`](package.json:1) still exits 1 because the remaining production findings require force-only breaking-change paths: [`firebase-admin`](package.json:43) downgrade to 10.3.0 and [`shadcn`](package.json:54) downgrade to 3.8.3. Those were intentionally not applied.

---

### 4.2 Build Warning

| Claim | Original Verification | Implemented Repair | Current Status |
|---|---|---|---|
| Build succeeds with chunk over 1000 kB | Confirmed in [arc-1-analysis-build.log](Errors/arc-1-analysis-build.log). | [`vite.config.ts`](vite.config.ts) expanded [`manualChunks`](vite.config.ts:28) to split Firebase, React, Framer Motion, UI libraries, Google AI, PDF, icons, markdown, and date-fns chunks. | ✅ [`npm run build`](package.json:11) passed with no >1000 kB chunk-size warning. ⚠️ Non-fatal circular chunk warning remains: markdown-vendor -> react -> markdown-vendor. |

---

### 4.3 Lint / TypeScript Check

| Claim | Original Verification | Current Status |
|---|---|---|
| [`npm run lint`](package.json:15) / [`tsc --noEmit`](package.json:15) produces no type errors | Confirmed in [arc-1-analysis-lint.log](Errors/arc-1-analysis-lint.log). | ✅ [`npm run lint`](package.json:15) passed after repairs. |

**Note:** [`tsconfig.json`](tsconfig.json) excludes test files via exclude patterns, so Jest remains the authoritative verification for test behavior.

---

### 4.4 E2E / Playwright Failure

| Claim | Original Verification | Implemented Repair | Current Status |
|---|---|---|---|
| Playwright failed with `/bin/sh: 1: cmd: not found` | Confirmed in [arc-1-analysis-e2e.log](Errors/arc-1-analysis-e2e.log); [`playwright.config.ts`](playwright.config.ts) used Windows-only command syntax. | [`playwright.config.ts`](playwright.config.ts) now uses [`cross-env`](package.json:73) instead of Windows-only [`cmd /c`](playwright.config.ts:38). | ✅ Configuration repaired. ⚠️ [`npm run test:e2e`](package.json:19) was not run during the repair subtask. |

---

### 4.5 Jest Test Failures — Detailed Repair Status

#### 4.5.1 [`councilSubmissionService.test.ts`](src/services/__tests__/councilSubmissionService.test.ts)

| Original Error Pattern | Root Cause | Implemented Repair | Verification |
|---|---|---|---|
| Service methods missing or mismatched. | Test file targeted a planned/previous API instead of actual [`councilSubmissionService`](src/services/councilSubmissionService.ts). | Test rewritten to actual methods: [`getMunicipalityConfig`](src/services/councilSubmissionService.ts:142), [`getAllMunicipalities`](src/services/councilSubmissionService.ts:149), [`submitToCouncil`](src/services/councilSubmissionService.ts:159), [`updateStatus`](src/services/councilSubmissionService.ts:213), [`subscribeToSubmission`](src/services/councilSubmissionService.ts:305), and [`generateSubmissionPackage`](src/services/councilSubmissionService.ts:330). | ✅ Targeted Jest passed. ✅ Full Jest passed. |

**Implemented status:** Priority task 2.1 is complete. Tests for non-existent legacy/planned methods were replaced with coverage for the service API that actually exists.

---

#### 4.5.2 [`notificationService.test.ts`](src/services/__tests__/notificationService.test.ts)

| Original Error Pattern | Root Cause | Implemented Repair | Verification |
|---|---|---|---|
| [`getDoc`](src/services/notificationService.ts:79) was not a function. | Test Firebase mock included collection reads but omitted singular document preference lookup. | Added [`getDoc`](src/services/notificationService.ts:79) preference mock behavior aligned with actual [`notificationService`](src/services/notificationService.ts). | ✅ Targeted Jest passed. ✅ Full Jest passed. |
| Missing service methods / wrong helper signatures. | Tests used old or incorrect helper names/signatures. | Test rewritten against actual helper names/signatures in [`notificationService`](src/services/notificationService.ts). | ✅ Targeted Jest passed. ✅ Full Jest passed. |
| Immediate unsubscribe assertions failed. | Test asserted returned unsubscribe functions were called immediately. | Incorrect immediate-unsubscribe assertions removed; lifecycle cleanup now uses actual [`cleanup`](src/services/notificationService.ts:227). | ✅ Targeted Jest passed. ✅ Full Jest passed. |

**Implemented status:** Priority tasks 2.2, 2.3, and 2.4 are complete.

---

#### 4.5.3 Component Test Peer Dependency Failure

| Original Error | Root Cause | Implemented Repair | Verification |
|---|---|---|---|
| Cannot find module [`@testing-library/dom`](package.json:64) from Testing Library React. | Direct dependency was absent and relied on transitive resolution. | Added explicit dev dependency [`@testing-library/dom`](package.json:64). | ✅ Full Jest passed. |

**Implemented status:** Priority task 2.7 is complete.

---

#### 4.5.4 [`messagingService.test.ts`](src/services/__tests__/messagingService.test.ts)

| Original Error | Root Cause | Implemented Repair | Verification |
|---|---|---|---|
| Undefined DOMPurify default export while calling sanitizer. | [`dompurify`](src/services/messagingService.ts:20) default export did not resolve as expected in Jest/jsdom/CommonJS path. | [`messagingService.test.ts`](src/services/__tests__/messagingService.test.ts) now mocks [`dompurify`](src/services/messagingService.ts:20) default export. | ✅ Targeted Jest passed. ✅ Full Jest passed. |

**Implemented status:** Priority task 2.5 is complete.

---

#### 4.5.5 [`authentication-flow.test.ts`](src/test/integration/authentication-flow.test.ts)

| Original Error | Root Cause | Implemented Repair | Verification |
|---|---|---|---|
| Test expected profile creation after directly calling Firebase [`signInWithPopup`](src/test/integration/authentication-flow.test.ts:20). | Profile creation lives in the app-level auth-state pathway, not inside Firebase Auth's popup function. | Test now covers the app-level profile creation pathway after [`signInWithPopup`](src/App.tsx:184), instead of expecting Firebase [`signInWithPopup`](src/test/integration/authentication-flow.test.ts:20) itself to call [`setDoc`](src/App.tsx:199). | ✅ Targeted Jest passed. ✅ Full Jest passed. |

**Implemented status:** Priority task 2.6 is complete.

---

### 4.6 Passing Tests Context

| Suite / Area | Original Status | Current Status |
|---|---|---|
| [`paymentService.test.ts`](src/services/__tests__/paymentService.test.ts) | Passing in original context. | ✅ Full Jest passed. |
| [`schemas.test.ts`](src/test/schemas.test.ts) | Passing in original context. | ✅ Full Jest passed. |
| [`geminiService.test.ts`](src/services/__tests__/geminiService.test.ts) | Passing with expected console warnings. | ✅ Full Jest passed; expected console warnings/errors from existing Gemini retry/failure tests remain. |
| [`llm-config-path.test.ts`](src/services/__tests__/llm-config-path.test.ts) | Passing in original context. | ✅ Full Jest passed. |
| [`ai-review-flow.test.ts`](src/test/integration/ai-review-flow.test.ts) | Passing with expected console errors. | ✅ Full Jest passed. |

---

## 5. Grouped Root-Cause Analysis and Resolution

| Root Cause | Affected Area | Original Impact | Resolution Status |
|---|---|---|---|
| RC-1: Test-source API drift | [`councilSubmissionService.test.ts`](src/services/__tests__/councilSubmissionService.test.ts), [`notificationService.test.ts`](src/services/__tests__/notificationService.test.ts) | Highest-impact Jest failures from methods that did not exist or had different signatures. | ✅ Implemented by rewriting tests against actual services. |
| RC-2: Incomplete Firebase mocking | [`notificationService.test.ts`](src/services/__tests__/notificationService.test.ts) | Preference lookup crashed because [`getDoc`](src/services/notificationService.ts:79) mock was missing. | ✅ Implemented by adding preference mock behavior. |
| RC-3: DOMPurify ESM/CommonJS mismatch | [`messagingService.test.ts`](src/services/__tests__/messagingService.test.ts) | Sanitizer default export was undefined in Jest. | ✅ Implemented by mocking [`dompurify`](src/services/messagingService.ts:20) default export in the test. |
| RC-4: Test logic/assertion errors | [`notificationService.test.ts`](src/services/__tests__/notificationService.test.ts), [`authentication-flow.test.ts`](src/test/integration/authentication-flow.test.ts) | Incorrect immediate-unsubscribe assertions and profile-creation expectation at the wrong abstraction layer. | ✅ Implemented by aligning tests to actual lifecycle and app-level auth flow. |
| RC-5: Cross-platform Playwright command | [`playwright.config.ts`](playwright.config.ts) | Linux failed on Windows-only [`cmd /c`](playwright.config.ts:38). | ✅ Config repaired with [`cross-env`](package.json:73). ⚠️ E2E not rerun. |
| RC-6: Bundle size | [`vite.config.ts`](vite.config.ts) | Main chunk exceeded 1000 kB warning threshold. | ✅ Chunk-size warning removed by expanded [`manualChunks`](vite.config.ts:28). ⚠️ Circular chunk warning remains. |

---

## 6. Prioritized Repair Task List Status

### Priority 1 — Critical / Security

| # | Task | Files Modified | Status | Notes |
|---|---|---|---|---|
| 1.1 | Run safe [`npm audit fix`](package.json:1) to patch [`protobufjs`](package.json), [`postcss`](package.json), [`fast-xml-parser`](package.json), [`hono`](package.json), and [`uuid`](package.json). | [`package.json`](package.json), [`package-lock.json`](package-lock.json) | ✅ Implemented | Safe direct findings remediated. |
| 1.2 | Verify critical [`protobufjs`](package.json) remediation. | [`package-lock.json`](package-lock.json) | ✅ Implemented | Critical finding no longer part of remaining production audit status. |

### Priority 2 — Test Suite Repair

| # | Task | Files Modified | Status | Notes |
|---|---|---|---|---|
| 2.1 | Rewrite [`councilSubmissionService.test.ts`](src/services/__tests__/councilSubmissionService.test.ts) to match actual API. | [`src/services/__tests__/councilSubmissionService.test.ts`](src/services/__tests__/councilSubmissionService.test.ts) | ✅ Implemented | Covers [`getMunicipalityConfig`](src/services/councilSubmissionService.ts:142), [`getAllMunicipalities`](src/services/councilSubmissionService.ts:149), [`submitToCouncil`](src/services/councilSubmissionService.ts:159), [`updateStatus`](src/services/councilSubmissionService.ts:213), [`subscribeToSubmission`](src/services/councilSubmissionService.ts:305), and [`generateSubmissionPackage`](src/services/councilSubmissionService.ts:330). |
| 2.2 | Add [`getDoc`](src/services/notificationService.ts:79) preference mock to [`notificationService.test.ts`](src/services/__tests__/notificationService.test.ts). | [`src/services/__tests__/notificationService.test.ts`](src/services/__tests__/notificationService.test.ts) | ✅ Implemented | Preference path is now mocked against actual service behavior. |
| 2.3 | Fix notification helper names/signatures. | [`src/services/__tests__/notificationService.test.ts`](src/services/__tests__/notificationService.test.ts) | ✅ Implemented | Tests rewritten against actual [`notificationService`](src/services/notificationService.ts). |
| 2.4 | Remove incorrect immediate-unsubscribe assertions. | [`src/services/__tests__/notificationService.test.ts`](src/services/__tests__/notificationService.test.ts) | ✅ Implemented | Cleanup aligned to [`cleanup`](src/services/notificationService.ts:227). |
| 2.5 | Fix [`dompurify`](src/services/messagingService.ts:20) mock for [`messagingService.test.ts`](src/services/__tests__/messagingService.test.ts). | [`src/services/__tests__/messagingService.test.ts`](src/services/__tests__/messagingService.test.ts) | ✅ Implemented | Default export is mocked. |
| 2.6 | Fix auth integration profile creation test. | [`src/test/integration/authentication-flow.test.ts`](src/test/integration/authentication-flow.test.ts) | ✅ Implemented | Test now exercises app-level profile creation after [`signInWithPopup`](src/App.tsx:184). |
| 2.7 | Add [`@testing-library/dom`](package.json:64) explicit dev dependency. | [`package.json`](package.json), [`package-lock.json`](package-lock.json) | ✅ Implemented | Removes fragile transitive dependency assumption. |

### Priority 3 — E2E

| # | Task | Files Modified | Status | Notes |
|---|---|---|---|---|
| 3.1 | Make Playwright web server command cross-platform. | [`playwright.config.ts`](playwright.config.ts), [`package.json`](package.json), [`package-lock.json`](package-lock.json) | ✅ Implemented | Uses [`cross-env`](package.json:73) instead of Windows-only [`cmd /c`](playwright.config.ts:38). |
| 3.2 | Verify E2E execution. | N/A | ⚠️ Not executed | [`npm run test:e2e`](package.json:19) was not run. |

### Priority 4 — Build Quality

| # | Task | Files Modified | Status | Notes |
|---|---|---|---|---|
| 4.1 | Add/expand Vite manual chunking. | [`vite.config.ts`](vite.config.ts) | ✅ Implemented | [`manualChunks`](vite.config.ts:28) now splits Firebase, React, Framer Motion, UI libraries, Google AI, PDF, icons, markdown, and date-fns chunks. |

### Priority 5 — Low-Risk Dependency Upgrades / Monitoring

| # | Task | Status | Notes |
|---|---|---|---|
| 5.1 | Evaluate major test-runner upgrade paths for dev audit chains. | Deferred | Not part of completed repair subtask. |
| 5.2 | Evaluate [`shadcn`](package.json:54) force-only downgrade path. | Intentionally not applied | Downgrade to 3.8.3 is a breaking-change path. |
| 5.3 | Monitor [`firebase-admin`](package.json:43) upstream fixes. | Intentionally not applied | Downgrade to 10.3.0 is a breaking-change path. |

---

## 7. Detailed Changed-Files Summary

| File | Change Type | Implementation Details |
|---|---|---|
| [`package.json`](package.json) | Dependency and script-adjacent updates | Updated by safe [`npm audit fix`](package.json:1) and [`npm install`](package.json:21). Added explicit dev dependencies [`@testing-library/dom`](package.json:64) and [`cross-env`](package.json:73). Remaining force-only remediation paths for [`firebase-admin`](package.json:43) and [`shadcn`](package.json:54) were intentionally not applied. |
| [`package-lock.json`](package-lock.json) | Lockfile dependency resolution update | Updated by safe [`npm audit fix`](package.json:1) and [`npm install`](package.json:21), including remediation of critical [`protobufjs`](package.json) and safe direct findings for [`postcss`](package.json), [`fast-xml-parser`](package.json), [`hono`](package.json), and [`uuid`](package.json). |
| [`src/services/__tests__/councilSubmissionService.test.ts`](src/services/__tests__/councilSubmissionService.test.ts) | Test rewrite | Rewritten to actual [`councilSubmissionService`](src/services/councilSubmissionService.ts) methods: [`getMunicipalityConfig`](src/services/councilSubmissionService.ts:142), [`getAllMunicipalities`](src/services/councilSubmissionService.ts:149), [`submitToCouncil`](src/services/councilSubmissionService.ts:159), [`updateStatus`](src/services/councilSubmissionService.ts:213), [`subscribeToSubmission`](src/services/councilSubmissionService.ts:305), and [`generateSubmissionPackage`](src/services/councilSubmissionService.ts:330). |
| [`src/services/__tests__/notificationService.test.ts`](src/services/__tests__/notificationService.test.ts) | Test rewrite / mock repair | Rewritten against actual [`notificationService`](src/services/notificationService.ts), including [`getDoc`](src/services/notificationService.ts:79) preference mock behavior, actual helper names/signatures, [`cleanup`](src/services/notificationService.ts:227), and removal of incorrect immediate-unsubscribe assertions. |
| [`src/services/__tests__/messagingService.test.ts`](src/services/__tests__/messagingService.test.ts) | Test mock repair | Now mocks [`dompurify`](src/services/messagingService.ts:20) default export for Jest/jsdom compatibility. |
| [`src/test/integration/authentication-flow.test.ts`](src/test/integration/authentication-flow.test.ts) | Integration test correction | Now tests app-level profile creation after [`signInWithPopup`](src/App.tsx:184), rather than expecting Firebase [`signInWithPopup`](src/test/integration/authentication-flow.test.ts:20) itself to call [`setDoc`](src/App.tsx:199). |
| [`playwright.config.ts`](playwright.config.ts) | E2E configuration repair | Uses [`cross-env`](package.json:73) instead of Windows-only [`cmd /c`](playwright.config.ts:38). |
| [`vite.config.ts`](vite.config.ts) | Build configuration repair | Expanded [`manualChunks`](vite.config.ts:28) to split Firebase, React, Framer Motion, UI libraries, Google AI, PDF, icons, markdown, and date-fns chunks. |
| [`ERROR_FINDINGS_VERIFICATION_AND_REPAIR_PLAN.md`](ERROR_FINDINGS_VERIFICATION_AND_REPAIR_PLAN.md) | Documentation update | Updated with implementation status, changed-files summary, verification outcomes, and remaining risks/open items. |

---

## 8. Verification Commands and Results

| Command | Result | Notes |
|---|---|---|
| [`npm install`](package.json:21) | ✅ Completed with warnings | Completed with Node engine warnings because the environment used Node v25.6.0 while [`package.json`](package.json:5) requires Node 20.x. |
| [`npx jest --config jest.config.cjs src/services/__tests__/councilSubmissionService.test.ts src/services/__tests__/notificationService.test.ts src/services/__tests__/messagingService.test.ts src/test/integration/authentication-flow.test.ts --runInBand`](package.json:16) | ✅ Passed | 4 suites / 41 tests. |
| [`npm run lint`](package.json:15) | ✅ Passed | TypeScript check passed. |
| [`npm test -- --runInBand`](package.json:16) | ✅ Passed | 13 suites / 105 tests. Only expected console warnings/errors from existing Gemini retry/failure tests were observed. |
| [`npm run build`](package.json:11) | ✅ Passed | No >1000 kB chunk-size warning after chunk adjustment. Non-fatal circular chunk warning remains: markdown-vendor -> react -> markdown-vendor. |
| [`npm audit --omit=dev`](package.json:1) | ⚠️ Exits 1 | Remaining production audit findings are force-only breaking-change remediation paths for [`firebase-admin`](package.json:43) and [`shadcn`](package.json:54). |
| [`npm run test:e2e`](package.json:19) | ⚠️ Not run | Playwright configuration was repaired, but E2E execution was not performed in this repair subtask. |
| [`git`](package.json:1) diff/status capture | ⚠️ Unavailable | Terminal reported: 'git' is not recognized. No terminal diff was captured. |

Recommended verification order for a follow-up environment with Node 20.x and Git available:

1. [`npm install`](package.json:21)
2. [`npm run lint`](package.json:15)
3. [`npm test -- --runInBand`](package.json:16)
4. [`npm run build`](package.json:11)
5. [`npm run test:e2e`](package.json:19)
6. [`npm audit --omit=dev`](package.json:1), expecting non-zero exit until force-only findings are accepted or upstream fixes are available

---

## 9. Remaining Risks and Open Items

| Risk / Open Item | Detail | Recommended Handling |
|---|---|---|
| Remaining production audit findings | [`npm audit --omit=dev`](package.json:1) still exits 1 because remediation requires [`firebase-admin`](package.json:43) downgrade to 10.3.0 and [`shadcn`](package.json:54) downgrade to 3.8.3. | Do not apply force-only downgrades without explicit breaking-change review. Monitor upstream patches or evaluate replacements separately. |
| Node version mismatch | [`npm install`](package.json:21) completed with engine warnings because Node v25.6.0 was used while [`package.json`](package.json:5) requires Node 20.x. | Re-run install and verification under Node 20.x for production-equivalent confidence. |
| E2E not executed | [`playwright.config.ts`](playwright.config.ts) was repaired, but [`npm run test:e2e`](package.json:19) was not run. | Run E2E in a follow-up pass, preferably in Node 20.x. |
| Non-fatal circular chunk warning | [`npm run build`](package.json:11) passes, but Rollup reports circular chunk relationship: markdown-vendor -> react -> markdown-vendor. | Treat as non-blocking unless runtime chunk loading issues appear; consider refining [`manualChunks`](vite.config.ts:28) if warning becomes noisy or problematic. |
| No terminal diff captured | [`git`](package.json:1) was unavailable: 'git' is not recognized. | Capture diff/status in an environment with Git available before merging. |

---

## 10. Appendix: File Reference Map

| File | Role | Current Notes |
|---|---|---|
| [`package.json`](package.json) | Dependencies and scripts | Updated by dependency repair; contains explicit [`@testing-library/dom`](package.json:64) and [`cross-env`](package.json:73). |
| [`package-lock.json`](package-lock.json) | Locked dependency graph | Updated by safe dependency repair. |
| [`jest.config.cjs`](jest.config.cjs) | Active Jest config used by [`npm test`](package.json:16) | Targeted and full Jest commands passed with this config. |
| [`jest.config.ts`](jest.config.ts) | Duplicate Jest config | Not the active config for the documented commands. |
| [`playwright.config.ts`](playwright.config.ts) | E2E config | Cross-platform command repaired with [`cross-env`](package.json:73); E2E not rerun. |
| [`tsconfig.json`](tsconfig.json) | TypeScript config | [`npm run lint`](package.json:15) passed. |
| [`vite.config.ts`](vite.config.ts) | Vite build config | Expanded [`manualChunks`](vite.config.ts:28); build chunk-size warning resolved. |
| [`src/test/setup.ts`](src/test/setup.ts) | Jest setup file | Provides test environment setup and mocks. |
| [`src/App.tsx`](src/App.tsx) | App-level auth/profile creation flow | Relevant to [`signInWithPopup`](src/App.tsx:184) and [`setDoc`](src/App.tsx:199) profile creation behavior. |
| [`src/services/councilSubmissionService.ts`](src/services/councilSubmissionService.ts) | Council submission service | Actual API now covered by repaired tests. |
| [`src/services/notificationService.ts`](src/services/notificationService.ts) | Notification service | Actual helpers, [`getDoc`](src/services/notificationService.ts:79), and [`cleanup`](src/services/notificationService.ts:227) now covered by repaired tests. |
| [`src/services/messagingService.ts`](src/services/messagingService.ts) | Messaging/chat service | [`dompurify`](src/services/messagingService.ts:20) default export behavior is mocked in tests. |
| [`src/services/__tests__/councilSubmissionService.test.ts`](src/services/__tests__/councilSubmissionService.test.ts) | Council service tests | Rewritten and passing. |
| [`src/services/__tests__/notificationService.test.ts`](src/services/__tests__/notificationService.test.ts) | Notification service tests | Rewritten and passing. |
| [`src/services/__tests__/messagingService.test.ts`](src/services/__tests__/messagingService.test.ts) | Messaging service tests | DOMPurify mock repaired and passing. |
| [`src/test/integration/authentication-flow.test.ts`](src/test/integration/authentication-flow.test.ts) | Auth integration test | Profile creation path corrected and passing. |
