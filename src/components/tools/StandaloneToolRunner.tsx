// Standalone Tool Runner — Opens a standalone tool instance
// This is the container that wraps any individual tool component for standalone use.
import React, { useState } from 'react'
import { ArrowLeft, Save, Download, FolderOpen } from 'lucide-react'
import type { StandaloneToolDef, StandaloneToolRun } from '@/types/standaloneToolTypes'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface StandaloneToolRunnerProps {
  tool: StandaloneToolDef
  onBack: () => void
  onSave: (input: Record<string, unknown>, output: Record<string, unknown>) => void
  onAssign: (run: StandaloneToolRun) => void
  onExport: (run: StandaloneToolRun, format: 'pdf' | 'csv' | 'json') => void
  latestRun: StandaloneToolRun | null
}

export default function StandaloneToolRunner({ tool, onBack, onSave, onAssign, onExport, latestRun }: StandaloneToolRunnerProps) {
  const [input, setInput] = useState<Record<string, unknown>>({})
  const [output, setOutput] = useState<Record<string, unknown>>({})
  const [saved, setSaved] = useState(false)

  // Tool-specific input fields — generated from tool.id
  const renderInputFields = () => {
    switch (tool.id) {
      case 'fee_calculator':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Construction Value (R)</label>
              <input type="number" className="w-full rounded-xl border p-2 mt-1" placeholder="e.g. 2500000" onChange={e => setInput({ ...input, constructionValue: Number(e.target.value) })} />
            </div>
            <div>
              <label className="text-sm font-medium">Project Type</label>
              <select className="w-full rounded-xl border p-2 mt-1" onChange={e => setInput({ ...input, projectType: e.target.value })}>
                <option value="">Select...</option>
                <option value="residential">Residential</option>
                <option value="commercial">Commercial</option>
                <option value="industrial">Industrial</option>
                <option value="renovation">Renovation</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Professional Category</label>
              <select className="w-full rounded-xl border p-2 mt-1" onChange={e => setInput({ ...input, category: e.target.value })}>
                <option value="">Select...</option>
                <option value="architect">Architect (SACAP)</option>
                <option value="engineer">Engineer (ECSA)</option>
                <option value="qs">Quantity Surveyor (SACQSP)</option>
                <option value="planner">Town Planner (SACPLAN)</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Complexity Factor</label>
              <select className="w-full rounded-xl border p-2 mt-1" onChange={e => setInput({ ...input, complexity: e.target.value })}>
                <option value="1.0">Simple (1.0)</option>
                <option value="1.25">Moderate (1.25)</option>
                <option value="1.5">Complex (1.5)</option>
                <option value="2.0">Very Complex (2.0)</option>
              </select>
            </div>
          </div>
        )
      case 'fenestration_calc':
        return (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium">Room Name</label>
              <input type="text" className="w-full rounded-xl border p-2 mt-1" placeholder="e.g. Living Room" onChange={e => setInput({ ...input, roomName: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium">Floor Area (m²)</label>
              <input type="number" className="w-full rounded-xl border p-2 mt-1" placeholder="e.g. 36" onChange={e => setInput({ ...input, floorArea: Number(e.target.value) })} />
            </div>
            <div>
              <label className="text-sm font-medium">Room Use</label>
              <select className="w-full rounded-xl border p-2 mt-1" onChange={e => setInput({ ...input, roomUse: e.target.value })}>
                <option value="habitable">Habitable (5% vent, 10% light)</option>
                <option value="bathroom">Bathroom (5% vent)</option>
                <option value="kitchen">Kitchen (5% vent)</option>
                <option value="garage">Garage (2.5% vent)</option>
              </select>
            </div>
          </div>
        )
      case 'boq_takeoff':
        return (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Enter line items for your bill of quantities. Each item has quantity, unit, rate, and total.</p>
            <div className="grid grid-cols-4 gap-3 text-sm font-medium text-muted-foreground border-b pb-2">
              <span>Item Description</span>
              <span>Qty</span>
              <span>Unit</span>
              <span>Rate (R)</span>
            </div>
            {[1, 2, 3].map(i => (
              <div key={i} className="grid grid-cols-4 gap-3">
                <input type="text" className="rounded-xl border p-2 text-sm" placeholder={`Item ${i}`} />
                <input type="number" className="rounded-xl border p-2 text-sm" placeholder="0" />
                <select className="rounded-xl border p-2 text-sm">
                  <option>m²</option>
                  <option>m³</option>
                  <option>lm</option>
                  <option>nr</option>
                  <option>hr</option>
                </select>
                <input type="number" className="rounded-xl border p-2 text-sm" placeholder="0.00" />
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" className="rounded-full mt-2">+ Add item</Button>
          </div>
        )
      case 'site_diary_entry':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Date</label>
                <input type="date" className="w-full rounded-xl border p-2 mt-1" onChange={e => setInput({ ...input, date: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Weather</label>
                <select className="w-full rounded-xl border p-2 mt-1" onChange={e => setInput({ ...input, weather: e.target.value })}>
                  <option>Sunny</option>
                  <option>Cloudy</option>
                  <option>Rain</option>
                  <option>Windy</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Work Description</label>
              <textarea className="w-full rounded-xl border p-2 mt-1" rows={3} placeholder="Describe today's activities..." onChange={e => setInput({ ...input, workDescription: e.target.value })} />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div><label className="text-sm font-medium">Labour (count)</label><input type="number" className="w-full rounded-xl border p-2 mt-1" placeholder="0" /></div>
              <div><label className="text-sm font-medium">Plant (count)</label><input type="number" className="w-full rounded-xl border p-2 mt-1" placeholder="0" /></div>
              <div><label className="text-sm font-medium">Deliveries</label><input type="number" className="w-full rounded-xl border p-2 mt-1" placeholder="0" /></div>
            </div>
          </div>
        )
      default:
        return (
          <div className="text-sm text-muted-foreground text-center py-6">
            <p>Standalone tool: {tool.label}</p>
            <p className="mt-2">Enter parameters and click Calculate/Generate to produce output.</p>
            <textarea
              className="w-full rounded-xl border p-2 mt-4"
              rows={4}
              placeholder="Enter input data for this tool..."
              onChange={e => setInput({ ...input, freeformInput: e.target.value })}
            />
          </div>
        )
    }
  }

  const handleCalculate = () => {
    // Simulate calculation based on tool type
    const result: Record<string, unknown> = {}
    switch (tool.id) {
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
      case 'fenestration_calc': {
        const fa = Number(input.floorArea || 0)
        result.requiredVentilation = Math.round(fa * 0.05 * 100) / 100
        result.requiredLighting = Math.round(fa * 0.10 * 100) / 100
        result.roomName = input.roomName || 'Unnamed'
        result.compliant = fa > 0
        break
      }
      case 'boq_takeoff': {
        result.items = 3
        result.totalEstimated = 0
        result.currency = 'ZAR'
        result.status = 'draft'
        break
      }
      case 'site_diary_entry': {
        result.date = input.date || new Date().toISOString().split('T')[0]
        result.weather = input.weather || 'Sunny'
        result.workDescription = input.workDescription || ''
        result.status = 'draft'
        break
      }
      default: {
        result.output = `Standalone tool run for ${tool.label}`
        result.status = 'completed'
        result.inputReceived = Object.keys(input).length > 0
        break
      }
    }
    setOutput(result)
    setSaved(false)
  }

  const handleSave = () => {
    onSave(input, output)
    setSaved(true)
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
            {tool.category === 'fee_calculator' ? 'Calculate Fee' : 
             tool.category === 'compliance' ? 'Check Compliance' : 
             tool.category === 'estimating' ? 'Generate Takeoff' : 
             tool.category === 'site_management' ? 'Create Entry' :
             tool.category === 'tendering' ? 'Prepare Bid' :
             'Run Tool'}
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
