# Full Error Log

Generated: 2026-05-03 00:16:12 +02:00

Command:

```bash
npm test -- --runInBand
```

Result:

```txt
Test Suites: 6 failed, 7 passed, 13 total
Tests:       19 failed, 71 passed, 90 total
Snapshots:   0 total
Time:        16.824 s
Ran all test suites.
```

## Passing Validation

```txt
npm run lint
```

Status: passed.

The following test suites passed in the latest full Jest run:

```txt
PASS src/services/__tests__/geminiService.test.ts
PASS src/components/__tests__/ClientDashboard.test.tsx
PASS src/lib/utils.test.ts
PASS src/services/__tests__/messagingService.test.ts
PASS src/services/__tests__/llm-config-path.test.ts
PASS src/test/schemas.test.ts
PASS src/test/integration/ai-review-flow.test.ts
```

## Failing Suites Overview

| Suite | Failed Tests | Primary Failure Type |
| --- | ---: | --- |
| `src/components/__tests__/AdminDashboard.test.tsx` | 2 | stale assertions / ambiguous text query |
| `src/components/__tests__/ArchitectDashboard.test.tsx` | 2 | stale `data-testid` expectations |
| `src/services/__tests__/paymentService.test.ts` | 6 | missing authenticated Firebase user mock |
| `src/services/__tests__/notificationService.test.ts` | 6 | stale service API names / subscription mock mismatch |
| `src/services/__tests__/councilSubmissionService.test.ts` | 2 | notification helper is not mocked/spied |
| `src/test/integration/authentication-flow.test.ts` | 1 | profile creation mock path not triggered |

## Failure Details

### 1. `src/components/__tests__/AdminDashboard.test.tsx`

#### `AdminDashboard › should render submissions tab`

Error:

```txt
TestingLibraryElementError: Found multiple elements with the text: /Submissions/i

Matching elements include:
- button text: Submissions
- paragraph text: No submissions awaiting review.

If this is intentional, then use the `*AllBy*` variant of the query
(like `queryAllByText`, `getAllByText`, or `findAllByText`).
```

Failing assertion:

```tsx
src/components/__tests__/AdminDashboard.test.tsx:298
expect(screen.getByText(/Submissions/i)).toBeInTheDocument();
```

Needs fix:

- Replace ambiguous `getByText(/Submissions/i)` with a role-based query.
- Recommended assertion:

```tsx
expect(screen.getByRole('tab', { name: /submissions/i })).toBeInTheDocument();
```

#### `AdminDashboard › should render agent configuration section`

Error:

```txt
TestingLibraryElementError: Unable to find an element with the text: Admin Portal.
```

Rendered heading in current component:

```txt
Admin Command Center
```

Failing assertion:

```tsx
src/components/__tests__/AdminDashboard.test.tsx:303
expect(screen.getByText('Admin Portal')).toBeInTheDocument();
```

Needs fix:

- Update expected text from `Admin Portal` to current UI copy.
- Recommended assertion:

```tsx
expect(screen.getByRole('heading', { name: /admin command center/i })).toBeInTheDocument();
```

### 2. `src/components/__tests__/ArchitectDashboard.test.tsx`

#### `ArchitectDashboard › should render overview tab by default`

Error:

```txt
TestingLibraryElementError: Unable to find an element by: [data-testid="tab-content-overview"]
```

Failing assertion:

```tsx
src/components/__tests__/ArchitectDashboard.test.tsx:212
expect(screen.getByTestId('tab-content-overview')).toBeInTheDocument();
```

Current rendered UI includes:

```txt
Architect Portal
Elite architectural workspace with SANS-powered compliance verification.
```

Needs fix:

- Update test to assert user-visible overview content instead of stale test ID.
- Or add `data-testid="tab-content-overview"` to the correct tab panel if the test ID is intentionally part of test infrastructure.

#### `ArchitectDashboard › should show profile editor mock`

Error:

```txt
TestingLibraryElementError: Unable to find an element by: [data-testid="profile-editor"]
```

Failing assertion:

```tsx
src/components/__tests__/ArchitectDashboard.test.tsx:217
expect(screen.getByTestId('profile-editor')).toBeInTheDocument();
```

Current rendered UI includes an `Edit Profile` button, but the profile editor content is inside a dialog and is not visible until interaction.

Needs fix:

- Click `Edit Profile` before asserting dialog content.
- Or update mock/dialog expectations to match current `DialogTrigger` behavior.
- Recommended approach:

```tsx
await user.click(screen.getByRole('button', { name: /edit profile/i }));
expect(screen.getByTestId('profile-editor')).toBeInTheDocument();
```

### 3. `src/services/__tests__/paymentService.test.ts`

All six failures share the same root error: payment service methods require an authenticated Firebase user before calling server APIs.

Source guard:

```tsx
src/services/paymentService.ts:21-24
async function requireIdToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('You must be signed in to perform this action.');
  return getIdToken(user);
}
```

#### `PaymentService › initializeEscrow › should call server and return payment details`

Error:

```txt
You must be signed in to perform this action.
```

Stack:

```txt
at requireIdToken (src/services/paymentService.ts:23:20)
at apiFetch (src/services/paymentService.ts:29:25)
at PaymentService.initializeEscrow (src/services/paymentService.ts:124:24)
at Object.<anonymous> (src/services/__tests__/paymentService.test.ts:136:43)
```

#### `PaymentService › initializeEscrow › should handle server errors`

Error:

```txt
expect(received).rejects.toThrow(expected)

Expected substring: "Insufficient funds"
Received message:   "You must be signed in to perform this action."
```

Stack:

```txt
at requireIdToken (src/services/paymentService.ts:23:20)
at apiFetch (src/services/paymentService.ts:29:25)
at PaymentService.initializeEscrow (src/services/paymentService.ts:124:24)
at Object.<anonymous> (src/services/__tests__/paymentService.test.ts:149:35)
at Object.toThrow (node_modules/expect/build/index.js:218:22)
at Object.<anonymous> (src/services/__tests__/paymentService.test.ts:150:18)
```

#### `PaymentService › confirmPayment › should confirm payment with server`

Error:

```txt
You must be signed in to perform this action.
```

Stack:

```txt
at requireIdToken (src/services/paymentService.ts:23:20)
at apiFetch (src/services/paymentService.ts:29:25)
at PaymentService.confirmPayment (src/services/paymentService.ts:134:21)
at Object.<anonymous> (src/services/__tests__/paymentService.test.ts:161:28)
```

#### `PaymentService › releaseMilestone › should release payment and notify architect`

Error:

```txt
You must be signed in to perform this action.
```

Stack:

```txt
at requireIdToken (src/services/paymentService.ts:23:20)
at apiFetch (src/services/paymentService.ts:29:25)
at PaymentService.releaseMilestone (src/services/paymentService.ts:150:24)
at Object.<anonymous> (src/services/__tests__/paymentService.test.ts:174:28)
```

#### `PaymentService › requestMilestoneRelease › should send request to server`

Error:

```txt
You must be signed in to perform this action.
```

Stack:

```txt
at requireIdToken (src/services/paymentService.ts:23:20)
at apiFetch (src/services/paymentService.ts:29:25)
at PaymentService.requestMilestoneRelease (src/services/paymentService.ts:171:8)
at Object.<anonymous> (src/services/__tests__/paymentService.test.ts:193:28)
```

#### `PaymentService › processRefund › should process refund via server`

Error:

```txt
You must be signed in to perform this action.
```

Stack:

```txt
at requireIdToken (src/services/paymentService.ts:23:20)
at apiFetch (src/services/paymentService.ts:29:25)
at PaymentService.processRefund (src/services/paymentService.ts:185:21)
at Object.<anonymous> (src/services/__tests__/paymentService.test.ts:206:28)
```

Needs fix:

- Mock `auth.currentUser` in `@/lib/firebase` for payment tests.
- Mock `getIdToken` from `firebase/auth`.
- Ensure server error tests reach `fetch` instead of failing at auth guard.

Recommended mock shape:

```tsx
jest.mock('@/lib/firebase', () => ({
  db: {},
  auth: {
    currentUser: { uid: 'user-1' },
  },
}));

jest.mock('firebase/auth', () => ({
  getIdToken: jest.fn(() => Promise.resolve('test-id-token')),
}));
```

### 4. `src/services/__tests__/notificationService.test.ts`

#### `NotificationService › subscribeToNotifications › should subscribe and return unsubscribe function`

Error:

```txt
expect(jest.fn()).toHaveBeenCalled()

Expected number of calls: >= 1
Received number of calls:    0
```

Failing assertion:

```tsx
src/services/__tests__/notificationService.test.ts:150
expect(unsubscribe).toHaveBeenCalled();
```

Needs fix:

- A returned unsubscribe function should not be expected to be called just because it was returned.
- Call it explicitly before asserting:

```tsx
const unsubscribe = notificationService.subscribeToNotifications('user-1', callback);
unsubscribe();
expect(unsubscribe).toHaveBeenCalled();
```

#### `NotificationService › subscribeToNotifications › should call callback with notifications`

Error:

```txt
expect(jest.fn()).toHaveBeenCalledWith(...expected)

Expected: ArrayContaining [ObjectContaining {"id": "notif-1", "type": "job_application", "userId": "user-1"}]
Received: []
Number of calls: 1
```

Failing assertion:

```tsx
src/services/__tests__/notificationService.test.ts:157
expect(callback).toHaveBeenCalledWith(
  expect.arrayContaining([
    expect.objectContaining({
      id: 'notif-1',
      type: 'job_application',
      userId: 'user-1',
    }),
  ])
);
```

Needs fix:

- Update the `onSnapshot` mock to provide docs with expected `id` and `data()`.
- Current mock appears to call callback with an empty docs array.

#### `NotificationService › unsubscribe › should unsubscribe all listeners`

Error:

```txt
TypeError: notificationService.unsubscribe is not a function
```

Failing line:

```tsx
src/services/__tests__/notificationService.test.ts:199
notificationService.unsubscribe();
```

Current implementation exposes:

```tsx
cleanup(): void {
  this.unsubscribeFns.forEach(unsubscribe => unsubscribe());
  this.unsubscribeFns.clear();
}
```

Needs fix:

- Replace `notificationService.unsubscribe()` with `notificationService.cleanup()`.

#### `NotificationService › notification type helpers › should notify on job application`

Error:

```txt
TypeError: notificationService.notifyJobApplication is not a function
```

Failing line:

```tsx
src/services/__tests__/notificationService.test.ts:210
await notificationService.notifyJobApplication('client-1', 'architect-1', 'job-1', 'app-1');
```

Current likely replacement:

```tsx
notifyNewApplication(clientId: string, architectName: string, jobTitle: string, jobId: string)
```

Needs fix:

- Update test to current helper API.

#### `NotificationService › notification type helpers › should notify on new message`

Error:

```txt
TypeError: notificationService.notifyMessage is not a function
```

Failing line:

```tsx
src/services/__tests__/notificationService.test.ts:281
await notificationService.notifyMessage('recipient-1', 'sender-1', 'Hello', 'job-1');
```

Current likely replacement:

```tsx
notifyNewMessage(recipientId: string, senderName: string, jobTitle: string, jobId: string)
```

Needs fix:

- Update test to current helper API.

#### `NotificationService › notification type helpers › should notify on milestone due`

Error:

```txt
TypeError: notificationService.notifyMilestoneDue is not a function
```

Failing line:

```tsx
src/services/__tests__/notificationService.test.ts:291
await notificationService.notifyMilestoneDue('architect-1', 'draft', 'job-1', 7);
```

Current likely replacements include:

```tsx
notifyMilestoneRequest(clientId: string, jobTitle: string, milestone: string, jobId: string)
notifyEscrowFunded(clientId: string, architectId: string, amount: number, jobId: string)
```

Needs fix:

- Update test to the current milestone notification helper that matches intended behavior.

### 5. `src/services/__tests__/councilSubmissionService.test.ts`

#### `CouncilSubmissionService › submitToCouncil › should create a submission and update the job`

Error:

```txt
expect(received).toHaveBeenCalled()

Matcher error: received value must be a mock or spy function

Received has type:  function
Received has value: [Function notifyCouncilUpdate]
```

Failing assertion:

```tsx
src/services/__tests__/councilSubmissionService.test.ts:101
expect(notificationService.notifyCouncilUpdate).toHaveBeenCalled();
```

Needs fix:

- Mock `notificationService.notifyCouncilUpdate` with `jest.fn()`.
- Or spy on the real service method:

```tsx
const notifyCouncilUpdateSpy = jest
  .spyOn(notificationService, 'notifyCouncilUpdate')
  .mockResolvedValue(undefined);

expect(notifyCouncilUpdateSpy).toHaveBeenCalled();
```

#### `CouncilSubmissionService › updateStatus › should update status and notify client`

Error:

```txt
expect(received).toHaveBeenCalled()

Matcher error: received value must be a mock or spy function

Received has type:  function
Received has value: [Function notifyCouncilUpdate]
```

Failing assertion:

```tsx
src/services/__tests__/councilSubmissionService.test.ts:129
expect(notificationService.notifyCouncilUpdate).toHaveBeenCalled();
```

Needs fix:

- Same as above: mock or spy on `notifyCouncilUpdate` before asserting calls.

### 6. `src/test/integration/authentication-flow.test.ts`

#### `Authentication Flow Integration › should create user profile on first Google sign in`

Error:

```txt
expect(jest.fn()).toHaveBeenCalled()

Expected number of calls: >= 1
Received number of calls:    0
```

Failing assertion:

```tsx
src/test/integration/authentication-flow.test.ts:183
expect(mockSetDoc).toHaveBeenCalled();
```

Needs fix:

- Ensure mocked first-sign-in profile lookup returns a missing profile:

```tsx
exists: () => false
```

- Verify the tested auth flow still creates profiles with `setDoc`.
- If profile creation moved into another effect/service, update the integration test to exercise that path.

## Console Warnings In Passing Tests

These logs appear during passing AI review tests and are expected by the tested failure paths, but they still add noise to full test output.

### `src/services/__tests__/geminiService.test.ts`

Warnings/errors observed while suite still passed:

```txt
Failed to parse agent JSON: SyntaxError: Unexpected token 'i', "invalid te"... is not valid JSON
Retrying after error: Error: fail1. Retries remaining: 3
Retrying after error: Error: fail2. Retries remaining: 2
Regulatory scope pre-pass failed: SyntaxError: Unexpected token 'N', "No issues "... is not valid JSON
Regulatory scope pre-pass failed: Error: Network error
Agent Architectural Completeness Agent failed: Error: Network error
Agent SANS 10400 General Agent failed: Error: Network error
Agent Envelope and Materials Agent failed: Error: Network error
AI orchestration failed: Error: Network error
```

Relevant source locations:

```txt
src/services/geminiService.ts:202
src/services/geminiService.ts:105
src/services/geminiService.ts:440
src/services/geminiService.ts:477
src/services/geminiService.ts:591
```

### `src/test/integration/ai-review-flow.test.ts`

Warnings/errors observed while suite still passed:

```txt
Failed to parse V2 agent JSON: SyntaxError: Unexpected end of JSON input
Failed to parse agent JSON: SyntaxError: Unexpected end of JSON input
Agent Architectural Completeness Agent failed: Error: Agent timeout
Regulatory scope pre-pass failed: Error: Service unavailable
Agent Architectural Completeness Agent failed: Error: Service unavailable
Agent SANS 10400 General Agent failed: Error: Service unavailable
Agent Envelope and Materials Agent failed: Error: Service unavailable
AI orchestration failed: Error: Service unavailable
```

Relevant source locations:

```txt
src/services/geminiService.ts:236
src/services/geminiService.ts:202
src/services/geminiService.ts:440
src/services/geminiService.ts:477
src/services/geminiService.ts:591
```

Needs fix if noise-free tests are required:

- Suppress expected console warnings/errors inside tests that intentionally exercise fallback/error paths.
- Or assert logs explicitly with scoped spies:

```tsx
const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

// run expected failure-path test

warnSpy.mockRestore();
errorSpy.mockRestore();
```

## Recommended Fix Order

1. Fix dashboard test assertions first; they are stale UI expectations and low risk.
2. Fix `paymentService.test.ts` auth mocks; this likely resolves all six payment failures at once.
3. Fix `notificationService.test.ts` helper names and subscription mock shape.
4. Fix `councilSubmissionService.test.ts` by mocking or spying `notifyCouncilUpdate`.
5. Fix authentication-flow mock setup so the first sign-in path actually reaches profile creation.
6. Optionally suppress expected console output in passing AI fallback tests.

## Raw Command Footer

```txt
Test Suites: 6 failed, 7 passed, 13 total
Tests:       19 failed, 71 passed, 90 total
Snapshots:   0 total
Time:        16.824 s
Ran all test suites.
```
