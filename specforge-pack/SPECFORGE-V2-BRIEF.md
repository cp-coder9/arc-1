# SpecForge V2 — Intelligence-First Specification Engine

## Core Philosophy Change

SpecForge is NOT a form you fill in. It's an **intelligent specification assistant** that makes adding specs as fast as typing a product name. The system does the work; the professional confirms and refines.

---

## 1. SMART SPEC CREATION (Priority)

### How adding a spec item SHOULD work:

**Step 1: User types or speaks a product name/description**
- "600x1200 porcelain wall tile, warm limestone"
- Or pastes a URL from a supplier website
- Or uploads a product image/photo
- Or selects from recent/library

**Step 2: System intelligence kicks in (in order of priority)**

1. **Project Memory** — Has this user specified this product before? On THIS project or ANY previous project? If yes: pre-fill everything from the last instance.

2. **System Library** — Has ANY user on the platform specified this product? If yes: offer it as a pre-written specification (with the previous supplier, cost, lead time, notes).

3. **Supplier Database** — Is this supplier already in the Architex system? If yes: pull their product data, pricing, lead times, contact details.

4. **AI Web Search** — If none of the above: use Google AI/Gemini to search for the product, pull manufacturer specs, dimensions, finishes, sustainability data, typical lead times, and pre-fill the form.

5. **Drawing Intelligence** — Can the AI read the uploaded project drawings and extract spec requirements? If floor tiles are shown on the finish schedule drawing → suggest adding a floor tile spec item with the room/location pre-filled.

**Step 3: User confirms/adjusts the auto-filled spec**
- Review the pre-filled fields
- Adjust supplier, cost, finish as needed
- Confirm responsible roles (owner/reviewer/approver)
- Save → item is created as draft

### Quick-Add Methods (all should be available):

1. **Search bar** (always visible): "Type a product name..." → instant results from library/memory/web
2. **Paste URL**: Drop a supplier product page URL → AI extracts all data
3. **Upload image**: Photo of a sample/product → AI identifies and fills fields
4. **From library**: Browse pre-written specs from your practice + the platform
5. **From drawings**: AI scans uploaded drawings → suggests spec items needed
6. **Duplicate**: Clone an existing item and modify
7. **Full manual form**: The comprehensive form (for power users who prefer control)

---

## 2. ISSUE & DISTRIBUTION WORKFLOW

### When all items in a section/package are approved:

**Issue trigger** — the system detects "all items approved + budget confirmed + no stale sources" and prompts the architect/BEP to issue.

**Issue distribution:**
| Recipient | What they receive | What they must do |
|---|---|---|
| **Contractor** (main recipient) | Full issued specification for their scope | Review for constructability, request clarifications, price packages, confirm programme implications |
| **Subcontractor** | Package-scoped spec (only their trade) | Prepare shop drawings, confirm availability, propose alternatives if needed |
| **Supplier** | Product-specific spec items | Confirm stock/lead time, formal quote, warranty documentation |
| **QS** | Issued spec + budget summary | Final cost reconciliation before procurement |
| **Client** | Summary of what was approved + confirmed cost | Record of what they signed off on |

**Agentic workflow triggers on issue:**
- Creates Action Centre cards for each recipient
- Creates messaging threads per package
- Creates programme milestones for procurement
- Creates escrow funding requirements
- Creates BoM/BoQ line items
- Updates Project Passport health card
- Sends structured notifications via messaging centre

---

## 3. PROCUREMENT, SCHEDULING & DELIVERY

Once issued, SpecForge drives:

1. **RFQ generation** → from spec items to formal quote requests (scoped per supplier/sub)
2. **Quote comparison** → received quotes attach to spec items for review
3. **Purchase order** → approved quotes generate POs linked to escrow
4. **Scheduling** → lead times create programme constraints; delivery dates feed Gantt
5. **Delivery tracking** → supplier confirms dispatch → site manager confirms receipt
6. **Installation** → site evidence (photos) attached per item
7. **Closeout** → warranties + O&M collected per item → handover pack

### All roles pushed to action:
The agentic workflow system creates time-bound tasks for every role at every stage. No one waits — everyone is actively prompted with their next action.

---

## 4. DEEP INTEGRATION MAP

### BoM / BoQ Connection
- Every spec item IS a BoM line item
- Quantities come from the drawings/schedules
- Rates come from supplier quotes
- BoQ totals update live as specs are priced
- The QS's cost plan and the spec are the SAME data — not separate documents

### Document Centre / Drawing Intelligence
- AI reads uploaded drawings (PDF, DWG via viewer, images)
- Extracts finish schedules, door schedules, window schedules
- Suggests spec items from drawing content
- Links spec items bi-directionally to drawing references
- When a drawing is revised → spec items flag as needing review

### Messaging Centre
- Every spec item has a threaded conversation
- Issue notifications go via messaging (not just email)
- @mentions create Action Centre cards
- Substitution requests open structured conversations
- Approval requests create actionable message cards

### Payment & Escrow
- Spec item cost → escrow funding requirement
- Supplier payment unlocks only when: spec approved + delivered + evidence uploaded
- 1% Architex platform fee on every spec-linked transaction
- Payment certificates reference spec items as evidence of what was delivered

### Programme / Gantt
- Lead times → procurement milestones
- Dependencies: "can't install Y until X is delivered"
- Critical path: longest-lead items highlighted
- Programme updated when delivery dates change

### AI Agent / Agentic Workflow
- "Next best action" generated from spec state
- Automated reminders: "Client decision pending 5 days"
- Risk alerts: "Supplier X lead time increased from 42 to 56 days"
- Smart suggestions: "Project Y used the same tile — cost was 12% less via Supplier Z"
- Drawing-to-spec: "New finish schedule uploaded — 3 items need specification"

---

## 5. SPECIFICATION LIBRARY

### Levels of library:

1. **Personal library** — items this user has specified before (across all projects)
2. **Practice library** — items anyone in the same firm has specified
3. **Platform library** — items specified by any professional on the platform (anonymized where needed)
4. **Manufacturer catalogs** — integrated supplier product data (future)
5. **Standards library** — pre-written clause templates (SANS/NBR references, with professional verification required)

### How library items work:
- When you add a spec, the system searches the library FIRST
- Library items come with: title, typical supplier, typical cost range, lead time range, sustainability data, common finishes, standard clause references
- You select a library item → it pre-fills your spec → you adjust for your project context
- Every time you issue a spec, your items feed back into the library (with permission)

---

## 6. UI IMPLICATIONS FOR THE PROTOTYPE

### The "Add Spec" experience should show:
1. A smart search bar at the top (like Spotlight/Command-K)
2. As you type: suggestions from library, recent items, AI web results
3. Click a suggestion → pre-filled form (most fields already done)
4. Or paste a URL → loading indicator → AI-filled form
5. Or "Upload image" → AI identification → pre-filled form
6. "From drawings" button → shows uploaded drawings with AI-identified items
7. Quick confirm → item created

### The "Issue" workflow should show:
1. Issue readiness gate (all approved, budget confirmed, no stale)
2. "Issue to..." panel showing recipients with their scope
3. One-click issue → distribution to all recipients
4. Generated actions visible in the Action Centre simulation
5. Generated messaging threads
6. Generated programme milestones
7. Generated BoM/BoQ updates
8. Escrow funding requirements created

---

## 7. WHAT THIS MEANS FOR IMPLEMENTATION

This is not just a UI prototype. When we integrate into arc-1:
- The Gemini AI service (already in the codebase) powers the web search + drawing intelligence
- The Firestore structure supports the library (cross-project, cross-user queries)
- The existing inbox/action service generates the workflow cards
- The existing messaging service handles threaded conversations
- The existing finance service handles escrow + 1% fee calculations
- The existing programme service handles milestone creation
- The existing file manager handles drawing uploads + AI analysis

Every service in the Architex codebase becomes a spoke that SpecForge connects to.
SpecForge is not a standalone tool — it's the SPECIFICATION LAYER of the entire OS.
