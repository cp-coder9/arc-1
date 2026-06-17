# Demo Mode Context — AGENTS.md

## Purpose

React context provider and type definitions for the Architex demo mode. Wraps the app in demo-aware state management: role selection, sandbox seeding, and localStorage persistence.

## Ownership

- **Owner:** Demo feature
- **Files:** `src/demo-context/DemoModeProvider.tsx`
- **Dependencies:** `src/demo-seed/seedAllData.ts`, `src/lib/firebase.ts`

## Local Contracts

1. `DemoModeProvider` wraps the entire app to provide `useDemoMode()` and `useDemoRole()` hooks
2. `VITE_DEMO_MODE=true` env var activates demo mode — all demo code is inert when false
3. On first auth state change in demo mode, auto-seeds the user's sandbox via `seedUserSandbox(uid)`
4. Seed flag stored at `/demo_seed_flags/{uid}` — prevents re-seeding on subsequent logins
5. Last-used role persisted to `localStorage` key `demo:activeRole` — restored on next login
6. `DEMO_ROLE_TO_INTERNAL` maps 22 demo roles to 6 internal dashboard roles
7. `DEMO_ROLE_GROUPS` organizes roles into 7 UI groups for the dropdown
8. `reseed()` function replaces all sandbox data — exposes "Reset Sandbox Data" to users

## Developer Notes

- Adding a new demo role: add to `DemoRole` type, `DEMO_ROLE_GROUPS`, and `DEMO_ROLE_TO_INTERNAL`
- Role mapping determines which dashboard the user sees — map new roles to the closest internal role
- Auto-seed adds ~2-3s latency on first login in demo mode — loading skeleton shown via `seeding` state

## Child DOX Index

No child documents — single-file module.
