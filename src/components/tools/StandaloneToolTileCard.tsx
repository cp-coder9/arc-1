// Standalone Tool Tile Card
import React from 'react'
import { ExternalLink, Clock, FolderOpen, Calculator as CalcIcon, Ruler, FileText, FileArchive, Search, Wrench, Users, Clock as ClockIcon, CreditCard, Shield, FileUp, Send, BookOpen, Settings2, History, Bot, DollarSign, Table, Package, Truck, Camera, Book, Reply, ClipboardList, MessageSquare, Briefcase, ClipboardCheck, Receipt, Scale, Thermometer, ScanSearch, FileEdit, Upload, FileInput, Library, type LucideIcon } from 'lucide-react'
import type { StandaloneToolDef, StandaloneToolCategory } from '@/types/standaloneToolTypes'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const ICON_MAP: Record<string, LucideIcon> = {
  Calculator: CalcIcon, Ruler, FileText, FileArchive, Search, Wrench, Users, Clock: ClockIcon,
  CreditCard, Shield, FileUp, Send, BookOpen, Settings2, History, Bot, DollarSign, Table,
  Package, Truck, Camera, Book, Reply, ClipboardList, MessageSquare, Briefcase, ClipboardCheck,
  Receipt, Scale, Thermometer, ScanSearch, FileEdit, Upload, FileInput, Library, ExternalLink,
}

const CATEGORY_COLORS: Record<StandaloneToolCategory, string> = {
  fee_calculator: 'bg-green-100 text-green-800',
  compliance: 'bg-blue-100 text-blue-800',
  drawing: 'bg-purple-100 text-purple-800',
  document_control: 'bg-cyan-100 text-cyan-800',
  briefing: 'bg-indigo-100 text-indigo-800',
  proposal: 'bg-violet-100 text-violet-800',
  tendering: 'bg-orange-100 text-orange-800',
  estimating: 'bg-amber-100 text-amber-800',
  site_management: 'bg-yellow-100 text-yellow-800',
  workforce: 'bg-pink-100 text-pink-800',
  plant_equipment: 'bg-rose-100 text-rose-800',
  procurement: 'bg-lime-100 text-lime-800',
  supplier: 'bg-teal-100 text-teal-800',
  payment: 'bg-emerald-100 text-emerald-800',
  closeout: 'bg-stone-100 text-stone-800',
  admin_governance: 'bg-slate-100 text-slate-800',
  cpd: 'bg-sky-100 text-sky-800',
  communication: 'bg-fuchsia-100 text-fuchsia-800',
  freelancer: 'bg-magenta-100 text-magenta-800',
  resource_centre: 'bg-gray-100 text-gray-800',
  construction_admin: 'bg-orange-100 text-orange-800',
  general: 'bg-neutral-100 text-neutral-800',
}

interface StandaloneToolTileCardProps {
  tool: StandaloneToolDef
  onOpen: (tool: StandaloneToolDef) => void
  onAssign: (tool: StandaloneToolDef) => void
  recentRuns: number
}

export default function StandaloneToolTileCard({ tool, onOpen, onAssign, recentRuns }: StandaloneToolTileCardProps) {
  const IconComponent = ICON_MAP[tool.icon] ?? ExternalLink

  return (
    <Card className="rounded-2xl border-border hover:shadow-md hover:border-primary/30 transition-all duration-200" data-testid={`standalone-tool-tile-${tool.id}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <IconComponent className="h-5 w-5" />
            </div>
            <Badge variant="outline" className={`rounded-full text-xs capitalize ${CATEGORY_COLORS[tool.category] ?? 'bg-gray-100'}`}>
              {tool.category.replace(/_/g, ' ')}
            </Badge>
          </div>
          {recentRuns > 0 && (
            <Badge variant="secondary" className="rounded-full text-xs gap-1">
              <Clock className="h-3 w-3" /> {recentRuns}
            </Badge>
          )}
        </div>
        <CardTitle className="text-base font-bold mt-3">{tool.label}</CardTitle>
        <CardDescription className="text-sm mt-1 line-clamp-2">{tool.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2 mb-3">
          {tool.tags.slice(0, 3).map(tag => (
            <span key={tag} className="text-[10px] uppercase tracking-wider text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              {tag}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-2">
          <Button type="button" size="sm" className="rounded-full flex-1" onClick={() => onOpen(tool)}>
            <CalcIcon className="h-4 w-4 mr-1.5" /> Use standalone
          </Button>
          {tool.canAssignToProject && (
            <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => onAssign(tool)} title="Assign to external project">
              <FolderOpen className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
