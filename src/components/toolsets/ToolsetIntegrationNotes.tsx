// Pseudo-component notes for the Architex repo.
// This is intentionally not a finished UI drop-in because the repo's design system and routing should be wired deliberately.

/*
BEPDashboard.tsx integration:

1. Add activeView option:
   const [activeView, setActiveView] = useState<'overview' | 'marketplace' | 'toolbox'>('overview');

2. Add button:
   <Button variant={activeView === 'toolbox' ? 'default' : 'outline'} onClick={() => setActiveView('toolbox')}>Toolbox</Button>

3. Render:
   {activeView === 'toolbox' && <BEPToolboxDashboard user={user} />}

ContractorDashboard.tsx integration:

1. Replace disabled Prepare Bid button with:
   <Button onClick={() => openCalculatorPanel(tender)}>Prepare Bid</Button>

2. Panel should prefill:
   - tenderPackageId
   - contractorId/userId
   - projectId
   - phase: 'tender'
   - exportTargets: tender_boq, bid_line_item, supplier_rfq

Service integration:

- Save runs under: projects/{projectId}/calculator_runs/{runId}
- Mirror tender-related runs under: tender_packages/{tenderPackageId}/calculator_runs/{runId}
- Include source drawing/spec revision in every saved run.
*/
export {};
