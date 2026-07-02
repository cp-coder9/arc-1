## Engineer's Calculation Hub

Implements the Engineer's Calculation Hub with **53 professional-grade engineering calculators** across 8 disciplines (structural steel/concrete/timber, geotechnical, civil loading/stormwater, mechanical HVAC, fire engineering, electrical, wet services, utilities).

## What's included

- **11 calculator engine files** with pure compute functions (deterministic, no I/O)
- **12 Zod input schema files** with SA-standard defaults and validation
- **9 data constant files** (SA Red Book steel sections, material densities, pipe sizes, fixture units, fire distances, unit conversions, etc.)
- **Platform integration contracts** (persistence, PDF export, Project Passport, SpecForge, Audit Trail)
- **Full workspace UI** — 240px sidebar navigation, dynamic forms from schemas, results display, step-by-step derivation with SANS clause references, run history
- **Tool registration** in standalone registry + App.tsx routing
- **35 unit tests** across 5 test files (steel, concrete, electrical, geotechnical, stormwater)

## Integration Scope (This PR)

| Feature | Status |
|---------|--------|
| Engine computation (53 calculators) | Fully implemented |
| Zod validation + SA defaults | Fully implemented |
| Derivation steps + SANS refs | Fully implemented |
| PDF export (HTML print-to-PDF) | Fully implemented |
| Run persistence (in-memory, session) | Fully implemented |
| Run history + restore | Fully implemented |
| Registry entry + routing | Fully implemented |
| Project Passport write-back | Preview (local-only, Firestore deferred) |
| SpecForge push | Preview (local-only, Firestore deferred) |
| Audit Trail events | Preview (local-only, Firestore deferred) |

## Testing

- TypeScript: zero errors (tsc --noEmit)
- Vitest: 35 CalcHub tests pass + 2,890 full suite tests pass
- Build: clean production build
- CI: GitHub Actions green

## Advisory

All calculations are advisory only and require professional engineer sign-off per ECSA regulations.

## npm audit

12 vulnerabilities (2 high) exist on the main branch baseline — not introduced by this PR.
