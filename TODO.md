# Architex Project TODO

> Last Updated: 2026-04-28
> Status: Active Development - Phase 2 (Testing & Polish)
> Overall Completion: ~85%

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
- [ ] Implement PDF generation (currently returns placeholder)
- [ ] Add at least one municipality API integration
- [ ] Create submission status tracking from actual portal responses

### Chat Integration ✅
- [x] Add Chat button to ClientDashboard (exists in ClientJobCard)
- [x] Add Chat button to ArchitectDashboard (added to ActiveProjectCard)
- [x] Integrate real-time messaging into job workflows

### UI Components
- [ ] Implement profile picture upload in ProfileEditor.tsx
- [ ] Add password reset flow
- [ ] Add email verification flow
- [ ] Create loading skeleton components for better UX
- [ ] Add pagination for jobs, submissions, and applications

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
- [x] Add rate limiting to `/api/review` endpoint (already implemented via `reviewLimiter`)
- [x] Move Gemini API key to server-side only (already server-side in api-router.ts)
- [ ] Add CSRF protection on API routes
- [ ] Sanitize message content to prevent XSS attacks
- [ ] Review and tighten Firestore security rules

---

## 🔵 MEDIUM PRIORITY - Business Logic

### Job Management
- [ ] Add job editing functionality for clients
- [ ] Add job deletion/cancellation flow
- [ ] Add job status change history

### Application Management
- [ ] Add application withdrawal for architects
- [ ] Add application notes/comments

### Architect Management
- [ ] Add architect unassignment functionality
- [ ] Add team member management UI
- [ ] Create portfolio editing interface

### Dispute Resolution
- [ ] Create dispute filing system
- [ ] Add admin mediation workflow
- [ ] Add dispute resolution status tracking

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
- [ ] Add email notification delivery
- [ ] Add push notification support
- [ ] Add notification preferences/settings

### Analytics
- [ ] Add Firebase Analytics events
- [ ] Create admin analytics dashboard
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

---

## 🐛 Known Bugs

1. **Admin assignment** happens client-side (security issue)
2. ~~**Payment flow** is mock UI only - no actual transactions~~ ✅ Implemented
3. **Council submission** creates records but doesn't actually submit
4. **Chat** exists but isn't integrated into dashboards
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
