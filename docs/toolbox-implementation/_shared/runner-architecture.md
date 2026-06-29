# StandaloneToolRunner Architecture

## Current State

`StandaloneToolRunner.tsx` (500 lines) has:
1. `renderInputFields()` — single flat `switch(tool.category)` — 15 category cases + default
2. `handleCalculate()` — tries matching calculator → fenestration enrichment → tool-specific switch → category switch → generic
3. `buttonLabel()` — category-based button text

## Problem

The file is already 500 lines. Adding 54 tool-specific forms will make it ~2000+ lines, unmaintainable.

## Solution: Extract Form Components

Extract each category form into its own file:

```
src/components/tools/forms/
├── ToolFormFeeCalculator.tsx
├── ToolFormCompliance.tsx        # base compliance form
├── ToolFormFenestration.tsx      # extends compliance for fenestration 
├── ToolFormRValue.tsx            # extends compliance for R-value
├── ToolFormXaCompliance.tsx      # full XA compliance form
├── ToolFormEnergyCertificate.tsx # EPC form
├── ToolFormFireRational.tsx      # fire rational design
├── ToolFormFireChecklist.tsx     # fire compliance checklist
├── ToolFormZoning.tsx            # zoning checker
├── ToolFormSans.tsx              # SANS forms
├── ToolFormEstimating.tsx        # BoQ line items
├── ToolFormSiteDiary.tsx         # site diary
├── ToolFormRfi.tsx              # RFI generator
├── ToolFormSnag.tsx             # snag creator
├── ToolFormHsCompliance.tsx     # H&S checklist
├── ToolFormRfiResponse.tsx      # RFI response
├── ToolFormTendering.tsx        # tender workbench
├── ToolFormDocControl.tsx       # document control
├── ToolFormShopDrawing.tsx      # shop drawing submission
├── ToolFormProcurement.tsx      # material procurement
├── ToolFormWorkforce.tsx        # timesheet
├── ToolFormPlantEquipment.tsx   # plant register
├── ToolFormPaymentClaim.tsx     # payment claim builder
├── ToolFormPaymentDashboard.tsx # payment lookup
├── ToolFormValuation.tsx        # valuation certificate
├── ToolFormBriefing.tsx         # briefing
├── ToolFormCloseout.tsx         # closeout
├── ToolFormDrawing.tsx          # drawing
├── ToolFormFreelancer.tsx       # freelancer
├── ToolFormSupplier.tsx         # supplier
├── ToolFormWarranty.tsx         # warranty upload
├── ToolFormDeliveryNote.tsx     # delivery note
├── ToolFormLookup.tsx           # generic lookup form
├── ToolFormStageGate.tsx        # stage gate review
├── ToolFormAdmin.tsx            # admin governance
├── ToolFormAuditTrail.tsx       # audit trail viewer
├── ToolFormUserVerification.tsx # verification console
├── ToolFormFeeTariff.tsx        # fee tariff editor
├── ToolFormRateConfig.tsx       # payment rate config
└── ToolFormCatalogue.tsx        # catalogue manager
```

Each form component receives:
```typescript
interface ToolFormProps {
  input: Record<string, unknown>
  onInputChange: (key: string, value: unknown) => void
  boqItems?: BoQItem[]
  onBoqItemsChange?: (items: BoQItem[]) => void
}
```

The runner `renderInputFields()` becomes a simple router:

```typescript
const renderInputFields = () => {
  const formProps = { input, onInputChange: set, boqItems, onBoqItemsChange: setBoqItems }
  switch (tool.id) {
    case 'fenestration_calc': return <ToolFormFenestration {...formProps} />
    case 'rvalue_calc':       return <ToolFormRValue {...formProps} />
    case 'rfi_generator':     return <ToolFormRfi {...formProps} />
    case 'snag_creator':      return <ToolFormSnag {...formProps} />
    // ... all 54 tools
    default: {
      switch (tool.category) {
        case 'fee_calculator': return <ToolFormFeeCalculator {...formProps} />
        case 'compliance':     return <ToolFormCompliance {...formProps} />
        // ... all 15 categories
        default:               return <ToolFormGeneric {...formProps} />
      }
    }
  }
}
```

Similarly, `handleCalculate()` logic moves to each form's `calculate()` function:

```typescript
interface ToolFormProps {
  // plus:
  onCalculate: (output: Record<string, unknown>) => void
}
```

## calculationHelperService.ts

Extract calculation logic shared across tools:

- `calculateFee(constructionValue, category, complexity, rateTable)`
- `calculateVAT(amount, rate)`
- `calculateRetention(gross, percent)`
- `calculateGlazingRatio(wallArea, glazedArea)`
- `sans10400NRequiredVentilation(floorArea)`
- `sans10400NRequiredLighting(floorArea)`
- `lookupXaMinRValue(zone, element)`
- `lookupFireTravelDistance(occupancy)`
- etc.

## Migration Strategy

1. Create `src/components/tools/forms/` directory
2. Extract one category per branch (e.g., `toolbox/refactor/runner-form-extraction`)
3. Update runner to use form components
4. Each tool branch then only needs to add a new form component + wire it
