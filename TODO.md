# Architex Project TODO

> Last Updated: 2026-05-01
> Status: Ready for deployment - external integrations blocked by provider access
> Overall Completion: ~99%

---

## Critical - Resolved

All previously critical items have been completed:

- [x] Slider component - Created at `src/components/ui/slider.tsx`
- [x] Avatar component - Created at `src/components/ui/avatar.tsx`
- [x] zod dependency - Added to `package.json`
- [x] Test dependencies - Jest, Testing Library, Playwright all installed
- [x] Test scripts - `test`, `test:e2e`, and `test:watch` configured
- [x] Dashboard shell layout - Sidebar flex wrapper and dashboard tab mapping fixed

---

## Core Features - Complete

### Payment System

- [x] Implement PayFast webhook handler in `server.ts` via `/api/payment/notify`
- [x] Add fund capture flow via ITN webhook
- [x] Create refund approval workflow for admin
- [x] Add payment receipt/invoice generation

### Council Submission

- [x] Implement PDF generation in `pdfGenerationService.ts`
- [x] Prepare official-access browser automation for municipal portal status sync
- [x] Create submission status tracking from portal automation and shadow-tracking signals
- [ ] Municipality API/portal live submission integration remains blocked until official access is available

### Chat Integration

- [x] Add Chat button to ClientDashboard
- [x] Add Chat button to ArchitectDashboard
- [x] Integrate real-time messaging into job workflows

### UI Components

- [x] Implement profile/portfolio media upload in `ProfileEditor.tsx`
- [x] Add password reset flow in `UserSettings.tsx`
- [x] Add email verification flow
- [x] Create reusable loading skeleton components
- [x] Add pagination for jobs, submissions, and applications
- [x] Add onboarding flow via `OnboardingFlow.tsx`

---

## Security And Testing

### Testing Coverage

- [x] Add service tests for Gemini, messaging, notification, payment, and council submission flows
- [x] Add component tests for ClientDashboard, ArchitectDashboard, and AdminDashboard
- [x] Add E2E specs for onboarding, auth, architect dashboard, and admin review flows
- [x] Add integration tests for AI review and authentication flows
- [x] Keep deploy lint focused on application code via `tsconfig.app.json`
- [ ] Repair legacy test API/type expectations under `npm run lint:tests`

### Security Fixes

- [x] Move admin role assignment to server-side `/api/auth/check-admin`
- [x] Add rate limiting to `/api/review`
- [x] Keep Gemini API key server-side through API routes
- [x] Sanitize message content to prevent XSS attacks
- [x] Add same-origin CSRF guard on API routes
- [x] Review and tighten Firestore security rules

---

## Business Logic - Complete

### Job Management

- [x] Add job editing functionality for clients
- [x] Add job deletion/cancellation flow
- [x] Add job status change history

### Application Management

- [x] Add application withdrawal for architects
- [x] Add application notes/comments

### Architect Management

- [x] Add architect unassignment functionality
- [x] Add team member management UI
- [x] Create portfolio editing interface

### Dispute Resolution

- [x] Create dispute filing system
- [x] Add admin mediation workflow
- [x] Add dispute resolution status tracking

---

## Polish Backlog

### Performance

- [x] Implement route/component code splitting for dashboard bundles
- [x] Lazy-load heavy dashboard, file, invoice, settings, and onboarding components
- [x] Add image optimization for portfolio and uploaded media
- [ ] Implement virtual scrolling for very large lists
- [x] Add offline persistence for Firestore

### UX Improvements

- [ ] Add keyboard navigation shortcuts
- [x] Add tour/onboarding for new users
- [x] Add dark mode toggle
- [x] Improve mobile sidebar/dashboard responsiveness

### Notifications

- [x] Serverless notification worker implemented
- [ ] Add email notification delivery after provider configuration and verified sending domain
- [x] Add push notification token registration endpoint and client service hook
- [x] Add notification preferences/settings

### Analytics

- [x] Initialize Firebase Analytics when supported
- [x] Create admin analytics dashboard
- [x] Add dashboard tab analytics event tracking
- [ ] Add detailed feature-level user activity event tracking

---

## Completed Highlights

- [x] Initial project setup
- [x] Basic authentication flow
- [x] Dashboard components structure
- [x] AI compliance review system
- [x] Basic chat system
- [x] Notification system with in-app records and serverless worker
- [x] SACAP verification workflow
- [x] Client, Architect, Admin, Freelancer, and BEP dashboards
- [x] Payment service foundation and webhook flow
- [x] Multi-agent orchestration for compliance checking
- [x] PDF generation service foundation
- [x] File upload via Vercel Blob
- [x] Firebase Admin SDK initialization
- [x] Reusable Skeleton UI component
- [x] Notification channel preferences/settings
- [x] Dashboard pagination for jobs, submissions, and applications
- [x] Client job editing, cancellation, unassignment, and status history
- [x] Architect application submission, withdrawal, and private notes
- [x] Team task assignment UI for architect projects
- [x] Dispute filing and admin mediation workflow
- [x] Admin review pipeline and analytics dashboard
- [x] Tightened Firestore rules for profile, job, application, and dispute updates
- [x] Added dashboard code splitting and suspense loading states
- [x] Added local dark mode preference
- [x] Added Firestore persistent offline cache
- [x] Added Firebase Analytics tab-view tracking helper

---

## Known Limitations

1. Council submission can prepare and track records, but live municipal submission remains blocked until a municipality API or approved portal automation access is available.
2. Email notification delivery requires provider credentials, domain verification, and production environment configuration.
3. `npm run lint` validates deployable application code; `npm run lint:tests` still surfaces stale test typings/API expectations.

---

## Future Considerations

- Multi-language support with i18n
- Mobile app with React Native or Expo
- Advanced search with Elasticsearch
- AI-powered architect matching improvements
- AutoCAD/Revit integration
- Video conferencing for consultations
- Subscription plans for architects
- Insurance integration

---

## Active Feature Branches

All tracked feature branches have been merged to main and can be deleted:

- `fix-types` - No unique commits
- `municipal-tracker` - Merged
- `pwd-compliance` - Merged
- `bip-role` - Merged
- `arch-dash-1` - Merged
- `arch-dash-2` - Merged
- `feat-architect-profiles` - Merged
