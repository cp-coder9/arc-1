// Standalone Tool Run History
import React from 'react'
import { Clock, FolderOpen, Download, ExternalLink } from 'lucide-react'
import type { StandaloneToolRun } from '@/types/standaloneToolTypes'
import { Badge } from '@/components/ui/badge'

interface StandaloneToolRunHistoryProps {
  runs: StandaloneToolRun[]
  onExport: (run: StandaloneToolRun) => void
}

export default function StandaloneToolRunHistory({ runs, onExport }: StandaloneToolRunHistoryProps) {
  if (runs.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-8">
        <Clock className="h-8 w-8 mx-auto mb-2 opacity-40" />
        <p>No standalone tool runs yet. Open a tool to create one.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Recent runs</h4>
      {runs.slice(0, 5).map(run => (
        <div key={run.runId} className="flex items-center justify-between p-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium truncate">{run.toolLabel}</span>
              {run.assignedToProject && (
                <Badge variant="outline" className="rounded-full text-[10px] gap-1">
                  <FolderOpen className="h-3 w-3" /> {run.assignedToProject}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
              <span>{new Date(run.createdAt).toLocaleDateString()}</span>
              {run.assignedToJobRef && <span>Ref: {run.assignedToJobRef}</span>}
              {run.exportedAt && <Badge variant="secondary" className="rounded-full text-[10px]">Exported</Badge>}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0 ml-2">
            {run.exportedAt ? (
              <Badge variant="outline" className="rounded-full text-xs gap-1">
                <Download className="h-3 w-3" /> {run.exportFormat?.toUpperCase()}
              </Badge>
            ) : (
              <button
                type="button"
                onClick={() => onExport(run)}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <Download className="h-3 w-3" /> Export
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
