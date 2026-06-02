# Architex BEP / Contractor / Subcontractor Calculator Toolbox

Version: 0.1 draft
Separate concern from: professional fee calculators and proposal builder
Repo context inspected: https://github.com/cp-coder9/arc-1, main, head 8541ede
Example link inspected: https://share.google/1SrjOeR2kzeUOhzs5 redirects to `https://magnusfjeldolsen.github.io/structural_tools/`, a free structural tools site with Eurocode-oriented steel, concrete, fire resistance, weld and seismic calculators.

## 1. Product intent

Architex should add a second calculator layer: practical discipline/toolbox calculators for Built Environment Professionals (BEPs), contractors, subcontractors and suppliers.

These are not fee calculators. They are working calculators that help users do daily built-environment tasks:

- pre-design checks
- SANS 10400-XA energy checks
- structural preliminary sizing/checks
- civil/stormwater checks
- electrical/mechanical/wet-services checks
- fire/life-safety checks
- quantity takeoff
- material ordering
- labour/productivity planning
- tender rate build-ups
- site valuations and claims

The objective is to duplicate the usefulness of public calculators, but tailor them to Architex workflows, South African norms, project phases, project records, tenders, bids, site logs, payments and professional sign-off.

## 2. Current Architex integration points

The current repo already has foundations to integrate this toolbox:

- `src/components/BEPDashboard.tsx`
  - BEP portal exists.
  - Has overview, marketplace, tasks and site logs.
  - No calculator toolbox yet.

- `src/components/ContractorDashboard.tsx`
  - Contractor portal exists.
  - Shows tender marketplace and bids.
  - `Prepare Bid` button is present but disabled; this is a natural entry point for tender/bid calculators.

- `src/services/tenderService.ts`
  - Tender packages and bids already exist.
  - Calculator outputs can feed BOQ lines, bid line items and rate build-ups.

- `src/services/constructionService.ts`
  - Gantt tasks, site logs, RFIs and inspections already exist.
  - Calculator outputs can feed site work packages, productivity tracking, variations, valuations and claims.

- `src/types.ts`
  - Already includes `UserRole`, `Discipline`, `TenderPackage`, `Bid`, `BidLineItem`, `GanttTask`, `SiteLog`, `RFI`, `SiteInspection`, project lifecycle and verification types.
  - Add toolbox-specific types rather than replacing existing models.

Recommended integration files:

- `src/services/toolboxCalculatorService.ts`
- `src/services/toolboxAgentService.ts`
- `src/types/toolboxCalculators.ts`
- `src/components/ToolboxCalculatorPanel.tsx`
- `src/components/BEPToolboxDashboard.tsx`
- `src/components/ContractorBidCalculatorPanel.tsx`

## 3. Calculator families

### 3.1 SANS 10400-XA / Energy / Sustainability toolbox

Purpose: help architects, energy professionals, BEPs and contractors check energy/compliance assumptions early and prepare consultant-ready data.

Recommended calculators:

1. XA fenestration quick checker
   - Inputs: building type, climate/energy zone, orientation, wall area, glazed area, U-value, SHGC, shading factor.
   - Outputs: glazing ratio, weighted U-value/SHGC, warning/pass/fail, missing data.
   - Sources to model against: SANSCalc, Fencalc, Blind Solutions SANS checker, PG SmartGlass tools, City Energy/Cape Town guidance.

2. XA roof/ceiling insulation R-value checker
   - Inputs: energy zone, roof/ceiling build-up, insulation type, R-value, direction of heat flow.
   - Outputs: total R-value, required R-value, pass/fail, insulation shortfall.
   - Sources: TIPSASA SANS 10400-XA guide, SANSCalc, manufacturer data.

3. XA wall R-value checker
   - Inputs: wall type, layers, thicknesses, material R-values, climate zone.
   - Outputs: composite R-value, minimum target, pass/fail.
   - Sources: Clay Brick SA R-value calculator, TIPSASA, SANS 10400-XA.

4. Hot-water energy compliance checklist
   - Inputs: dwelling/building type, water heating system, solar/heat pump/gas/electric, storage, pipe insulation.
   - Outputs: compliance notes, missing information, consultant queries.

5. EDGE early sustainability estimator
   - Inputs: building type/location, energy measures, water measures, materials measures.
   - Outputs: early savings flags, EDGE route note, not municipal-compliance proof.

Caution: XA tools must distinguish quick screening, deemed-to-satisfy calculator output, rational design and municipal submission evidence. Architex should not imply a quick check replaces a competent person's SANS 10400-XA responsibility.

### 3.2 Structural toolbox

Model after public structural tools such as structural_tools, SkyCiv, calcresource and EngineeringToolBox, but tailored to South African coordination.

Recommended calculators:

- Beam reaction/shear/moment/deflection quick calculator
- Section properties calculator
- Preliminary steel member selector
- Concrete slab preliminary depth calculator
- Pad footing bearing pressure calculator
- Retaining wall preliminary pressure/overturning checker
- Concrete volume and reinforcement allowance calculator
- Temporary works / loading sanity-check calculator for contractors

Inputs should support SANS 10160 assumptions, SA materials/section presets, grids/levels, BIM element IDs, and "coordination only / engineer verification required" flags.

### 3.3 Civil / drainage / stormwater toolbox

Recommended calculators:

- Rational Method runoff calculator
- Manning pipe/channel flow calculator
- Stormwater attenuation volume estimator
- Pipe gradient and invert-level calculator
- Sewer/drainage pipe sizing sanity check
- Earthworks cut/fill/bulking/shrinkage calculator
- Rainwater harvesting tank sizing calculator

Tailoring:
- Add municipality, return period, runoff coefficients, local IDF placeholder tables, roof/paving/landscape catchment split, invert-level handover schedules.

### 3.4 Electrical toolbox

Recommended calculators:

- Voltage drop calculator
- Cable sizing / derating calculator
- DB load estimate calculator
- Lighting/lux/lumen method calculator
- PV preliminary sizing calculator
- Battery backup/inverter sizing calculator
- Generator sizing calculator

Tailoring:
- Use 230V single phase / 400V three phase defaults, SANS 10142 caution, Eskom/municipal supply assumptions, load-shedding resilience workflows, cable route/riser coordination.

### 3.5 Mechanical / HVAC toolbox

Recommended calculators:

- Cooling/heating load preliminary calculator
- Ventilation / air-change calculator
- Duct sizing calculator
- Fan airflow/pressure calculator
- Plant room allowance calculator
- Louver/free-area calculator

Tailoring:
- Link to room areas, occupancy, glazing/orientation, ceiling voids, plant room/reserve zones, SANS 10400-O ventilation checks.

### 3.6 Wet services / plumbing toolbox

Recommended calculators:

- Water demand / fixture-unit calculator
- Soil/waste pipe sizing calculator
- Hot-water sizing calculator
- Pump sizing preliminary calculator
- Rainwater harvesting / greywater calculator
- Fire water tank/pump preliminary calculator

Tailoring:
- Reference SANS 10252/10254, common SA pipe sizes, minimum gradients, stack/riser coordination, municipal supply assumptions.

### 3.7 Fire / life safety toolbox

Recommended calculators:

- Occupant load calculator
- Escape width / number of exits calculator
- Travel-distance checker
- Fire water storage / pump preliminary calculator
- Smoke ventilation / stair pressurisation preliminary calculator
- Fire door/compartmentation checklist

Tailoring:
- Reference SANS 10400-T, building occupancy, assembly/religious/education/retail use, route drawings and fire engineer sign-off.

### 3.8 Contractor / subcontractor / supplier toolbox

Recommended calculators:

- Quantity takeoff calculator
- Concrete volume/order calculator
- Brick/blockwork calculator
- Mortar/plaster/screed calculator
- Paint calculator
- Tile/adhesive/grout calculator
- Roofing area/material calculator
- Drywall/partition calculator
- Excavation/trench calculator
- Waste/pack-size/order optimiser
- Labour/productivity calculator
- Tender rate build-up calculator
- Programme/crew productivity calculator
- Variation/daywork/claims calculator
- Payment valuation/progress-claim calculator

Tailoring:
- Feed tender BOQs, bid line items, supplier RFQs, site work packages, site logs, delivery tickets, progress valuations and escrow/payment claims.

## 4. Standard Architex calculator output

Every calculator should produce a common auditable output:

- calculatorId
- calculatorVersion
- projectId / jobId / tenderPackageId / bidId where relevant
- userId and role
- discipline/trade
- project phase
- location/zone/grid/level/room
- inputs
- formula/version
- assumptions
- result values
- pass/warning/fail/risk status
- South African reference/caution
- professional sign-off requirement
- source documents/drawings/model elements
- next recommended action
- export targets: tender, bid, BOQ, RFQ, site log, RFI, payment claim, proposal, compliance report

## 5. Agentic workflow around toolbox calculators

This should be an agentic workflow, not just a drawer of calculators.

Agents:

- Toolbox Router Agent: suggests the right calculator based on role, project phase, discipline, chat message, tender package or site issue.
- Input Completion Agent: checks missing dimensions, zones, drawings, material specs, climate zone, municipality or assumptions.
- Compliance Caution Agent: adds SANS/NBR/municipal caveats and professional sign-off labels.
- Quantity Agent: converts calculator outputs to BOQ/RFQ/work-package quantities.
- Tender Agent: turns calculator outputs into rate build-ups and bid line items.
- Site Agent: compares calculated quantities with actual site logs, deliveries and progress.
- Claims Agent: packages variations, dayworks, delay/disruption calculations and evidence.
- Coordination Agent: turns engineering/service calculator outputs into BIM coordination comments, RFIs and clash-risk warnings.
- Learning Agent: captures accepted calculator settings and actual outcomes for future templates, with human review.

Core workflow:

1. User opens toolbox or agent suggests a calculator.
2. Project/phase/discipline context is prefilled.
3. User enters or imports data from drawing, BIM, BOQ, tender or site log.
4. Calculator runs.
5. Agent checks missing data, assumptions and risk level.
6. Result is saved as a versioned calculation run.
7. User chooses export target: report, tender line, bid line, RFQ, RFI, site log, claim, payment valuation or compliance checklist.
8. Human/professional signs off where required.
9. Agent monitors downstream use and flags changes when inputs/drawings/revisions change.

Non-negotiable: agents may assist, check, draft and route. They may not certify engineering, fire, electrical, XA or statutory compliance without a competent human professional.

## 6. MVP priority

Phase 1:
- XA fenestration quick checker
- XA R-value roof/wall checker
- Beam quick calculator
- Rational Method runoff calculator
- Voltage drop calculator
- Concrete calculator
- Brick/blockwork calculator
- Paint/tile calculator
- Tender rate build-up calculator
- Labour/productivity calculator

Phase 2:
- Manning flow
- Pipe gradient/invert level
- Duct sizing
- Ventilation/air changes
- Water fixture demand
- Occupant load/escape width
- Drywall/roofing/excavation
- Payment valuation calculator

Phase 3:
- EDGE/sustainability estimator
- PV/battery/generator sizing
- Retaining wall/footing/slab preliminary checks
- Stormwater attenuation
- Fire water/smoke ventilation preliminary tools
- Claims/daywork/delay calculators

## 7. Important cautions

- Do not clone proprietary calculators or copy protected formula implementations blindly. Use public standards, engineering first principles, user-entered tables and Architex-owned implementation.
- Provide South African defaults but keep reference tables admin-editable/versioned.
- Mark each calculator as one of: quick estimate, coordination check, tender estimate, contractor quantity, compliance support, professional design required.
- Keep final professional responsibility with registered/competent professionals where required.
- Lock calculation outputs to source versions and input assumptions so later disputes can be audited.
