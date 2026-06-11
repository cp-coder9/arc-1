// Assign To Project Dialog
import React, { useState } from 'react'
import { FolderOpen, X } from 'lucide-react'
import type { StandaloneToolDef, StandaloneToolRun } from '@/types/standaloneToolTypes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

interface AssignToProjectDialogProps {
  tool: StandaloneToolDef
  latestRun: StandaloneToolRun | null
  onAssign: (projectName: string, jobRef: string, notes: string) => void
  onClose: () => void
}

export default function AssignToProjectDialog({ tool, latestRun, onAssign, onClose }: AssignToProjectDialogProps) {
  const [projectName, setProjectName] = useState('')
  const [jobRef, setJobRef] = useState('')
  const [notes, setNotes] = useState('')
  const [assigning, setAssigning] = useState(false)

  const handleAssign = async () => {
    if (!projectName.trim()) return
    setAssigning(true)
    onAssign(projectName.trim(), jobRef.trim(), notes.trim())
    setAssigning(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-primary" />
            <h3 className="font-bold text-lg">Assign to Project</h3>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="text-sm text-muted-foreground bg-muted p-3 rounded-xl">
          <p className="font-medium text-foreground">{tool.label}</p>
          <p className="mt-1">Assign the tool output to a project. This can be an <strong>external project</strong> outside of Architex — just enter your own reference.</p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium">Project Name</label>
            <Input
              type="text"
              placeholder="e.g. Parkview House Alterations (external)"
              value={projectName}
              onChange={e => setProjectName(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Job / Reference Number</label>
            <Input
              type="text"
              placeholder="e.g. EXT-2026-042 (optional)"
              value={jobRef}
              onChange={e => setJobRef(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Notes</label>
            <Textarea
              placeholder="Optional notes about this assignment"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              className="mt-1"
            />
          </div>
        </div>

        {latestRun && (
          <div className="text-xs text-muted-foreground bg-muted p-2 rounded-lg">
            Latest run: {new Date(latestRun.createdAt).toLocaleDateString()}
            {latestRun.output && Object.keys(latestRun.output).length > 0 && ` — ${Object.keys(latestRun.output).length} output fields`}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} className="rounded-full flex-1">Cancel</Button>
          <Button type="button" onClick={handleAssign} disabled={!projectName.trim() || assigning} className="rounded-full flex-1">
            <FolderOpen className="h-4 w-4 mr-1.5" /> Assign
          </Button>
        </div>
      </div>
    </div>
  )
}
