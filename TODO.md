# Architex Project TODO

> Last Updated: 2026-04-28
> Status: Active Development - Phase 2 (Testing & Polish)
> Overall Completion: ~98%

---

## 🔴 CRITICAL - All Resolved ✅

All previously critical items have been completed:

- [x] **Slider component** - Created at `src/components/ui/slider.tsx`
- [x] **Avatar component** - Created at `src/components/ui/avatar.tsx`
- [x] **zod dependency** - Added to package.json
- [x] **Test dependencies** - Jest, Testing Library, Playwright all installed
- [x] **Test scripts** - `"test"`, `"test:e2e"`, `"test:watch"` all configured

---

## 🟡 HIGH PRIORITY - Core Features

### Payment System ✅
- [x] Implement PayFast webhook handler in server.ts (`/api/payment/notify`)
- [x] Add actual fund capture flow via ITN webhook
- [x] Create refund approval workflow for admin
- [x] Add payment receipt/invoice generation

### Council Submission
- [x] Implement PDF generation (Fully implemented in pdfGenerationService.ts)
- [ ] Add at least one municipality API integration (Blocked pending official municipality API credentials/specification)
- [ ] Create submission status tracking from actual portal responses (Blocked pending official portal/API access; scraper and shadow tracking scaffolds exist)

### Chat Integration ✅
- [x] Add Chat button to ClientDashboard (exists in ClientJobCard)
- [x] Add Chat button to ArchitectDashboard (added to ActiveProjectCard)
- [x] Integrate real-time messaging into job workflows

### UI Components
- [x] Implement profile picture upload in ProfileEditor.tsx (Portfolio gallery image upload implemented - avatar uses initial)
- [x] Add password reset flow (Implemented in UserSettings.tsx via Firebase)
- [x] Add email verification flow (Signup sends verification email; UserSettings supports resend/status)
- [x] Create loading skeleton components for better UX (Reusable `src/components/ui/skeleton.tsx` added)
- [x] Add pagination for jobs, submissions, and applications

---

## 🟠 MEDIUM PRIORITY - Security & Testing ✅

### Testing (Complete)
- [x] Add unit tests for all services:
  - [x] geminiService.ts (existing)
  - [x] messagingService.ts (existing)
  - [x] notificationService.ts
  - [x] paymentService.ts
  - [x] councilSubmissionService.ts
- [x] Add component tests for:
  - [x] ClientDashboard
  - [x] ArchitectDashboard
  - [x] AdminDashboard
- [x] Fix E2E tests to match actual UI selectors
- [x] Add integration tests for AI review flow
- [x] Add authentication flow tests

### Security Fixes ✅
- [x] Move admin role assignment to server-side (added `/api/auth/check-admin` endpoint)
- [x] Add rate limiting to `/api/review` endpoint (implemented via `reviewLimiter` in api-router.ts)
- [x] Move Gemini API key to server-side only (server-side in api-router.ts)
- [x] Sanitize message content to prevent XSS attacks (DOMPurify in messagingService.ts)
- [x] Add CSRF protection on API routes (same-origin guard blocks cross-origin state-changing browser requests)
- [x] Review and tighten Firestore security rules

---

## 🔵 MEDIUM PRIORITY - Business Logic

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
- [x] Create portfolio editing interface (Implemented in ProfileEditor.tsx - portfolio images, specializations, website, LinkedIn)

### Dispute Resolution
- [x] Create dispute filing system
- [x] Add admin mediation workflow
- [x] Add dispute resolution status tracking

---

## 🟣 LOW PRIORITY - Enhancements

### Performance
- [ ] Implement code splitting for dashboard components
- [ ] Add lazy loading for heavy components
- [ ] Add image optimization
- [ ] Implement virtual scrolling for large lists
- [ ] Add offline persistence for Firestore

### UX Improvements
- [ ] Add keyboard navigation shortcuts
- [ ] Add tour/onboarding for new users
- [ ] Add dark mode toggle
- [ ] Improve mobile responsiveness

### Notifications
- [x] Serverless notification worker implemented
- [ ] Add email notification delivery (Blocked pending email provider package/configuration and verified sending domain)
- [ ] Add push notification support
- [x] Add notification preferences/settings (UserSettings stores channel preferences; notification service filters channels)

### Analytics
- [ ] Add Firebase Analytics events
- [x] Create admin analytics dashboard
- [ ] Add user activity tracking

---

## 📋 Completed Tasks

- [x] Initial project setup
- [x] Basic authentication flow
- [x] Dashboard components structure
- [x] AI compliance review system
- [x] Basic chat system
- [x] Notification system (in-app + serverless worker)
- [x] SACAP verification workflow
- [x] ClientDashboard component
- [x] Payment service foundation
- [x] Multi-agent orchestration for compliance checking
- [x] PDF generation service foundation
- [x] File upload via Vercel Blob
- [x] Firebase Admin SDK initialization
- [x] Fixed duplicate UserRole import in SubmissionItem.tsx
- [x] Fixed TypeScript errors in ComplianceReport.tsx (added 'bep' to userRole type)
- [x] Fixed TypeScript errors in KnowledgeFeedback.tsx (added 'bep' to userRole type)
- [x] Fixed ClientDashboard.tsx - passing job and user props to ClientJobCard
- [x] Fixed ArchitectDashboard.tsx - corrected MunicipalTracker props
- [x] Added same-origin CSRF guard in api-router.ts
- [x] Added Firebase email verification flow
- [x] Added reusable Skeleton UI component
- [x] Added notification channel preferences/settings
- [x] Added dashboard pagination for jobs, submissions, and applications
- [x] Added client job editing, cancellation, unassignment, and status history
- [x] Added architect application submission, withdrawal, and private notes
- [x] Added team task assignment UI for architect projects
- [x] Added dispute filing and admin mediation workflow
- [x] Added admin review pipeline and analytics dashboard
- [x] Tightened Firestore rules for profile, job, application, and dispute updates

---

## 🐛 Known Bugs

1. ~~**Admin assignment** happens client-side (security issue)~~ ✅ Fixed - now server-side via `/api/auth/check-admin`
2. ~~**Payment flow** is mock UI only - no actual transactions~~ ✅ Implemented
3. **Council submission** creates records but doesn't actually submit to municipality APIs (blocked until a municipality API/portal integration is available)
4. ~~**Chat** exists but isn't integrated into dashboards~~ ✅ Fixed - Chat integrated in Client, Architect, Freelancer, and BEP dashboards
5. ~~E2E tests use incorrect selectors~~ ✅ Fixed

---

## 💡 Future Considerations

- Multi-language support (i18n)
- Mobile app (React Native/Expo)
- Advanced search with Elasticsearch
- AI-powered architect matching
- Integration with AutoCAD/Revit
- Video conferencing for consultations
- Subscription plans for architects
- Insurance integration

---

## Active Feature Branches

All feature branches have been merged to main and can be deleted:
- ✅ `fix-types` - No unique commits
- ✅ `municipal-tracker` - Merged
- ✅ `pwd-compliance` - Merged
- ✅ `bip-role` - Merged
- ✅ `arch-dash-1` - Merged
- ✅ `arch-dash-2` - Merged
- ✅ `feat-architect-profiles` - Merged
