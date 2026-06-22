// Standalone Tool Runner — Opens a standalone tool instance
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
  const [boqItems, setBoqItems] = useState<BoQItem[]>([{ description: '', qty: '', unit: 'm²', rate: '' }])

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
            <FormField label="Location / Area" type="text" value={String(input.location ?? '')} onChange={v => set('location', v)} placeholder="e.g. Bedroom 2 — North Wall" />
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
              <FormField label="Energy Zone" type="select" value={String(input.energyZone ?? '')} onChange={v => set('energyZone', v)} options={[{ value: '1', label: 'Zone 1 — Hot interior' }, { value: '2', label: 'Zone 2 — Hot, moderate dry' }, { value: '3', label: 'Zone 3 — Moderate dry' }, { value: '4', label: 'Zone 4 — Moderate coastal' }, { value: '5', label: 'Zone 5 — Cool highveld' }, { value: '6', label: 'Zone 6 — Cold interior' }]} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField label="Wall Area (m²)" type="number" value={String(input.wallAreaM2 ?? '')} onChange={v => set('wallAreaM2', Number(v))} placeholder="e.g. 24" />
              <FormField label="Glazed Area (m²)" type="number" value={String(input.glazedAreaM2 ?? '')} onChange={v => set('glazedAreaM2', Number(v))} placeholder="e.g. 6" />
            </div>
            <details className="text-sm text-muted-foreground">
              <summary className="cursor-pointer font-medium">Optional — advanced glazing specs</summary>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
                <FormField label="Average U-Value (W/m²K)" type="number" value={String(input.averageUValue ?? '')} onChange={v => set('averageUValue', Number(v))} placeholder="e.g. 2.0" />
                <FormField label="Average SHGC" type="number" value={String(input.averageSHGC ?? '')} onChange={v => set('averageSHGC', Number(v))} placeholder="e.g. 0.69" />
                <FormField label="Shading Factor" type="number" value={String(input.shadingFactor ?? '')} onChange={v => set('shadingFactor', Number(v))} placeholder="e.g. 1.0" />
              </div>
            </details>
          </div>
        ) : tool.id === 'rvalue_calc' || tool.id === 'xa_rvalue_check' ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">R-value / thermal resistance check per SANS 10400-XA. Enter assembly name, zone, and layer build-up.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField label="Assembly Name" type="text" value={String(input.assembly ?? '')} onChange={v => set('assembly', v)} placeholder="e.g. Roof — tile + insulation" />
              <FormField label="Energy Zone" type="select" value={String(input.energyZone ?? '')} onChange={v => set('energyZone', v)} options={[{ value: '1', label: 'Zone 1' }, { value: '2', label: 'Zone 2' }, { value: '3', label: 'Zone 3' }, { value: '4', label: 'Zone 4' }, { value: '5', label: 'Zone 5' }, { value: '6', label: 'Zone 6' }]} />
              <FormField label="Required R-Value" type="number" value={String(input.requiredRValue ?? '')} onChange={v => set('requiredRValue', Number(v))} placeholder="e.g. 3.7" />
            </div>
            <p className="text-xs text-muted-foreground mt-2">Use manufacturer R-values. The calculator sums all layer R-values and reports the shortfall.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Element Name" type="text" value={String(input.elementName ?? '')} onChange={v => set('elementName', v)} placeholder="e.g. Living Room Wall" />
            <FormField label="Area (m²)" type="number" value={String(input.area ?? '')} onChange={v => set('area', Number(v))} placeholder="e.g. 36" />
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
                  <option>m²</option><option>m³</option><option>lm</option><option>nr</option><option>hr</option>
                </select>
                <input type="number" className="rounded-xl border p-2 text-sm" placeholder="0.00" value={item.rate} onChange={e => { const items = [...boqItems]; items[i].rate = e.target.value; setBoqItems(items); set(`item${i}Rate`, Number(e.target.value)) }} />
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" className="rounded-full mt-2" onClick={() => setBoqItems([...boqItems, { description: '', qty: '', unit: 'm²', rate: '' }])}>
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

    // Fenestration enrichment — always add ventilation/lighting/ratio for fenestration tools
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
              result.closedDate = result.status === 'completed' || result.status === 'verified' ? new Date().toISOString().split('T')[0] : '—'
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
          <p className="text-sm text-muted-foreground">Standalone mode — no project context required</p>
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
