# Architex: Production Re-creation Prompt

This prompt is designed to recreate the **Architex** platform—a high-end architectural marketplace that integrates AI-powered compliance checking with a professional project management workflow.

---

## Core Vision
Build **Architex**, a premier architectural marketplace for South Africa. The platform connects property owners (Clients) with SACAP-registered professionals (Architects). The unique selling proposition is an **AI-powered SANS 10400 compliance engine** that reviews technical drawings before they are submitted to local municipalities.

## Tech Stack
- **Frontend:** React 18+, Vite, TypeScript.
- **Styling:** Tailwind CSS (Modern, Minimalist, Architectural aesthetic).
- **Animations:** `motion` (motion/react).
- **Icons:** `lucide-react`.
- **Backend/Database:** Firebase (Auth & Firestore).
- **AI Integration:** Google Gemini API (via `@google/genai`) for drawing analysis.
- **UI Components:** Shadcn UI (Card, Button, Input, Dialog, Tabs, Badge, ScrollArea).

## Design Language
- **Aesthetic:** Minimalist, "Swiss Modern" architectural style.
- **Colors:** Primary Teal Green (`#0d9488`), Crisp White, Soft Slate Grays (`#F8FAFC` background).
- **UI Patterns:** Glassmorphism (backdrop blurs), generous whitespace, oversized "tighter" headings, 2XL/3XL rounded corners, and subtle shadows.
- **Branding:** Use a custom architectural bird logo (abstract geometric) throughout.

## User Roles & Dashboards

### 1. Landing Page (The Marketplace)
- A high-impact hero section with architectural grid patterns.
- A "Live Marketplace" section showing active jobs fetched from Firestore.
- Job cards displaying Title, Description, Budget (ZAR), Category, and Location.
- **Admin Hotkey:** Implement `CONTROL + ALT + ]` to auto-login a system admin (`gm.tarb@gmail.com`) for testing.

### 2. Client Dashboard ("Client Workspace")
- **Job Posting:** A dialog-based form to post jobs with: Title, Description, Category (Residential, Commercial, Industrial, Renovation, Interior, Landscape), Budget, Deadline, and Requirements.
- **Project Management:** View active jobs, see applicant counts, and hire architects.
- **Escrow & Payments:** Visual representation of secured funds and milestone tracking (Deposit, Draft, Final).
- **Ratings:** Ability to rate architects upon job completion.

### 3. Architect Dashboard ("Architect Studio")
- **Job Browser:** Find open jobs and apply with proposals and portfolio links.
- **Active Projects:** Manage hired jobs.
- **Drawing Submission Workflow:**
    - **AI Pre-check:** Before submitting, architects can run an AI scan on their drawing name/URL for SANS 10400 compliance.
    - **Submission Journey:** Statuses: `Processing` -> `AI Reviewing` -> `Awaiting Admin Approval` -> `Approved`.
    - **Traceability Log:** A vertical timeline tracking every step (e.g., "AI Compliance Check Completed", "Routing to Admin").
- **AI Feedback:** Display detailed markdown feedback from Gemini regarding SANS 10400 compliance.

### 4. Admin Dashboard ("Control Center")
- **Compliance Oversight:** A dedicated view to see all drawings that have passed AI review.
- **Approval Workflow:** Admins can view AI feedback, the drawing itself, and provide final "Council Ready" approval or rejection with feedback.

## Critical Technical Requirements
- **Firebase Security:** Hardened `firestore.rules` using the "Validator Function Pattern". Ensure collection group support for global submission tracking.
- **Error Handling:** A centralized `handleFirestoreError` utility that throws structured JSON errors.
- **Error Boundary:** A global React Error Boundary that parses structured Firestore errors and displays a recovery UI.
- **AI Service:** A `geminiService.ts` that uses the Gemini Pro model to analyze drawing metadata against SANS 10400 standards.
- **Real-time:** Use `onSnapshot` for all dashboard data to ensure a live, collaborative feel.

## Data Schema (Firestore)
- `/users/{uid}`: Profile with roles.
- `/jobs/{jobId}`: Job details.
- `/jobs/{jobId}/applications/{appId}`: Architect proposals.
- `/jobs/{jobId}/submissions/{subId}`: Drawing files, AI feedback, and traceability logs.
- `/reviews/{reviewId}`: Cross-role feedback.
