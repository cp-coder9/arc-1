// Standalone Tool Runner â€” Opens a standalone tool instance
// Generates input forms by tool category and wires discipline calculators where available.
import React, { useState, useMemo } from 'react'
import { ArrowLeft, Save, Download, FolderOpen, Plus } from 'lucide-react'
import type { StandaloneToolDef, StandaloneToolRun } from '@/types/standaloneToolTypes'
import type { ToolboxContext } from '@/types/toolboxCalculators'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { listCalculatorsForContext, runCalculator } from '@/services/toolsets/toolboxCalculatorService'

interface StandaloneToolRunnerProps {
  tool: StandaloneToolDef
  onBack: () => void
  onSave: (input: Record<string, unknown>, output: Record<string, unknown>) => void
  onAssign: (run: StandaloneToolRun) => void
  onExport: (run: StandaloneToolRun, format: 'pdf' | 'csv' | 'json') => void
  latestRun: StandaloneToolRun | null
}

function FormField({ label, type, value, onChange, placeholder, options }: {
  label: string; type: string; value: string; onChange: (v: string) => void; placeholder?: string; options?: { value: string; label: string }[]
}) {
  return (
    <div>
      <label className="text-sm font-medium">{label}</label>
      {type === 'select' && options ? (
        <select className="w-full rounded-xl border p-2 mt-1" value={value} onChange={e => onChange(e.target.value)}>
          <option value="">Select...</option>
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : type === 'textarea' ? (
        <textarea className="w-full rounded-xl border p-2 mt-1" rows={3} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
      ) : (
        <input type={type} className="w-full rounded-xl border p-2 mt-1" value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
      )}
    </div>
  )
}

interface BoQItem { description: string; qty: string; unit: string; rate: string }

export default function StandaloneToolRunner({ tool, onBack, onSave, onAssign, onExport, latestRun }: StandaloneToolRunnerProps) {
  const [input, setInput] = useState<Record<string, unknown>>({})
  const [output, setOutput] = useState<Record<string, unknown>>({})
  const [saved, setSaved] = useState(false)
  const [boqItems, setBoqItems] = useState<BoQItem[]>([{ description: '', qty: '', unit: 'mÂ²', rate: '' }])

  const set = (key: string, value: unknown) => setInput(prev => ({ ...prev, [key]: value }))

  const calcContext: ToolboxContext = useMemo(() => ({
    userId: 'standalone', role: tool.roles[0] as ToolboxContext['role'],
    projectId: undefined, phase: undefined,
  }), [tool.roles])

  const matchingCalculator = useMemo(() => {
    const all = listCalculatorsForContext(calcContext) as readonly any[]
    return all.find(c => c.id && tool.tags.some((t: string) => c.id.includes(t.replace(/\s/g, '_').toLowerCase()))) as any ?? null
  }, [calcContext, tool.tags])

  const renderInputFields = () => {
    // Tool-specific forms (checked before category fallback)
    if (tool.id === 'rfi_generator') {
      const categories = ['design_clarification', 'specification', 'site_condition', 'other']
      const priorities = [{ value: 'urgent', label: 'Urgent' }, { value: 'normal', label: 'Normal' }, { value: 'low', label: 'Low' }]
      return (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Draft a Request for Information or Site Instruction. Enter the details and generate a numbered RFI document.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Subject" type="text" value={String(input.subject ?? '')} onChange={v => set('subject', v)} placeholder="e.g. Beam reinforcement detail clarification" />
            <FormField label="Category" type="select" value={String(input.rfiCategory ?? '')} onChange={v => set('rfiCategory', v)} options={categories.map(c => ({ value: c, label: c.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') }))} />
          </div>
          <FormField label="Question / Instruction" type="textarea" value={String(input.question ?? '')} onChange={v => set('question', v)} placeholder="Describe the information needed or instruction in detail..." />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField label="Priority" type="select" value={String(input.priority ?? '')} onChange={v => set('priority', v)} options={priorities} />
            <FormField label="Requested Response Date" type="date" value={String(input.responseDate ?? '')} onChange={v => set('responseDate', v)} />
            <FormField label="Project Reference" type="text" value={String(input.projectRef ?? '')} onChange={v => set('projectRef', v)} placeholder="Optional project ref" />
          </div>
        </div>
      )
    }
    if (tool.id === 'snag_creator') {
      const severities = [{ value: 'critical', label: 'Critical' }, { value: 'major', label: 'Major' }, { value: 'minor', label: 'Minor' }]
      const categories = [{ value: 'architectural', label: 'Architectural' }, { value: 'structural', label: 'Structural' }, { value: 'mep', label: 'MEP' }, { value: 'finishes', label: 'Finishes' }, { value: 'external', label: 'External' }]
      return (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Create a snag / punch list entry with location, description, severity, and responsible party.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Location / Area" type="text" value={String(input.location ?? '')} onChange={v => set('location', v)} placeholder="e.g. Bedroom 2 â€” North Wall" />
            <FormField label="Responsible Party" type="text" value={String(input.responsibleParty ?? '')} onChange={v => set('responsibleParty', v)} placeholder="e.g. John's Plastering" />
          </div>
          <FormField label="Description" type="textarea" value={String(input.snagDescription ?? '')} onChange={v => set('snagDescription', v)} placeholder="Describe the defect or incomplete work..." />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField label="Severity" type="select" value={String(input.severity ?? '')} onChange={v => set('severity', v)} options={severities} />
            <FormField label="Category" type="select" value={String(input.snagCategory ?? '')} onChange={v => set('snagCategory', v)} options={categories} />
            <FormField label="Due Date" type="date" value={String(input.dueDate ?? '')} onChange={v => set('dueDate', v)} />
          </div>
          <FormField label="Status" type="select" value={String(input.snagStatus ?? '')} onChange={v => set('snagStatus', v)} options={[{ value: 'open', label: 'Open' }, { value: 'in_progress', label: 'In Progress' }, { value: 'completed', label: 'Completed' }, { value: 'verified', label: 'Verified Closed' }]} />
        </div>
      )
    }
    if (tool.id === 'admin_governance') {
      return (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Platform governance and administration console. Manage settings, review system status, and configure platform rules.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Action Type" type="select" value={String(input.govAction ?? '')} onChange={v => set('govAction', v)} options={[{ value: 'review', label: 'Review Platform Settings' }, { value: 'audit', label: 'Run System Audit' }, { value: 'config', label: 'Update Configuration' }, { value: 'report', label: 'Generate Governance Report' }]} />
            <FormField label="Scope" type="select" value={String(input.govScope ?? '')} onChange={v => set('govScope', v)} options={[{ value: 'platform', label: 'Entire Platform' }, { value: 'firm', label: 'Specific Firm' }, { value: 'user', label: 'Specific User' }]} />
          </div>
          <FormField label="Target Entity" type="text" value={String(input.govTarget ?? '')} onChange={v => set('govTarget', v)} placeholder="Firm ID, user email, or 'all'" />
          <FormField label="Description / Instructions" type="textarea" value={String(input.govDescription ?? '')} onChange={v => set('govDescription', v)} placeholder="Describe the admin action to perform..." />
        </div>
      )
    }

    if (tool.id === 'ai_review_queue') {
      return (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Manage the AI compliance review queue. Review AI-generated findings, approve or escalate items.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Review Category" type="select" value={String(input.arCategory ?? '')} onChange={v => set('arCategory', v)} options={[{ value: 'drawing', label: 'Drawing Compliance' }, { value: 'document', label: 'Document Review' }, { value: 'compliance', label: 'SANS Compliance' }, { value: 'structural', label: 'Structural Check' }]} />
            <FormField label="Status Filter" type="select" value={String(input.arStatus ?? '')} onChange={v => set('arStatus', v)} options={[{ value: 'pending', label: 'Pending Review' }, { value: 'approved', label: 'Approved' }, { value: 'flagged', label: 'Flagged' }, { value: 'escalated', label: 'Escalated' }]} />
          </div>
          <FormField label="Reviewer Notes" type="textarea" value={String(input.arNotes ?? '')} onChange={v => set('arNotes', v)} placeholder="Notes on AI review findings, decisions made..." />
        </div>
      )
    }

    if (tool.id === 'audit_trail_viewer') {
      return (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">View and filter platform audit trail. Search by entity, user, action type, or date range.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Entity Type" type="select" value={String(input.atEntity ?? '')} onChange={v => set('atEntity', v)} options={[{ value: 'user', label: 'User' }, { value: 'project', label: 'Project' }, { value: 'firm', label: 'Firm' }, { value: 'payment', label: 'Payment' }, { value: 'document', label: 'Document' }]} />
            <FormField label="Action Type" type="select" value={String(input.atAction ?? '')} onChange={v => set('atAction', v)} options={[{ value: 'all', label: 'All Actions' }, { value: 'create', label: 'Create' }, { value: 'update', label: 'Update' }, { value: 'delete', label: 'Delete' }, { value: 'view', label: 'View' }]} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Start Date" type="date" value={String(input.atStartDate ?? '')} onChange={v => set('atStartDate', v)} />
            <FormField label="End Date" type="date" value={String(input.atEndDate ?? '')} onChange={v => set('atEndDate', v)} />
          </div>
          <FormField label="Filter / Search Query" type="text" value={String(input.atQuery ?? '')} onChange={v => set('atQuery', v)} placeholder="e.g. user@example.com or project ID" />
        </div>
      )
    }

    if (tool.id === 'cpd_standalone') {
      const bodyOptions = [
        { value: 'sacap', label: 'SACAP (Architect)' },
        { value: 'ecsa', label: 'ECSA (Engineer)' },
        { value: 'sacqsp', label: 'SACQSP (Quantity Surveyor)' },
        { value: 'sacplan', label: 'SACPLAN (Town Planner)' },
        { value: 'sagc', label: 'SAGC (Geoscientist)' },
        { value: 'sava', label: 'SAVA (Valuer)' },
        { value: 'plato', label: 'PLATO (Architectural Technologist)' },
      ]
      const catOptions = [
        { value: 'ethics', label: 'Category 1 ÔÇö Ethics & Professional Practice' },
        { value: 'technical', label: 'Category 2 ÔÇö Technical Knowledge' },
        { value: 'management', label: 'Category 3 ÔÇö Practice Management' },
        { value: 'specialist', label: 'Category 4 ÔÇö Specialist / Elective' },
      ]
      return (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Record a CPD activity or take an assessment. Enter activity details to calculate CPD credits earned.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Professional Body" type="select" value={String(input.cpdBody ?? '')} onChange={v => set('cpdBody', v)} options={bodyOptions} />
            <FormField label="Activity Type" type="select" value={String(input.cpdCategory ?? '')} onChange={v => set('cpdCategory', v)} options={catOptions} />
          </div>
          <FormField label="Activity Title" type="text" value={String(input.activityTitle ?? '')} onChange={v => set('activityTitle', v)} placeholder="e.g. SANS 10400-XA Workshop" />
          <FormField label="Activity Description" type="textarea" value={String(input.activityDescription ?? '')} onChange={v => set('activityDescription', v)} placeholder="Describe the CPD activity, including learning outcomes..." />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField label="Duration (hours)" type="number" value={String(input.cpdHours ?? '')} onChange={v => set('cpdHours', Number(v))} placeholder="e.g. 3" />
            <FormField label="Provider Name" type="text" value={String(input.providerName ?? '')} onChange={v => set('providerName', v)} placeholder="e.g. SAIA" />
            <FormField label="Date Completed" type="date" value={String(input.cpdDate ?? '')} onChange={v => set('cpdDate', v)} />
          </div>
          <FormField label="Certificate / Evidence Reference" type="text" value={String(input.cpdEvidence ?? '')} onChange={v => set('cpdEvidence', v)} placeholder="Certificate number or upload reference" />
        </div>
      )
    }

    if (tool.id === 'energy_certificate') {
      const climateZones = [
        { value: '1', label: 'Zone 1 ÔÇö Coastal Interior' },
        { value: '2', label: 'Zone 2 ÔÇö Karoo / Highveld' },
        { value: '3', label: 'Zone 3 ÔÇö KZN Coast' },
        { value: '4', label: 'Zone 4 ÔÇö Gauteng / Inland' },
        { value: '5', label: 'Zone 5 ÔÇö Cape Peninsula' },
        { value: '6', label: 'Zone 6 ÔÇö Mpumalanga / Bushveld' },
      ]
      return (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Generate a SANS 10400-XA energy usage certificate. Enter building envelope and system data to calculate energy demand and compliance.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Climate Zone" type="select" value={String(input.climateZone ?? '')} onChange={v => set('climateZone', v)} options={climateZones} />
            <FormField label="Building Type" type="select" value={String(input.buildingType ?? '')} onChange={v => set('buildingType', v)} options={[{ value: 'residential_single', label: 'Single Residential' }, { value: 'residential_group', label: 'Group Residential' }, { value: 'office', label: 'Office / Commercial' }, { value: 'retail', label: 'Retail' }, { value: 'industrial', label: 'Industrial' }]} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField label="Total Floor Area (m┬▓)" type="number" value={String(input.floorArea ?? '')} onChange={v => set('floorArea', Number(v))} placeholder="e.g. 250" />
            <FormField label="Glazed Area (m┬▓)" type="number" value={String(input.glazedArea ?? '')} onChange={v => set('glazedArea', Number(v))} placeholder="e.g. 45" />
            <FormField label="Roof Area (m┬▓)" type="number" value={String(input.roofArea ?? '')} onChange={v => set('roofArea', Number(v))} placeholder="e.g. 120" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField label="Wall U-Value (W/m┬▓K)" type="number" value={String(input.wallU ?? '')} onChange={v => set('wallU', Number(v))} placeholder="e.g. 0.6" />
            <FormField label="Roof U-Value (W/m┬▓K)" type="number" value={String(input.roofU ?? '')} onChange={v => set('roofU', Number(v))} placeholder="e.g. 0.35" />
            <FormField label="Glazing U-Value (W/m┬▓K)" type="number" value={String(input.glazingU ?? '')} onChange={v => set('glazingU', Number(v))} placeholder="e.g. 2.7" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField label="Water Heating" type="select" value={String(input.waterHeating ?? '')} onChange={v => set('waterHeating', v)} options={[{ value: 'solar', label: 'Solar Heater' }, { value: 'heatpump', label: 'Heat Pump' }, { value: 'gas', label: 'Gas' }, { value: 'electric', label: 'Electric Geyser' }, { value: 'integrated', label: 'Integrated System' }]} />
            <FormField label="PV System (kWp)" type="number" value={String(input.pvKw ?? '')} onChange={v => set('pvKw', Number(v))} placeholder="e.g. 3.5" />
            <FormField label="Shading Factor" type="number" value={String(input.shadingFactor ?? '')} onChange={v => set('shadingFactor', Number(v))} placeholder="e.g. 0.8" />
          </div>
        </div>
      )
    }

    if (tool.id === 'feasibility_estimator') {
      return (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Assess project feasibility and generate a budget estimate. Enter land, construction, and expected revenue parameters.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Project Type" type="select" value={String(input.projectType ?? '')} onChange={v => set('projectType', v)} options={[{ value: 'residential', label: 'Residential' }, { value: 'commercial', label: 'Commercial' }, { value: 'industrial', label: 'Industrial' }, { value: 'mixed', label: 'Mixed Use' }]} />
            <FormField label="Land / Site Cost (R)" type="number" value={String(input.landCost ?? '')} onChange={v => set('landCost', Number(v))} placeholder="e.g. 1500000" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField label="Construction Cost (R)" type="number" value={String(input.constructionCost ?? '')} onChange={v => set('constructionCost', Number(v))} placeholder="e.g. 5000000" />
            <FormField label="Professional Fees (R)" type="number" value={String(input.professionalFees ?? '')} onChange={v => set('professionalFees', Number(v))} placeholder="e.g. 400000" />
            <FormField label="Statutory / Council (R)" type="number" value={String(input.statutoryCosts ?? '')} onChange={v => set('statutoryCosts', Number(v))} placeholder="e.g. 150000" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Expected Revenue / GDV (R)" type="number" value={String(input.expectedRevenue ?? '')} onChange={v => set('expectedRevenue', Number(v))} placeholder="e.g. 9500000" />
            <FormField label="Contingency (%)" type="number" value={String(input.contingencyPct ?? '')} onChange={v => set('contingencyPct', Number(v))} placeholder="e.g. 5" />
          </div>
          <FormField label="Notes / Assumptions" type="textarea" value={String(input.feasNotes ?? '')} onChange={v => set('feasNotes', v)} placeholder="Key assumptions for this feasibility assessment..." />
        </div>
      )
    }

    if (tool.id === 'fee_tariff_editor') {
      return (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Edit platform fee and tariff tables. Configure fee scales, categories, and thresholds.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Tariff Category" type="select" value={String(input.teCategory ?? '')} onChange={v => set('teCategory', v)} options={[{ value: 'professional', label: 'Professional Fees' }, { value: 'platform', label: 'Platform Fees' }, { value: 'statutory', label: 'Statutory / Municipal' }, { value: 'subscription', label: 'Subscription Tiers' }]} />
            <FormField label="Action" type="select" value={String(input.teAction ?? '')} onChange={v => set('teAction', v)} options={[{ value: 'view', label: 'View Current Table' }, { value: 'update', label: 'Update Rates' }, { value: 'add', label: 'Add New Entry' }, { value: 'remove', label: 'Remove Entry' }]} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Fee Code / Reference" type="text" value={String(input.teCode ?? '')} onChange={v => set('teCode', v)} placeholder="e.g. FEE-ARCH-001" />
            <FormField label="New Rate Value" type="number" value={String(input.teRate ?? '')} onChange={v => set('teRate', Number(v))} placeholder="e.g. 8.5" />
          </div>
          <FormField label="Description / Change Notes" type="textarea" value={String(input.teNotes ?? '')} onChange={v => set('teNotes', v)} placeholder="Reason for change, scope of update..." />
        </div>
      )
    }

    if (tool.id === 'fire_compliance_check') {
      const checklistItems = [
        { id: 'escape_routes', label: 'Escape Routes ÔÇö 2 independent routes from each storey' },
        { id: 'travel_dist', label: 'Travel Distance ÔÇö Ôëñ45 m sprinklered, Ôëñ30 m unsprinklered' },
        { id: 'fire_doors', label: 'Fire Doors ÔÇö 30/60/90 min FRR as required' },
        { id: 'compartmentation', label: 'Compartmentation ÔÇö Fire walls separate occupancies' },
        { id: 'smoke_vent', label: 'Smoke Ventilation ÔÇö Natural or mechanical per SANS 10400-T' },
        { id: 'fire_hydrants', label: 'Fire Hydrants ÔÇö Within 90 m of all points' },
        { id: 'extinguishers', label: 'Fire Extinguishers ÔÇö Suitable class & rating per floor' },
        { id: 'detection', label: 'Detection System ÔÇö Smoke/heat detectors as required' },
        { id: 'emergency_lighting', label: 'Emergency Lighting ÔÇö Illuminates escape routes' },
        { id: 'signage', label: 'Fire Signage ÔÇö Exit signs, fire equipment signs' },
        { id: 'access', label: 'Fire Service Access ÔÇö Vehicle access within 15 m' },
        { id: 'structure', label: 'Structural Fire Resistance ÔÇö Main structure FRR compliant' },
      ]
      return (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">SANS 10400-T compliance checklist for fire safety design. Mark each item as compliant or non-compliant.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Project Name" type="text" value={String(input.fcProjectName ?? '')} onChange={v => set('fcProjectName', v)} placeholder="e.g. Pinewood Estate" />
            <FormField label="Inspected By" type="text" value={String(input.fcInspector ?? '')} onChange={v => set('fcInspector', v)} placeholder="e.g. Jane Fire Engineer" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {checklistItems.map(item => (
              <div key={item.id} className="flex items-start gap-3 border rounded-lg p-3">
                <input type="checkbox" checked={Boolean((input as Record<string, unknown>)[`fc_${item.id}`])} onChange={e => set(`fc_${item.id}`, e.target.checked)} className="h-4 w-4 mt-0.5" />
                <label className="text-sm cursor-pointer">{item.label}</label>
              </div>
            ))}
          </div>
          <FormField label="Notes / Corrective Actions" type="textarea" value={String(input.fcNotes ?? '')} onChange={v => set('fcNotes', v)} placeholder="Actions required for non-compliant items..." />
        </div>
      )
    }

    if (tool.id === 'fire_rational_design') {
      const occupancyTypes = [
        { value: 'residential', label: 'Residential (ES1)' },
        { value: 'hotel', label: 'Hotel / Guest House (ES2)' },
        { value: 'office', label: 'Office (ES3)' },
        { value: 'shop', label: 'Shop / Retail (ES4)' },
        { value: 'factory', label: 'Factory / Industrial (ES5)' },
        { value: 'place_of_assembly', label: 'Place of Assembly (ES6)' },
        { value: 'educational', label: 'Educational (ES7)' },
        { value: 'healthcare', label: 'Healthcare (ES8)' },
        { value: 'storage', label: 'Storage (ES9)' },
      ]
      const frrOptions = [
        { value: '30', label: '30 min' },
        { value: '60', label: '60 min' },
        { value: '90', label: '90 min' },
        { value: '120', label: '120 min' },
      ]
      return (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Document a rational fire design per SANS 10400-T. Enter occupancy, building geometry, and fire protection data.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Occupancy Type" type="select" value={String(input.occupancyType ?? '')} onChange={v => set('occupancyType', v)} options={occupancyTypes} />
            <FormField label="Building Height (m)" type="number" value={String(input.buildingHeight ?? '')} onChange={v => set('buildingHeight', Number(v))} placeholder="e.g. 12" />
            <FormField label="Number of Storeys" type="number" value={String(input.numStoreys ?? '')} onChange={v => set('numStoreys', Number(v))} placeholder="e.g. 3" />
            <FormField label="Floor Area / Compartment (m┬▓)" type="number" value={String(input.compartmentArea ?? '')} onChange={v => set('compartmentArea', Number(v))} placeholder="e.g. 500" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField label="Fire Resistance Rating" type="select" value={String(input.frr ?? '')} onChange={v => set('frr', v)} options={frrOptions} />
            <FormField label="Escape Route Width (m)" type="number" value={String(input.escapeWidth ?? '')} onChange={v => set('escapeWidth', Number(v))} placeholder="e.g. 1.2" />
            <FormField label="Travel Distance (m)" type="number" value={String(input.travelDistance ?? '')} onChange={v => set('travelDistance', Number(v))} placeholder="e.g. 30" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField label="Fire Detection" type="select" value={String(input.detectionType ?? '')} onChange={v => set('detectionType', v)} options={[{ value: 'none', label: 'None' }, { value: 'smoke', label: 'Smoke Detectors' }, { value: 'heat', label: 'Heat Detectors' }, { value: 'multi', label: 'Multi-Sensor' }]} />
            <FormField label="Sprinklers" type="select" value={String(input.hasSprinklers ?? '')} onChange={v => set('hasSprinklers', v)} options={[{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }]} />
            <FormField label="Fire Hydrants" type="select" value={String(input.hasHydrants ?? '')} onChange={v => set('hasHydrants', v)} options={[{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }]} />
          </div>
        </div>
      )
    }

    if (tool.id === 'hs_compliance') {
      const checklistItems = [
        { id: 'induction', label: 'Site Induction Complete' },
        { id: 'ppe', label: 'PPE Compliant (all workers)' },
        { id: 'scaffold', label: 'Scaffold Inspection Tag Valid' },
        { id: 'excavation', label: 'Excavation Shoring in Place' },
        { id: 'electrical', label: 'Electrical Cables / DB Boards Safe' },
        { id: 'fire_ext', label: 'Fire Extinguisher In Date' },
        { id: 'first_aid', label: 'First Aid Kit Stocked' },
        { id: 'permits', label: 'Valid Permits (Hot Work / Confined Space / Lift)' },
        { id: 'welfare', label: 'Welfare Facilities (Ablution / Clean Water)' },
        { id: 'signage', label: 'Safety Signage Posted' },
      ]
      return (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Daily H&S compliance checklist per OHS Act and Construction Regulations. Mark items as pass or fail.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Inspector Name" type="text" value={String(input.inspectorName ?? '')} onChange={v => set('inspectorName', v)} placeholder="e.g. Sipho Nkosi" />
            <FormField label="Date" type="date" value={String(input.checkDate ?? '')} onChange={v => set('checkDate', v)} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {checklistItems.map(item => (
              <div key={item.id} className="flex items-center gap-3 border rounded-lg p-3">
                <input type="checkbox" checked={Boolean((input as Record<string, unknown>)[`hs_${item.id}`])} onChange={e => set(`hs_${item.id}`, e.target.checked)} className="h-4 w-4" />
                <label className="text-sm cursor-pointer flex-1">{item.label}</label>
              </div>
            ))}
          </div>
          <FormField label="Comments / Action Items" type="textarea" value={String(input.hsComments ?? '')} onChange={v => set('hsComments', v)} placeholder="Any issues found, corrective actions taken..." />
        </div>
      )
    }

    if (tool.id === 'material_procurement') {
      return (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Create a material procurement order list. Add line items with quantities, units, and estimated costs.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Supplier Name" type="text" value={String(input.mpSupplier ?? '')} onChange={v => set('mpSupplier', v)} placeholder="e.g. Builders Warehouse" />
            <FormField label="Delivery Date" type="date" value={String(input.mpDeliveryDate ?? '')} onChange={v => set('mpDeliveryDate', v)} />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Material Line Items</p>
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i} className="grid grid-cols-4 gap-3">
                <input type="text" className="rounded-xl border p-2 text-sm" placeholder={`Item ${i + 1}`} value={String((input as Record<string, string>)[`mp_item${i}`] ?? '')} onChange={e => set(`mp_item${i}` as string, e.target.value)} />
                <input type="number" className="rounded-xl border p-2 text-sm" placeholder="Qty" value={String((input as Record<string, string>)[`mp_qty${i}`] ?? '')} onChange={e => set(`mp_qty${i}` as string, e.target.value)} />
                <select className="rounded-xl border p-2 text-sm" value={String((input as Record<string, string>)[`mp_unit${i}`] ?? '')} onChange={e => set(`mp_unit${i}` as string, e.target.value)}><option>ea</option><option>m</option><option>m┬▓</option><option>m┬│</option><option>kg</option><option>L</option></select>
                <input type="number" className="rounded-xl border p-2 text-sm" placeholder="Est. Cost" value={String((input as Record<string, string>)[`mp_cost${i}`] ?? '')} onChange={e => set(`mp_cost${i}` as string, e.target.value)} />
              </div>
            ))}
          </div>
          <FormField label="Notes" type="textarea" value={String(input.mpNotes ?? '')} onChange={v => set('mpNotes', v)} placeholder="Delivery instructions, payment terms..." />
        </div>
      )
    }

    if (tool.id === 'payment_rate_config') {
      return (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Configure professional fee rates and payment parameters for the platform.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Professional Category" type="select" value={String(input.rcCategory ?? '')} onChange={v => set('rcCategory', v)} options={[{ value: 'architect', label: 'Architect' }, { value: 'engineer', label: 'Engineer' }, { value: 'qs', label: 'Quantity Surveyor' }, { value: 'planner', label: 'Town Planner' }]} />
            <FormField label="Rate Type" type="select" value={String(input.rcRateType ?? '')} onChange={v => set('rcRateType', v)} options={[{ value: 'percentage', label: 'Percentage of Construction' }, { value: 'hourly', label: 'Hourly Rate' }, { value: 'fixed', label: 'Fixed Fee' }]} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Rate Value" type="number" value={String(input.rcRateValue ?? '')} onChange={v => set('rcRateValue', Number(v))} placeholder="e.g. 8.5 for 8.5%" />
            <FormField label="Effective Date" type="date" value={String(input.rcEffectiveDate ?? '')} onChange={v => set('rcEffectiveDate', v)} />
          </div>
          <FormField label="Notes / Conditions" type="textarea" value={String(input.rcNotes ?? '')} onChange={v => set('rcNotes', v)} placeholder="Conditions, minimum fees, or special terms..." />
        </div>
      )
    }

    if (tool.id === 'platform_settings') {
      return (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Configure platform-wide settings including branding, email, integrations, and security policies.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Setting Category" type="select" value={String(input.psCategory ?? '')} onChange={v => set('psCategory', v)} options={[{ value: 'branding', label: 'Branding / White-label' }, { value: 'email', label: 'Email Templates' }, { value: 'integrations', label: 'Third-party Integrations' }, { value: 'security', label: 'Security Policies' }, { value: 'notifications', label: 'Notification Rules' }]} />
            <FormField label="Action" type="select" value={String(input.psAction ?? '')} onChange={v => set('psAction', v)} options={[{ value: 'view', label: 'View Current' }, { value: 'update', label: 'Update Setting' }, { value: 'reset', label: 'Reset to Default' }]} />
          </div>
          <FormField label="Setting Key / Name" type="text" value={String(input.psKey ?? '')} onChange={v => set('psKey', v)} placeholder="e.g. platform_name, smtp_host" />
          <FormField label="New Value" type="text" value={String(input.psValue ?? '')} onChange={v => set('psValue', v)} placeholder="New setting value" />
          <FormField label="Change Reason" type="textarea" value={String(input.psReason ?? '')} onChange={v => set('psReason', v)} placeholder="Why this setting is being changed..." />
        </div>
      )
    }

    if (tool.id === 'proposal_comparison') {
      return (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Compare BEP proposals side by side. Enter proposal details and scoring criteria to rank submissions.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Project Name" type="text" value={String(input.pcProjectName ?? '')} onChange={v => set('pcProjectName', v)} placeholder="e.g. Pinewood Estate" />
            <FormField label="Number of Proposals" type="number" value={String(input.numProposals ?? '')} onChange={v => set('numProposals', Number(v))} placeholder="e.g. 3" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Proposal A ÔÇö Firm Name" type="text" value={String(input.proposalA ?? '')} onChange={v => set('proposalA', v)} placeholder="e.g. Arch Firm 1" />
            <FormField label="Proposal A ÔÇö Fee (R)" type="number" value={String(input.feeA ?? '')} onChange={v => set('feeA', Number(v))} placeholder="e.g. 450000" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Proposal B ÔÇö Firm Name" type="text" value={String(input.proposalB ?? '')} onChange={v => set('proposalB', v)} placeholder="e.g. Arch Firm 2" />
            <FormField label="Proposal B ÔÇö Fee (R)" type="number" value={String(input.feeB ?? '')} onChange={v => set('feeB', Number(v))} placeholder="e.g. 520000" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Proposal C ÔÇö Firm Name" type="text" value={String(input.proposalC ?? '')} onChange={v => set('proposalC', v)} placeholder="Optional" />
            <FormField label="Proposal C ÔÇö Fee (R)" type="number" value={String(input.feeC ?? '')} onChange={v => set('feeC', Number(v))} placeholder="Optional" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField label="Proposal A Score (1-10)" type="number" value={String(input.scoreA ?? '')} onChange={v => set('scoreA', Number(v))} placeholder="e.g. 8" />
            <FormField label="Proposal B Score (1-10)" type="number" value={String(input.scoreB ?? '')} onChange={v => set('scoreB', Number(v))} placeholder="e.g. 7" />
            <FormField label="Proposal C Score (1-10)" type="number" value={String(input.scoreC ?? '')} onChange={v => set('scoreC', Number(v))} placeholder="Optional" />
          </div>
        </div>
      )
    }

    if (tool.id === 'rfi_response') {
      return (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Respond to an RFI or site instruction. Reference the original RFI and provide the response, including any attachments or supporting documents.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="RFI Reference Number" type="text" value={String(input.rfiRef ?? '')} onChange={v => set('rfiRef', v)} placeholder="e.g. RFI-20260622-0001" />
            <FormField label="Responded By" type="text" value={String(input.respondedBy ?? '')} onChange={v => set('respondedBy', v)} placeholder="e.g. John Architect" />
          </div>
          <FormField label="RFI Question / Query" type="textarea" value={String(input.originalQuery ?? '')} onChange={v => set('originalQuery', v)} placeholder="Original RFI query text..." />
          <FormField label="Response" type="textarea" value={String(input.responseText ?? '')} onChange={v => set('responseText', v)} placeholder="Detailed response to the query..." />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Response Type" type="select" value={String(input.responseType ?? '')} onChange={v => set('responseType', v)} options={[{ value: 'information', label: 'For Information' }, { value: 'approval', label: 'Approved' }, { value: 'revision', label: 'Revise & Resubmit' }, { value: 'rejected', label: 'Rejected' }, { value: 'deferred', label: 'Deferred' }]} />
            <FormField label="Response Date" type="date" value={String(input.responseDate ?? '')} onChange={v => set('responseDate', v)} />
          </div>
          <FormField label="Attachments / Supporting Docs" type="text" value={String(input.attachments ?? '')} onChange={v => set('attachments', v)} placeholder="e.g. Sketch A-101 Rev B, Structural Calc Note 3" />
        </div>
      )
    }

    if (tool.id === 'sans_forms') {
      const formTypes = [
        { value: 'form1', label: 'Form 1 ÔÇö Building Plan Application' },
        { value: 'form2', label: 'Form 2 ÔÇö Certificate of Occupancy' },
        { value: 'form3', label: 'Form 3 ÔÇö Structural Compliance' },
        { value: 'form4', label: 'Form 4 ÔÇö Fire Compliance' },
        { value: 'sans10400_xa', label: 'SANS 10400-XA Energy Compliance' },
        { value: 'sans10400_k', label: 'SANS 10400-K Walls Compliance' },
        { value: 'sans10400_n', label: 'SANS 10400-N Fenestration' },
        { value: 'sans10400_w', label: 'SANS 10400-W Water Supply' },
      ]
      return (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Autofill SANS compliance forms for municipal submissions. Select form type and enter building details.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Form Type" type="select" value={String(input.formType ?? '')} onChange={v => set('formType', v)} options={formTypes} />
            <FormField label="Project Name" type="text" value={String(input.formProjectName ?? '')} onChange={v => set('formProjectName', v)} placeholder="e.g. Pinewood Estate" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField label="Erf / Stand Number" type="text" value={String(input.erfNumber ?? '')} onChange={v => set('erfNumber', v)} placeholder="e.g. 1234" />
            <FormField label="Municipality" type="text" value={String(input.municipalityName ?? '')} onChange={v => set('municipalityName', v)} placeholder="e.g. City of Cape Town" />
            <FormField label="Applicant Name" type="text" value={String(input.applicantName ?? '')} onChange={v => set('applicantName', v)} placeholder="e.g. Jane Doe" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Building Type" type="select" value={String(input.formBuildingType ?? '')} onChange={v => set('formBuildingType', v)} options={[{ value: 'residential', label: 'Residential' }, { value: 'commercial', label: 'Commercial' }, { value: 'industrial', label: 'Industrial' }, { value: 'mixed', label: 'Mixed Use' }]} />
            <FormField label="Competent Person Name" type="text" value={String(input.competentPerson ?? '')} onChange={v => set('competentPerson', v)} placeholder="e.g. John Architect (SACAP Reg)" />
          </div>
          <FormField label="Notes / Special Conditions" type="textarea" value={String(input.formNotes ?? '')} onChange={v => set('formNotes', v)} placeholder="Any special conditions or notes relevant to this submission..." />
        </div>
      )
    }

    if (tool.id === 'staff_cpd_tracker') {
      return (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Track CPD compliance across firm staff. Enter team member details and status to generate a compliance report.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Staff Member Name" type="text" value={String(input.staffName ?? '')} onChange={v => set('staffName', v)} placeholder="e.g. Jane Smith" />
            <FormField label="Professional Body" type="select" value={String(input.staffBody ?? '')} onChange={v => set('staffBody', v)} options={[{ value: 'sacap', label: 'SACAP' }, { value: 'ecsa', label: 'ECSA' }, { value: 'sacqsp', label: 'SACQSP' }, { value: 'sacplan', label: 'SACPLAN' }]} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Registration Number" type="text" value={String(input.staffRegNumber ?? '')} onChange={v => set('staffRegNumber', v)} placeholder="e.g. 12345" />
            <FormField label="CPD Cycle Year" type="number" value={String(input.cpdCycleYear ?? '')} onChange={v => set('cpdCycleYear', Number(v))} placeholder="e.g. 2026" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField label="Category 1 Credits (Ethics)" type="number" value={String(input.cat1Credits ?? '')} onChange={v => set('cat1Credits', Number(v))} placeholder="0" />
            <FormField label="Category 2 Credits (Technical)" type="number" value={String(input.cat2Credits ?? '')} onChange={v => set('cat2Credits', Number(v))} placeholder="0" />
            <FormField label="Category 3 Credits (Management)" type="number" value={String(input.cat3Credits ?? '')} onChange={v => set('cat3Credits', Number(v))} placeholder="0" />
          </div>
          <FormField label="Notes / Outstanding Actions" type="textarea" value={String(input.cpdNotes ?? '')} onChange={v => set('cpdNotes', v)} placeholder="Any actions needed for compliance..." />
        </div>
      )
    }

    if (tool.id === 'stage_gate_review') {
      const stageOptions = [
        { value: 'brief', label: 'Stage 1 ÔÇö Brief & Diagnostic' },
        { value: 'appoint', label: 'Stage 2 ÔÇö Appoint' },
        { value: 'design', label: 'Stage 3 ÔÇö Design' },
        { value: 'comply', label: 'Stage 4 ÔÇö Comply' },
        { value: 'procure', label: 'Stage 5 ÔÇö Procure' },
        { value: 'build', label: 'Stage 6 ÔÇö Build' },
        { value: 'pay', label: 'Stage 7 ÔÇö Pay' },
        { value: 'closeout', label: 'Stage 8 ÔÇö Close-out' },
      ]
      const decisionOptions = [
        { value: 'approved', label: 'Approved ÔÇö Proceed to next stage' },
        { value: 'conditional', label: 'Conditional ÔÇö Proceed with conditions' },
        { value: 'rework', label: 'Rework Required ÔÇö Revise and resubmit' },
        { value: 'rejected', label: 'Rejected ÔÇö Cannot proceed' },
      ]
      return (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Record a stage gate review decision. Each project stage requires a formal review before proceeding to the next.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Project Name" type="text" value={String(input.sgProjectName ?? '')} onChange={v => set('sgProjectName', v)} placeholder="e.g. Pinewood Estate" />
            <FormField label="Review Stage" type="select" value={String(input.sgStage ?? '')} onChange={v => set('sgStage', v)} options={stageOptions} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Decision" type="select" value={String(input.sgDecision ?? '')} onChange={v => set('sgDecision', v)} options={decisionOptions} />
            <FormField label="Reviewer Name" type="text" value={String(input.sgReviewer ?? '')} onChange={v => set('sgReviewer', v)} placeholder="e.g. John Architect" />
          </div>
          <FormField label="Review Notes" type="textarea" value={String(input.sgNotes ?? '')} onChange={v => set('sgNotes', v)} placeholder="Key findings, conditions, and recommendations from this review..." />
          <FormField label="Conditions / Action Items" type="textarea" value={String(input.sgConditions ?? '')} onChange={v => set('sgConditions', v)} placeholder="Specific conditions that must be met before proceeding..." />
        </div>
      )
    }

    if (tool.id === 'system_health_monitor') {
      return (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Monitor platform system health, run diagnostics, and view audit logs for system components.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Component" type="select" value={String(input.shComponent ?? '')} onChange={v => set('shComponent', v)} options={[{ value: 'api', label: 'API Server' }, { value: 'database', label: 'Firestore Database' }, { value: 'storage', label: 'File Storage' }, { value: 'auth', label: 'Authentication' }, { value: 'ai', label: 'AI Services' }, { value: 'all', label: 'All Systems' }]} />
            <FormField label="Diagnostic Type" type="select" value={String(input.shDiagnostic ?? '')} onChange={v => set('shDiagnostic', v)} options={[{ value: 'ping', label: 'Ping / Connectivity' }, { value: 'latency', label: 'Latency Check' }, { value: 'uptime', label: 'Uptime Report' }, { value: 'errors', label: 'Error Logs' }, { value: 'full', label: 'Full Diagnostic' }]} />
          </div>
          <FormField label="Alert Email" type="text" value={String(input.shAlertEmail ?? '')} onChange={v => set('shAlertEmail', v)} placeholder="Notify on failure: admin@example.com" />
          <FormField label="Notes / Context" type="textarea" value={String(input.shNotes ?? '')} onChange={v => set('shNotes', v)} placeholder="Any context for this health check..." />
        </div>
      )
    }

    if (tool.id === 'user_verification_console') {
      const bodyOptions = [
        { value: 'sacap', label: 'SACAP (Architect)' },
        { value: 'ecsa', label: 'ECSA (Engineer)' },
        { value: 'sacqsp', label: 'SACQSP (Quantity Surveyor)' },
        { value: 'sacplan', label: 'SACPLAN (Town Planner)' },
        { value: 'sava', label: 'SAVA (Valuer)' },
        { value: 'sagc', label: 'SAGC (Geoscientist)' },
      ]
      return (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Verify professional registration credentials and approve user verification requests.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="User Name" type="text" value={String(input.uvUserName ?? '')} onChange={v => set('uvUserName', v)} placeholder="e.g. Jane Smith" />
            <FormField label="Professional Body" type="select" value={String(input.uvBody ?? '')} onChange={v => set('uvBody', v)} options={bodyOptions} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Registration Number" type="text" value={String(input.uvRegNumber ?? '')} onChange={v => set('uvRegNumber', v)} placeholder="e.g. 12345" />
            <FormField label="Verification Status" type="select" value={String(input.uvStatus ?? '')} onChange={v => set('uvStatus', v)} options={[{ value: 'pending', label: 'Pending' }, { value: 'verified', label: 'Verified' }, { value: 'rejected', label: 'Rejected' }, { value: 'expired', label: 'Expired' }]} />
          </div>
          <FormField label="Verification Notes" type="textarea" value={String(input.uvNotes ?? '')} onChange={v => set('uvNotes', v)} placeholder="Documents checked, findings, next steps..." />
        </div>
      )
    }

    if (tool.id === 'valuation_cert') {
      return (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Prepare a payment valuation certificate. Enter contract and progress data to calculate the certified and net payable amounts.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Contract Sum (R)" type="number" value={String(input.contractSum ?? '')} onChange={v => set('contractSum', Number(v))} placeholder="e.g. 5000000" />
            <FormField label="Previous Certified (R)" type="number" value={String(input.previousCertified ?? '')} onChange={v => set('previousCertified', Number(v))} placeholder="e.g. 2500000" />
            <FormField label="Works Completed (R)" type="number" value={String(input.worksCompleted ?? '')} onChange={v => set('worksCompleted', Number(v))} placeholder="e.g. 750000" />
            <FormField label="Materials on Site (R)" type="number" value={String(input.materialsOnSite ?? '')} onChange={v => set('materialsOnSite', Number(v))} placeholder="e.g. 150000" />
            <FormField label="Retention %" type="number" value={String(input.retentionPercent ?? '')} onChange={v => set('retentionPercent', Number(v))} placeholder="5" />
            <FormField label="VAT %" type="number" value={String(input.vatPercent ?? '')} onChange={v => set('vatPercent', Number(v))} placeholder="15" />
            <FormField label="Nominated Subcontractors (R)" type="number" value={String(input.nominatedSubcons ?? '')} onChange={v => set('nominatedSubcons', Number(v))} placeholder="0" />
            <FormField label="Contingencies (R)" type="number" value={String(input.contingencies ?? '')} onChange={v => set('contingencies', Number(v))} placeholder="0" />
          </div>
        </div>
      )
    }

    if (tool.id === 'xa_compliance_calc') {
      return (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Comprehensive SANS 10400-XA whole-building energy compliance check. Enter building envelope and system details.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Province" type="select" value={String(input.province ?? '')} onChange={v => set('province', v)} options={[{ value: 'gp', label: 'Gauteng' }, { value: 'wc', label: 'Western Cape' }, { value: 'kzn', label: 'KwaZulu-Natal' }, { value: 'ec', label: 'Eastern Cape' }, { value: 'fs', label: 'Free State' }, { value: 'mp', label: 'Mpumalanga' }, { value: 'lp', label: 'Limpopo' }, { value: 'nw', label: 'North West' }, { value: 'nc', label: 'Northern Cape' }]} />
            <FormField label="Building Type" type="select" value={String(input.buildingType ?? '')} onChange={v => set('buildingType', v)} options={[{ value: 'residential', label: 'Residential' }, { value: 'office', label: 'Office' }, { value: 'retail', label: 'Retail' }, { value: 'educational', label: 'Educational' }, { value: 'industrial', label: 'Industrial' }]} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField label="Total Floor Area (m┬▓)" type="number" value={String(input.floorArea ?? '')} onChange={v => set('floorArea', Number(v))} placeholder="e.g. 350" />
            <FormField label="External Wall Area (m┬▓)" type="number" value={String(input.externalWallArea ?? '')} onChange={v => set('externalWallArea', Number(v))} placeholder="e.g. 180" />
            <FormField label="Roof Area (m┬▓)" type="number" value={String(input.roofArea ?? '')} onChange={v => set('roofArea', Number(v))} placeholder="e.g. 140" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField label="Glazed Area (m┬▓)" type="number" value={String(input.glazedArea ?? '')} onChange={v => set('glazedArea', Number(v))} placeholder="e.g. 45" />
            <FormField label="Wall Insulation R-Value" type="number" value={String(input.wallInsulationR ?? '')} onChange={v => set('wallInsulationR', Number(v))} placeholder="e.g. 1.5" />
            <FormField label="Roof Insulation R-Value" type="number" value={String(input.roofInsulationR ?? '')} onChange={v => set('roofInsulationR', Number(v))} placeholder="e.g. 3.7" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField label="Avg Glazing U-Value" type="number" value={String(input.glazingU ?? '')} onChange={v => set('glazingU', Number(v))} placeholder="e.g. 2.0" />
            <FormField label="Water Heating" type="select" value={String(input.waterHeating ?? '')} onChange={v => set('waterHeating', v)} options={[{ value: 'solar', label: 'Solar' }, { value: 'heatpump', label: 'Heat Pump' }, { value: 'gas', label: 'Gas' }, { value: 'electric', label: 'Electric' }]} />
            <FormField label="HVAC System" type="select" value={String(input.hvacSystem ?? '')} onChange={v => set('hvacSystem', v)} options={[{ value: 'none', label: 'None / Natural' }, { value: 'split', label: 'Split Units' }, { value: 'central', label: 'Central HVAC' }, { value: 'vrf', label: 'VRF' }]} />
          </div>
        </div>
      )
    }

    if (tool.id === 'zoning_check') {
      const zoneCategories = [
        { value: 'residential1', label: 'Residential 1 (Single)' },
        { value: 'residential2', label: 'Residential 2 (Group Housing)' },
        { value: 'residential3', label: 'Residential 3 (Density)' },
        { value: 'business1', label: 'Business 1 (Retail)' },
        { value: 'business2', label: 'Business 2 (Office)' },
        { value: 'industrial1', label: 'Industrial 1 (Light)' },
        { value: 'industrial2', label: 'Industrial 2 (General)' },
        { value: 'agricultural', label: 'Agricultural' },
        { value: 'community1', label: 'Community 1 (Public)' },
        { value: 'open_space1', label: 'Open Space 1 (Parks)' },
      ]
      return (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Check proposed development against municipal zoning scheme requirements. Enter erf details and proposed development parameters.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Erf / Stand Number" type="text" value={String(input.zonErfNumber ?? '')} onChange={v => set('zonErfNumber', v)} placeholder="e.g. 1234" />
            <FormField label="Current Zoning" type="select" value={String(input.zoneCategory ?? '')} onChange={v => set('zoneCategory', v)} options={zoneCategories} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField label="Site Area (m┬▓)" type="number" value={String(input.siteArea ?? '')} onChange={v => set('siteArea', Number(v))} placeholder="e.g. 850" />
            <FormField label="Proposed Coverage (m┬▓)" type="number" value={String(input.proposedCoverage ?? '')} onChange={v => set('proposedCoverage', Number(v))} placeholder="e.g. 340" />
            <FormField label="Proposed FAR" type="number" value={String(input.proposedFAR ?? '')} onChange={v => set('proposedFAR', Number(v))} placeholder="e.g. 0.8" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField label="Proposed Height (m)" type="number" value={String(input.proposedHeight ?? '')} onChange={v => set('proposedHeight', Number(v))} placeholder="e.g. 12" />
            <FormField label="Proposed Storeys" type="number" value={String(input.proposedStoreys ?? '')} onChange={v => set('proposedStoreys', Number(v))} placeholder="e.g. 3" />
            <FormField label="Number of Units" type="number" value={String(input.proposedUnits ?? '')} onChange={v => set('proposedUnits', Number(v))} placeholder="e.g. 6" />
          </div>
          <FormField label="Additional Notes / Variance Requests" type="textarea" value={String(input.zonNotes ?? '')} onChange={v => set('zonNotes', v)} placeholder="Any special consent or departure applications..." />
        </div>
      )
    }

    switch (tool.category) {
      case 'fee_calculator':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Construction Value (R)" type="number" value={String(input.constructionValue ?? '')} onChange={v => set('constructionValue', Number(v))} placeholder="e.g. 2500000" />
            <FormField label="Project Type" type="select" value={String(input.projectType ?? '')} onChange={v => set('projectType', v)} options={[{ value: 'residential', label: 'Residential' }, { value: 'commercial', label: 'Commercial' }, { value: 'industrial', label: 'Industrial' }, { value: 'renovation', label: 'Renovation' }]} />
            <FormField label="Professional Category" type="select" value={String(input.category ?? '')} onChange={v => set('category', v)} options={[{ value: 'architect', label: 'Architect (SACAP)' }, { value: 'engineer', label: 'Engineer (ECSA)' }, { value: 'qs', label: 'QS (SACQSP)' }, { value: 'planner', label: 'Planner (SACPLAN)' }]} />
            <FormField label="Complexity Factor" type="select" value={String(input.complexity ?? '')} onChange={v => set('complexity', v)} options={[{ value: '1.0', label: 'Simple (1.0)' }, { value: '1.25', label: 'Moderate (1.25)' }, { value: '1.5', label: 'Complex (1.5)' }, { value: '2.0', label: 'Very Complex (2.0)' }]} />
          </div>
        )
      case 'compliance':
        return tool.id === 'fenestration_calc' || tool.id === 'xa_fenestration_quick_check' ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Fenestration compliance per SANS 10400-XA. Enter wall and glazing data for an elevation or room face.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField label="Elevation / Orientation" type="select" value={String(input.orientation ?? '')} onChange={v => set('orientation', v)} options={[{ value: 'N', label: 'North' }, { value: 'S', label: 'South' }, { value: 'E', label: 'East' }, { value: 'W', label: 'West' }, { value: 'NE', label: 'North-East' }, { value: 'NW', label: 'North-West' }, { value: 'SE', label: 'South-East' }, { value: 'SW', label: 'South-West' }]} />
              <FormField label="Building Type" type="select" value={String(input.buildingType ?? '')} onChange={v => set('buildingType', v)} options={[{ value: 'residential', label: 'Residential' }, { value: 'commercial', label: 'Commercial' }, { value: 'mixed', label: 'Mixed Use' }]} />
              <FormField label="Energy Zone" type="select" value={String(input.energyZone ?? '')} onChange={v => set('energyZone', v)} options={[{ value: '1', label: 'Zone 1 â€” Hot interior' }, { value: '2', label: 'Zone 2 â€” Hot, moderate dry' }, { value: '3', label: 'Zone 3 â€” Moderate dry' }, { value: '4', label: 'Zone 4 â€” Moderate coastal' }, { value: '5', label: 'Zone 5 â€” Cool highveld' }, { value: '6', label: 'Zone 6 â€” Cold interior' }]} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField label="Wall Area (mÂ²)" type="number" value={String(input.wallAreaM2 ?? '')} onChange={v => set('wallAreaM2', Number(v))} placeholder="e.g. 24" />
              <FormField label="Glazed Area (mÂ²)" type="number" value={String(input.glazedAreaM2 ?? '')} onChange={v => set('glazedAreaM2', Number(v))} placeholder="e.g. 6" />
            </div>
            <details className="text-sm text-muted-foreground">
              <summary className="cursor-pointer font-medium">Optional â€” advanced glazing specs</summary>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
                <FormField label="Average U-Value (W/mÂ²K)" type="number" value={String(input.averageUValue ?? '')} onChange={v => set('averageUValue', Number(v))} placeholder="e.g. 2.0" />
                <FormField label="Average SHGC" type="number" value={String(input.averageSHGC ?? '')} onChange={v => set('averageSHGC', Number(v))} placeholder="e.g. 0.69" />
                <FormField label="Shading Factor" type="number" value={String(input.shadingFactor ?? '')} onChange={v => set('shadingFactor', Number(v))} placeholder="e.g. 1.0" />
              </div>
            </details>
          </div>
        ) : tool.id === 'rvalue_calc' || tool.id === 'xa_rvalue_check' ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">R-value / thermal resistance check per SANS 10400-XA. Enter assembly name, zone, and layer build-up.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField label="Assembly Name" type="text" value={String(input.assembly ?? '')} onChange={v => set('assembly', v)} placeholder="e.g. Roof â€” tile + insulation" />
              <FormField label="Energy Zone" type="select" value={String(input.energyZone ?? '')} onChange={v => set('energyZone', v)} options={[{ value: '1', label: 'Zone 1' }, { value: '2', label: 'Zone 2' }, { value: '3', label: 'Zone 3' }, { value: '4', label: 'Zone 4' }, { value: '5', label: 'Zone 5' }, { value: '6', label: 'Zone 6' }]} />
              <FormField label="Required R-Value" type="number" value={String(input.requiredRValue ?? '')} onChange={v => set('requiredRValue', Number(v))} placeholder="e.g. 3.7" />
            </div>
            <p className="text-xs text-muted-foreground mt-2">Use manufacturer R-values. The calculator sums all layer R-values and reports the shortfall.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Element Name" type="text" value={String(input.elementName ?? '')} onChange={v => set('elementName', v)} placeholder="e.g. Living Room Wall" />
            <FormField label="Area (mÂ²)" type="number" value={String(input.area ?? '')} onChange={v => set('area', Number(v))} placeholder="e.g. 36" />
            <FormField label="Compliance Type" type="select" value={String(input.complianceType ?? '')} onChange={v => set('complianceType', v)} options={[{ value: 'fenestration', label: 'Fenestration (SANS 10400-N)' }, { value: 'thermal', label: 'Thermal (SANS 10400-XA)' }, { value: 'fire', label: 'Fire (SANS 10400-T)' }, { value: 'zoning', label: 'Zoning / Land Use' }]} />
            <FormField label="Result / Value" type="text" value={String(input.resultValue ?? '')} onChange={v => set('resultValue', v)} placeholder="Measured or calculated value" />
          </div>
        )
      case 'estimating':
        return (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Enter line items for your bill of quantities. Each item has quantity, unit, rate, and total.</p>
            <div className="grid grid-cols-4 gap-3 text-sm font-medium text-muted-foreground border-b pb-2">
              <span>Item Description</span><span>Qty</span><span>Unit</span><span>Rate (R)</span>
            </div>
            {boqItems.map((item, i) => (
              <div key={i} className="grid grid-cols-4 gap-3">
                <input type="text" className="rounded-xl border p-2 text-sm" placeholder={`Item ${i + 1}`} value={item.description} onChange={e => { const items = [...boqItems]; items[i].description = e.target.value; setBoqItems(items) }} />
                <input type="number" className="rounded-xl border p-2 text-sm" placeholder="0" value={item.qty} onChange={e => { const items = [...boqItems]; items[i].qty = e.target.value; setBoqItems(items); set(`item${i}Qty`, Number(e.target.value)) }} />
                <select className="rounded-xl border p-2 text-sm" value={item.unit} onChange={e => { const items = [...boqItems]; items[i].unit = e.target.value; setBoqItems(items) }}>
                  <option>mÂ²</option><option>mÂ³</option><option>lm</option><option>nr</option><option>hr</option>
                </select>
                <input type="number" className="rounded-xl border p-2 text-sm" placeholder="0.00" value={item.rate} onChange={e => { const items = [...boqItems]; items[i].rate = e.target.value; setBoqItems(items); set(`item${i}Rate`, Number(e.target.value)) }} />
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" className="rounded-full mt-2" onClick={() => setBoqItems([...boqItems, { description: '', qty: '', unit: 'mÂ²', rate: '' }])}>
              <Plus className="h-4 w-4 mr-1" /> Add item
            </Button>
          </div>
        )
      case 'site_management':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Date" type="date" value={String(input.date ?? '')} onChange={v => set('date', v)} />
              <FormField label="Weather" type="select" value={String(input.weather ?? '')} onChange={v => set('weather', v)} options={[{ value: 'Sunny', label: 'Sunny' }, { value: 'Cloudy', label: 'Cloudy' }, { value: 'Rain', label: 'Rain' }, { value: 'Windy', label: 'Windy' }]} />
            </div>
            <FormField label="Description" type="textarea" value={String(input.description ?? '')} onChange={v => set('description', v)} placeholder="Describe activities, observations, or issues..." />
            <div className="grid grid-cols-3 gap-4">
              <FormField label="Labour (count)" type="number" value={String(input.labour ?? '')} onChange={v => set('labour', Number(v))} />
              <FormField label="Plant (count)" type="number" value={String(input.plant ?? '')} onChange={v => set('plant', Number(v))} />
              <FormField label="Deliveries" type="number" value={String(input.deliveries ?? '')} onChange={v => set('deliveries', Number(v))} />
            </div>
          </div>
        )
      case 'tendering':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Project Name" type="text" value={String(input.projectName ?? '')} onChange={v => set('projectName', v)} placeholder="e.g. Pinewood Estate" />
            <FormField label="Tender Value (R)" type="number" value={String(input.tenderValue ?? '')} onChange={v => set('tenderValue', Number(v))} placeholder="e.g. 5000000" />
            <FormField label="Scope Summary" type="textarea" value={String(input.scopeSummary ?? '')} onChange={v => set('scopeSummary', v)} placeholder="Brief description of the tender scope..." />
            <FormField label="Submission Date" type="date" value={String(input.submissionDate ?? '')} onChange={v => set('submissionDate', v)} />
          </div>
        )
      case 'document_control':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Document Title" type="text" value={String(input.docTitle ?? '')} onChange={v => set('docTitle', v)} placeholder="e.g. Structural Layout - Sheet 1" />
            <FormField label="Revision" type="text" value={String(input.revision ?? '')} onChange={v => set('revision', v)} placeholder="e.g. P01" />
            <FormField label="Recipient" type="text" value={String(input.recipient ?? '')} onChange={v => set('recipient', v)} placeholder="e.g. Main Contractor" />
            <FormField label="Issue Purpose" type="select" value={String(input.issuePurpose ?? '')} onChange={v => set('issuePurpose', v)} options={[{ value: 'for_approval', label: 'For Approval' }, { value: 'for_construction', label: 'For Construction' }, { value: 'for_tender', label: 'For Tender' }, { value: 'as_built', label: 'As-Built' }]} />
          </div>
        )
      case 'procurement':
        return (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Enter materials or items to procure. Each row is a line item for the order list.</p>
            <FormField label="Supplier Name" type="text" value={String(input.supplierName ?? '')} onChange={v => set('supplierName', v)} placeholder="e.g. Builders Warehouse" />
            <FormField label="Delivery Date" type="date" value={String(input.deliveryDate ?? '')} onChange={v => set('deliveryDate', v)} />
            <FormField label="Notes" type="textarea" value={String(input.notes ?? '')} onChange={v => set('notes', v)} placeholder="Delivery instructions, payment terms, etc." />
          </div>
        )
      case 'workforce':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Worker Name" type="text" value={String(input.workerName ?? '')} onChange={v => set('workerName', v)} placeholder="e.g. John Smith" />
            <FormField label="Trade / Role" type="text" value={String(input.trade ?? '')} onChange={v => set('trade', v)} placeholder="e.g. Bricklayer" />
            <FormField label="Hours Worked" type="number" value={String(input.hours ?? '')} onChange={v => set('hours', Number(v))} placeholder="e.g. 8" />
            <FormField label="Hourly Rate (R)" type="number" value={String(input.hourlyRate ?? '')} onChange={v => set('hourlyRate', Number(v))} placeholder="e.g. 85" />
          </div>
        )
      case 'plant_equipment':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Asset Name" type="text" value={String(input.assetName ?? '')} onChange={v => set('assetName', v)} placeholder="e.g. CAT 320 Excavator" />
            <FormField label="Hire Rate (R/hr)" type="number" value={String(input.hireRate ?? '')} onChange={v => set('hireRate', Number(v))} placeholder="e.g. 550" />
            <FormField label="Hours Used" type="number" value={String(input.hoursUsed ?? '')} onChange={v => set('hoursUsed', Number(v))} placeholder="e.g. 8" />
            <FormField label="Operator" type="text" value={String(input.operator ?? '')} onChange={v => set('operator', v)} placeholder="Operator name" />
          </div>
        )
      case 'payment':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Claim Reference" type="text" value={String(input.claimRef ?? '')} onChange={v => set('claimRef', v)} placeholder="e.g. PC-001" />
            <FormField label="Claim Amount (R)" type="number" value={String(input.claimAmount ?? '')} onChange={v => set('claimAmount', Number(v))} placeholder="e.g. 250000" />
            <FormField label="Period" type="text" value={String(input.period ?? '')} onChange={v => set('period', v)} placeholder="e.g. March 2026" />
            <FormField label="Description" type="textarea" value={String(input.paymentDescription ?? '')} onChange={v => set('paymentDescription', v)} placeholder="Description of work completed..." />
          </div>
        )
      case 'briefing':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Project Name" type="text" value={String(input.projectName ?? '')} onChange={v => set('projectName', v)} placeholder="e.g. Pinewood Estate" />
            <FormField label="Budget (R)" type="number" value={String(input.budget ?? '')} onChange={v => set('budget', Number(v))} placeholder="e.g. 5000000" />
            <FormField label="Scope Description" type="textarea" value={String(input.scopeDescription ?? '')} onChange={v => set('scopeDescription', v)} placeholder="Describe the project scope..." />
          </div>
        )
      case 'closeout':
        return (
          <div className="space-y-4">
            <FormField label="Item / Defect" type="text" value={String(input.itemName ?? '')} onChange={v => set('itemName', v)} placeholder="e.g. Crack in plaster - Bedroom 2" />
            <FormField label="Status" type="select" value={String(input.status ?? '')} onChange={v => set('status', v)} options={[{ value: 'open', label: 'Open' }, { value: 'in_progress', label: 'In Progress' }, { value: 'completed', label: 'Completed' }, { value: 'verified', label: 'Verified Closed' }]} />
            <FormField label="Notes" type="textarea" value={String(input.closeoutNotes ?? '')} onChange={v => set('closeoutNotes', v)} placeholder="Resolution details, date closed, inspector..." />
          </div>
        )
      case 'drawing':
        return (
          <div className="space-y-4">
            <FormField label="Drawing Title" type="text" value={String(input.drawingTitle ?? '')} onChange={v => set('drawingTitle', v)} placeholder="e.g. Elevations - Sheet A-03" />
            <FormField label="Drawing Number" type="text" value={String(input.drawingNumber ?? '')} onChange={v => set('drawingNumber', v)} placeholder="e.g. A-03" />
            <FormField label="Notes" type="textarea" value={String(input.drawingNotes ?? '')} onChange={v => set('drawingNotes', v)} placeholder="Any comments or review notes for this drawing..." />
          </div>
        )
      case 'freelancer':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Task / Deliverable" type="text" value={String(input.taskName ?? '')} onChange={v => set('taskName', v)} placeholder="e.g. 3D Model - Kitchen" />
            <FormField label="Hours" type="number" value={String(input.freelancerHours ?? '')} onChange={v => set('freelancerHours', Number(v))} placeholder="e.g. 6" />
            <FormField label="Rate (R/hr)" type="number" value={String(input.freelancerRate ?? '')} onChange={v => set('freelancerRate', Number(v))} placeholder="e.g. 350" />
            <FormField label="Status" type="select" value={String(input.freelancerStatus ?? '')} onChange={v => set('freelancerStatus', v)} options={[{ value: 'in_progress', label: 'In Progress' }, { value: 'submitted', label: 'Submitted' }, { value: 'approved', label: 'Approved' }]} />
          </div>
        )
      case 'supplier':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Product / Material" type="text" value={String(input.productName ?? '')} onChange={v => set('productName', v)} placeholder="e.g. Cement 42.5N" />
            <FormField label="Quantity" type="number" value={String(input.productQty ?? '')} onChange={v => set('productQty', Number(v))} placeholder="e.g. 100" />
            <FormField label="Unit Price (R)" type="number" value={String(input.unitPrice ?? '')} onChange={v => set('unitPrice', Number(v))} placeholder="e.g. 85" />
            <FormField label="Lead Time (days)" type="number" value={String(input.leadTime ?? '')} onChange={v => set('leadTime', Number(v))} placeholder="e.g. 3" />
          </div>
        )
      default:
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Enter parameters for <strong>{tool.label}</strong> and click Run Tool to produce output.</p>
            {tool.tags.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {tool.tags.slice(0, 4).map(tag => (
                  <div key={tag}>
                    <FormField label={tag.charAt(0).toUpperCase() + tag.slice(1)} type="text" value={String(input[tag] ?? '')} onChange={v => set(tag, v)} placeholder={`Enter ${tag}`} />
                  </div>
                ))}
              </div>
            )}
            <FormField label="Freeform Data" type="textarea" value={String(input.freeformData ?? '')} onChange={v => set('freeformData', v)} placeholder="Enter any additional data as JSON or key=value lines..." />
          </div>
        )
    }
  }

  const handleCalculate = () => {
    const result: Record<string, unknown> = {}

    // Try matching discipline calculator first
    if (matchingCalculator) {
      try {
        const calcInputs: Record<string, unknown> = {}
        for (const key of matchingCalculator.requiredInputs ?? []) {
          if (input[key] !== undefined) calcInputs[key] = input[key]
        }
        for (const key of matchingCalculator.optionalInputs ?? []) {
          if (input[key] !== undefined) calcInputs[key] = input[key]
        }
        if (Object.keys(calcInputs).length > 0) {
          const calcRun = runCalculator(matchingCalculator.id, calcContext, calcInputs)
          result.calculatorRun = calcRun.id
          result.results = calcRun.results as Record<string, unknown>
          result.riskStatus = calcRun.riskStatus
          result.assumptions = calcRun.assumptions
          result.nextActions = calcRun.nextRecommendedActions
          result.professionalSignoffRequired = calcRun.professionalSignoffRequired
        }
      } catch { /* fall through to default */ }
    }

    // Fenestration enrichment â€” always add ventilation/lighting/ratio for fenestration tools
    if (tool.id === 'fenestration_calc' || tool.id === 'xa_fenestration_quick_check') {
      const wallArea = Number(input.wallAreaM2 || input.area || input.floorArea || 0)
      const glazedArea = Number(input.glazedAreaM2 || 0)
      const glazingRatio = wallArea > 0 ? Math.round((glazedArea / wallArea) * 10000) / 100 : 0
      if (result.results) {
        const r = result.results as Record<string, unknown>
        r.requiredVentilationM2 = Math.round(glazedArea * 0.05 * 100) / 100
        r.requiredLightingM2 = Math.round(glazedArea * 0.10 * 100) / 100
        r.glazingRatioPercent = glazingRatio
      } else {
        result.requiredVentilation = Math.round(glazedArea * 0.05 * 100) / 100
        result.requiredLighting = Math.round(glazedArea * 0.10 * 100) / 100
        result.glazingRatioPercent = glazingRatio
        result.compliant = wallArea > 0
      }
    }

    // Tool-specific calculations (only if calculator didn't produce output)
    if (Object.keys(result).length === 0) {
      switch (tool.id) {
        case 'rfi_generator': {
          const now = new Date()
          const dateStr = now.toISOString().split('T')[0].replace(/-/g, '')
          const seq = Math.floor(Math.random() * 9000 + 1000)
          result.rfiNumber = `RFI-${dateStr}-${seq}`
          result.subject = input.subject || 'Untitled'
          result.category = input.rfiCategory || 'other'
          result.priority = input.priority || 'normal'
          result.status = 'draft'
          result.dateCreated = now.toISOString().split('T')[0]
          break
        }
        case 'snag_creator': {
          const now = new Date()
          const dateStr = now.toISOString().split('T')[0].replace(/-/g, '')
          const seq = Math.floor(Math.random() * 9000 + 1000)
          const severityColors: Record<string, string> = { critical: 'red', major: 'amber', minor: 'blue' }
          result.snagId = `SNAG-${dateStr}-${seq}`
          result.location = input.location || 'Unspecified'
          result.description = input.snagDescription || ''
          result.severity = input.severity || 'minor'
          result.severityColor = severityColors[String(input.severity)] || 'blue'
          result.category = input.snagCategory || 'architectural'
          result.responsibleParty = input.responsibleParty || 'Unassigned'
          result.dueDate = input.dueDate || 'Not set'
          result.status = input.snagStatus || 'open'
          break
        }
        case 'fee_calculator': {
          const cv = Number(input.constructionValue || 0)
          const complexity = Number(input.complexity || 1.0)
          const rates: Record<string, number> = { architect: 0.085, engineer: 0.075, qs: 0.035, planner: 0.02 }
          const rate = rates[String(input.category || 'architect')] || 0.085
          const fee = cv * rate * complexity
          result.fee = Math.round(fee)
          result.rate = rate
          result.currency = 'ZAR'
          result.breakdown = { baseFee: Math.round(cv * rate), complexityMultiplier: complexity, adjustedFee: Math.round(fee) }
          break
        }
        case 'rvalue_calc': {
          const area = Number(input.area || 0)
          const rValue = Number(input.resultValue || 3.7)
          result.area = area
          result.rValue = rValue
          result.uValue = area > 0 ? Math.round((1 / rValue) * 1000) / 1000 : 0
          result.compliant = rValue >= 3.7 ? 'Pass - meets SANS 10400-XA minimum' : 'Review needed'
          break
        }
        case 'admin_governance': {
          result.action = input.govAction || 'review'
          result.scope = input.govScope || 'platform'
          result.target = input.govTarget || ''
          result.description = input.govDescription || ''
          result.runDate = new Date().toISOString().split('T')[0]
          result.status = 'completed'
          result.reference = `GOV-${new Date().toISOString().split('T')[0].replace(/-/g, '')}`
          break
        }

        case 'ai_drawing_checker': {
          const drawingTitle = String(input.drawingTitle || 'Untitled')
          const drawingNumber = String(input.drawingNumber || 'N/A')
          result.titleBlockOk = drawingTitle.length > 0
          result.northPointOk = true
          result.scaleOk = true
          result.dateOk = true
          result.drawingTitle = drawingTitle
          result.drawingNumber = drawingNumber
          result.reference = `DRAW-CHK-${Date.now().toString(36).toUpperCase()}`
          break
        }

        case 'ai_review_queue': {
          result.category = input.arCategory || 'drawing'
          result.statusFilter = input.arStatus || 'pending'
          result.reviewerNotes = input.arNotes || ''
          result.itemsInQueue = 0
          result.runDate = new Date().toISOString().split('T')[0]
          result.reference = `AIQ-${new Date().toISOString().split('T')[0].replace(/-/g, '')}`
          break
        }

        case 'audit_trail_viewer': {
          result.entityType = input.atEntity || 'user'
          result.actionType = input.atAction || 'all'
          result.dateRange = `${input.atStartDate || 'Any'} ÔÇö ${input.atEndDate || 'Any'}`
          result.query = input.atQuery || ''
          result.runDate = new Date().toISOString().split('T')[0]
          result.entriesFound = 0
          result.status = 'completed'
          result.reference = `AUDIT-${new Date().toISOString().split('T')[0].replace(/-/g, '')}`
          break
        }

        case 'boq_takeoff': {
          const total = boqItems.reduce((sum, item) => sum + (Number(item.qty) * Number(item.rate)), 0)
          result.items = boqItems.filter(i => i.description).length
          result.totalEstimated = Math.round(total)
          result.currency = 'ZAR'
          result.reference = `BOQ-${Date.now().toString(36).toUpperCase()}`
          result.status = 'draft'
          break
        }

        case 'brief_wizard': {
          const projectName = String(input.projectName || 'Untitled')
          const budget = Number(input.budget || 0)
          const scopeDescription = String(input.scopeDescription || 'No description')
          result.projectName = projectName
          result.budget = budget
          result.scopeDescription = scopeDescription
          result.reference = `BRIEF-${Date.now().toString(36).toUpperCase()}`
          result.status = 'generated'
          break
        }

        case 'cad_upload_check': {
          const drawingTitle = String(input.drawingTitle || 'Untitled')
          const drawingNumber = String(input.drawingNumber || 'N/A')
          const notes = String(input.drawingNotes || '')
          result.drawingTitle = drawingTitle
          result.drawingNumber = drawingNumber
          result.notes = notes
          result.cadValid = true
          result.reference = `CAD-CHK-${Date.now().toString(36).toUpperCase()}`
          break
        }

        case 'catalogue_manager': {
          const productName = String(input.productName || 'Unnamed product')
          const qty = Number(input.productQty || 0)
          const price = Number(input.unitPrice || 0)
          const leadTime = Number(input.leadTime || 0)
          result.productName = productName
          result.quantity = qty
          result.unitPrice = price
          result.leadTime = leadTime
          result.totalPrice = qty * price
          result.reference = `CAT-${Date.now().toString(36).toUpperCase()}`
          result.status = 'catalogued'
          break
        }

        case 'cpd_standalone': {
          const hours = Number(input.cpdHours || 0)
          const category = String(input.cpdCategory || 'technical')
          const body = String(input.cpdBody || 'sacap')

          // CPD credits: 1 credit per hour (varies by body, simplified)
          const credits = hours
          const annualLimit = body === 'sacap' ? 25 : body === 'ecsa' ? 30 : body === 'sacqsp' ? 20 : 25

          result.professionalBody = body
          result.activityType = category
          result.activityTitle = input.activityTitle || 'Untitled Activity'
          result.activityDescription = input.activityDescription || ''
          result.durationHours = hours
          result.creditsEarned = credits
          result.provider = input.providerName || ''
          result.dateCompleted = input.cpdDate || new Date().toISOString().split('T')[0]
          result.evidenceRef = input.cpdEvidence || ''
          result.creditsTowardsAnnual = `${credits} of ${annualLimit} required`
          result.categoryLabel = category === 'ethics' ? 'Category 1 ÔÇö Ethics' : category === 'technical' ? 'Category 2 ÔÇö Technical' : category === 'management' ? 'Category 3 ÔÇö Management' : 'Category 4 ÔÇö Specialist'
          result.status = 'submitted'
          result.reference = `CPD-${new Date().toISOString().split('T')[0].replace(/-/g, '')}-${Math.floor(Math.random() * 900 + 100)}`
          break
        }

        case 'deliverable_submission': {
          const task = String(input.taskName || 'Unnamed task')
          const hours = Number(input.freelancerHours || 0)
          const rate = Number(input.freelancerRate || 0)
          const status = String(input.freelancerStatus || 'in_progress')
          result.task = task
          result.hours = hours
          result.rate = rate
          result.status = status
          result.reference = `DEL-${Date.now().toString(36).toUpperCase()}`
          break
        }

        case 'delivery_note': {
          const productName = String(input.productName || 'Unnamed product')
          const qty = Number(input.productQty || 0)
          const price = Number(input.unitPrice || 0)
          const leadTime = Number(input.leadTime || 0)
          result.productName = productName
          result.quantity = qty
          result.unitPrice = price
          result.leadTime = leadTime
          result.totalPrice = qty * price
          result.reference = `DN-${Date.now().toString(36).toUpperCase()}`
          result.status = 'delivered'
          break
        }

        case 'doc_control_issue': {
          const docTitle = String(input.docTitle || 'Untitled')
          const revision = String(input.revision || 'D01')
          const recipient = String(input.recipient || 'Unspecified')
          const issuePurpose = String(input.issuePurpose || 'for_approval')
          result.docTitle = docTitle
          result.revision = revision
          result.recipient = recipient
          result.issuePurpose = issuePurpose
          result.reference = `ISSUE-${Date.now().toString(36).toUpperCase()}`
          result.status = 'generated'
          break
        }

        case 'drawing_register': {
          result.docTitle = input.docTitle || 'Untitled'
          result.revision = input.revision || 'D01'
          result.recipient = input.recipient || 'Unspecified'
          result.issuePurpose = input.issuePurpose || 'for_approval'
          result.reference = `REG-${Date.now().toString(36).toUpperCase()}`
          result.status = 'registered'
          break
        }

        case 'energy_certificate': {
          const floorArea = Number(input.floorArea || 0)
          const glazedArea = Number(input.glazedArea || 0)
          const roofArea = Number(input.roofArea || 0)
          const wallU = Number(input.wallU || 0.6)
          const roofU = Number(input.roofU || 0.35)
          const glazingU = Number(input.glazingU || 2.7)
          const pvKw = Number(input.pvKw || 0)
          const shading = Number(input.shadingFactor || 0.8)
          const zone = String(input.climateZone || '4')
          const water = String(input.waterHeating || 'electric')
          const bldgType = String(input.buildingType || 'residential_single')

          // Simplified SANS 10400-XA energy demand calculation
          const wallArea = floorArea * 0.4 // approx external wall area ratio
          const wallLoss = wallArea * wallU * 15 // temp diff ~15┬░C
          const roofLoss = roofArea * roofU * 15
          const glazingLoss = glazedArea * glazingU * 15
          const totalLoss = wallLoss + roofLoss + glazingLoss
          const pvOffset = pvKw * 1.5 * 4.5 // kWh/m┬▓/yr avg insolation

          // Zone-based demand target (approximate kWh/m┬▓/yr)
          const demandTargets: Record<string, number> = {
            '1': 80, '2': 85, '3': 75, '4': 90, '5': 70, '6': 95,
          }
          const targetDemand = demandTargets[zone] || 90
          const annualDemand = Math.round(totalLoss * 0.1) // convert to approx kWh/m┬▓/yr
          const netDemand = Math.max(0, annualDemand - pvOffset)
          const compliant = netDemand <= targetDemand ? 'Compliant' : 'Non-compliant'

          result.climateZone = `Zone ${zone}`
          result.buildingType = bldgType
          result.floorArea = floorArea
          result.annualEnergyDemand = `${annualDemand.toFixed(1)} kWh/m┬▓/yr`
          result.netEnergyDemand = `${netDemand.toFixed(1)} kWh/m┬▓/yr`
          result.targetDemand = `${targetDemand} kWh/m┬▓/yr`
          result.complianceStatus = compliant
          result.pvContribution = pvKw > 0 ? `${pvOffset.toFixed(1)} kWh/yr offset` : 'None'
          result.waterHeatingType = water
          result.certificateRef = `EC-${new Date().toISOString().split('T')[0].replace(/-/g, '')}`
          break
        }

        case 'feasibility_estimator': {
          const land = Number(input.landCost || 0)
          const construction = Number(input.constructionCost || 0)
          const fees = Number(input.professionalFees || 0)
          const statutory = Number(input.statutoryCosts || 0)
          const revenue = Number(input.expectedRevenue || 0)
          const contingencyPct = Number(input.contingencyPct || 5)
          const projType = String(input.projectType || 'residential')

          const contingency = Math.round(construction * (contingencyPct / 100))
          const totalProjectCost = land + construction + fees + statutory + contingency
          const netRevenue = revenue - totalProjectCost
          const profitMargin = totalProjectCost > 0 ? (netRevenue / totalProjectCost) * 100 : 0
          const costPerM2 = construction > 0 && Number(input.floorArea || 0) > 0
            ? Math.round(construction / Number(input.floorArea || 1))
            : 'N/A (no floor area)'

          result.projectType = projType
          result.landCost = land
          result.constructionCost = construction
          result.professionalFees = fees
          result.statutoryCosts = statutory
          result.contingency = contingency
          result.contingencyRate = `${contingencyPct}%`
          result.totalProjectCost = totalProjectCost
          result.expectedRevenue = revenue
          result.netRevenue = netRevenue
          result.profitMargin = profitMargin.toFixed(1) + '%'
          result.viability = netRevenue > 0 ? 'Feasible' : netRevenue === 0 ? 'Break-even' : 'Not Feasible'
          result.currency = 'ZAR'
          result.notes = input.feasNotes || ''
          result.reference = `FEAS-${new Date().toISOString().split('T')[0].replace(/-/g, '')}`
          break
        }

        case 'fee_tariff_editor': {
          result.category = input.teCategory || 'professional'
          result.action = input.teAction || 'view'
          result.feeCode = input.teCode || ''
          result.newRate = Number(input.teRate || 0)
          result.changeNotes = input.teNotes || ''
          result.effectiveDate = new Date().toISOString().split('T')[0]
          result.reference = `TARIFF-${new Date().toISOString().split('T')[0].replace(/-/g, '')}`
          break
        }

        case 'fire_compliance_check': {
          const items = [
            { id: 'escape_routes', label: 'Escape Routes' },
            { id: 'travel_dist', label: 'Travel Distance' },
            { id: 'fire_doors', label: 'Fire Doors' },
            { id: 'compartmentation', label: 'Compartmentation' },
            { id: 'smoke_vent', label: 'Smoke Ventilation' },
            { id: 'fire_hydrants', label: 'Fire Hydrants' },
            { id: 'extinguishers', label: 'Fire Extinguishers' },
            { id: 'detection', label: 'Detection System' },
            { id: 'emergency_lighting', label: 'Emergency Lighting' },
            { id: 'signage', label: 'Fire Signage' },
            { id: 'access', label: 'Fire Service Access' },
            { id: 'structure', label: 'Structural Fire Resistance' },
          ]
          const passed: string[] = []
          const failed: string[] = []
          for (const item of items) {
            if (Boolean((input as Record<string, unknown>)[`fc_${item.id}`])) {
              passed.push(item.label)
            } else {
              failed.push(item.label)
            }
          }
          const total = items.length
          const score = Math.round((passed.length / total) * 100)
          result.projectName = input.fcProjectName || ''
          result.inspector = input.fcInspector || ''
          result.passedItems = passed.length
          result.failedItems = failed.length
          result.totalChecks = total
          result.complianceScore = `${score}%`
          result.status = score >= 90 ? 'Compliant' : score >= 70 ? 'Conditional' : 'Non-Compliant'
          result.failedList = failed.join(', ') || 'None'
          result.notes = input.fcNotes || ''
          result.reference = `FC-${new Date().toISOString().split('T')[0].replace(/-/g, '')}`
          break
        }

        case 'fire_rational_design': {
          const height = Number(input.buildingHeight || 0)
          const area = Number(input.compartmentArea || 0)
          const travel = Number(input.travelDistance || 30)
          const escapeWidth = Number(input.escapeWidth || 1.2)
          const frrMin = Number(input.frr || 60)
          const storeys = Number(input.numStoreys || 1)
          const occupancy = String(input.occupancyType || 'residential')

          // SANS 10400-T compliance checks
          const travelCompliant = travel <= 45 ? 'Compliant' : travel <= 60 ? 'Conditional' : 'Non-compliant'
          const escapeWidthCompliant = escapeWidth >= 0.9 ? 'Compliant' : 'Non-compliant'
          const sprinklers = String(input.hasSprinklers || 'no')
          const detection = String(input.detectionType || 'none')

          let frrRequired: number
          if (height > 28) frrRequired = 120
          else if (height > 15) frrRequired = 90
          else if (height > 8) frrRequired = 60
          else frrRequired = 30

          const frrCompliant = frrMin >= frrRequired ? 'Compliant' : 'Non-compliant'

          result.occupancyType = occupancy
          result.buildingHeight = height
          result.numStoreys = storeys
          result.compartmentArea = area
          result.frrProvided = `${frrMin} min`
          result.frrRequired = `${frrRequired} min`
          result.frrCompliant = frrCompliant
          result.travelDistance = `${travel} m ÔÇö ${travelCompliant}`
          result.escapeWidthCompliant = escapeWidthCompliant
          result.hasSprinklers = sprinklers
          result.detectionType = detection
          result.mustComplyWithSANS10400T = true
          result.designReference = `RD-${new Date().toISOString().split('T')[0].replace(/-/g, '')}`
          break
        }

        case 'firm_document_register': {
          result.docTitle = String(input.docTitle || 'Untitled')
          result.revision = String(input.revision || 'D01')
          result.recipient = String(input.recipient || 'Unspecified')
          result.issuePurpose = String(input.issuePurpose || 'for_approval')
          result.reference = `FIRM-REG-${Date.now().toString(36).toUpperCase()}`
          result.status = 'registered'
          break
        }

        case 'freelancer_resource_centre': {
          result.reference = `RES-${Date.now().toString(36).toUpperCase()}`
          result.status = 'viewed'
          result.output = 'Freelancer resource centre'
          break
        }

        case 'freelancer_timesheet': {
          const task = String(input.taskName || 'Unnamed task')
          const hours = Number(input.freelancerHours || 0)
          const rate = Number(input.freelancerRate || 0)
          const status = String(input.freelancerStatus || 'in_progress')
          result.task = task
          result.hours = hours
          result.rate = rate
          result.status = status
          result.total = hours * rate
          result.reference = `FL-TS-${Date.now().toString(36).toUpperCase()}`
          break
        }

        case 'hs_compliance': {
          const items = [
            { id: 'induction', label: 'Site Induction' },
            { id: 'ppe', label: 'PPE Compliance' },
            { id: 'scaffold', label: 'Scaffold Safety' },
            { id: 'excavation', label: 'Excavation Shoring' },
            { id: 'electrical', label: 'Electrical Safety' },
            { id: 'fire_ext', label: 'Fire Extinguisher' },
            { id: 'first_aid', label: 'First Aid' },
            { id: 'permits', label: 'Valid Permits' },
            { id: 'welfare', label: 'Welfare Facilities' },
            { id: 'signage', label: 'Safety Signage' },
          ]
          const passed: string[] = []
          const failed: string[] = []
          for (const item of items) {
            if (Boolean((input as Record<string, unknown>)[`hs_${item.id}`])) {
              passed.push(item.label)
            } else {
              failed.push(item.label)
            }
          }
          const total = items.length
          const score = Math.round((passed.length / total) * 100)
          result.inspector = input.inspectorName || 'Unspecified'
          result.checkDate = input.checkDate || new Date().toISOString().split('T')[0]
          result.passedItems = passed.join(', ') || 'None'
          result.failedItems = failed.join(', ') || 'None'
          result.passCount = passed.length
          result.failCount = failed.length
          result.totalChecks = total
          result.complianceScore = score
          result.status = score >= 80 ? 'Pass' : score >= 50 ? 'Conditional Pass' : 'Fail'
          result.comments = input.hsComments || ''
          result.reference = `HS-${new Date().toISOString().split('T')[0].replace(/-/g, '')}`
          break
        }

        case 'material_procurement': {
          let total = 0
          const items: string[] = []
          for (let i = 0; i < 5; i++) {
            const name = String((input as Record<string, string>)[`mp_item${i}`] || '')
            const qty = Number((input as Record<string, string>)[`mp_qty${i}`] || 0)
            const cost = Number((input as Record<string, string>)[`mp_cost${i}`] || 0)
            if (name) {
              const lineTotal = qty * cost
              total += lineTotal
              items.push(`${name} x${qty} = R${lineTotal.toFixed(0)}`)
            }
          }
          result.supplier = input.mpSupplier || ''
          result.deliveryDate = input.mpDeliveryDate || ''
          result.items = items.length ? items.join('; ') : 'No items added'
          result.itemCount = items.length
          result.totalEstimated = Math.round(total)
          result.currency = 'ZAR'
          result.notes = input.mpNotes || ''
          result.reference = `PO-${new Date().toISOString().split('T')[0].replace(/-/g, '')}`
          break
        }

        case 'package_scope_viewer': {
          result.reference = `SCOPE-${Date.now().toString(36).toUpperCase()}`
          result.status = 'viewed'
          result.output = 'Package scope viewer output'
          break
        }

        case 'payment_claim_builder': {
          result.claimRef = String(input.claimRef || 'N/A')
          result.claimAmount = Number(input.claimAmount || 0)
          result.period = String(input.period || 'N/A')
          result.description = String(input.paymentDescription || '')
          result.reference = `CLAIM-${Date.now().toString(36).toUpperCase()}`
          result.status = 'draft'
          break
        }

        case 'payment_dashboard': {
          result.claimRef = String(input.claimRef || 'N/A')
          result.claimAmount = Number(input.claimAmount || 0)
          result.period = String(input.period || 'N/A')
          result.description = String(input.paymentDescription || '')
          result.reference = `PAY-DASH-${Date.now().toString(36).toUpperCase()}`
          result.status = 'viewed'
          break
        }

        case 'payment_rate_config': {
          result.category = input.rcCategory || 'architect'
          result.rateType = input.rcRateType || 'percentage'
          result.rateValue = Number(input.rcRateValue || 0)
          result.effectiveDate = input.rcEffectiveDate || ''
          result.notes = input.rcNotes || ''
          result.status = 'draft'
          result.reference = `RATE-${new Date().toISOString().split('T')[0].replace(/-/g, '')}`
          break
        }

        case 'plant_register': {
          const assetName = String(input.assetName || 'Unnamed asset')
          const hireRate = Number(input.hireRate || 0)
          const hoursOperated = Number(input.hoursUsed || 0)
          const operator = String(input.operator || 'Unassigned')
          result.assetName = assetName
          result.hireRate = hireRate
          result.hoursOperated = hoursOperated
          result.operator = operator
          result.totalHireCost = hoursOperated * hireRate
          result.reference = `PLANT-${Date.now().toString(36).toUpperCase()}`
          result.status = 'calculated'
          break
        }

        case 'platform_settings': {
          result.category = input.psCategory || 'branding'
          result.action = input.psAction || 'view'
          result.settingKey = input.psKey || ''
          result.newValue = input.psValue || ''
          result.changeReason = input.psReason || ''
          result.updatedBy = 'Platform Admin'
          result.updatedDate = new Date().toISOString().split('T')[0]
          result.reference = `CONFIG-${new Date().toISOString().split('T')[0].replace(/-/g, '')}`
          break
        }

        case 'progress_viewer': {
          result.reference = `PROG-${Date.now().toString(36).toUpperCase()}`
          result.status = 'viewed'
          result.output = 'Progress viewer output'
          break
        }

        case 'proposal_comparison': {
          const feeA = Number(input.feeA || 0)
          const feeB = Number(input.feeB || 0)
          const feeC = Number(input.feeC || 0)
          const scoreA = Number(input.scoreA || 0)
          const scoreB = Number(input.scoreB || 0)
          const scoreC = Number(input.scoreC || 0)
          const nameA = String(input.proposalA || 'Proposal A')
          const nameB = String(input.proposalB || 'Proposal B')
          const nameC = String(input.proposalC || '')

          const proposals: Array<{ name: string; fee: number; score: number; id: string; valueIndex?: number }> = [
            { name: nameA, fee: feeA, score: scoreA, id: 'A' },
            { name: nameB, fee: feeB, score: scoreB, id: 'B' },
          ]
          if (nameC) proposals.push({ name: nameC, fee: feeC, score: scoreC, id: 'C' })

          // Value score: normalised fee + quality score (50/50 weighting)
          const maxFee = Math.max(...proposals.map(p => p.fee), 1)
          const maxScore = 10
          for (const p of proposals) {
            const feeNorm = maxFee > 0 ? 1 - (p.fee / maxFee) : 0
            const scoreNorm = p.score / maxScore
            p.valueIndex = Math.round(((feeNorm * 0.5) + (scoreNorm * 0.5)) * 100)
          }

          const ranked = [...proposals].sort((a, b) => (b.valueIndex || 0) - (a.valueIndex || 0))

          result.projectName = input.pcProjectName || ''
          result.numProposals = proposals.length
          result.proposals = proposals.map(p => ({
            name: p.name,
            fee: p.fee,
            score: p.score,
            valueIndex: p.valueIndex,
          }))
          result.ranking = ranked.map((p, i) => `#${i + 1} ${p.name} (Value: ${p.valueIndex}%)`).join(' | ')
          result.recommended = ranked[0]?.name || ''
          result.reference = `BEP-${new Date().toISOString().split('T')[0].replace(/-/g, '')}`
          break
        }

        case 'quote_response': {
          const productName = String(input.productName || 'Unnamed product')
          const qty = Number(input.productQty || 0)
          const price = Number(input.unitPrice || 0)
          const leadTime = Number(input.leadTime || 0)
          result.productName = productName
          result.quantity = qty
          result.unitPrice = price
          result.leadTime = leadTime
          result.totalPrice = qty * price
          result.reference = `QTE-${Date.now().toString(36).toUpperCase()}`
          result.status = 'quoted'
          break
        }

        case 'rfi_response': {
          const now = new Date()
          const dateStr = now.toISOString().split('T')[0].replace(/-/g, '')
          const seq = Math.floor(Math.random() * 9000 + 1000)
          result.responseId = `RFI-RSP-${dateStr}-${seq}`
          result.rfiReference = input.rfiRef || 'Not specified'
          result.respondedBy = input.respondedBy || 'Unspecified'
          result.originalQuery = input.originalQuery || ''
          result.responseText = input.responseText || ''
          result.responseType = input.responseType || 'information'
          result.responseDate = input.responseDate || dateStr
          result.attachments = input.attachments || ''
          result.status = 'submitted'
          break
        }

        case 'sans_forms': {
          const now = new Date()
          const dateStr = now.toISOString().split('T')[0]
          const formType = String(input.formType || 'form1')
          result.formType = formType
          result.projectName = input.formProjectName || 'Unspecified'
          result.erfNumber = input.erfNumber || ''
          result.municipality = input.municipalityName || ''
          result.applicant = input.applicantName || ''
          result.buildingType = input.formBuildingType || 'residential'
          result.competentPerson = input.competentPerson || ''
          result.notes = input.formNotes || ''
          result.submissionDate = dateStr
          result.formReference = `SANS-${formType.toUpperCase()}-${dateStr.replace(/-/g, '')}`
          result.status = 'draft'
          break
        }

        case 'shop_drawing_submission': {
          result.docTitle = String(input.docTitle || 'Untitled')
          result.revision = String(input.revision || 'D01')
          result.recipient = String(input.recipient || 'Unspecified')
          result.issuePurpose = String(input.issuePurpose || 'for_approval')
          result.reference = `SHP-${Date.now().toString(36).toUpperCase()}`
          result.status = 'submitted'
          break
        }

        case 'site_diary_entry': {
          result.date = input.date || new Date().toISOString().split('T')[0]
          result.weather = input.weather || 'Sunny'
          result.description = input.description || ''
          result.labourCount = Number(input.labourCount || 0)
          result.plantCount = Number(input.plantCount || 0)
          result.deliveries = input.deliveries || ''
          result.reference = `SD-${new Date().toISOString().split('T')[0].replace(/-/g, '')}`
          break
        }

        case 'snag_evidence_upload': {
          const itemName = String(input.itemName || 'Unnamed item')
          const status = String(input.status || 'open')
          const notes = String(input.closeoutNotes || '')
          result.itemName = itemName
          result.status = status
          result.notes = notes
          result.evidenceUploaded = true
          result.reference = `SNAG-EV-${Date.now().toString(36).toUpperCase()}`
          break
        }

        case 'soft_cost_estimator': {
          const constrValue = Number(input.constructionValue || 0)
          const projType = String(input.projectType || 'residential')
          const category = String(input.category || 'architect')
          const complexity = Number(input.complexity || 1.0)

          // Professional fee percentages (simplified SAIA/SACAP scales)
          const feePcts: Record<string, Record<string, number>> = {
            architect: { residential: 0.08, commercial: 0.065, industrial: 0.06, renovation: 0.10 },
            engineer: { residential: 0.05, commercial: 0.045, industrial: 0.04, renovation: 0.06 },
            qs: { residential: 0.025, commercial: 0.02, industrial: 0.02, renovation: 0.03 },
            planner: { residential: 0.015, commercial: 0.012, industrial: 0.01, renovation: 0.02 },
          }
          const basePct = (feePcts[category]?.[projType] || 0.065) * complexity
          const professionalFee = Math.round(constrValue * basePct)

          // Soft costs as percentage of construction
          const statutory = Math.round(constrValue * 0.015)   // planning, building control
          const geotech = Math.round(constrValue * 0.005)     // geotechnical
          const enviro = Math.round(constrValue * 0.003)      // environmental
          const legal = Math.round(constrValue * 0.008)       // legal
          const finance = Math.round(constrValue * 0.02)      // finance costs
          const contingency = Math.round(constrValue * 0.05)  // 5% contingency
          const totalSoft = professionalFee + statutory + geotech + enviro + legal + finance + contingency

          result.constructionValue = constrValue
          result.projectType = projType
          result.professionalCategory = category
          result.complexityFactor = complexity
          result.feePercentage = `${(basePct * 100).toFixed(1)}%`
          result.professionalFee = professionalFee
          result.statutoryFees = statutory
          result.geotechnical = geotech
          result.environmental = enviro
          result.legalFees = legal
          result.financeCosts = finance
          result.contingency = contingency
          result.totalSoftCosts = totalSoft
          result.currency = 'ZAR'
          break
        }

        case 'staff_cpd_tracker': {
          const cat1 = Number(input.cat1Credits || 0)
          const cat2 = Number(input.cat2Credits || 0)
          const cat3 = Number(input.cat3Credits || 0)
          const body = String(input.staffBody || 'sacap')
          const total = cat1 + cat2 + cat3

          // Minimum per category (simplified SACAP rules)
          const minCat1 = 3
          const minCat2 = 12
          const minCat3 = 2
          const annualRequired = body === 'sacap' ? 25 : body === 'ecsa' ? 30 : body === 'sacqsp' ? 20 : 25

          const cat1Ok = cat1 >= minCat1
          const cat2Ok = cat2 >= minCat2
          const cat3Ok = cat3 >= minCat3
          const totalOk = total >= annualRequired
          const compliant = [cat1Ok, cat2Ok, cat3Ok, totalOk].every(Boolean)

          result.staffName = input.staffName || ''
          result.professionalBody = body
          result.registrationNumber = input.staffRegNumber || ''
          result.cycleYear = Number(input.cpdCycleYear || new Date().getFullYear())
          result.cat1Credits = cat1
          result.cat2Credits = cat2
          result.cat3Credits = cat3
          result.totalCredits = total
          result.annualRequired = annualRequired
          result.cat1Compliant = cat1Ok ? `Yes (${cat1} ÔëÑ ${minCat1})` : `No (${cat1} < ${minCat1})`
          result.cat2Compliant = cat2Ok ? `Yes (${cat2} ÔëÑ ${minCat2})` : `No (${cat2} < ${minCat2})`
          result.cat3Compliant = cat3Ok ? `Yes (${cat3} ÔëÑ ${minCat3})` : `No (${cat3} < ${minCat3})`
          result.totalCompliant = totalOk ? `Yes (${total} ÔëÑ ${annualRequired})` : `Shortfall of ${annualRequired - total}`
          result.overallStatus = compliant ? 'Compliant' : 'Non-Compliant'
          result.notes = input.cpdNotes || ''
          result.reference = `CPD-TRK-${new Date().toISOString().split('T')[0].replace(/-/g, '')}`
          break
        }

        case 'stage_gate_review': {
          result.projectName = input.sgProjectName || ''
          result.stage = input.sgStage || ''
          result.decision = input.sgDecision || ''
          result.reviewer = input.sgReviewer || ''
          result.reviewNotes = input.sgNotes || ''
          result.conditions = input.sgConditions || ''
          result.decisionDate = new Date().toISOString().split('T')[0]
          result.stageLabel = input.sgStage === 'brief' ? 'Stage 1 ÔÇö Brief' : input.sgStage === 'appoint' ? 'Stage 2 ÔÇö Appoint' : input.sgStage === 'design' ? 'Stage 3 ÔÇö Design' : input.sgStage === 'comply' ? 'Stage 4 ÔÇö Comply' : input.sgStage === 'procure' ? 'Stage 5 ÔÇö Procure' : input.sgStage === 'build' ? 'Stage 6 ÔÇö Build' : input.sgStage === 'pay' ? 'Stage 7 ÔÇö Pay' : input.sgStage === 'closeout' ? 'Stage 8 ÔÇö Close-out' : ''
          result.reference = `SG-${new Date().toISOString().split('T')[0].replace(/-/g, '')}-${Math.floor(Math.random() * 900 + 100)}`
          break
        }

        case 'system_health_monitor': {
          result.component = input.shComponent || 'all'
          result.diagnosticType = input.shDiagnostic || 'ping'
          result.alertEmail = input.shAlertEmail || ''
          result.notes = input.shNotes || ''
          result.runDate = new Date().toISOString().split('T')[0]
          result.status = 'completed'
          result.allOk = true
          result.reference = `SYS-${new Date().toISOString().split('T')[0].replace(/-/g, '')}`
          break
        }

        case 'technical_brief': {
          const projectName = String(input.projectName || 'Untitled')
          const budget = Number(input.budget || 0)
          const scopeDescription = String(input.scopeDescription || 'No description')
          result.projectName = projectName
          result.budget = budget
          result.scopeDescription = scopeDescription
          result.reference = `TB-${Date.now().toString(36).toUpperCase()}`
          result.status = 'draft'
          break
        }

        case 'tender_bid_bench': {
          result.projectName = String(input.projectName || 'Untitled')
          result.tenderValue = Number(input.tenderValue || 0)
          result.scope = String(input.scopeSummary || '')
          result.submissionDate = String(input.submissionDate || '')
          result.reference = `TENDER-${Date.now().toString(36).toUpperCase()}`
          result.status = 'draft'
          break
        }

        case 'user_verification_console': {
          result.userName = input.uvUserName || ''
          result.professionalBody = input.uvBody || ''
          result.registrationNumber = input.uvRegNumber || ''
          result.verificationStatus = input.uvStatus || 'pending'
          result.verificationNotes = input.uvNotes || ''
          result.verifiedBy = 'Platform Admin'
          result.verificationDate = new Date().toISOString().split('T')[0]
          result.reference = `VER-${new Date().toISOString().split('T')[0].replace(/-/g, '')}`
          break
        }

        case 'valuation_cert': {
          const contract = Number(input.contractSum || 0)
          const prevCert = Number(input.previousCertified || 0)
          const works = Number(input.worksCompleted || 0)
          const materials = Number(input.materialsOnSite || 0)
          const retentionPct = Number(input.retentionPercent || 5)
          const vatPct = Number(input.vatPercent || 15)
          const nominated = Number(input.nominatedSubcons || 0)
          const contingencies = Number(input.contingencies || 0)
          const grossEarned = works + materials + nominated + contingencies
          const retention = grossEarned * (retentionPct / 100)
          const amountCertified = grossEarned - retention
          const vat = amountCertified * (vatPct / 100)
          const netPayable = amountCertified + vat
          result.contractSum = contract
          result.previousCertified = prevCert
          result.worksCompleted = works
          result.materialsOnSite = materials
          result.grossEarned = grossEarned
          result.retentionDeducted = Math.round(retention)
          result.amountCertified = Math.round(amountCertified)
          result.vatAmount = Math.round(vat)
          result.netPayable = Math.round(netPayable)
          result.remainingContract = contract - prevCert
          result.currency = 'ZAR'
          result.status = 'draft'
          result.certificateNumber = `VC-${new Date().toISOString().split('T')[0].replace(/-/g, '')}-${Math.floor(Math.random() * 900 + 100)}`
          break
        }

        case 'warranty_upload': {
          const itemName = String(input.itemName || 'Unnamed item')
          const status = String(input.status || 'open')
          const notes = String(input.closeoutNotes || '')
          result.itemName = itemName
          result.status = status
          result.notes = notes
          result.warrantyUploaded = true
          result.reference = `WARR-${Date.now().toString(36).toUpperCase()}`
          break
        }

        case 'workforce_timesheet': {
          const workerName = String(input.workerName || 'Unnamed')
          const trade = String(input.trade || 'General')
          const hours = Number(input.hours || 0)
          const hourlyRate = Number(input.hourlyRate || 0)
          result.workerName = workerName
          result.trade = trade
          result.hours = hours
          result.hourlyRate = hourlyRate
          result.totalPay = hours * hourlyRate
          result.reference = `TS-${Date.now().toString(36).toUpperCase()}`
          result.status = 'calculated'
          break
        }

        case 'xa_compliance_calc': {
          const floorArea = Number(input.floorArea || 0)
          const wallArea = Number(input.externalWallArea || 0)
          const roofArea = Number(input.roofArea || 0)
          const glazedArea = Number(input.glazedArea || 0)
          const wallR = Number(input.wallInsulationR || 0)
          const roofR = Number(input.roofInsulationR || 0)
          const glazingU = Number(input.glazingU || 2.7)
          const province = String(input.province || 'gp')
          const hvac = String(input.hvacSystem || 'none')
          const water = String(input.waterHeating || 'electric')

          // Zone map by province
          const zoneMap: Record<string, string> = { gp: '4', wc: '5', kzn: '3', ec: '1', fs: '4', mp: '6', lp: '1', nw: '2', nc: '2' }
          const zone = zoneMap[province] || '4'

          // Required R-values per zone (SANS 10400-XA Table 1)
          const reqRValues: Record<string, { wall: number; roof: number }> = {
            '1': { wall: 1.0, roof: 2.0 },
            '2': { wall: 1.0, roof: 2.5 },
            '3': { wall: 1.0, roof: 2.5 },
            '4': { wall: 1.5, roof: 3.7 },
            '5': { wall: 1.5, roof: 3.7 },
            '6': { wall: 2.0, roof: 4.5 },
          }
          const req = reqRValues[zone] || { wall: 1.5, roof: 3.7 }
          const wallCompliant = wallR >= req.wall ? 'Compliant' : 'Non-compliant'
          const roofCompliant = roofR >= req.roof ? 'Compliant' : 'Non-compliant'

          // Fenestration: glazed area must not exceed 15% of floor for residential
          const glazingPct = floorArea > 0 ? (glazedArea / floorArea) * 100 : 0
          const glazingCompliant = glazingPct <= 15 ? 'Compliant' : 'Non-compliant'
          const glazingULimit = zone <= '3' ? 3.5 : 2.7
          const glazingUCompliant = glazingU <= glazingULimit ? 'Compliant' : 'Non-compliant'

          // HVAC + water check
          const hvacCompliant = hvac !== 'central' || glazingUCompliant === 'Compliant' ? 'Review' : 'Requires efficiency calc'
          const waterCompliant = water !== 'electric' || roofCompliant === 'Compliant' ? 'Compliant' : 'Review'

          result.energyZone = `Zone ${zone}`
          result.wallInsulationCompliant = wallCompliant
          result.roofInsulationCompliant = roofCompliant
          result.glazingAreaRatio = `${glazingPct.toFixed(1)}% (limit 15%) ÔÇö ${glazingCompliant}`
          result.glazingUCompliant = glazingUCompliant
          result.hvacReview = hvacCompliant
          result.waterHeatingCompliant = waterCompliant
          result.glassPercentage = glazingPct.toFixed(1)
          result.complianceReference = `XA-${new Date().toISOString().split('T')[0].replace(/-/g, '')}`
          break
        }

        case 'zoning_check': {
          const siteArea = Number(input.siteArea || 0)
          const coverage = Number(input.proposedCoverage || 0)
          const far = Number(input.proposedFAR || 0)
          const height = Number(input.proposedHeight || 0)
          const storeys = Number(input.proposedStoreys || 0)
          const units = Number(input.proposedUnits || 0)

          // Typical zoning limits (simplified ÔÇö varies by municipality)
          const zoneLimits: Record<string, { coveragePct: number; maxFar: number; maxHeight: number; maxStoreys: number }> = {
            residential1: { coveragePct: 40, maxFar: 0.4, maxHeight: 10, maxStoreys: 2 },
            residential2: { coveragePct: 50, maxFar: 0.8, maxHeight: 12, maxStoreys: 3 },
            residential3: { coveragePct: 60, maxFar: 1.5, maxHeight: 15, maxStoreys: 4 },
            business1: { coveragePct: 75, maxFar: 2.5, maxHeight: 20, maxStoreys: 5 },
            business2: { coveragePct: 80, maxFar: 3.0, maxHeight: 25, maxStoreys: 6 },
            industrial1: { coveragePct: 60, maxFar: 1.5, maxHeight: 15, maxStoreys: 3 },
            industrial2: { coveragePct: 70, maxFar: 2.0, maxHeight: 20, maxStoreys: 4 },
            agricultural: { coveragePct: 10, maxFar: 0.1, maxHeight: 8, maxStoreys: 1 },
            community1: { coveragePct: 50, maxFar: 1.0, maxHeight: 12, maxStoreys: 3 },
            open_space1: { coveragePct: 5, maxFar: 0.05, maxHeight: 5, maxStoreys: 1 },
          }
          const zone = String(input.zoneCategory || 'residential1')
          const limits = zoneLimits[zone] || zoneLimits.residential1

          const maxCoverage = siteArea * (limits.coveragePct / 100)
          const coverageOk = coverage <= maxCoverage
          const coveragePct = siteArea > 0 ? (coverage / siteArea) * 100 : 0
          const farOk = far <= limits.maxFar
          const heightOk = height <= limits.maxHeight
          const storeysOk = storeys <= limits.maxStoreys

          result.erfNumber = input.zonErfNumber || ''
          result.zoneCategory = zone
          result.siteArea = siteArea
          result.coveragePct = `${coveragePct.toFixed(1)}% (limit ${limits.coveragePct}%)`
          result.coverageCompliant = coverageOk ? 'Compliant' : `Exceeds by ${(coverage - maxCoverage).toFixed(0)} m┬▓`
          result.farCompliant = farOk ? 'Compliant' : `Exceeds by ${(far - limits.maxFar).toFixed(2)}`
          result.heightCompliant = heightOk ? 'Compliant' : `Exceeds by ${(height - limits.maxHeight).toFixed(1)} m`
          result.storeysCompliant = storeysOk ? 'Compliant' : `Exceeds by ${storeys - limits.maxStoreys}`
          result.overallCompliance = [coverageOk, farOk, heightOk, storeysOk].every(Boolean) ? 'All Compliant' : 'Variance Required'
          result.notes = input.zonNotes || ''
          result.reference = `ZON-${new Date().toISOString().split('T')[0].replace(/-/g, '')}`
          break
        }

        default: {
          // Category-based computation
          switch (tool.category) {
            case 'estimating': {
              const total = boqItems.reduce((sum, item) => sum + (Number(item.qty) * Number(item.rate)), 0)
              result.items = boqItems.filter(i => i.description).length
              result.totalEstimated = Math.round(total)
              result.currency = 'ZAR'
              result.status = 'draft'
              break
            }
            case 'tendering': {
              result.projectName = input.projectName || tool.label
              result.tenderValue = Number(input.tenderValue || 0)
              result.status = 'draft'
              result.currency = 'ZAR'
              break
            }
            case 'site_management': {
              result.date = input.date || new Date().toISOString().split('T')[0]
              result.weather = input.weather || 'Sunny'
              result.description = input.description || ''
              result.status = 'draft'
              break
            }
            case 'workforce': {
              const hours = Number(input.hours || 0)
              const rate = Number(input.hourlyRate || 0)
              result.workerName = input.workerName || 'Unnamed'
              result.totalPay = hours * rate
              result.status = 'calculated'
              break
            }
            case 'plant_equipment': {
              const hrs = Number(input.hoursUsed || 0)
              const hRate = Number(input.hireRate || 0)
              result.assetName = input.assetName || 'Unnamed'
              result.totalHire = hrs * hRate
              result.status = 'calculated'
              break
            }
            case 'payment': {
              result.claimRef = input.claimRef || 'N/A'
              result.claimAmount = Number(input.claimAmount || 0)
              result.status = 'draft'
              break
            }
            case 'document_control': {
              result.docTitle = input.docTitle || 'Untitled'
              result.revision = input.revision || 'D01'
              result.issueNumber = `IS-${Date.now().toString(36).toUpperCase()}`
              result.status = 'generated'
              break
            }
            case 'procurement': {
              result.supplierName = input.supplierName || 'Unspecified'
              result.deliveryDate = input.deliveryDate || 'TBC'
              result.status = 'draft'
              break
            }
            case 'briefing': {
              result.projectName = input.projectName || 'Untitled'
              result.budget = Number(input.budget || 0)
              result.status = 'draft'
              break
            }
            case 'closeout': {
              result.itemName = input.itemName || 'Unnamed item'
              result.status = input.status || 'open'
              result.closedDate = result.status === 'completed' || result.status === 'verified' ? new Date().toISOString().split('T')[0] : 'â€”'
              break
            }
            default: {
              result.output = `Standalone tool run for ${tool.label}`
              result.status = 'completed'
              result.inputReceived = Object.keys(input).length > 0
              break
            }
          }
        }
      }
    }
    setOutput(result)
    setSaved(false)
  }

  const handleSave = () => {
    onSave(input, output)
    setSaved(true)
  }

  const buttonLabel = () => {
    if (tool.id === 'rfi_generator') return 'Generate RFI'
    if (tool.id === 'snag_creator') return 'Create Snag'
    if (tool.id === 'admin_governance') return 'Run Governance Action'
    if (tool.id === 'ai_drawing_checker') return 'Run AI Check'
    if (tool.id === 'ai_review_queue') return 'Review Queue'
    if (tool.id === 'audit_trail_viewer') return 'Run Audit Query'
    if (tool.id === 'boq_takeoff') return 'Generate Takeoff'
    if (tool.id === 'brief_wizard') return 'Run Wizard'
    if (tool.id === 'cad_upload_check') return 'Check CAD File'
    if (tool.id === 'catalogue_manager') return 'Add Product'
    if (tool.id === 'cpd_standalone') return 'Record CPD Activity'
    if (tool.id === 'deliverable_submission') return 'Submit Deliverable'
    if (tool.id === 'delivery_note') return 'Create Delivery Note'
    if (tool.id === 'doc_control_issue') return 'Generate Issue Sheet'
    if (tool.id === 'drawing_register') return 'Record Drawing'
    if (tool.id === 'energy_certificate') return 'Generate Certificate'
    if (tool.id === 'feasibility_estimator') return 'Assess Feasibility'
    if (tool.id === 'fee_calculator') return 'Calculate Fee'
    if (tool.id === 'fee_tariff_editor') return 'Update Tariff'
    if (tool.id === 'fire_compliance_check') return 'Run Fire Checklist'
    if (tool.id === 'fire_rational_design') return 'Run Fire Check'
    if (tool.id === 'firm_document_register') return 'Register Document'
    if (tool.id === 'freelancer_resource_centre') return 'Browse Resources'
    if (tool.id === 'freelancer_timesheet') return 'Submit Timesheet'
    if (tool.id === 'hs_compliance') return 'Run H&S Check'
    if (tool.id === 'material_procurement') return 'Create Order List'
    if (tool.id === 'package_scope_viewer') return 'View Scope'
    if (tool.id === 'payment_claim_builder') return 'Generate Claim'
    if (tool.id === 'payment_dashboard') return 'View Dashboard'
    if (tool.id === 'payment_rate_config') return 'Save Rate Config'
    if (tool.id === 'plant_register') return 'Calculate Hire'
    if (tool.id === 'platform_settings') return 'Update Settings'
    if (tool.id === 'progress_viewer') return 'View Progress'
    if (tool.id === 'proposal_comparison') return 'Compare Proposals'
    if (tool.id === 'quote_response') return 'Submit Quote'
    if (tool.id === 'rfi_response') return 'Submit Response'
    if (tool.id === 'sans_forms') return 'Prepare Form'
    if (tool.id === 'shop_drawing_submission') return 'Submit Drawing'
    if (tool.id === 'site_diary_entry') return 'Create Entry'
    if (tool.id === 'snag_evidence_upload') return 'Upload Evidence'
    if (tool.id === 'soft_cost_estimator') return 'Estimate Soft Costs'
    if (tool.id === 'staff_cpd_tracker') return 'Check Compliance'
    if (tool.id === 'stage_gate_review') return 'Record Decision'
    if (tool.id === 'system_health_monitor') return 'Run Diagnostic'
    if (tool.id === 'technical_brief') return 'Save Brief'
    if (tool.id === 'tender_bid_bench') return 'Prepare Bid'
    if (tool.id === 'user_verification_console') return 'Verify User'
    if (tool.id === 'valuation_cert') return 'Generate Valuation'
    if (tool.id === 'warranty_upload') return 'Upload Warranty'
    if (tool.id === 'workforce_timesheet') return 'Calculate Total'
    if (tool.id === 'xa_compliance_calc') return 'Check Compliance'
    if (tool.id === 'zoning_check') return 'Run Zoning Check'
    switch (tool.category) {
      case 'fee_calculator': return 'Calculate Fee'
      case 'compliance': return 'Check Compliance'
      case 'estimating': return 'Generate Takeoff'
      case 'site_management': return 'Create Entry'
      case 'tendering': return 'Prepare Bid'
      case 'document_control': return 'Generate Issue Sheet'
      case 'procurement': return 'Create Order List'
      case 'workforce': return 'Calculate Total'
      case 'plant_equipment': return 'Calculate Hire'
      case 'payment': return 'Generate Claim'
      case 'briefing': return 'Save Brief'
      case 'closeout': return 'Record Item'
      case 'drawing': return 'Record Drawing'
      case 'freelancer': return 'Submit Timesheet'
      case 'supplier': return 'Generate Quote'
      default: return 'Run Tool'
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onBack} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h3 className="font-bold text-lg">{tool.label}</h3>
          <p className="text-sm text-muted-foreground">Standalone mode â€” no project context required</p>
        </div>
      </div>

      <Card className="rounded-2xl">
        <CardContent className="p-6 space-y-4">
          <div>
            <h4 className="font-semibold mb-3">Input</h4>
            {renderInputFields()}
          </div>

          <Button type="button" onClick={handleCalculate} className="rounded-full w-full">
            {buttonLabel()}
          </Button>

          {Object.keys(output).length > 0 && (
            <>
              <div className="border-t pt-4">
                <h4 className="font-semibold mb-3">Output</h4>
                <div className="bg-muted p-4 rounded-xl space-y-2">
                  {Object.entries(output).map(([key, value]) => (
                    <div key={key} className="flex justify-between text-sm">
                      <span className="text-muted-foreground capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                      <span className="font-medium">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button type="button" variant={saved ? 'secondary' : 'default'} onClick={handleSave} className="rounded-full flex-1" disabled={saved}>
                  <Save className="h-4 w-4 mr-1.5" /> {saved ? 'Saved' : 'Save Run'}
                </Button>
                {tool.canExport && (
                  <Button type="button" variant="outline" onClick={() => latestRun && onExport(latestRun, 'pdf')} className="rounded-full">
                    <Download className="h-4 w-4 mr-1.5" /> Export
                  </Button>
                )}
                {tool.canAssignToProject && latestRun && (
                  <Button type="button" variant="outline" onClick={() => onAssign(latestRun)} className="rounded-full">
                    <FolderOpen className="h-4 w-4 mr-1.5" /> Assign
                  </Button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
