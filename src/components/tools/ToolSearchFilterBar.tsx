// Tool Search & Filter Bar
import React, { useState, useCallback } from 'react'
import { Search, X } from 'lucide-react'
import type { StandaloneToolCategory } from '@/types/standaloneToolTypes'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

const CATEGORY_LABELS: Record<StandaloneToolCategory, string> = {
  fee_calculator: 'Fee Calc',
  compliance: 'Compliance',
  drawing: 'Drawing',
  document_control: 'Document Control',
  briefing: 'Briefing',
  proposal: 'Proposal',
  tendering: 'Tendering',
  estimating: 'Estimating',
  site_management: 'Site',
  workforce: 'Workforce',
  plant_equipment: 'Plant',
  procurement: 'Procurement',
  supplier: 'Supplier',
  payment: 'Payment',
  closeout: 'Closeout',
  admin_governance: 'Admin',
  cpd: 'CPD',
  communication: 'Communication',
  freelancer: 'Freelancer',
  resource_centre: 'Resources',
  general: 'General',
}

interface ToolSearchFilterBarProps {
  onSearchChange: (query: string) => void
  onCategoryFilter: (category: string | null) => void
  activeCategory: string | null
  availableCategories: string[]
}

export default function ToolSearchFilterBar({ onSearchChange, onCategoryFilter, activeCategory, availableCategories }: ToolSearchFilterBarProps) {
  const [query, setQuery] = useState('')

  const handleSearch = useCallback((value: string) => {
    setQuery(value)
    onSearchChange(value)
  }, [onSearchChange])

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search tools by name, description, or keyword..."
          value={query}
          onChange={e => handleSearch(e.target.value)}
          className="pl-10 pr-8 rounded-2xl"
        />
        {query && (
          <button
            type="button"
            onClick={() => handleSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge
          variant={activeCategory === null ? 'default' : 'outline'}
          className="cursor-pointer rounded-full"
          onClick={() => onCategoryFilter(null)}
        >
          All
        </Badge>
        {availableCategories.map(cat => (
          <Badge
            key={cat}
            variant={activeCategory === cat ? 'default' : 'outline'}
            className="cursor-pointer rounded-full capitalize"
            onClick={() => onCategoryFilter(activeCategory === cat ? null : cat)}
          >
            {CATEGORY_LABELS[cat as StandaloneToolCategory] ?? cat}
          </Badge>
        ))}
      </div>
    </div>
  )
}
