// Standalone Tool Tiles Page — Screen 2 of the Toolbox Toggle
// Shows ALL tools for the user's role as hyperlinked tiles.
// Tools are usable independently of any project/phase/workflow.
import React, { useState, useMemo } from 'react'
import { Grid3X3, Workflow, Sparkles, ExternalLink } from 'lucide-react'
import type { UserProfile } from '@/types'
import type { StandaloneToolDef, StandaloneToolRun } from '@/types/standaloneToolTypes'
import { getToolsForRole, searchTools } from '@/services/tools/standaloneToolRegistry'
import { standaloneToolRunService } from '@/services/tools/standaloneToolRunService'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import ToolSearchFilterBar from './ToolSearchFilterBar'
import StandaloneToolTileCard from './StandaloneToolTileCard'
import StandaloneToolRunner from './StandaloneToolRunner'
import AssignToProjectDialog from './AssignToProjectDialog'
import StandaloneToolRunHistory from './StandaloneToolRunHistory'

interface StandaloneToolTilesPageProps {
  user: UserProfile
  onNavigate: (pageId: string) => void
  mode: 'tiles' | 'workflow'
  onModeChange: (mode: 'tiles' | 'workflow') => void
}

export default function StandaloneToolTilesPage({ user, onNavigate, mode, onModeChange }: StandaloneToolTilesPageProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [activeTool, setActiveTool] = useState<StandaloneToolDef | null>(null)
  const [assignTarget, setAssignTarget] = useState<StandaloneToolDef | null>(null)
  const [runs, setRuns] = useState<StandaloneToolRun[]>(() => standaloneToolRunService.getRunsForUser(user.uid ?? 'unknown'))

  const allTools = useMemo(() => getToolsForRole(user.role), [user.role])
  const filteredTools = useMemo(() => {
    let tools = searchQuery ? searchTools(searchQuery, user.role) : allTools
    if (activeCategory) {
      tools = tools.filter(t => t.category === activeCategory)
    }
    return tools
  }, [searchQuery, activeCategory, allTools, user.role])

  const availableCategories = useMemo(() =>
    [...new Set(allTools.map(t => t.category))].sort(),
    [allTools]
  )

  const handleOpenTool = (tool: StandaloneToolDef) => {
    setActiveTool(tool)
  }

  const handleBackFromTool = () => {
    setActiveTool(null)
    setRuns(standaloneToolRunService.getRunsForUser(user.uid ?? 'unknown'))
  }

  const handleSaveRun = (input: Record<string, unknown>, output: Record<string, unknown>) => {
    if (!activeTool) return
    const run = standaloneToolRunService.createRun({
      userId: user.uid ?? 'unknown',
      role: user.role,
      toolId: activeTool.id,
      toolLabel: activeTool.label,
      category: activeTool.category,
      input,
      output,
    })
    setRuns(prev => [run, ...prev])
  }

  const handleAssign = (tool: StandaloneToolDef) => {
    setAssignTarget(tool)
  }

  const handleAssignSubmit = (projectName: string, jobRef: string, notes: string) => {
    if (!assignTarget) return
    const latestRuns = standaloneToolRunService.getRunsForTool(assignTarget.id, user.uid ?? 'unknown')
    if (latestRuns.length > 0) {
      standaloneToolRunService.assignToProject(latestRuns[0].runId, { runId: latestRuns[0].runId, projectName, jobRef, notes })
      setRuns(standaloneToolRunService.getRunsForUser(user.uid ?? 'unknown'))
    }
    setAssignTarget(null)
  }

  const handleExport = (run: StandaloneToolRun) => {
    standaloneToolRunService.markExported(run.runId, 'pdf')
    setRuns(standaloneToolRunService.getRunsForUser(user.uid ?? 'unknown'))
  }

  const getRecentRunCount = (toolId: string): number => {
    return standaloneToolRunService.getRecentRunCount(toolId, user.uid ?? 'unknown')
  }

  // If a tool is active, show the runner
  if (activeTool) {
    const latestRuns = standaloneToolRunService.getRunsForTool(activeTool.id, user.uid ?? 'unknown')
    return (
      <StandaloneToolRunner
        tool={activeTool}
        onBack={handleBackFromTool}
        onSave={handleSaveRun}
        onAssign={(run) => setAssignTarget(activeTool)}
        onExport={handleExport}
        latestRun={latestRuns[0] ?? null}
      />
    )
  }

  return (
    <div className="space-y-6" data-testid="standalone-tool-tiles-page">
      {/* Header with mode toggle */}
      <div className="flex items-center justify-between">
        <div>
          <Badge variant="secondary" className="uppercase tracking-widest">Standalone Tool Tiles</Badge>
          <h2 className="font-heading text-2xl font-bold mt-2 flex items-center gap-2">
            <Grid3X3 className="h-6 w-6 text-primary" />
            All Tools for {user.role === 'bep' ? 'BEP / Professional' : user.role.charAt(0).toUpperCase() + user.role.slice(1)}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {filteredTools.length} tool{filteredTools.length !== 1 ? 's' : ''} available — all usable independently of any project
          </p>
        </div>
        <Tabs value={mode} onValueChange={(v) => onModeChange(v as 'tiles' | 'workflow')} className="shrink-0">
          <TabsList className="rounded-full">
            <TabsTrigger value="workflow" className="rounded-full gap-1.5">
              <Workflow className="h-4 w-4" /> AI-guided
            </TabsTrigger>
            <TabsTrigger value="tiles" className="rounded-full gap-1.5">
              <Grid3X3 className="h-4 w-4" /> All tools
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Info banner */}
      <Card className="rounded-2xl bg-primary/5 border-primary/20">
        <CardContent className="p-4 text-sm">
          <div className="flex items-start gap-2">
            <Sparkles className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <p className="text-muted-foreground">
              <strong>Standalone mode.</strong> Every tool here works without an active project, job, or workflow phase.
              Run calculations, generate documents, create entries — then assign the output to any project
              (including external jobs not on Architex) or export as PDF/CSV.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Search and filter */}
      <ToolSearchFilterBar
        onSearchChange={setSearchQuery}
        onCategoryFilter={setActiveCategory}
        activeCategory={activeCategory}
        availableCategories={availableCategories}
      />

      {/* Tool tiles grid */}
      {filteredTools.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <ExternalLink className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No tools match your search</p>
          <p className="text-sm mt-1">Try different keywords or clear filters</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredTools.map(tool => (
            <React.Fragment key={tool.id}>
            <StandaloneToolTileCard
              tool={tool}
              onOpen={handleOpenTool}
              onAssign={handleAssign}
              recentRuns={getRecentRunCount(tool.id)}
            />
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Run history */}
      <StandaloneToolRunHistory
        runs={runs}
        onExport={handleExport}
      />

      {/* Assign-to-project dialog */}
      {assignTarget && (
        <AssignToProjectDialog
          tool={assignTarget}
          latestRun={standaloneToolRunService.getRunsForTool(assignTarget.id, user.uid ?? 'unknown')[0] ?? null}
          onAssign={handleAssignSubmit}
          onClose={() => setAssignTarget(null)}
        />
      )}
    </div>
  )
}
