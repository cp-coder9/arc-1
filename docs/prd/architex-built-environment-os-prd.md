# Architex Built Environment OS PRD

> Source: user-provided `newprd.txt` on 2026-05-22. This is the active implementation reference for role-based, stage-gate Architex development. Sample identity values are redacted.

This analysis breaks down the **Architex Built Environment OS**, a role-based, action-driven platform designed to coordinate the complete lifecycle of construction and architectural projects.

---

### **Section 1: Architectural Concept & Platform Architecture**
The core design of Architex is built around **Role-Based Access Control (RBAC)** and **Stage-Gate Automation**. Rather than presenting users with an overwhelming suite of isolated software tools, the system adapts dynamically to:
1. The **selected user role** (filtering UI navigation, visibility, and tool availability).
2. The **active project stage** (shaping the "Project Command Centre" dashboard).
3. The **"Next Best Action"** (prioritising high-impact tasks such as approvals, payments, or compliance checks).

---

### **Section 2: Comprehensive User Role Breakdown**

Architex accommodates six distinct user profiles, each representing a key stakeholder in the built environment.

#### **1. The Client**
*   **Objective**: Intuitively initiate, fund, track, and approve project progress without needing deep technical or legal expertise in construction or design.
*   **Key Responsibilities**:
    *   Defining the initial baseline requirements via plain-language wizard tools.
    *   Reviewing, comparing, and appointing Verified Built Environment Professionals (BEPs).
    *   Approving design milestones, change orders, and progress claims.
    *   Funding the escrow account via the payment gateway.
*   **Available Toolset**:
    *   *Guided Brief Wizard*: Plain-language intake that avoids technical jargon.
    *   *BEP Proposals*: Comparative view of bids by fee, scope, and timeline.
    *   *Client Progress Reports*: High-level status updates translated into simple summaries.
    *   *Contracts & Digital Signing*: Interface to review and execute appointments and contracts.
    *   *Payments & Escrow*: Clean portal displaying pending invoices with clear "Pay into escrow" triggers.

#### **2. The BEP (Built Environment Professional) / Design Team**
*   **Objective**: Lead technical design delivery, coordinate structural/mechanical/wet services consultants, ensure statutory building regulations compliance, and manage technical packages.
*   **Key Responsibilities**:
    *   Converting raw client requirements into structured technical briefs.
    *   Generating fee proposals and staged milestone appointment agreements.
    *   Managing drawing registers, consultant inputs, and municipal submissions.
    *   Assessing quality assurance and drafting snag lists during close-out.
*   **Available Toolset**:
    *   *Technical Brief Editor*: Interface to refine client goals into a formal scope.
    *   *Fee Proposal Builder*: Tool to generate fee options (fixed, hourly, percentage-based).
    *   *Design Team Matrix*: Real-time grid tracing responsibilities and dependencies across engineers and consultants.
    *   *AI Drawing Checker & SANS Form Autofill*: Automation utility to check PDF/CAD designs for compliance errors and auto-populate municipal submission sheets.
    *   *Freelancer Jobs*: Panel to outsource discrete CAD, drafting, or modeling packages.
    *   *Remote Workstations*: Reservation tool to book secure, high-spec remote machines.

#### **3. The Main Contractor**
*   **Objective**: Deliver physical execution, maintain construction schedules, administer labor and site machinery, purchase materials, and certify payment progress claims.
*   **Key Responsibilities**:
    *   Building the project's baseline programme (Gantt) and look-ahead windows.
    *   Logging daily site parameters (labor counts, weather delays, equipment run-times).
    *   Sourcing materials based on the Bill of Quantities (BoQ) and Bill of Materials (BoM).
    *   Issuing Requests for Information (RFIs) to design teams and delegating specialist subcontractor work.
*   **Available Toolset**:
    *   *Construction OS*: Daily site log dashboard.
    *   *Staff, Wages & Plant*: Time-card approval, wage payouts, and equipment registries.
    *   *BoQ/BoM Procurement*: Materials tracking, supplier inventory lookup, and PO builder.
    *   *Subcontractor Packages*: Portal to control specialized trade tenders, claims, and warranties.
    *   *Programme / Gantt*: Engine mapping dependencies, progress, and critical paths.

#### **4. The Subcontractor / Supplier**
*   **Objective**: Execute highly specialized work packages (e.g., HVAC, fire detection, glazing) and supply building products in alignment with the master project schedule.
*   **Key Responsibilities**:
    *   Generating shop drawings and sending physical samples for professional sign-off.
    *   Coordinating material orders and uploading delivery documentation.
    *   Issuing progress claims against completed tasks and submitting compliance certificates during close-out.
*   **Available Toolset**:
    *   *BoQ/BoM Procurement*: View-access to package-specific material schedules.
    *   *Subcontractor Packages*: Claims registry and contract review panel.
    *   *Payments & Governance*: Portal tracking escrowed balances and billing requirements.

#### **5. The Freelancer**
*   **Objective**: Provide remote professional support (e.g., BIM authoring, drafting, rendering) directly to appointed BEPs on a task-by-task basis.
*   *(Note: Freelancers do not have visibility or bidding access on raw, client-facing projects to preserve the platform's professional hierarchy).*
*   **Key Responsibilities**:
    *   Executing specific tasks assigned in the work package agreement.
    *   Performing preliminary compliance pre-checks on drawings before formal submissions.
    *   Submitting outputs and revisions based on design-team feedback.
*   **Available Toolset**:
    *   *Assigned Work*: Board listing current active, in-review, or completed tasks.
    *   *Submissions & Feedback*: Structured portal for uploads, revision cycles, and approvals.
    *   *Remote Desktop / Resource Sharing*: Access to book virtual GPU environments.
    *   *Freelancer Invoicing*: Direct invoice builder linked to approved task deliverables.

#### **6. The Admin / Governance**
*   **Objective**: Orchestrate platform-wide operations, verify credentials, arbitrate disputes, manage monetisation setups, and audit automated AI actions.
*   **Key Responsibilities**:
    *   Processing user sign-ups through verification queues (SACAP, ECSA, corporate registries).
    *   Resolving contract, milestone, or payment disputes as an impartial third party.
    *   Curating external opportunities and assigning fee parameters to the marketplace.
    *   Setting global system fees (escrow percentages, payment gateway cuts, resource sharing commission).
*   **Available Toolset**:
    *   *Admin Whole-System Governance Console*: Global dashboard providing total oversight of projects, disputes, and escrow funds.
    *   *Payment Rate Settings*: Rules engine for platform fees and transactional cutouts.
    *   *AI Orchestration*: Performance tracker and feedback loop manager for automated agents.

---

### **Section 3: End-to-End Project Workflow (The 8-Stage Lifecycle)**

Architex routes all stakeholders through a single, unified workflow journey. The active stage determines the specific tools and dashboard views surfaced to each role.

```
[1. Brief] ➔ [2. Appoint] ➔ [3. Design] ➔ [4. Comply] ➔ [5. Procure] ➔ [6. Build] ➔ [7. Pay] ➔ [8. Close-out]
```

#### **Stage 1: Brief & Diagnostic**
*   **Process**:
    1. The *Client* accesses the **Guided Brief Wizard** to describe their goals using intuitive options. They upload photos, property outlines, or title documents.
    2. The *AI Engine* analyzes the submission, predicts professional inputs, identifies likely approvals, and outlines a recommended project route.
    3. The appointed *BEP* reviews this plain-language draft and uses the **Technical Brief Editor** to define formal scopes, engineering requirements, and regulatory routes.

#### **Stage 2: Team Appointment**
*   **Process**:
    1. The *Client* searches the manual directory or relies on AI suggestions to find verified specialists.
    2. Appointed professionals use the **Fee Proposal Builder** to design structured fee options.
    3. The *Client* compares bids on the **BEP Proposal Comparison** screen.
    4. Upon selection, the platform auto-generates a **Client-Professional Appointment Contract**, which both parties execute via digital signature.
    5. The system automatically creates a milestone-linked payment plan inside the **Escrow Service**.

#### **Stage 3: Design & Coordination**
*   **Process**:
    1. The lead *BEP* coordinates the design team through the **Design Team Matrix**, assigning responsibilities to structural, wet services, and mechanical engineers.
    2. The *BEP* drafts discrete work packages (e.g., structural modeling or rendering) and publishes them to the **Freelancer Marketplace**.
    3. *Freelancers* execute these tasks, using the **Remote Desktop Sharing Center** if high-performance hardware or specialized software licenses are required, and upload their work back to the design team for approval.

#### **Stage 4: Compliance & Municipal**
*   **Process**:
    1. Completed design drafts are passed through the **AI Drawing Checker**, which flags compliance risks (e.g., missing fire notes or incorrect drainage layouts).
    2. Once the *BEP* resolves the flagged issues, the platform triggers the **SANS Compliance Form Autofill** system. Recurring data from user profiles and technical brief parameters are compiled automatically.
    3. The *BEP* digitally signs the finalized compliance forms.
    4. The submission's status is monitored via the **Municipal Tracker** using API integrations or manual proof-of-receipt uploads.

#### **Stage 5: Tender & Procurement**
*   **Process**:
    1. The **Drawing-to-BoM Extractor** analyzes approved drawings and notes to generate a draft Bill of Materials.
    2. A *Quantity Surveyor (QS)* or *Contractor* reviews the extracted materials list and associates items with cost-codes.
    3. The material requirements are mapped to the construction timetable.
    4. The *Contractor* views regional availability, pricing, and estimated lead times via supplier APIs.
    5. The *AI Material Agent* flags lead-time delivery risks, and the *Contractor* approves the final Purchase Orders.

#### **Stage 6: Construction Delivery**
*   **Process**:
    1. The *Contractor* establishes a master construction timeline using the **Programme Builder**.
    2. Daily operations are managed through the **Construction OS**, with supervisors logging daily progress, weather conditions, active machinery, and staff counts.
    3. Subcontractors submit their shop drawings, material delivery confirmations, and weekly timesheets for the contractor's approval.
    4. Site-level questions are handled through the **RFI & Site Instruction** tool.

#### **Stage 7: Payments & Governance**
*   **Process**:
    1. *BEPs*, *Contractors*, and *Freelancers* generate billing drafts via the **Invoice Builder**, which links invoices directly to verified milestones or completed deliverables.
    2. Invoices are routed to the designated paying party with a prominent "Pay" button.
    3. Payments are processed through the secure gateway and held within the **Escrow Service**.
    4. Architex auto-calculates and deducts its platform fee from the gross invoice value.
    5. Funds are held securely until the designated approval gate is passed (such as a client's sign-off, a BEP's review, or a QS's progress certificate).

#### **Stage 8: Close-Out & Handover**
*   **Process**:
    1. The *BEP* conducts walk-throughs and records issues in the **Snagging Tool**, linking snags to specific trades and drawings.
    2. *Contractors* assign rectifications to their *Subcontractors*, who must upload photographic evidence of their repairs to trigger final retention payments.
    3. The platform compiles final accounts, material safety sheets, compliance certs, and manufacturer warranties into a digital handover pack.
    4. The *Admin* closes active escrow wallets and archives the project file.

---

### **Section 4: Key Platform Integration Highlights**

*   **Integrated Escrow Protection**: The system binds financial releases to digital compliance events. This ensures professionals and contractors are paid securely, while clients retain approval rights before funds leave escrow.
*   **Targeted AI Support**: The AI works behind the scenes to simplify complex tasks. It drafts plain-language summaries for clients, scans design documents for compliance errors, extracts material lists from drawings, and identifies delivery bottlenecks in the supply chain.
*   **Dynamic Role-Filtering Navigation**: The user interface adapts in real-time based on the active role selected in the preview menu. This hides complex professional workflows from clients while ensuring administrative and technical teams have full access to their respective control suites.











### **Section 45: Surveyor-General (SG) Diagrams & Boundary Auditing**

During **Stage 1 (Brief & Diagnostic)** and **Stage 4 (Compliance & Municipal)**, the system validates the physical boundaries of the site against official property registries [16].

```
 [Property Deed Key / Erf] ──► [Surveyor-General (SG) API]
                                         │
                                         ▼
                             [SG Diagram Vectorisation]
                                         │
                                         ▼
    [Site Boundary / Servitude Check] ◄──┴──► [Encroachment / Coordinate Alert]
```

#### **1. SG Diagram Integration**
*   **Coordinate Systems**: The platform queries the Surveyor-General’s database to retrieve the official SG diagram for the property (utilizing the Hartebeesthoek94 coordinate system / Lo system) [16].
*   **Vector Conversion**: The platform vectorizes the retrieved diagram, extracting precise boundary coordinates, beacon descriptions, and registered municipal servitudes (such as sewer lines, electrical easements, or rights-of-way).

#### **2. Encroachment & Setback Detection**
*   **Geometric Check**: The **Compliance Agent** overlays the vectorized SG boundary lines onto the project's BIM model or site plan.
*   **Encroachment Alerts**: The system automatically flags any structures (such as walls, pools, or roof overhangs) designed outside the property boundaries or encroaching on registered municipal servitudes, prompting the BEP to make necessary design corrections before plan submission.

---

### **Section 46: Solar PV & Small-Scale Embedded Generation (SSEG) Compliance**

Given energy constraints in South Africa, residential and commercial projects frequently incorporate solar PV, battery storage, and generator systems. The platform tracks compliance with national and municipal embedded generation standards [17, 18].

```
 [Solar PV System Designed]
             │
             ▼
 [SSEG Application Pack Created] ──► Submitted to Distributor (Eskom / City Power / Cape Town)
             │
             ▼
 [SANS 10142-1-2 CoC Approved] ───► Grid Connection Authorised
```

#### **1. SSEG Registration & Authorisation**
*   **Automatic Pack Assembly**: For designs incorporating solar PV, the platform auto-populates Small-Scale Embedded Generation (SSEG) application packs for the local electricity distributor (such as Eskom, City Power in Johannesburg, or the City of Cape Town) [18].
*   **Required Documentation**: The pack compiles the inverter’s type-approval certificates, structural engineering certifications for roof-mounted arrays, and the proposed single-line schematics.

#### **2. Installation Standards (SANS 10142-1-2)**
*   **Certified Sign-off**: The platform's close-out checklist requires an accredited installation electrician to upload and digitally sign the SANS 10142-1-2 Certificate of Compliance (CoC) before the solar system can be marked as operational.
*   **Grid Connection**: The system logs the municipal grid connection permission, ensuring the installation is registered for legally exporting excess power where feed-in tariffs are active.

---

### **Section 47: Water Infrastructure & Water Use License Applications (WULA)**

Water security has driven the adoption of off-grid greywater, borehole, and rainwater harvesting infrastructure. The system manages compliance under **SANS 10252** and coordinates applications with the **Department of Water and Sanitation (DWS)** [19, 20].

```
 [Off-Grid Water System Designed]
                 │
                 ▼
 [SANS 10252 Plumbing Compliance Check]
                 │
                 ▼
  [DWS WULA / Registration Triggered] ──► Borehole / Water Use Permit Authorised
```

#### **1. Borehole & Water Extraction Licensing (WULA)**
*   **Trigger Evaluation**: If a design includes borehole extraction, greywater irrigation, or blackwater treatment plants within sensitive areas, the system flags a mandatory registration or Water Use License Application (WULA) with the DWS [19].
*   **EAP Coordination**: The system coordinates application requirements with the appointed Environmental Assessment Practitioner (EAP) or geohydrologist, tracking borehole yield tests and water quality compliance certificates (conforming to SANS 241 standards for drinking water).

#### **2. Plumbing Installation Compliance (SANS 10252-1)**
*   **System Separations**: The **Compliance Agent** reviews greywater and rainwater harvesting schematics to verify there is no direct connection between municipal drinking water lines and non-potable backup systems. This prevents cross-contamination and complies with SANS 10252-1.
*   **Digital Certification**: The system requires the appointed plumbing subcontractor to upload a certified plumbing CoC, verifying the plumbing meets municipal regulations.

---

### **Section 48: Local Sourcing & B-BBEE Procurement Auditing**

For both public developments and large-scale private projects, the procurement module provides tracking and audit reporting for Broad-Based Black Economic Empowerment (B-BBEE) compliance [12, 21].

```
 [Tender Bids Submitted]
            │
            ▼
 [B-BBEE Certificate Verification]
            │
            ▼
 [Preferential Procurement Score Calculated] ──► Selected Subcontractor Appointed
            │
            ▼
  [Local Spend Compliance Audits] ─────────────► Real-time B-BBEE Spend Dashboard
```

#### **1. Automatic B-BBEE Validation**
*   **Registry Check**: During the tender phase in **Stage 5 (Tender & Procurement)**, subcontractors and suppliers upload their SANAS-approved B-BBEE certificates or sworn affidavits.
*   **Scorecard Calculation**: The system automatically reads the certificate data to extract their B-BBEE status level, black ownership percentage, and enterprise development eligibility. It applies these parameters to the bid evaluation scoring matrix in accordance with the Preferential Procurement Policy Framework Act (PPPFA) guidelines [12, 21].

#### **2. Real-Time B-BBEE Spend Reports**
*   **Spend Tracking**: As progress claims are processed and released through the **Escrow Service**, the system calculates and logs the exact B-BBEE-recognized spend for each subcontractor trade.
*   **Compliance Dashboard**: This financial data is consolidated into a real-time compliance dashboard, letting the project managers and corporate clients track their preferential procurement performance, enterprise development contributions, and localized supplier spend during the project's construction lifecycle.

### **Section 49: Fire Protection & Municipal Fire Department Clearances (SANS 10400-T)**

During **Stage 4 (Compliance & Municipal)** and **Stage 8 (Close-Out & Handover)**, the platform coordinates specialized fire safety reviews and certifications required for municipal plan approvals and final occupancy certificates [1].

```
 [Design Complete] ──► [SANS 10400-T Fire Audit]
                             │
                             ▼
              [Municipal Fire Dept Submission] (JHB EMS / CT Fire & Rescue)
                             │
                             ▼
              [Fire Safety Clearance Issued] ──► Final Occupancy Permit Integration
```

#### **1. SANS 10400-T Compliance Auditing**
*   **Automatic Geometry Checks**: The **Compliance Agent** analyzes the architectural model against fire safety rules:
    *   *Escape Routes*: Calculates travel distances to safety exits, verifying they do not exceed SANS 10400-T thresholds.
    *   *Fire Compartmentation*: Verifies fire-resistance ratings of dividing walls and floors between different occupancies or tenancy zones.
    *   *Fire Equipment Placement*: Confirms that fire hose reels, hydrants, and portable extinguishers are located within statutory travel distances.

#### **2. Municipal Fire Department Approvals**
*   **Document Packaging**: The system packages dedicated fire plans, SANS 10287 automatic sprinkler designs, and fire detection schematics (conforming to SANS 10139) for submission to local fire safety inspectorates (such as Johannesburg Emergency Management Services or City of Cape Town Fire and Rescue Services) [22].
*   **Inspections and Sign-off**: During close-out, the system schedules the required site inspection. The appointed fire engineer must upload the completed fire installation certificate (under SANS 10400-A Form 4) to clear this milestone [1].

---

### **Section 50: Structural Timber & Truss Certification (SANS 10082 & ITC-SA A19)**

Timber roofing and framing are common across South African residential projects. The platform manages truss design validations and structural compliance certifications [23, 24].

```
 [Roof Truss Fabricated] ──► [Truss Manufacturer Design Pack]
                                    │
                                    ▼
                        [On-Site Truss Erection]
                                    │
                                    ▼
                [A19 Structural Timber Roof Certificate] ──► Uploaded to Tracker
```

#### **1. ITC-SA Design Pack Integration**
*   **Manufacturer Submissions**: The system requires the selected timber truss manufacturer to upload their design engineering pack (including detailed truss layouts, wind bracing details, and structural software calculations under SANS 10163) [24].
*   **Truss Loading Checks**: The platform cross-references the timber species (such as S5 structural SA Pine) and truss configurations with the site’s wind loading metrics to verify the baseline specifications.

#### **2. A19 Roof Inspection and Sign-off**
*   **Regulatory Requirement**: In accordance with the National Building Regulations, the completed roof structure must be inspected and certified by a registered professional engineer before roof coverings are completed [23].
*   **ITC-SA Certificate**: The inspector must upload the signed **Section A19 Structural Timber Roof Certificate** (often issued in conjunction with the Institute for Timber Construction South Africa - ITC-SA) to the project tracker, unlocking the milestone payment in the escrow account [23].

---

### **Section 51: Municipal Bulk Service Connections & Development Charges**

Connecting a new development to municipal services (electricity, water, sewer, and stormwater networks) requires coordinating with local utilities and managing development charges.

```
 [Zoning / Site Plan Approved]
               │
               ▼
 [Development Charges Calculated] ──► Paid into Municipal Escrow
               │
               ▼
   [Utility Connection Orders] ─────► Site Connection and Meters Commissioned
```

#### **1. Development Charges (Bulk Service Contributions)**
*   **Automatic Cost Estimation**: When a project includes land-use changes or an increase in permissible floor area, the platform estimates the required Development Charges (Bulk Service Contributions) based on the municipality’s development charge framework [25].
*   **Payment Tracking**: The platform tracks payment demands from the municipality. These charges must be paid and cleared before the municipality will connect services or issue the final occupancy certificate [25].

#### **2. Utility Connection Coordination**
*   **Connection Applications**: The platform auto-populates service connection applications for local utilities (e.g., City Power, Johannesburg Water, or Eskom).
*   **Meter Commissioning**: The system tracks the municipal process from the initial application, through site inspection, to the final installation and commissioning of utility meters on site.

---

### **Section 52: Closed-Loop Machine Learning & Project Analytics**

When a project reaches Final Completion and is closed out in **Stage 8**, its anonymized metadata is indexed to improve the platform's predictive performance on future projects.

```
 [Project ATX-0427 Completed]
               │
               ▼
 [Anonymised Project Metadata Captured]
 (Actual cost per sqm, municipal turnaround, contractor delays)
               │
               ▼
 [Machine Learning Training Pipeline]
               │
               ▼
 [Stage 1 Predictive Engine Updated] (More accurate feasibility predictions)
```

*   **Metadata Indexing**: The system extracts key performance metrics from the completed project record:
    *   *Actual Costs*: Total cost per square meter by trade, structure type, and region, compared against the baseline estimate.
    *   *Timeline Performance*: Municipal plan turnaround times (e.g., actual review duration in Johannesburg CPS vs. Cape Town DAMS) and contractor progress rates [2].
    *   *Resource Analysis*: Vendor reliability ratings, material delivery delays, and subcontractor package performance.
*   **Continuous Improvement Loop**:
    *   This anonymized data is used to train the platform's machine learning models.
    *   This continuous feedback loop improves the accuracy of the **Stage 1 (Brief & Diagnostic)** predictive engine, providing future users with more precise cost estimates, realistic schedules, and risk assessments.

### **Section 53: Demolition Permits, Waste Management Plans, & Asbestos Abatement**

Prior to site establishment in **Stage 6 (Construction Delivery)**, the platform coordinates demolition permits, site clearance approvals, and hazardous waste management plans [1].

```
 [Demolition Planned] ──► [Asbestos & Hazardous Scan]
                                  │
         ┌────────────────────────┴────────────────────────┐
         ▼ (Hazardous ACM Present)                         ▼ (Standard Demolition)
┌──────────────────────────────────┐              ┌──────────────────────────────────┐
│   Asbestos Abatement Inventory   │              │     Demolition Permit Pack       │
│  (Registered AIA Contractor)     │              │     (SANS 10400-F / Council)     │
└──────────────────────────────────┘              └──────────────────────────────────┘
```

#### **1. Asbestos Abatement Regulations, 2020**
*   **Asbestos Audit**: For any modifications or demolitions of structures built prior to the local bans on asbestos, the system triggers a mandatory asbestos audit.
*   **AIA Contractor Coordination**: If Asbestos-Containing Materials (ACM) are detected, the platform restricts site access and flags a requirement for a registered Approved Inspection Authority (AIA) asbestos contractor.
*   **Safe Disposal Tracking**: The system requires the contractor to upload the asbestos inventory, safe work procedures, and certified disposal certificates from a licensed hazardous waste landfill before demolition works are marked as compliant.

#### **2. Construction Waste Management Plans (NEM:WA, Act 59 of 2008)**
*   **Waste Tracking**: In accordance with the National Environmental Management: Waste Act (NEM:WA), the **Construction OS** hosts the project's waste management plan [26].
*   **Disposal Verification**: Contractors must log concrete, brick, and steel recycling quantities, uploading safe disposal certificates from municipal or licensed commercial dump sites to verify responsible waste handling.

---

### **Section 54: Heritage Impact Assessments (NHRA Section 38 Triggers)**

While Section 34 of the National Heritage Resources Act (NHRA) focuses on structure age, Section 38 defines specific spatial development triggers that require a formal Heritage Impact Assessment (HIA) [13].

```
 [Site Design / Layout Proposed] ──► [Section 38 Spatial Trigger Scan]
                                                │
         ┌──────────────────────────────────────┴──────────────────────────────────────┐
         ▼ (Trigger Met: e.g. Area > 5000m² or Linear > 300m)                          ▼ (No Trigger)
┌─────────────────────────────────────────────────────────────────────────────┐┌──────────────────────────────┐
│                  HIA Required (SAHRA / PHRAs)                               ││   Standard Heritage Clearance│
│  - Appoint Professional Heritage Practitioner                               ││   Granted                    │
│  - Compile Archaeological, Palaeontological & Cultural Landscape Reports    ││                              │
└─────────────────────────────────────────────────────────────────────────────┘└──────────────────────────────┘
```

#### **1. Automated Spatial Triggers**
The system's GIS boundary audit automatically scans the design layout for Section 38 spatial triggers [13]:
*   Linear developments (roads, pipelines, powerlines) exceeding **300 meters** in length.
*   Bridges or similar structures exceeding **50 meters** in length.
*   Any development or activity that will change the character of a site exceeding **5,000 square meters** in extent.
*   The rezoning of a site exceeding **10,000 square meters** in extent.

#### **2. HIA Workflow Coordination**
*   **Specialist Appointments**: When a trigger is detected, the system flags the mandatory appointment of a registered Heritage Practitioner.
*   **Report Management**: The platform coordinates the sub-specialist reports (such as Archaeological Impact Assessments, Palaeontological Impact Assessments, and Visual Impact Assessments) into a single, cohesive HIA pack for submission to the South African Heritage Resources Agency (SAHRA) or relevant Provincial Heritage Resources Authority (PHRA) [13].

---

### **Section 55: Soil & Concrete Laboratory Testing (SANS 3001 & Compressive Strength Cube Tests)**

To enforce structural safety during **Stage 6 (Construction Delivery)**, the platform manages and tracks material testing requirements through third-party SANAS-accredited laboratories [28].

```
 [Concrete Cast on Site] ──► [Slump Test & Cube Sampling] (Recorded on Site Report)
                                     │
                                     ▼
                      [Lab Crushing Tests at 7 & 28 Days] (SANS 3001)
                                     │
                                     ▼
         [Lab Certificate Uploaded] ──► Passes Structural Spec Gate
```

#### **1. Geotechnical Compaction Testing (SANS 3001)**
*   **Compaction Density**: For earthworks and foundations, the system logs Dynamic Cone Penetrometer (DCP) results and MOD AASHTO compaction density tests (conforming to the SANS 3001 series) [27].
*   **Structural Gate**: Foundation concrete casting is blocked within the platform's workflow until the civil engineer reviews and approves these soil density test results.

#### **2. Concrete Compressive Strength (Cube Crushing Tests)**
*   **Sampling Records**: When structural concrete is cast on site, the site supervisor logs the batch details, slump test results, and unique identification numbers for the cast concrete cubes.
*   **Crushing Test Certificates**: The system schedules reminder tasks for uploading third-party laboratory test certificates at **7 days** (for early strength indication) and **28 days** (for characteristic compressive strength verification, e.g., $25\text{ MPa}$, $30\text{ MPa}$).
*   **Compliance Alerts**: If a laboratory certificate indicates a compressive strength below the structural design specification, the platform triggers an alert to the structural engineer and contractor, flags the associated structural elements as "At Risk," and pauses subsequent load-bearing construction milestones.

---

### **Section 56: System Architecture Index (Unified Operating System Registry)**

This index maps the complete functional architecture of the **Architex Built Environment OS**, organizing all 56 operating system modules into their respective structural categories.

#### **I. Core Architecture & Stakeholder Framework**
*   **Section 1**: Architectural Concept & Platform Architecture
*   **Section 2**: Comprehensive User Role Breakdown
*   **Section 3**: End-to-End Project Workflow (The 8-Stage Lifecycle)
*   **Section 4**: Key Platform Integration Highlights
*   **Section 21**: Responsive Layout Mechanics & Fluid Design System
*   **Section 22**: UI State Management & JavaScript Event Delegation
*   **Section 23**: Production PostgreSQL Database Schema

#### **II. Technical Design & Multi-Disciplinary Coordination**
*   **Section 6**: Codebase Architecture & Technical Execution
*   **Section 17**: Drawing Register & Transmittal Workflows
*   **Section 38**: Freelancer Work Package QA & BIM Model Auditing
*   **Section 42**: Common Data Environment (CDE) & ISO 19650 Architecture
*   **Section 50**: Structural Timber & Truss Certification (SANS 10082 & ITC-SA A19)

#### **III. Statutory Compliance, Environmental, & Heritage Governance**
*   **Section 9**: The Municipal Tracker Hybrid Layer
*   **Section 11**: South African Regulatory Compliance Layer (SANS 10400 & SACAP/ECSA Validation)
*   **Section 25**: Automated Compliance Auditing (The AI Drawing Parser Engine Pipeline)
*   **Section 28**: API Specifications for South African Municipal Portals
*   **Section 34**: Geotechnical & GIS Integrations (SANS 10160 & SANS 10400-H)
*   **Section 39**: Zoning Schemes & SPLUMA Compliance (SPLUMA, Act 16 of 2013)
*   **Section 41**: Heritage Permits & Environmental Authorisations (NHRA & NEMA)
*   **Section 45**: Surveyor-General (SG) Diagrams & Boundary Auditing
*   **Section 49**: Fire Protection & Municipal Fire Department Clearances (SANS 10400-T)
*   **Section 53**: Demolition Permits, Waste Management Plans, & Asbestos Abatement
*   **Section 54**: Heritage Impact Assessments (NHRA Section 38 Triggers)

#### **IV. Financial Engineering, Escrow, & Contractual Frameworks**
*   **Section 12**: JBCC & PROCSA Standard-Form Contract Digitalization
*   **Section 14**: Defect Liability & Escrow Retention Management
*   **Section 15**: Financial Cashflow & Scraping Simulation
*   **Section 27**: Fail-Safe Protocols & Escrow Rollback Mechanics
*   **Section 33**: Onboarding & KYC / FICA Verification Pipelines

#### **V. Estimation, Procurement, & Supply Chain Management**
*   **Section 13**: South African Bill of Quantities (BoQ) Standards
*   **Section 29**: Quantity Surveying & Cost Estimation Module (ASAQS Pricing System)
*   **Section 37**: Subcontractor Tendering & Procurement (JBCC NSSA / DSA Mapping)
*   **Section 40**: ESG & Embodied Carbon Estimation Layer (GBCSA Guidelines)
*   **Section 48**: Local Sourcing & B-BBEE Procurement Auditing

#### **VI. Construction Operations, Site Controls, & Safety**
*   **Section 30**: Health, Safety, & OHS Agent Workflows (Construction Regulations, 2014)
*   **Section 43**: Local Labour, CLO, & EPWP Reporting (Construction Regulations, 2014)
*   **Section 46**: Solar PV & Small-Scale Embedded Generation (SSEG) Compliance
*   **Section 47**: Water Infrastructure & Water Use License Applications (WULA)
*   **Section 55**: Soil & Concrete Laboratory Testing (SANS 3001 & Compressive Strength Cube Tests)

#### **VII. Close-Out, Asset Handover, & Operational Intelligence**
*   **Section 35**: Snag Classification & Latent Defects Liability
*   **Section 36**: Handover Packs & Municipal Occupancy Certificates
*   **Section 44**: Facility Management Transition & COBie Asset Handover
*   **Section 52**: Closed-Loop Machine Learning & Project Analytics

#### **VIII. Platform Infrastructure, Privacy, & Communication**
*   **Section 5**: Specialized Platform Modules & Operational Logic
*   **Section 7**: AI Workflow Co-Pilot Orchestration (The Multi-Agent Architecture)
*   **Section 8**: Static Data Mapping & Dynamic Binding
*   **Section 10**: Production-Grade Production Path
*   **Section 16**: Legal Auditing, Communication, & Hashed Logging
*   **Section 18**: Continuing Professional Development (CPD) Engine
*   **Section 19**: Security, Privacy, & POPIA Compliance
*   **Section 20**: System Interoperability Map (Unified Runtime Orchestration)
*   **Section 26**: Event-Driven Real-Time Notification Schema
*   **Section 31**: Advanced Project Messenger Encryption & Attachment Pipelines
*   **Section 32**: Deployment Architecture & POPIA Compliance

### **Section 57: FICA Compliance Architecture & Suspicious Transaction Reporting (STR/CTR)**

As a platform supervising and routing millions of Rands in construction and professional fees through an integrated gateway, the billing engine is registered as an **Accountable Institution** under **Schedule 1 of the Financial Intelligence Centre Act (FICA) (Act 38 of 2001)**[[1](https://www.google.com/url?sa=E&q=https%3A%2F%2Fvertexaisearch.cloud.google.com%2Fgrounding-api-redirect%2FAUZIYQH5exvJj1ZdShoDh4-essyrxf8TgVVaekIwjQCsdEov2NcEJeX0iOtNV4KnHgS-hmKulzKSTkW5yM8W35lnJi5BjV3Uih06ZCY9bXuHtqHTajG_2eEAqx-m0KWxmfpQaBrll0iH8PyFbVuRPcQddIg%3D)][[2](https://www.google.com/url?sa=E&q=https%3A%2F%2Fvertexaisearch.cloud.google.com%2Fgrounding-api-redirect%2FAUZIYQGscxMrsTfvfwmYcRkOy4GH-7naoe24ide_UuPyTYjUU4VcN8VpEUUmYu60EwiuVrsjpCaUZ6Hc3JOJa-NpuqtlQA3aj9xZoxCviWaZal5oUJLvHRBsxd5YtvuDU7lqLt5BlCYEK8bnqpn9AoQpMk8nK488dYSHnS9IyzUSBva0)].

```
                     [Billing Gateway / Escrow Ledger]
                                     │
                        (Scans Incoming Transactions)
                                     │
         ┌───────────────────────────┴───────────────────────────┐
         ▼ (Transaction ≥ R50,000.00)                            ▼ (Suspicious/Bypass Attempt)
┌─────────────────────────────────┐                     ┌─────────────────────────────────┐
│  Cash Threshold Report (CTR)    │                     │ Suspicious Transaction (STR)    │
│  - Compile metadata payload     │                     │ - Flag entity                   │
│  - Auto-submit to FIC (goAML)   │                     │ - Lock pending releases         │
│  - 3-Day Submission Window      │                     │ - Report to goAML portal        │
└─────────────────────────────────┘                     └─────────────────────────────────┘
```

#### **1. Cash Threshold Reporting (CTR) Automation (Section 28)**
*   **Trigger Threshold**: Any cash-equivalent deposit, wire transfer anomaly, or transaction valued at **R50,000.00 and above** (greater than R49,999.99) automatically triggers a CTR event within the billing microservice[[3](https://www.google.com/url?sa=E&q=https%3A%2F%2Fvertexaisearch.cloud.google.com%2Fgrounding-api-redirect%2FAUZIYQF0ZM37wYGpFJ1ECJ7anRYA6Nzx5Dj9eZjd8A9JA2LiOJU5M8dWt9JOnQdE0QrUvoojvW9J2axNpJbMUm5rrY-2XmwLKQ4YKZP8ZY6418Zkgm8Baj_P1oJIjkw0Y3sb7-EgIK4xk7E5c5FAtipb1xpi1L2kl98%3D)][[4](https://www.google.com/url?sa=E&q=https%3A%2F%2Fvertexaisearch.cloud.google.com%2Fgrounding-api-redirect%2FAUZIYQHSrghfNX_etsp-E32Ci7He5yK_XwVqX9oRPf6Xj55_97MKwcVGBNEtdPPvAyRyEBkxYrdf5EKgf2iQ_hGpASYDECfJibIsaN-N_HMJ5emYIQ16niFC3KBI7vfbEZ7qsRmrL4Hw_i69kfk8o7y5jx9J9qzHWTOI5cEfqSZkOb5oKwY-T9SVUNPMVA%3D%3D)].
*   **Submission SLA**: In accordance with Guidance Note 5C, the platform compiles and transmits the CTR payload to the FIC’s **goAML portal** within **3 business days** of transaction detection[[5](https://www.google.com/url?sa=E&q=https%3A%2F%2Fvertexaisearch.cloud.google.com%2Fgrounding-api-redirect%2FAUZIYQHilJ_YK_0lNNP8qGRKaOfCTGTZfceacjP075yyPUWe_Cg94IEwTnry7BEnoMlWdn_gMG-YUfgST0z8B0vSOyfYd0lTJOjBukoVo0oZsr_vanm7gdzRTVO0k5QZP2kWC2DicROxtGyq-tBa0QEKOzR_TVpuqlfowVKCkAqrd146-mMeXrNpcQzLOhsjccIryyosciCcj9UIZw%3D%3D)][[6](https://www.google.com/url?sa=E&q=https%3A%2F%2Fvertexaisearch.cloud.google.com%2Fgrounding-api-redirect%2FAUZIYQHc47lFMLurUhHD_qn26Kh0qBYr9rdD8IjijnX6hOP0CtfeTP5cXwOaJIhqGh6NiuiLXUg1ypG34tTfXGmiGYKHmxQuZaiOZ89SqxuUeEte8PtPVk-cUVXyzOGjiUXmc9wyv2LSkY48L-wlLAtFAgjL0c92FE_kpjY7v76xAFNZ0u1sxo5vDxoP75c%3D)].
*   **API Payload Structure (goAML Schema)**:
    ```json
    {
      "report_type": "CTR",
      "reporting_entity_id": "ORG_ARCHITEX_FIC_091",
      "timestamp": "2026-05-20T10:47:00Z",
      "transaction_details": {
        "local_currency_amount": 420000.00, -- e.g., Progress Claim INV-CON-014
        "source_account_validated": true,
        "payment_method": "EFT_INSTANT",
        "direction": "RECEIVE"
      },
      "parties": {
        "conductor": {
          "id_number": "[REDACTED_SAMPLE_ID]",
          "verified_fullname": "[REDACTED_SAMPLE_NAME]",
          "verification_authority": "DHA_HANIS_API"
        },
        "beneficiary": {
          "cipc_number": "[REDACTED_SAMPLE_CIPC]",
          "registered_name": "[REDACTED_SAMPLE_COMPANY]",
          "verification_authority": "CIPC_REGISTRY_API"
        }
      }
    }
    ```

#### **2. Suspicious Transaction and Activity Reporting (STR / SAR - Section 29)**
*   **Flagging Anomalies**: If a client attempts to bypass the escrow and verification gateway (such as splitting a single R150,000 milestone into three R49,000 payments to avoid the FICA threshold), the **AI Claims Assistant** flags the pattern as structured evasion[[2](https://www.google.com/url?sa=E&q=https%3A%2F%2Fvertexaisearch.cloud.google.com%2Fgrounding-api-redirect%2FAUZIYQGscxMrsTfvfwmYcRkOy4GH-7naoe24ide_UuPyTYjUU4VcN8VpEUUmYu60EwiuVrsjpCaUZ6Hc3JOJa-NpuqtlQA3aj9xZoxCviWaZal5oUJLvHRBsxd5YtvuDU7lqLt5BlCYEK8bnqpn9AoQpMk8nK488dYSHnS9IyzUSBva0)][[7](https://www.google.com/url?sa=E&q=https%3A%2F%2Fvertexaisearch.cloud.google.com%2Fgrounding-api-redirect%2FAUZIYQFlwHWE-NBDGmZ3r-mrORJp-yFd2CzVf_JBDtpsefmzzjV9BRbeHWDIRW_AzdGMgY0n_bcXiHp1bt8cDbkHqM-kbbFuYHEPeYxwxEQuc0GYm9JQodpvwvKpVqu4TWmc0doZkY65EcDhQIBOxgE3TSGtB6Ib4IhQsR7LRvwW6pLiAyAFPxEmo0g0lYo%3D)].
*   **Safety Hold**: The transaction is marked as `PENDING_INVESTIGATION`. Funding and release triggers are locked, and the system compiles an STR file containing the communication logs, KYC records, and transactional audit trails for immediate secure upload to the FIC[[2](https://www.google.com/url?sa=E&q=https%3A%2F%2Fvertexaisearch.cloud.google.com%2Fgrounding-api-redirect%2FAUZIYQGscxMrsTfvfwmYcRkOy4GH-7naoe24ide_UuPyTYjUU4VcN8VpEUUmYu60EwiuVrsjpCaUZ6Hc3JOJa-NpuqtlQA3aj9xZoxCviWaZal5oUJLvHRBsxd5YtvuDU7lqLt5BlCYEK8bnqpn9AoQpMk8nK488dYSHnS9IyzUSBva0)].

---

### **Section 58: Programmatic Escrow State-Machine (Solidity Specification)**

To guarantee transparency and automation, the **Escrow Service** utilizes a programmatic state-machine. Below is the Solidity-style contract logic used to govern holds, certifications, and fee splits.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ArchitexEscrow {
    enum EscrowStatus { Unfunded, FundedHeld, Disputed, Released }

    struct Milestone {
        uint256 grossAmount;
        uint256 platformFeePercentage; // Base 10000 (e.g. 250 for 2.5%)
        address payable payer;
        address payable payee;
        address verifier; // e.g., appointed QS or Principal Agent
        EscrowStatus status;
        bool verifiedByAgent;
    }

    mapping(string => Milestone) public milestones;

    event MilestoneFunded(string indexed invoiceCode, uint256 amount);
    event MilestoneCertified(string indexed invoiceCode, address indexed certifier);
    event EscrowReleased(string indexed invoiceCode, uint256 payout, uint256 platformFee);
    event DisputeTriggered(string indexed invoiceCode);

    // 1. FUND ESCROW (Paying party locks funds)
    function fundMilestone(string memory _invoiceCode) external payable {
        Milestone storage m = milestones[_invoiceCode];
        require(m.status == EscrowStatus.Unfunded, "Milestone already funded or released");
        require(msg.value == m.grossAmount, "Incorrect funding amount");
        require(msg.sender == m.payer, "Only designated payer can fund");

        m.status = EscrowStatus.FundedHeld;
        emit MilestoneFunded(_invoiceCode, msg.value);
    }

    // 2. CERTIFY WORK (Appointed professional signs off)
    function certifyMilestone(string memory _invoiceCode) external {
        Milestone storage m = milestones[_invoiceCode];
        require(m.status == EscrowStatus.FundedHeld, "Escrow must be funded and held");
        require(msg.sender == m.verifier, "Only designated certifier can sign off");

        m.verifiedByAgent = true;
        emit MilestoneCertified(_invoiceCode, msg.sender);
    }

    // 3. RELEASE PAYOUT (Triggers payment split and auto-scraped platform fee)
    function releaseEscrow(string memory _invoiceCode, address payable _feeCollector) external {
        Milestone storage m = milestones[_invoiceCode];
        require(m.status == EscrowStatus.FundedHeld, "Escrow must be funded and held");
        require(m.verifiedByAgent == true, "Certification gate not cleared");
        require(msg.sender == m.payer || msg.sender == m.verifier, "Unauthorized release trigger");

        uint256 platformFee = (m.grossAmount * m.platformFeePercentage) / 10000;
        uint256 payeePayout = m.grossAmount - platformFee;

        m.status = EscrowStatus.Released;

        // Perform safe transfers
        _feeCollector.transfer(platformFee);
        m.payee.transfer(payeePayout);

        emit EscrowReleased(_invoiceCode, payeePayout, platformFee);
    }

    // 4. TRIGGER DISPUTE (Freezes funds and notifies arbitration console)
    function triggerDispute(string memory _invoiceCode) external {
        Milestone storage m = milestones[_invoiceCode];
        require(m.status == EscrowStatus.FundedHeld, "Can only dispute active held funds");
        require(msg.sender == m.payer || msg.sender == m.payee, "Only transactional parties can dispute");

        m.status = EscrowStatus.Disputed;
        emit DisputeTriggered(_invoiceCode);
    }
}
```

---

### **Section 59: High-Availability Infrastructure & Disaster Recovery**

To comply with local POPIA data localization rules and safeguard the platform against load shedding or power failures, the physical infrastructure is hosted in a high-availability, multi-AZ configuration inside the **AWS Cape Town (af-south-1) Region** [5].

```
                ┌────────────────────────────────────────────────────────┐
                │               Application Load Balancer                │
                └───────────────────────────┬────────────────────────────┘
                                            │
         ┌──────────────────────────────────┼──────────────────────────────────┐
         ▼ (af-south-1a)                    ▼ (af-south-1b)                    ▼ (af-south-1c)
┌────────────────────────────────┐ ┌────────────────────────────────┐ ┌────────────────────────────────┐
│      Primary Web/App Node      │ │      Standby Web/App Node      │ │      Standby Web/App Node      │
│  - Docker Container (ECS)      │ │  - Docker Container (ECS)      │ │  - Docker Container (ECS)      │
│  - Active SANS Compliance Engine││  - Active SANS Compliance Engine││  - Active SANS Compliance Engine│
└──────────────┬─────────────────┘ └──────────────┬─────────────────┘ └──────────────┬─────────────────┘
               │                                  │                                  │
               └──────────────────┬───────────────┴──────────────────────────────────┘
                                  ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                              Relational Database Service (RDS - Multi-AZ)                            │
│  - PostgreSQL Primary (af-south-1a) ──► Real-Time Streaming Replication ──► Standby (af-south-1b)     │
└──────────────────────────────────────────────────┬───────────────────────────────────────────────────┘
                                                   ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   Immutable S3 Storage af-south-1                                    │
│  - Hourly encrypted database backups (AES-256)                                                       │
│  - Secure drawing repositories and transmittal archives                                              │
└──────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### **1. Database Clustering and Replication**
*   **Active Database RDS Instance**: Located in AZ `af-south-1a`, writing securely to encrypted SSD volumes.
*   **Synchronous Standby Instance**: Located in AZ `af-south-1b`. Continuous streaming replication ensures a sub-second Recovery Point Objective (RPO) in the event of hardware failure in the primary AZ.
*   **Read-Replicas**: Located in AZ `af-south-1c` to handle high-frequency, non-transactional database reads (such as populating the public **Directory Search** and rendering historical **CPD Learning** pages).

#### **2. Power Redundancy and edge Failovers**
*   **Container Deployments**: Web applications run on AWS ECS Fargate, which automatically redistributes and launches app containers across active zones during localized infrastructure outages.
*   **Global CDN**: Cloudflare edge-nodes cache static assets (such as CSS frameworks, logos, and scripts) locally across South African points of presence (Johannesburg, Cape Town, and Durban), ensuring rapid layout load times even during severe national grid constraints.

---

### **Section 60: Strategic Integration Blueprint**

This operational blueprint maps the primary integration points between the **Architex Built Environment OS** and South African administrative portals, outlining the exact mechanisms used to automate regulatory and financial compliance.

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│                                  ARCHITEX BUILT ENVIRONMENT OS                               │
└──────────────┬───────────────────────────────┬───────────────────────────────┬───────────────┘
               │                               │                               │
               ▼                               ▼                               ▼
┌──────────────────────────────┐┌──────────────────────────────┐┌──────────────────────────────┐
│     Municipal Portals        ││    Financial & Identity      ││     Professional Councils    │
│  - City of Cape Town (DAMS)  ││  - CIPC Registry             ││  - SACAP Portal              │
│  - City of Johannesburg (CPS)││  - Home Affairs (DHA)        ││  - ECSA Registry             │
│  - e-Tshwane / eThekwini     ││  - goAML (FICA) / Bank AVS   ││  - NHBRC / Master's Office   │
└──────────────┬───────────────┘└──────────────┬───────────────┘└──────────────┬───────────────┘
               │                               │                               │
               ▼                               ▼                               ▼
  Automated Plan Submissions,    Validated Profiles, Instant     Professional Verification,
  SANS Compliance Transmittals   FICA Clearance, Secure Escrow   SANS Form 4 Signatures, and
  and Occupancy Certificates     Payouts and Transaction Audits  CPD Certificate Syncing
```

*   **For Developers, Clients, and Professionals**:
    The platform provides a single, unified workspace that connects the entire building lifecycle—from initial brief to final close-out—into an automated compliance and payment system.
*   **For Contractors, Subcontractors, and Suppliers**:
    The system protects cash flow and payment timelines, holding contractually agreed fees in escrow and releasing them automatically upon professional sign-off and validation of the work on site.
*   **For Financial, Municipal, and Regulatory Authorities**:
    Architex acts as a reliable verification layer, ensuring that every design is compliant with national building standards, every professional registration is verified, and every escrow transaction is fully audited and FICA-compliant[[2](https://www.google.com/url?sa=E&q=https%3A%2F%2Fvertexaisearch.cloud.google.com%2Fgrounding-api-redirect%2FAUZIYQGscxMrsTfvfwmYcRkOy4GH-7naoe24ide_UuPyTYjUU4VcN8VpEUUmYu60EwiuVrsjpCaUZ6Hc3JOJa-NpuqtlQA3aj9xZoxCviWaZal5oUJLvHRBsxd5YtvuDU7lqLt5BlCYEK8bnqpn9AoQpMk8nK488dYSHnS9IyzUSBva0)].
