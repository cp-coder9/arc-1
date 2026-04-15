/**
 * Search and Filter Component
 * For marketplace job filtering
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { 
  Search, 
  Filter, 
  X, 
  MapPin, 
  Calendar,
  IndianRupee,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { JobCategory } from '@/types';

export interface SearchFilters {
  query: string;
  category: JobCategory | '';
  minBudget: number;
  maxBudget: number;
  location: string;
  deadlineWithin: number;
  postedWithin: number;
  sortBy: 'budget_asc' | 'budget_desc' | 'deadline' | 'posted' | 'relevance';
}

const CATEGORIES: { value: JobCategory; label: string }[] = [
  { value: 'Residential', label: 'Residential' },
  { value: 'Commercial', label: 'Commercial' },
  { value: 'Industrial', label: 'Industrial' },
  { value: 'Renovation', label: 'Renovation' },
  { value: 'Interior', label: 'Interior' },
  { value: 'Landscape', label: 'Landscape' },
];

const DEADLINE_OPTIONS = [
  { value: 0, label: 'Any' },
  { value: 7, label: 'Within 7 days' },
  { value: 30, label: 'Within 30 days' },
  { value: 90, label: 'Within 3 months' },
];

const POSTED_OPTIONS = [
  { value: 0, label: 'Any time' },
  { value: 1, label: 'Last 24 hours' },
  { value: 7, label: 'Last 7 days' },
  { value: 30, label: 'Last 30 days' },
];

const SORT_OPTIONS = [
  { value: 'posted', label: 'Recently Posted' },
  { value: 'budget_desc', label: 'Budget: High to Low' },
  { value: 'budget_asc', label: 'Budget: Low to High' },
  { value: 'deadline', label: 'Deadline (Soonest)' },
];

interface SearchFilterProps {
  filters: SearchFilters;
  onFiltersChange: (filters: SearchFilters) => void;
  totalResults: number;
  isMobile?: boolean;
}

export function SearchFilter({ 
  filters, 
  onFiltersChange, 
  totalResults,
  isMobile = false 
}: SearchFilterProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [localFilters, setLocalFilters] = useState(filters);
  const [budgetRange, setBudgetRange] = useState([filters.minBudget, filters.maxBudget]);

  useEffect(() => {
    setLocalFilters(filters);
    setBudgetRange([filters.minBudget, filters.maxBudget]);
  }, [filters]);

  const handleSearch = useCallback(() => {
    onFiltersChange({
      ...localFilters,
      minBudget: budgetRange[0],
      maxBudget: budgetRange[1],
    });
  }, [localFilters, budgetRange, onFiltersChange]);

  const handleReset = () => {
    const resetFilters: SearchFilters = {
      query: '',
      category: '',
      minBudget: 0,
      maxBudget: 10000000,
      location: '',
      deadlineWithin: 0,
      postedWithin: 0,
      sortBy: 'posted',
    };
    setLocalFilters(resetFilters);
    setBudgetRange([0, 10000000]);
    onFiltersChange(resetFilters);
  };

  const activeFilterCount = [
    localFilters.query,
    localFilters.category,
    localFilters.location,
    localFilters.deadlineWithin > 0,
    localFilters.postedWithin > 0,
    localFilters.minBudget > 0 || localFilters.maxBudget < 10000000,
  ].filter(Boolean).length;

  const BudgetSlider = () => (
    <div className="space-y-2">
      <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Budget Range
      </label>
      <div className="px-2">
        <Slider
          value={budgetRange}
          onValueChange={(value) => setBudgetRange(value as number[])}
          max={10000000}
          step={10000}
          minStepsBetweenThumbs={1000}
        />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>R{budgetRange[0].toLocaleString()}</span>
        <span>R{budgetRange[1].toLocaleString()}</span>
      </div>
    </div>
  );

  return (
    <div className="bg-white rounded-2xl border border-border shadow-sm p-4 space-y-4">
      {/* Search Bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search jobs by title or description..."
            value={localFilters.query}
            onChange={(e) => setLocalFilters({ ...localFilters, query: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="pl-10"
          />
        </div>
        <Button onClick={handleSearch}>
          <Search className="h-4 w-4 mr-2" />
          Search
        </Button>
        <Button variant="outline" onClick={() => setIsExpanded(!isExpanded)}>
          <Filter className="h-4 w-4 mr-2" />
          Filters
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="ml-2">
              {activeFilterCount}
            </Badge>
          )}
        </Button>
      </div>

      {/* Active Filters */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap gap-2">
          {localFilters.query && (
            <Badge variant="secondary" className="gap-1">
              Search: {localFilters.query.slice(0, 20)}...
              <X 
                className="h-3 w-3 cursor-pointer" 
                onClick={() => setLocalFilters({ ...localFilters, query: '' })}
              />
            </Badge>
          )}
          {localFilters.category && (
            <Badge variant="secondary" className="gap-1">
              {localFilters.category}
              <X 
                className="h-3 w-3 cursor-pointer" 
                onClick={() => setLocalFilters({ ...localFilters, category: '' })}
              />
            </Badge>
          )}
          {localFilters.location && (
            <Badge variant="secondary" className="gap-1">
              <MapPin className="h-3 w-3" />
              {localFilters.location}
              <X 
                className="h-3 w-3 cursor-pointer" 
                onClick={() => setLocalFilters({ ...localFilters, location: '' })}
              />
            </Badge>
          )}
          {(localFilters.minBudget > 0 || localFilters.maxBudget < 10000000) && (
            <Badge variant="secondary" className="gap-1">
              R{localFilters.minBudget.toLocaleString()} - R{localFilters.maxBudget.toLocaleString()}
              <X 
                className="h-3 w-3 cursor-pointer" 
                onClick={() => {
                  setLocalFilters({ ...localFilters, minBudget: 0, maxBudget: 10000000 });
                  setBudgetRange([0, 10000000]);
                }}
              />
            </Badge>
          )}
          <Button variant="ghost" size="sm" onClick={handleReset}>
            Clear all
          </Button>
        </div>
      )}

      {/* Results count */}
      <div className="text-sm text-muted-foreground">
        Showing {totalResults} job{totalResults !== 1 ? 's' : ''}
      </div>

      {/* Expanded Filters */}
      {isExpanded && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t">
          {/* Category */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Category
            </label>
            <select
              value={localFilters.category}
              onChange={(e) => setLocalFilters({ ...localFilters, category: e.target.value as JobCategory })}
              className="w-full h-10 px-3 rounded-md border border-input bg-background"
            >
              <option value="">All Categories</option>
              {CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

          {/* Location */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Location
            </label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="City or region"
                value={localFilters.location}
                onChange={(e) => setLocalFilters({ ...localFilters, location: e.target.value })}
                className="pl-10"
              />
            </div>
          </div>

          {/* Deadline */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Calendar className="h-3 w-3 inline mr-1" />
              Deadline
            </label>
            <select
              value={localFilters.deadlineWithin}
              onChange={(e) => setLocalFilters({ ...localFilters, deadlineWithin: Number(e.target.value) })}
              className="w-full h-10 px-3 rounded-md border border-input bg-background"
            >
              {DEADLINE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Posted Within */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Posted
            </label>
            <select
              value={localFilters.postedWithin}
              onChange={(e) => setLocalFilters({ ...localFilters, postedWithin: Number(e.target.value) })}
              className="w-full h-10 px-3 rounded-md border border-input bg-background"
            >
              {POSTED_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Budget Range - Full width */}
          <div className="md:col-span-2 lg:col-span-4">
            <BudgetSlider />
          </div>

          {/* Sort By */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Sort By
            </label>
            <select
              value={localFilters.sortBy}
              onChange={(e) => setLocalFilters({ ...localFilters, sortBy: e.target.value as SearchFilters['sortBy'] })}
              className="w-full h-10 px-3 rounded-md border border-input bg-background"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Apply/Reset buttons */}
          <div className="flex gap-2 md:col-span-2 lg:col-span-3 justify-end items-end">
            <Button variant="outline" onClick={handleReset}>
              Reset Filters
            </Button>
            <Button onClick={handleSearch}>
              Apply Filters
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
