# Architex Project TODO

> Last Updated: 2026-04-14
> Status: Active Development

## 🔴 CRITICAL - Fix Immediately (Build/Runtime Blockers)

- [ ] **Create missing `Slider` component** in `src/components/ui/slider.tsx`
  - Imported in SearchFilter.tsx but doesn't exist
  - Required for budget filter functionality

- [ ] **Create missing `Avatar` component** in `src/components/ui/avatar.tsx`
  - Imported in Chat.tsx and ArchitectPortfolio.tsx
  - Required for user profile display

- [ ] **Add `zod` dependency to package.json**
  - Imported in schemas.ts but not listed in dependencies

- [ ] **Add missing test dependencies to package.json**
  - `jest`
  - `@testing-library/react`
  - `@testing-library/jest-dom`
  - `playwright`

- [ ] **Add test scripts to package.json**
  - `"test": "jest"`
  - `"test:e2e": "playwright test"`
  - `"test:watch": "jest --watch"`

---

## 🟡 HIGH PRIORITY - Core Features

### UI Components
- [ ] Implement profile picture upload in ProfileEditor.tsx
- [ ] Add password reset flow
- [ ] Add email verification flow
- [ ] Create loading skeleton components for better UX
- [ ] Add pagination for jobs, submissions, and applications

### Payment System
- [ ] Implement PayFast webhook handler in server.ts (`/api/payment/notify`)
- [ ] Add actual fund capture flow (currently mock UI only)
- [ ] Create refund approval workflow for admin
- [ ] Add payment receipt/invoice generation

### Council Submission
- [ ] Implement PDF generation (currently returns placeholder)
- [ ] Add at least one municipality API integration
- [ ] Create submission status tracking from actual portal responses

### Chat Integration
- [ ] Add Chat button to ClientDashboard
- [ ] Add Chat button to ArchitectDashboard
- [ ] Integrate real-time messaging into job workflows

---

## 🟠 MEDIUM PRIORITY - Security & Testing

### Security Fixes
- [ ] Move admin role assignment to server-side (currently client-side in App.tsx)
- [ ] Add rate limiting to `/api/review` endpoint
- [ ] Move Gemini API key to server-side only (currently exposed via vite.config.ts)
- [ ] Add CSRF protection on API routes
- [ ] Sanitize message content to prevent XSS attacks
- [ ] Review and tighten Firestore security rules

### Testing
- [ ] Add unit tests for all services:
  - [ ] geminiService.ts
  - [ ] messagingService.ts
  - [ ] notificationService.ts
  - [ ] paymentService.ts
  - [ ] councilSubmissionService.ts
- [ ] Add component tests for:
  - [ ] ClientDashboard
  - [ ] ArchitectDashboard
  - [ ] AdminDashboard
- [ ] Fix E2E tests to match actual UI selectors
- [ ] Add integration tests for AI review flow
- [ ] Add authentication flow tests

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
- [x] Notification system (in-app)
- [x] SACAP verification workflow

---

## 🐛 Known Bugs

1. **Admin assignment** happens client-side (security issue)
2. **Payment flow** is mock UI only - no actual transactions
3. **Council submission** creates records but doesn't actually submit
4. **Chat** exists but isn't integrated into dashboards
5. **E2E tests** use incorrect selectors

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
