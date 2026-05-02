# Product Requirements Document: Architex Built-Environment AI Agent System

## 1. Document Control

**Product:** Architex Built-Environment AI Agent System  
**Project:** Architex architectural marketplace  
**Primary domain:** South African building regulation, architectural, engineering, fire-plan, and council-readiness review  
**Audience:** Product, engineering, QA, administrators, architects, engineers, fire consultants, draughting professionals, compliance reviewers, and agent maintainers  
**Status:** Draft PRD  
**Last updated:** 2026-05-02

## 2. Executive Summary

Architex is an architectural marketplace for clients and built-environment professionals. The AI Agent System must become a broad South African built-environment intelligence layer, not only a SANS 10400 checker. Its value is to give architects, engineers, fire consultants, builders, developers, and administrators fast, structured, evidence-aware review of drawings and submission packs before expensive professional coordination, council submission, construction, or rework.

The system should autonomously review architectural drawings, site plans, fire plans, engineering drawings, service layouts, schedules, and supporting documents against South African building regulations, SANS standards, local authority submission requirements, common professional coordination rules, and platform-specific quality gates. It must remain clear that AI output is preliminary professional assistance and does not replace SACAP, ECSA, municipal, fire department, NHBRC, competent-person, or registered inspector sign-off.

The existing implementation in `src/services/geminiService.ts` already provides a multi-agent foundation: specialist agents run against an uploaded drawing, an orchestrator synthesizes outputs, Firestore stores configurable agent prompts, and the knowledge base allows governed context. This PRD expands the intended product into a multi-discipline, standards-aware value-added service for professionals on the Architex platform.

## 3. Product Vision

Architex should provide a professional-grade AI review layer that helps practitioners answer:

1. Is this drawing package complete enough for review or submission?
2. Are there obvious South African regulatory, architectural, engineering, fire-safety, accessibility, energy, drainage, or coordination issues?
3. Which issues can be corrected by the draughting or design team before involving expensive specialist reviewers?
4. Which issues require a competent person, engineer, fire engineer, energy professional, municipal official, or other professional sign-off?
5. Which South African standards, regulations, by-laws, submission requirements, and professional conventions appear relevant?

The AI system must operate as an assistant, checklist engine, evidence organizer, and early-warning tool. It must not represent itself as a statutory authority, certifier, registered professional, or final approval body.

## 4. Problem Statement

South African building projects are reviewed against overlapping requirements: National Building Regulations, SANS 10400 parts, discipline-specific SANS standards, fire department requirements, local zoning and land-use schemes, engineering standards, accessibility requirements, energy-performance requirements, service coordination, municipal forms, title-deed constraints, and professional documentation conventions.

Professionals often discover missing notes, inconsistent plans, non-compliant layouts, absent fire information, incomplete drainage diagrams, missing occupancy classifications, or unsupported structural assumptions late in the process. These issues cause delays, resubmissions, professional disputes, and additional cost.

Architex can add value by using AI agents to perform early autonomous checks, produce structured issue reports, flag professional sign-off requirements, and improve the quality of submissions before formal review.

## 5. Goals

1. Expand compliance review beyond SANS 10400 into a broad South African built-environment standards and submission-readiness system.
2. Provide autonomous preliminary checks for architectural, structural, civil, fire, accessibility, energy, plumbing, electrical, environmental, and council-readiness domains.
3. Detect missing information, drawing coordination problems, conflicting schedules, incomplete legends, absent fire notes, and missing professional sign-off references.
4. Categorize issues by regulation or standard family, professional discipline, severity, required action, and responsible party.
5. Give professionals a value-added service that improves documentation quality before council submission or specialist review.
6. Maintain administrator-governed knowledge so agent behavior is based on approved, traceable standards summaries and local authority requirements.
7. Support multiple LLM providers and per-agent routing for different risk and complexity levels.
8. Clearly separate autonomous AI checks from checks that require registered professional calculation, inspection, rational design, or certification.

## 6. Non-Goals

1. Replace SACAP-registered professionals, ECSA-registered engineers, fire engineers, competent persons, municipal officials, NHBRC inspectors, or legal reviewers.
2. Guarantee plan approval by a local authority or fire department.
3. Produce final rational designs, structural calculations, fire engineering designs, energy calculations, or certificates of compliance without professional verification.
4. Provide legal advice on title deeds, zoning rights, servitudes, environmental approvals, or contract disputes.
5. Republish copyrighted SANS standards text beyond licensed summaries, references, and approved internal knowledge.
6. Perform destructive edits to drawings or replace professional CAD/BIM authoring tools.

## 7. Regulatory and Standards Landscape

The system must support a layered regulatory model. The standards below are not exhaustive, and versions must be managed through the knowledge system.

### 7.1 Core Legal and Regulatory Framework

1. National Building Regulations and Building Standards Act, 1977 (Act 103 of 1977).
2. Regulations issued under the National Building Regulations and Building Standards Act.
3. SANS 10400 series as deemed-to-satisfy rules for National Building Regulations.
4. Local authority planning by-laws, building control requirements, zoning schemes, land-use schemes, overlay zones, heritage areas, and fire department requirements.
5. Occupational Health and Safety Act requirements where relevant to construction, electrical installations, lifts, pressure systems, demolition, hazardous materials, and occupational use.
6. Housing Consumers Protection Measures Act and NHBRC technical requirements for applicable residential work.
7. National Environmental Management Act and related environmental triggers where site constraints suggest possible approvals.
8. Spatial Planning and Land Use Management Act and municipal planning schemes where land-use rights, coverage, height, parking, building lines, or departures are relevant.
9. Promotion of Administrative Justice Act context for municipal decisions and objections, where the platform provides process guidance rather than legal advice.

### 7.2 SANS 10400 National Building Regulation Parts

The system must maintain a full SANS 10400 coverage map, including at minimum:

| Part | Area | AI review value |
| --- | --- | --- |
| Part A | General principles and requirements | Occupancy classification, competent-person declarations, application completeness, rational design flags |
| Part B | Structural design | Structural sign-off presence, load-bearing assumptions, engineer-required triggers |
| Part C | Dimensions | Minimum room dimensions, headroom, occupancy-related space checks |
| Part D | Public safety | Edge protection, public access, barriers, unsafe openings |
| Part E | Demolition work | Demolition notes, method statement flags, adjoining-property risk prompts |
| Part F | Site operations | Site safety notes, hoarding, temporary works, public protection requirements |
| Part G | Excavations | Excavation depth flags, boundary proximity, shoring and geotechnical sign-off prompts |
| Part H | Foundations | Foundation details, soil-class assumptions, engineer/geotech requirement flags |
| Part J | Floors | Floor construction notes, damp-proofing, fire and acoustic separation prompts |
| Part K | Walls | Wall thickness, fire separation, DPC, lateral support, retaining-wall flags |
| Part L | Roofs | Roof pitch, drainage, truss notes, uplift/anchoring, thatch or combustible-roof flags |
| Part M | Stairways | Risers, goings, landings, handrails, balustrades, escape stair conditions |
| Part N | Glazing | Safety glazing locations, low-level glazing, balustrade glazing, marking notes |
| Part O | Lighting and ventilation | Natural light, ventilation, mechanical ventilation flags, habitable-room checks |
| Part P | Drainage | Sanitary fixture provision, drainage layout completeness, gradients and inspection access flags |
| Part Q | Non-water-borne sanitary disposal | Alternative sanitation flags and approval prompts |
| Part R | Stormwater disposal | Roofwater disposal, site drainage, attenuation, discharge-point flags |
| Part S | Facilities for persons with disabilities | Accessible route, ramps, doors, toilets, parking, signage, reach ranges |
| Part T | Fire protection | Occupancy fire risk, escape routes, fire resistance, detection, extinguishers, signage, fire equipment |
| Part U | Refuse disposal | Refuse storage, access, ventilation, fire separation flags |
| Part V | Space heating | Chimneys, fireplaces, combustion appliance clearances, ventilation prompts |
| Part W | Fire installation | Hose reels, hydrants, water supply, fire-fighting installation completeness |
| Part X | Environmental sustainability | Site and environmental sustainability requirements |
| Part XA | Energy usage in buildings | Building envelope, fenestration, insulation, orientation, hot water and energy notes |

### 7.3 Structural and Civil Engineering Standards

The AI must identify whether drawings appear to require professional engineering input and whether supporting documents are present. It must not certify calculations.

Relevant standards and reference families include:

1. SANS 10160 series for basis of structural design and actions on structures.
2. SANS 10100 series for structural use of concrete.
3. SANS 10162 series for structural use of steel.
4. SANS 10163 series for structural use of timber where applicable.
5. SANS 10145 for concrete masonry construction.
6. SANS 10082 for timber-frame buildings.
7. SANS 2001 construction works standards where specification-level checks are relevant.
8. Geotechnical investigation and foundation reporting requirements as required by site conditions, dolomite risk, slope, fill, retaining structures, basement excavations, or local authority requirements.
9. Stormwater management and civil-services requirements from municipal standards and SANS 10400-R.
10. Retaining wall, boundary wall, swimming pool, elevated deck, balcony, and excavation triggers requiring engineer review.

Autonomous AI checks include:

1. Missing structural engineer details on drawings showing structural beams, slabs, retaining walls, basements, large spans, unusual roofs, cantilevers, or multi-storey work.
2. Inconsistency between architectural plans and structural grid, columns, walls, beams, slab openings, stairs, and foundations.
3. Unsupported assumptions such as unspecified lintels, omitted wall support, missing roof truss layout, absent foundation schedule, or no slab thickness notes.
4. Site risk flags such as steep slopes, retaining, excavation near boundaries, dolomite-region prompt, flood-prone areas, or stormwater discharge to neighbours.
5. Missing rational design, Form 2, competent-person appointment, or engineer certificate references where a professional design is indicated.

### 7.4 Fire Safety, Fire Plans, and Fire Engineering Standards

Fire review must cover both building-regulation fire protection and fire-plan/documentation readiness.

Relevant standards and reference families include:

1. SANS 10400-T for fire protection.
2. SANS 10400-W for fire installation.
3. SANS 10139 for fire detection and alarm systems.
4. SANS 10287 for automatic sprinkler installations.
5. SANS 10105 for portable and wheeled fire extinguishers.
6. SANS 543 for hose reels.
7. SANS 1128 series for hydrant systems and firefighting equipment components.
8. SANS 1186 series for symbolic safety signs.
9. SANS 1253 for fire doors and fire shutters.
10. SANS 10114-2 and SANS 1464-22 for emergency lighting references.
11. SANS 10177 series for fire testing of materials, fire resistance, non-combustibility, and surface fire index.
12. SANS 10313 and SANS 62305 references for lightning protection risk and physical damage to structures.
13. SANS 10087 series for LPG installations and storage.
14. SANS 10089 series for petroleum installations where fuel storage or dispensing is shown.
15. Fire engineering rational design references such as BS 7974 or PD 7974 where complex buildings exceed deemed-to-satisfy assumptions.

Autonomous AI checks include:

1. Occupancy classification and mixed-occupancy fire separation flags.
2. Escape route completeness, dead-end corridor flags, travel-distance prompts, exit-door swing direction, and door width consistency.
3. Fire-rated wall, floor, shaft, lobby, basement, occupancy-separation, and tenancy-separation notation checks.
4. Fire door labels, self-closing requirements, fire shutter notes, and door schedule consistency.
5. Hose reel, hydrant, extinguisher, sprinkler, fire alarm, smoke control, emergency lighting, and signage presence checks.
6. Fire department access, turning, hydrant proximity, firemen's lift, stretcher lift, and high-risk occupancy prompts.
7. Fire plan completeness: legends, symbols, escape arrows, occupancy loads, equipment schedules, fire notes, evacuation signage, assembly point, and revision block.
8. Rational fire design trigger detection for atria, basements, high-rise buildings, large assembly spaces, shopping centres, hospitals, warehouses, petrochemical facilities, unusual occupancies, or complex smoke-control systems.

### 7.5 Accessibility and Universal Access Standards

Relevant standards and requirements include:

1. SANS 10400-S for facilities for persons with disabilities.
2. Department of Public Works accessibility guidelines where applicable.
3. Local authority accessibility requirements for public buildings, commercial buildings, educational buildings, healthcare, and assembly occupancies.

Autonomous AI checks include:

1. Accessible entrance route from boundary, parking, drop-off, or public way.
2. Ramp presence, slope notation, landings, handrails, kerbs, tactile warning prompts, and route width.
3. Door clear width, threshold, turning space, lobby depth, and corridor width prompts.
4. Accessible toilet layout completeness, grab rails, turning circle, basin clearance, door swing, emergency access, and signage.
5. Accessible parking bay count, dimensions, route to entrance, and signage prompts.
6. Lift or platform-lift requirement flags for multi-level public access.

### 7.6 Energy, Sustainability, and Environmental Performance

Relevant standards and requirements include:

1. SANS 10400-X and SANS 10400-XA for environmental sustainability and energy usage.
2. SANS 204 for energy efficiency in buildings where referenced by design route or local authority expectations.
3. Hot-water energy requirements and renewable-energy notes where applicable.
4. Local environmental overlays, flood lines, coastal setbacks, heritage, tree protection, protected areas, and water-sensitive urban design requirements where provided in municipal data or user-uploaded context.

Autonomous AI checks include:

1. Orientation, fenestration area, shading, roof insulation, wall insulation, glazing type, and energy-zone prompt checks.
2. Missing XA forms, energy calculations, glazing schedule, insulation notes, or hot-water system notes.
3. Roof overhang and solar control prompts.
4. Rainwater harvesting, greywater, PV, solar water heating, or heat-pump notes as optional value-added sustainability review.
5. Environmental trigger flags such as flood line, wetland proximity, steep slope, heritage overlay, coastal zone, protected tree, or servitude conflict when visible or provided.

### 7.7 Plumbing, Drainage, Water, and Stormwater Standards

Relevant standards and requirements include:

1. SANS 10400-P for drainage.
2. SANS 10400-Q for non-water-borne sanitary disposal.
3. SANS 10400-R for stormwater disposal.
4. SANS 10252-1 for water supply installations in buildings.
5. SANS 10252-2 for drainage installations in buildings.
6. SANS 10254 for fixed electric storage water heating systems where applicable.
7. Municipal water, sewer, stormwater, wayleave, connection, and discharge requirements.

Autonomous AI checks include:

1. Missing drainage layout, stack/vent information, inspection eyes, rodding access, gradients, pipe sizes, connection points, and municipal invert references.
2. Fixture count versus occupancy prompts.
3. Stormwater roof area, downpipe, channel, soakaway, attenuation, discharge direction, and neighbour-impact flags.
4. Hot-water cylinder location, overflow, drip tray, discharge, access, and energy-source note prompts.
5. Rainwater harvesting, greywater, septic tank, conservancy tank, soakaway, or alternative sanitation approval flags.

### 7.8 Electrical, Mechanical, and Building Services Standards

Relevant standards and requirements include:

1. SANS 10142-1 for low-voltage electrical installations.
2. SANS 10142-1-2 or current applicable embedded-generation/PV installation references where renewable systems are included.
3. SANS 10400-O for lighting and ventilation.
4. SANS 10400-T and W for fire-related services.
5. Mechanical ventilation, smoke control, lift, escalator, gas, HVAC, and pressure-system regulations where relevant.

Autonomous AI checks include:

1. Missing electrical legend, DB position, meter location, main switch, smoke detector, emergency lighting, exit signage, and fire alarm interface prompts.
2. Mechanical ventilation requirement flags for internal bathrooms, basements, parking garages, kitchens, plant rooms, and high-occupancy rooms.
3. Plant-room access, ventilation, fire separation, acoustic impact, condensate discharge, and service clearance prompts.
4. PV/battery/inverter location, ventilation, fire separation, emergency shutoff, and electrical sign-off prompts.
5. Gas cylinder, LPG cage, restaurant extraction, or fuel storage flags requiring specialist input.

### 7.9 Architectural Documentation and Council Submission Requirements

The system must review not only compliance but submission readiness and drawing professionalism.

Autonomous AI checks include:

1. Title block completeness: project name, erf number, address, owner, professional, SACAP/ECSA registration where applicable, scale, drawing number, revision, date, sheet number.
2. Site plan completeness: erf boundaries, dimensions, north point, street names, building lines, setbacks, servitudes, coverage, FAR, height, contours, access, parking, stormwater direction, municipal connections.
3. Plan, section, elevation, roof plan, drainage plan, fire plan, window/door schedule, area schedule, parking schedule, and material schedule presence.
4. Scale consistency, dimensions, room names, floor levels, section markers, grid references, legends, notes, and cross-references.
5. Consistency between plans, sections, elevations, schedules, and specifications.
6. Missing owner signature, professional declaration, competent-person appointment, municipal forms, zoning certificate, SG diagram, title deed, power of attorney, fire form, or engineer certificate prompts.
7. Local authority requirements by municipality, including Cape Town, Johannesburg, Tshwane, eThekwini, Ekurhuleni, Nelson Mandela Bay, Mangaung, and district/local municipalities as knowledge is added.

### 7.10 Town Planning, Zoning, Land Use, and Site Constraints

AI can assist with preliminary site-constraint review if provided with zoning data, title deed extracts, SG diagrams, municipal GIS output, or user-entered property information.

Autonomous AI checks include:

1. Erf number, township, suburb, owner, and site address consistency.
2. Building line, side space, rear space, height, coverage, FAR/bulk, parking, access, and street boundary prompts.
3. Servitude, restrictive title condition, HOA/body corporate, estate guideline, heritage overlay, flood line, coastal setback, and environmental overlay flags.
4. Departures, rezoning, consent use, relaxation, subdivision, consolidation, or site development plan trigger prompts.
5. Parking schedule and loading bay checks for commercial, industrial, assembly, education, or healthcare projects.

### 7.11 NHBRC, Residential Quality, and Construction Risk

For applicable residential projects, the system should flag NHBRC and residential construction quality requirements.

Autonomous AI checks include:

1. New home, alteration, addition, owner-builder, or contractor-built classification prompts.
2. NHBRC enrolment and builder-registration reminders where applicable.
3. Foundation classification, soil report, waterproofing, roof tie-down, slab, damp-proofing, and stormwater-risk prompts.
4. Wet-area waterproofing, balcony drainage, balustrade, pool safety, boundary wall, and retaining wall risk flags.

## 8. AI Autonomy Boundaries

The PRD distinguishes between checks AI can perform autonomously and outputs that require professional validation.

### 8.1 AI Can Autonomously Perform

1. Completeness checks against drawing and submission checklists.
2. Consistency checks between drawings, schedules, notes, legends, and forms.
3. Geometry-derived prompts where dimensions are readable, such as room areas, door widths, stair riser/going annotations, parking bay labels, window areas, and route widths.
4. Detection of missing mandatory notes, certificates, signatures, legends, or discipline drawings.
5. Identification of likely regulatory domains triggered by project type, occupancy, height, use, site conditions, or drawing content.
6. Preliminary pass/fail issue categorization for obvious missing or inconsistent information.
7. Risk flagging where drawings imply specialist input is needed.
8. Generation of correction checklists and professional coordination actions.
9. Citation of approved knowledge entries and standards references without claiming final interpretation.
10. Drafting value-added reports for architects, engineers, fire consultants, and administrators.

### 8.2 AI Must Not Autonomously Certify

1. Structural adequacy, foundation design, retaining wall stability, geotechnical adequacy, or rational structural design.
2. Rational fire designs, smoke-control design, sprinkler hydraulic design, fire detection design, or fire department approval.
3. Electrical certificates of compliance, PV compliance, gas compliance, lift compliance, pressure equipment compliance, or occupational safety certificates.
4. Energy performance compliance calculations requiring professional method selection, detailed envelope data, or certified software outputs.
5. Legal compliance with title deed restrictions, zoning rights, SPLUMA approvals, environmental authorizations, or heritage approvals.
6. Final municipal approval readiness.
7. NHBRC enrolment or warranty compliance.

### 8.3 Output Labels

Every AI finding must be labeled as one of:

1. `autonomous_check`: AI can identify and report directly.
2. `professional_review_required`: AI can flag the issue, but a registered professional must decide.
3. `competent_person_required`: Regulation or project condition suggests a competent person appointment or rational design.
4. `municipal_confirmation_required`: Local authority interpretation or approval is required.
5. `insufficient_information`: Drawing package does not contain enough information to assess.

## 9. Agent System Requirements

### 9.1 Agent Registry

The system must maintain a Firestore-backed registry of agents with configurable prompts, descriptions, model settings, status, and last activity.

Required agent fields:

1. `name`
2. `role`
3. `discipline`
4. `description`
5. `systemPrompt`
6. `temperature`
7. `status`
8. `riskLevel`
9. `standardsCoverage`
10. `lastActive`

Optional fields:

1. `llmProvider`
2. `llmModel`
3. `llmApiKey`
4. `llmBaseUrl`
5. `authorizationType`
6. `authorizationHeader`
7. `executionMode`
8. `requiresHumanReview`
9. `version`
10. `approvedBy`

### 9.2 Target Agent Portfolio

The current implementation can continue with existing agents as MVP defaults, but the target product requires the following expanded portfolio:

| Agent | Role | Primary value |
| --- | --- | --- |
| Chief Built-Environment Orchestrator | `orchestrator` | Coordinates all agents and produces final professional report |
| Regulatory Scope Agent | `regulatory_scope` | Determines applicable laws, standards, occupancy, and required specialist agents |
| Architectural Completeness Agent | `architectural_completeness` | Reviews drawing package completeness and drafting quality |
| Council Submission Agent | `council_submission` | Checks municipal forms, site data, title block, zoning and submission readiness |
| SANS 10400 General Agent | `sans_10400_general` | Maintains full National Building Regulations coverage map |
| Spatial Planning and Zoning Agent | `planning_zoning` | Flags building lines, coverage, FAR, height, parking, land-use and departures |
| Structural Trigger Agent | `structural_trigger` | Flags engineering sign-off requirements and structural coordination risks |
| Foundation and Geotechnical Agent | `foundation_geotech` | Flags soil, foundation, excavation, retaining and slope risks |
| Fire Safety and Fire Plan Agent | `fire_safety` | Reviews fire protection, fire plans, escape routes, equipment and rational design triggers |
| Accessibility Agent | `accessibility` | Reviews universal access and SANS 10400-S requirements |
| Energy and Sustainability Agent | `energy_sustainability` | Reviews SANS 10400-X/XA, SANS 204 and sustainability opportunities |
| Drainage and Stormwater Agent | `drainage_stormwater` | Reviews sanitary drainage, stormwater, water supply and municipal connection prompts |
| Electrical and Services Agent | `electrical_services` | Flags electrical, PV, ventilation, mechanical and service coordination requirements |
| Envelope and Materials Agent | `envelope_materials` | Reviews walls, roofs, glazing, waterproofing, fire properties and material notes |
| Safety and Site Operations Agent | `site_safety_operations` | Flags demolition, excavation, site operations, public safety and temporary works |
| NHBRC and Residential Risk Agent | `nhbrc_residential` | Flags residential enrolment, owner-builder and quality-risk prompts |
| Coordination Clash Agent | `coordination_clash` | Compares drawings for inconsistencies across disciplines |
| Professional Sign-Off Agent | `professional_signoff` | Produces list of required professional declarations, certificates and rational designs |
| Knowledge and Research Agent | `knowledge_research` | Requests governed research for unknown or municipality-specific topics |

### 9.3 Agent Execution Modes

The system must support different execution modes by project type and subscription tier.

1. `basic_ai_screen`: Architectural completeness, title block, SANS 10400 high-level checks.
2. `council_readiness`: Submission pack, municipal forms, zoning prompts, professional sign-off checklist.
3. `fire_plan_review`: Fire plan, escape routes, equipment, signage, rational design triggers.
4. `engineering_coordination`: Structural, civil, drainage, services, and coordination risk checks.
5. `full_professional_review`: All available agents with orchestrated multi-discipline report.
6. `resubmission_delta_review`: Compares revised drawings against previous AI findings.
7. `specialist_pack_review`: Runs only a selected discipline such as fire, drainage, accessibility, or energy.

## 10. Product Requirements

### 10.1 Multi-Document Review

The system must review individual files and full submission packs.

Functional expectations:

1. Accept architectural drawings, fire plans, structural drawings, drainage layouts, electrical layouts, schedules, municipal forms, zoning documents, title deed extracts, SG diagrams, and supporting reports.
2. Identify document type automatically when possible.
3. Build a submission index showing missing, duplicate, outdated, or inconsistent documents.
4. Allow agents to reference cross-document context.
5. Flag when a conclusion is limited because only one drawing was supplied.

### 10.2 Structured Findings

Each finding must include:

1. `title`
2. `description`
3. `discipline`
4. `standardFamily`
5. `reference`
6. `severity`
7. `confidence`
8. `autonomyLabel`
9. `responsibleParty`
10. `actionItem`
11. `evidence`
12. `sourceCitations`
13. `drawingReferences`
14. `requiresProfessionalSignoff`

Target issue schema:

```json
{
  "title": "string",
  "description": "string",
  "discipline": "architecture|structure|fire|accessibility|energy|drainage|electrical|mechanical|planning|documentation|environmental|nhbrc|coordination",
  "standardFamily": "NBR|SANS10400|SANS10160|SANS10100|SANS10162|SANS10142|SANS10252|MunicipalBylaw|NHBRC|ProfessionalCoordination|Other",
  "reference": "string",
  "severity": "low|medium|high|critical",
  "confidence": "low|medium|high",
  "autonomyLabel": "autonomous_check|professional_review_required|competent_person_required|municipal_confirmation_required|insufficient_information",
  "responsibleParty": "architect|structural_engineer|civil_engineer|fire_engineer|electrical_engineer|mechanical_engineer|energy_professional|client|contractor|municipality|admin",
  "actionItem": "string",
  "evidence": "string",
  "sourceCitations": [],
  "drawingReferences": [],
  "requiresProfessionalSignoff": true
}
```

### 10.3 Report Types

The system must generate multiple report formats:

1. Professional issue register.
2. Council-readiness checklist.
3. Fire-plan review checklist.
4. Engineering sign-off checklist.
5. Accessibility review checklist.
6. Energy and sustainability opportunity report.
7. Client-friendly summary.
8. Admin audit report.
9. Resubmission delta report.
10. Downloadable PDF certificate of preliminary AI review with disclaimers.

### 10.4 Risk-Based Status

The result must move beyond simple `passed` or `failed`.

Target statuses:

1. `ready_for_admin_review`
2. `ready_for_professional_review`
3. `requires_minor_corrections`
4. `requires_major_corrections`
5. `requires_specialist_design`
6. `not_assessable_insufficient_information`
7. `ai_review_failed`

For backward compatibility with the current `AIReviewResult`, statuses can be mapped to `passed` or `failed` until type changes are implemented.

### 10.5 Knowledge Governance

The knowledge system must store standards summaries, municipality-specific checklists, professional guidance, approved interpretations, and version metadata.

Knowledge entries must support:

1. Standard family and part, such as `SANS 10400-T` or `SANS 10142-1`.
2. Municipality and province scope.
3. Discipline scope.
4. Effective date and review date.
5. Source type, source URL, uploaded PDF reference, or internal professional note.
6. Copyright-safe summary content.
7. Status workflow: pending review, active, rejected, archived.
8. Reviewer, approval date, and rejection reason.
9. Confidence and legal/professional disclaimer metadata.

Only active, approved knowledge may be injected into production agent prompts.

### 10.6 Professional Sign-Off Detection

The system must output a professional sign-off checklist for every review.

Examples:

1. SACAP-registered architectural professional required.
2. Structural engineer required for slabs, beams, retaining walls, basements, multi-storey structures, large spans, unusual roofs, or rational design.
3. Civil engineer required for stormwater attenuation, roads, bulk services, complex drainage, or flood-line considerations.
4. Fire engineer required for rational fire design, smoke control, complex occupancy, atria, basements, high-rise, healthcare, warehouse, industrial, or assembly spaces.
5. Electrical engineer or registered electrical contractor required for electrical design, CoC, PV, inverter, generator, or emergency power systems.
6. Mechanical engineer required for smoke extraction, HVAC, mechanical ventilation, parking garage ventilation, kitchen extraction, or plant rooms.
7. Energy competent person required for XA route, energy calculations, or complex envelope design.
8. Geotechnical professional required for dolomite, expansive soils, slopes, fill, retaining, basement excavation, or unusual foundations.
9. NHBRC enrolment or owner-builder documentation required for applicable residential projects.
10. Municipal fire department approval required for designated occupancies or fire plans.

### 10.7 Autonomous Value-Added Checks Catalog

The platform must expose selectable professional services built from the agent system.

Potential paid or premium review products:

1. AI Council Submission Readiness Check.
2. AI Fire Plan Pre-Review.
3. AI Accessibility Audit.
4. AI Energy and Sustainability Pre-Check.
5. AI Structural Coordination Risk Scan.
6. AI Drainage and Stormwater Completeness Check.
7. AI Zoning and Site Constraint Prompt Review.
8. AI NHBRC Residential Risk Scan.
9. AI Drawing Coordination and Clash Check.
10. AI Professional Sign-Off Checklist.
11. AI Resubmission Delta Review.
12. AI Client Summary Report for design milestones.

## 11. Current System Overview

The current system provides a foundation that must be evolved rather than discarded.

Current implementation references:

1. `src/services/geminiService.ts` contains the multi-agent orchestration service.
2. `SPECIALIZED_AGENTS` defines default agents.
3. `agents` Firestore collection stores runtime agent configuration.
4. `agent_knowledge` Firestore collection stores governed knowledge entries.
5. `src/services/knowledgeService.ts` manages knowledge retrieval, approval, rejection, deletion, and research persistence.
6. `/api/gemini/review` and `/api/review` proxy LLM calls.
7. `/api/agent/search` performs LLM-backed research for unknown regulatory topics.
8. `OrchestrationProgressModal` displays review progress.
9. `ComplianceReport` and `SubmissionItem` display structured review output.

Current default agents:

1. Chief Architect Orchestrator.
2. SANS 10400-K Wall Agent.
3. Fenestration and Ventilation Agent.
4. Fire Safety and Egress Agent.
5. Room Sizing and Ceiling Agent.
6. General Presentation Agent.
7. SANS 10400 National Regs Expert.

## 12. Primary Workflow

1. Professional uploads one or more project files.
2. System classifies files by type and discipline.
3. Regulatory Scope Agent identifies applicable review domains.
4. Orchestrator selects execution mode and agent set.
5. Agents retrieve approved knowledge by discipline, standard family, municipality, project type, and occupancy.
6. Agents review files and produce structured specialist findings.
7. Knowledge and Research Agent handles unknown topics as pending, non-authoritative research.
8. Professional Sign-Off Agent determines required professional declarations and certificates.
9. Coordination Clash Agent compares cross-document consistency.
10. Orchestrator produces final report, summary, risk status, citations, and next actions.
11. User receives professional issue register and role-specific action plan.
12. Admins can review AI-generated knowledge and system logs.

## 13. Personas

### 13.1 Architect or Draughting Professional

Needs faster document-quality feedback, council-readiness checks, coordination prompts, and issue registers before submission.

### 13.2 Engineer

Needs structural, civil, drainage, fire, electrical, or mechanical coordination risks surfaced before reviewing drawings.

### 13.3 Fire Consultant

Needs fire-plan completeness, escape-route, equipment, signage, detection, sprinkler, and rational-design trigger checks.

### 13.4 Developer or Client

Needs a simplified milestone report showing whether drawings are likely ready for professional or admin review.

### 13.5 Administrator

Needs traceable review output, knowledge governance, agent configuration, and auditability.

### 13.6 Platform Operator

Needs observability, cost controls, provider routing, queueing, and secure configuration.

## 14. Security and Compliance Requirements

1. API keys must not be exposed to client UI.
2. Agent prompt management and knowledge approval must be admin-only.
3. Per-agent provider credentials must be encrypted or otherwise protected according to deployment capabilities.
4. Uploaded drawings, title deeds, and project documents must be treated as confidential project data.
5. AI-generated knowledge must remain pending until reviewed.
6. Standards content must be summarized and cited in a copyright-safe way.
7. Every report must state that AI output is preliminary and requires professional validation where applicable.
8. Prompt injection from uploaded drawings must be mitigated by strict system instructions.
9. The system must not claim municipal, fire department, NHBRC, SACAP, or ECSA approval.

## 15. Observability and Quality Metrics

Primary product metrics:

1. Review completion rate.
2. Average review duration.
3. Number of issues detected before admin or council submission.
4. Administrator agreement rate with AI severity and status.
5. Professional acceptance rate of AI issue register usefulness.
6. Reduction in resubmission defects or missing-document defects.
7. Percentage of findings with approved citations.
8. Percentage of findings labeled with correct autonomy boundary.

Operational metrics:

1. Provider error rate by model and agent.
2. JSON schema validity rate.
3. Agent failure rate by discipline.
4. Token and cost per review type.
5. Pending knowledge backlog age.
6. Knowledge usage counts.
7. Research-trigger frequency by standard family or municipality.

## 16. Acceptance Test Plan

Automated tests must cover:

1. Parsing structured multi-discipline findings.
2. Safe failure on invalid orchestrator output.
3. Agent selection by project type and execution mode.
4. Knowledge filtering by active status, discipline, and standard family.
5. Exclusion of pending and rejected knowledge.
6. Single specialist failure while orchestration continues.
7. Professional sign-off checklist generation.
8. Fire-plan checklist generation from a drawing with fire symbols.
9. Council-readiness checklist generation from incomplete title block/site plan.
10. Accessibility issue generation from missing accessible route or toilet information.
11. Engineering trigger generation from retaining wall, basement, large span, or slab notes.
12. Drainage and stormwater missing-document detection.
13. Energy/XA missing-information detection.
14. Client summary generation without exposing unnecessary technical detail.

Manual QA scenarios:

1. Upload a basic residential plan and verify architectural, SANS 10400, drainage, energy, and NHBRC prompts.
2. Upload a commercial plan and verify fire, accessibility, parking, occupancy, and professional sign-off prompts.
3. Upload a fire plan and verify escape route, equipment, signage, detection, and rational-design trigger checks.
4. Upload structural drawings and architectural drawings with inconsistent columns or grids and verify coordination findings.
5. Upload a submission pack missing title deed, zoning certificate, drainage layout, or owner signature and verify council-readiness findings.
6. Upload a revised drawing and verify delta review against previous findings.

## 17. MVP Scope

The immediate MVP should expand the existing SANS-focused review into a broader but still manageable professional pre-check.

Included in expanded MVP:

1. Full SANS 10400 coverage map and prompt framework.
2. Fire-plan pre-review agent.
3. Council-readiness and architectural completeness agent.
4. Professional sign-off checklist agent.
5. Drainage/stormwater completeness checks.
6. Accessibility checks.
7. Energy/XA missing-information checks.
8. Structural trigger detection, not structural certification.
9. Knowledge metadata for standard family, municipality, discipline, and version.
10. Report labels separating autonomous checks from professional-review-required findings.

Deferred:

1. Full CAD/BIM geometry extraction.
2. Certified calculations.
3. Automated municipal submission.
4. True legal title-deed interpretation.
5. Fully automated visual annotations for every issue.
6. Full national municipality checklist database.

## 18. Future Enhancements

1. Parallel agent execution.
2. BIM/IFC parsing and model-based compliance checks.
3. Municipality-specific knowledge packs and submission checklists.
4. Province and metro-specific planning overlays.
5. Fire-plan symbol recognition and escape-route path measurement.
6. Automated drawing comparison for revision deltas.
7. Professional marketplace routing based on detected sign-off requirements.
8. Costed correction work packages for freelancers or specialists.
9. Integration with council portals where available.
10. Golden drawing dataset for regression testing.
11. Standards update monitoring and admin review reminders.
12. Paid value-added AI review tiers.

## 19. Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| AI overclaims compliance | Professional or legal risk | Strong disclaimers, autonomy labels, failed-by-default parser, human review |
| Outdated standards | Incorrect guidance | Versioned knowledge, review dates, admin approvals, standards update workflow |
| Copyright misuse | Legal risk | Store summaries and citations, not full standards text unless licensed |
| Missed local by-law requirement | Council rejection | Municipality-specific knowledge packs and municipal confirmation labels |
| False structural/fire confidence | Safety risk | Require professional sign-off labels for calculations and rational designs |
| Provider instability | Delayed reviews | Retry, fallback, partial agent failure handling, queueing |
| Prompt injection from drawings | Misleading output | System-prompt hardening and uploaded-document instruction isolation |
| Excessive cost | Poor unit economics | Tiered review modes, provider routing, usage metrics |

## 20. Open Questions

1. Which review products should be free versus premium value-added services?
2. Which municipalities should receive first-class checklist support first?
3. What standards summaries can Architex legally store and cite under current licensing constraints?
4. Should raw specialist outputs be persisted for every submission?
5. How should AI findings route work to platform professionals for paid correction or specialist sign-off?
6. What agreement threshold with administrators defines production readiness?
7. Should the platform maintain separate agent packs for residential, commercial, industrial, healthcare, education, and assembly occupancies?

## 21. Definition of Done

The expanded agent system is ready for MVP release when:

1. The review scope covers SANS 10400 plus at least fire-plan, accessibility, drainage, energy, structural-trigger, council-readiness, and professional sign-off checks.
2. Every finding includes discipline, reference, severity, autonomy label, responsible party, and action item.
3. Reports clearly state when professional or municipal confirmation is required.
4. Knowledge entries are versioned by discipline and standard family.
5. Pending AI-generated knowledge cannot influence production reviews.
6. Admin users can approve, reject, edit, archive, and audit knowledge.
7. Agents can fail independently without crashing the entire review.
8. The orchestrator produces schema-valid output or safely degrades to a failed/non-assessable result.
9. Test coverage includes multi-discipline review, fire-plan checks, council-readiness checks, and professional sign-off generation.
10. User-facing copy positions the system as a value-added professional assistant, not a statutory approval engine.
