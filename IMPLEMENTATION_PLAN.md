# Architex Implementation Plan

> Complete roadmap to production-ready state
> Version: 1.0
> Target: MVP Release

---

## Phase 1: Critical Fixes (Week 1)

### Goal: Fix build/runtime blockers

#### 1.1 Missing UI Components

**Slider Component** (`src/components/ui/slider.tsx`)
```typescript
// Implementation using Radix UI Slider primitive
// Props: value, min, max, step, onChange, disabled
// Styling: Tailwind v4 with shadcn design system
```

**Tasks:**
- [ ] Install `@radix-ui/react-slider`
- [ ] Create slider component with shadcn styling
- [ ] Integrate with SearchFilter.tsx budget range
- [ ] Test range selection functionality

**Avatar Component** (`src/components/ui/avatar.tsx`)
```typescript
// Implementation using Radix UI Avatar primitive
// Props: src, alt, fallback
// Features: Fallback initials, image loading state
```

**Tasks:**
- [ ] Install `@radix-ui/react-avatar`
- [ ] Create avatar component with fallback support
- [ ] Update Chat.tsx to use Avatar component
- [ ] Update ArchitectPortfolio.tsx to use Avatar component
- [ ] Test with missing images

#### 1.2 Package.json Fixes

**Dependencies to Add:**
```json
{
  "dependencies": {
    "zod": "^3.23.0",
    "@radix-ui/react-slider": "^1.2.0",
    "@radix-ui/react-avatar": "^1.1.0"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "@testing-library/react": "^14.3.0",
    "@testing-library/jest-dom": "^6.4.0",
    "@playwright/test": "^1.43.0"
  }
}
```

**Scripts to Add:**
```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui"
  }
}
```

**Tasks:**
- [ ] Add missing dependencies
- [ ] Run `npm install` to verify
- [ ] Run `npm run lint` to check for TypeScript errors
- [ ] Update jest.config.ts if needed

---

## Phase 2: Security Hardening (Week 1-2)

### Goal: Secure the application

#### 2.1 Admin Role Security

**Current Problem:**
Admin assignment happens client-side in App.tsx (lines 127-128, 184-185)

**Solution:**
Move admin assignment to server-side using Firebase Cloud Functions

**Implementation:**
```typescript
// Firebase Cloud Function (to be created)
// Trigger: onCreate user
// Check email against admin list
// Set role in Firestore
```

**Tasks:**
- [ ] Create `functions/` directory for Firebase Functions
- [ ] Set up Firebase Functions SDK
- [ ] Create `onUserCreate` Cloud Function
- [ ] Move admin email list to server-side config
- [ ] Remove client-side admin assignment
- [ ] Test with admin and non-admin accounts

#### 2.2 API Key Protection

**Current Problem:**
Gemini API key exposed via vite.config.ts `define`

**Solution:**
Move all LLM calls to server-side only

**Implementation:**
```typescript
// server.ts - Add server-side proxy
app.post('/api/gemini/review', async (req, res) => {
  // Server-side API call with protected key
});
```

**Tasks:**
- [ ] Create server-side Gemini proxy endpoint
- [ ] Remove client-side Gemini API calls
- [ ] Update geminiService.ts to use server proxy
- [ ] Test AI review flow end-to-end
- [ ] Remove GEMINI_API_KEY from vite.config.ts define

#### 2.3 Rate Limiting

**Implementation:**
```typescript
// server.ts - Add rate limiting middleware
import rateLimit from 'express-rate-limit';

const reviewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 requests per windowMs
  message: 'Too many review requests, please try again later'
});

app.use('/api/review', reviewLimiter);
```

**Tasks:**
- [ ] Install `express-rate-limit`
- [ ] Configure rate limiting for `/api/review`
- [ ] Configure rate limiting for `/api/gemini/review`
- [ ] Add rate limit headers to responses
- [ ] Test rate limiting functionality

#### 2.4 Input Sanitization

**Implementation:**
```typescript
// messagingService.ts - Add sanitization
import DOMPurify from 'dompurify';

const sanitizedContent = DOMPurify.sanitize(messageContent);
```

**Tasks:**
- [ ] Install `dompurify` and `@types/dompurify`
- [ ] Add sanitization to all user-generated content:
  - [ ] Chat messages
  - [ ] Job descriptions
  - [ ] User profiles
  - [ ] Comments/reviews
- [ ] Test XSS prevention

---

## Phase 3: Payment System (Week 2-3)

### Goal: Functional payment and escrow

#### 3.1 PayFast Webhook Handler

**Implementation:**
```typescript
// server.ts - Add ITN handler
app.post('/api/payment/notify', async (req, res) => {
  // Validate PayFast signature
  // Verify payment data
  // Update escrow status in Firestore
  // Send notification to relevant parties
});
```

**Tasks:**
- [ ] Research PayFast ITN (Instant Transaction Notification)
- [ ] Implement signature validation
- [ ] Create payment status update logic
- [ ] Add fraud checks (amount, merchant_id verification)
- [ ] Test with PayFast sandbox
- [ ] Create payment status webhook handler

#### 3.2 Escrow Management

**Implementation:**
```typescript
// paymentService.ts - Complete implementation
- captureFunds(jobId: string)
- releaseFunds(jobId: string, milestoneId: string)
- processRefund(jobId: string, amount: number, reason: string)
- getEscrowStatus(jobId: string)
```

**Tasks:**
- [ ] Complete captureFunds implementation
- [ ] Add milestone release workflow
- [ ] Create refund approval UI for admin
- [ ] Add refund processing logic
- [ ] Create payment receipt generation
- [ ] Add payment history to user dashboards

#### 3.3 Payment UI

**Tasks:**
- [ ] Create PaymentConfirmation component
- [ ] Add payment status indicators to jobs
- [ ] Create escrow release request UI
- [ ] Add payment history view
- [ ] Create refund request form

---

## Phase 4: Council Submission (Week 3-4)

### Goal: Real council submissions

#### 4.1 PDF Generation

**Implementation:**
```typescript
// councilSubmissionService.ts
import { PDFDocument } from 'pdf-lib';

async function generateSubmissionPackage(submission: Submission): Promise<Blob> {
  // Combine drawings, compliance reports, forms into single PDF
  // Add cover page with submission details
  // Add table of contents
  // Return PDF blob for upload
}
```

**Tasks:**
- [ ] Install `pdf-lib` dependency
- [ ] Create PDF generation service
- [ ] Design submission package template
- [ ] Add drawing compilation logic
- [ ] Add compliance report integration
- [ ] Test PDF output quality

#### 4.2 Municipality API Integration

**Priority 1: City of Cape Town**
```typescript
// Municipality with API integration
{
  id: 'city-of-cape-town',
  name: 'City of Cape Town',
  hasApi: true,
  apiEndpoint: 'https://api.capetown.gov.za/...',
  authType: 'oauth2'
}
```

**Tasks:**
- [ ] Research City of Cape Town API documentation
- [ ] Apply for API access/developer account
- [ ] Implement OAuth2 authentication
- [ ] Create submission upload endpoint
- [ ] Add status polling for submissions
- [ ] Handle error responses

**Priority 2: eThekwini (Durban)**
- [ ] Research API availability
- [ ] Implement if available

**Priority 3: Manual Fallback**
```typescript
// For municipalities without API
{
  hasApi: false,
  manualInstructions: "Download forms from...",
  contactEmail: "submissions@...",
  requiredDocuments: [...]
}
```

**Tasks:**
- [ ] Create manual submission guide generator
- [ ] Add document checklist for each municipality
- [ ] Create submission tracking even for manual process

---

## Phase 5: Chat Integration (Week 4)

### Goal: Fully integrated messaging

#### 5.1 Chat UI Integration

**Tasks:**
- [ ] Add Chat button to ClientDashboard navigation
- [ ] Add Chat button to ArchitectDashboard navigation
- [ ] Create conversation list sidebar in dashboards
- [ ] Add unread message badge to navigation
- [ ] Integrate Chat component into dashboard layout

#### 5.2 Message Notifications

**Implementation:**
```typescript
// Express Server Worker (server.ts)
// Listen to 'notifications' collection where deliveryStatus === 'pending'
// Deliver via SendGrid/FCM
// Update deliveryStatus to 'delivered' or 'failed'
```

**Tasks:**
- [x] Create server-side worker in `server.ts` to process notifications
- [x] Add `/api/notifications/token` endpoint for FCM registration
- [ ] Add real-time message listeners in dashboards
- [ ] Show toast notifications for new messages
- [ ] Update NotificationBell to include message notifications
- [ ] Implement actual SendGrid integration (currently simulated)
- [ ] Implement actual FCM integration (currently simulated)

#### 5.3 Contextual Chat

**Tasks:**
- [ ] Auto-create conversation when job application accepted
- [ ] Link messages to specific jobs/submissions
- [ ] Add job context to chat header
- [ ] Enable file sharing in chat (drawings, documents)
- [ ] Add message threading for complex discussions

---

## Phase 6: Testing (Week 4-5)

### Goal: Comprehensive test coverage

#### 6.1 Unit Tests

**Service Tests:**
```typescript
// src/services/__tests__/geminiService.test.ts
describe('GeminiService', () => {
  test('should review submission with all agents', async () => {
    // Mock Firestore
    // Mock Gemini API
    // Verify agent orchestration
  });
  
  test('should handle AI review failure gracefully', async () => {
    // Error handling test
  });
});
```

**Tasks:**
- [ ] Add jest setup and configuration
- [ ] Create service test files:
  - [ ] geminiService.test.ts
  - [ ] messagingService.test.ts
  - [ ] notificationService.test.ts
  - [ ] paymentService.test.ts
  - [ ] councilSubmissionService.test.ts
- [ ] Mock Firebase and external APIs
- [ ] Achieve 70%+ coverage for services

#### 6.2 Component Tests

```typescript
// src/components/__tests__/ClientDashboard.test.tsx
describe('ClientDashboard', () => {
  test('should display jobs list', async () => {
    // Mock Firestore snapshot
    // Render component
    // Verify jobs displayed
  });
  
  test('should create new job', async () => {
    // Form interaction test
  });
});
```

**Tasks:**
- [ ] Set up React Testing Library
- [ ] Create dashboard component tests:
  - [ ] ClientDashboard.test.tsx
  - [ ] ArchitectDashboard.test.tsx
  - [ ] AdminDashboard.test.tsx
- [ ] Mock Firebase Auth context
- [ ] Mock Firestore hooks

#### 6.3 E2E Tests

```typescript
// e2e/auth.spec.ts
test('complete signup and login flow', async () => {
  // Update selectors to match actual UI
  // Test Google OAuth flow (mock)
  // Test role selection
  // Test dashboard access
});
```

**Tasks:**
- [ ] Update Playwright selectors to match actual UI
- [ ] Create E2E test scenarios:
  - [ ] Complete signup flow
  - [ ] Job posting and application
  - [ ] Submission and AI review
  - [ ] Payment flow (sandbox)
  - [ ] Chat messaging
- [ ] Set up test database isolation
- [ ] Configure CI to run E2E tests

---

## Phase 7: Business Logic (Week 5-6)

### Goal: Complete marketplace functionality

#### 7.1 Job Management

**Tasks:**
- [ ] Add job editing UI
- [ ] Create job update API
- [ ] Add job cancellation flow
- [ ] Implement job status change history
- [ ] Add job analytics (views, applications count)

#### 7.2 Application Management

**Tasks:**
- [ ] Add application withdrawal button
- [ ] Create withdrawal confirmation flow
- [ ] Add application notes field
- [ ] Create application status timeline

#### 7.3 Architect Features

**Tasks:**
- [ ] Create portfolio editing page
- [ ] Add project gallery upload
- [ ] Create team management UI
- [ ] Add availability calendar
- [ ] Create architect analytics dashboard

#### 7.4 Dispute Resolution

**Tasks:**
- [ ] Create dispute filing form
- [ ] Add dispute status tracking
- [ ] Create admin mediation interface
- [ ] Add resolution workflow
- [ ] Implement escrow freeze during disputes

---

## Phase 8: Performance & Polish (Week 6)

### Goal: Production-ready performance

#### 8.1 Code Splitting

**Implementation:**
```typescript
// App.tsx
const ClientDashboard = lazy(() => import('./components/ClientDashboard'));
const ArchitectDashboard = lazy(() => import('./components/ArchitectDashboard'));
const AdminDashboard = lazy(() => import('./components/AdminDashboard'));
```

**Tasks:**
- [ ] Implement React.lazy for dashboard components
- [ ] Add Suspense boundaries with loading states
- [ ] Verify bundle size reduction
- [ ] Test code splitting in production build

#### 8.2 Pagination

**Implementation:**
```typescript
// Firestore pagination
const q = query(
  collection(db, 'jobs'),
  orderBy('createdAt', 'desc'),
  limit(20)
);

// Cursor-based pagination
const nextPage = query(q, startAfter(lastDocument), limit(20));
```

**Tasks:**
- [ ] Implement pagination for jobs list
- [ ] Add pagination for submissions
- [ ] Create pagination for applications
- [ ] Add infinite scroll option
- [ ] Update pagination UI components

#### 8.3 Image Optimization

**Tasks:**
- [ ] Add image compression on upload
- [ ] Implement responsive images (srcset)
- [ ] Add lazy loading for images
- [ ] Create thumbnail generation
- [ ] Add blur placeholder for images

#### 8.4 Offline Support

**Tasks:**
- [ ] Enable Firestore offline persistence
- [ ] Add offline indicators in UI
- [ ] Queue mutations for offline users
- [ ] Add sync status indicators
- [ ] Test offline functionality

---

## Phase 9: Documentation (Week 6-7)

### Goal: Complete project documentation

#### 9.1 API Documentation

**Tasks:**
- [ ] Document all API endpoints
- [ ] Create API request/response examples
- [ ] Add authentication documentation
- [ ] Create webhook integration guide
- [ ] Add error code reference

#### 9.2 User Documentation

**Tasks:**
- [ ] Create user guide for clients
- [ ] Create user guide for architects
- [ ] Add admin documentation
- [ ] Create FAQ section
- [ ] Add troubleshooting guide

#### 9.3 Developer Documentation

**Tasks:**
- [ ] Update README.md with detailed setup
- [ ] Document component usage
- [ ] Add architecture diagrams
- [ ] Create contribution guidelines
- [ ] Add changelog

---

## Phase 10: Deployment (Week 7)

### Goal: Production deployment

#### 10.1 Pre-deployment Checklist

- [ ] Run full test suite (all tests passing)
- [ ] Security audit completed
- [ ] Performance benchmarks met
- [ ] Environment variables configured
- [ ] Database indexes created
- [ ] Firebase rules deployed
- [ ] SSL certificates configured

#### 10.2 Deployment Steps

**Tasks:**
- [ ] Create production build
- [ ] Deploy to Firebase Hosting
- [ ] Deploy Firebase Functions
- [ ] Update Firestore security rules
- [ ] Configure custom domain
- [ ] Set up monitoring (Sentry, LogRocket)
- [ ] Configure backups

#### 10.3 Post-deployment

- [ ] Run smoke tests
- [ ] Monitor error rates
- [ ] Check performance metrics
- [ ] Validate payment webhooks
- [ ] Test email delivery
- [ ] Verify SSL/security headers

---

## Resource Requirements

### Development Team
- 1x Full-stack Developer (primary)
- 1x UI/UX Designer (for Phase 8 polish)
- 1x QA Engineer (Phase 6 onwards)

### External Services
- Firebase (Auth, Firestore, Functions, Hosting)
- Vercel Blob (file storage)
- Google Gemini API
- PayFast (payment gateway)
- SendGrid/AWS SES (email)

### Tools
- VS Code with extensions
- Node.js 20+
- Firebase CLI
- Git + GitHub
- Figma (design)

---

## Success Criteria

### Phase Completion
- [ ] **Phase 1**: Project builds without errors, all imports resolved
- [ ] **Phase 2**: Security audit passed, no client-side secrets
- [ ] **Phase 3**: Payments processed end-to-end in sandbox
- [ ] **Phase 4**: At least one municipality API integrated
- [ ] **Phase 5**: Chat working between client and architect
- [ ] **Phase 6**: 70%+ test coverage, E2E tests passing
- [ ] **Phase 7**: All marketplace features functional
- [ ] **Phase 8**: Lighthouse score >90
- [ ] **Phase 9**: Documentation complete
- [ ] **Phase 10**: Production deployment successful

### Key Metrics
- Page load time: < 3 seconds
- Time to interactive: < 5 seconds
- Test coverage: > 70%
- Error rate: < 0.1%
- Uptime: > 99.9%

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Municipality API unavailable | High | Implement manual fallback process |
| PayFast integration delays | Medium | Use extended sandbox testing |
| Firebase costs exceed budget | Medium | Implement usage monitoring, caching |
| Gemini API rate limits | Medium | Implement request queuing, fallbacks |
| Security vulnerabilities found | High | Regular audits, rapid patching |

---

## Appendix

### A. File Structure
```
architex/
├── src/
│   ├── components/
│   │   ├── ui/              # shadcn components
│   │   ├── *Dashboard.tsx   # Role dashboards
│   │   └── ...
│   ├── services/            # Business logic
│   ├── lib/                 # Utilities, Firebase
│   ├── types.ts             # TypeScript types
│   └── test/                # Test utilities
├── functions/               # Firebase Functions
├── e2e/                     # Playwright tests
├── server.ts                # Express server
└── docs/                    # Documentation
```

### B. Environment Variables
```
# Required
GEMINI_API_KEY=
VITE_BLOB_READ_WRITE_TOKEN=
VITE_PAYFAST_MERCHANT_ID=
VITE_PAYFAST_MERCHANT_KEY=

# Optional
VITE_PAYFAST_PASSPHRASE=
VITE_PAYFAST_SANDBOX=true
```

### C. Firebase Collections
- `users` - User profiles
- `jobs` - Job postings
- `applications` - Job applications
- `submissions` - Drawing submissions
- `conversations` - Chat conversations
- `messages` - Chat messages
- `notifications` - User notifications
- `payments` - Payment records
- `escrow` - Escrow transactions
- `agents` - AI agent configurations
