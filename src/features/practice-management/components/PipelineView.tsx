/**
 * Practice Management — Pipeline View Component
 *
 * Enquiry pipeline with toggle between Kanban (columns per stage) and
 * List (table) views. Includes pipeline metrics, filtering, sorting,
 * and per-enquiry stage transitions.
 *
 * Requirements: 1.1–1.6
 */

import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Filter,
  Kanban,
  List,
  Plus,
  Search,
  TrendingUp,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { UserProfile } from '@/types';
import type { EnquiryRecord, EnquiryStage, PipelineMetrics, PracticeDiscipline } from '../types';

// ─── Props ────────────────────────────────────────────────────────────────────

interface PipelineViewProps {
  user: UserProfile;
  firmId: string;
  enquiries: EnquiryRecord[];
  metrics: PipelineMetrics;
  onTransition?: (enquiryId: string, targetStage: EnquiryStage, params?: { lossReason?: string; notes?: string }) => void;
  onCreateEnquiry?: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STAGE_ORDER: EnquiryStage[] = [
  'lead', 'quote_sent', 'quote_accepted', 'appointed', 'active', 'complete', 'on_hold', 'lost',
];

const STAGE_LABELS: Record<EnquiryStage, string> = {
  lead: 'Lead',
  quote_sent: 'Quote Sent',
  quote_accepted: 'Quote Accepted',
  appointed: 'Appointed',
  active: 'Active',
  complete: 'Complete',
  on_hold: 'On Hold',
  lost: 'Lost',
};

const STAGE_COLORS: Record<EnquiryStage, string> = {
  lead: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  quote_sent: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  quote_accepted: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
  appointed: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  active: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  complete: 'bg-green-500/20 text-green-400 border-green-500/30',
  on_hold: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  lost: 'bg-red-500/20 text-red-400 border-red-500/30',
};

/** Valid forward transitions per stage */
const VALID_TRANSITIONS: Record<EnquiryStage, EnquiryStage[]> = {
  lead: ['quote_sent', 'lost'],
  quote_sent: ['quote_accepted', 'lost'],
  quote_accepted: ['appointed', 'lost'],
  appointed: ['active', 'on_hold', 'lost'],
  active: ['complete', 'on_hold'],
  complete: [],
  on_hold: ['active', 'lost'],
  lost: [],
};

const DISCIPLINES: PracticeDiscipline[] = [
  'architecture', 'engineering', 'quantity_surveying', 'project_management', 'town_planning', 'multi_discipline',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(value);
}

function calculateDaysInStage(enquiry: EnquiryRecord): number {
  const lastTransition = enquiry.stageHistory[enquiry.stageHistory.length - 1];
  if (!lastTransition) return 0;
  const transitionDate = new Date(lastTransition.date);
  const now = new Date();
  return Math.ceil((now.getTime() - transitionDate.getTime()) / (1000 * 60 * 60 * 24));
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '…';
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PipelineView({
  user,
  firmId,
  enquiries,
  metrics,
  onTransition,
  onCreateEnquiry,
}: PipelineViewProps) {
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [disciplineFilter, setDisciplineFilter] = useState<PracticeDiscipline | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'value' | 'days'>('date');

  // Filtered and sorted enquiries
  const filteredEnquiries = useMemo(() => {
    let result = enquiries;

    if (disciplineFilter !== 'all') {
      result = result.filter((e) => e.discipline === disciplineFilter);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (e) =>
          e.clientName.toLowerCase().includes(query) ||
          e.projectDescription.toLowerCase().includes(query)
      );
    }

    // Sort
    result = [...result].sort((a, b) => {
      switch (sortBy) {
        case 'value':
          return b.estimatedFeeValueZAR - a.estimatedFeeValueZAR;
        case 'days':
          return calculateDaysInStage(b) - calculateDaysInStage(a);
        case 'date':
        default:
          return new Date(b.enquiryDate).getTime() - new Date(a.enquiryDate).getTime();
      }
    });

    return result;
  }, [enquiries, disciplineFilter, searchQuery, sortBy]);

  // Enquiries grouped by stage
  const byStage = useMemo(() => {
    const grouped: Record<EnquiryStage, EnquiryRecord[]> = {
      lead: [], quote_sent: [], quote_accepted: [], appointed: [],
      active: [], complete: [], on_hold: [], lost: [],
    };
    for (const e of filteredEnquiries) {
      grouped[e.currentStage].push(e);
    }
    return grouped;
  }, [filteredEnquiries]);

  const totalFeeValue = useMemo(
    () => enquiries.reduce((sum, e) => sum + e.estimatedFeeValueZAR, 0),
    [enquiries]
  );

  return (
    <div className="space-y-6">
      {/* Pipeline Metrics */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Kanban className="h-4 w-4 text-blue-400" />
              <span className="text-xs uppercase tracking-wider text-surface-400">Total Enquiries</span>
            </div>
            <p className="mt-1 text-2xl font-bold text-foreground">{enquiries.length}</p>
          </CardContent>
        </Card>

        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-400" />
              <span className="text-xs uppercase tracking-wider text-surface-400">Total Fee Value</span>
            </div>
            <p className="mt-1 text-2xl font-bold text-foreground">{formatCurrency(totalFeeValue)}</p>
          </CardContent>
        </Card>

        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <ArrowRight className="h-4 w-4 text-cyan-400" />
              <span className="text-xs uppercase tracking-wider text-surface-400">Conversion Rate</span>
            </div>
            <p className="mt-1 text-2xl font-bold text-foreground">{metrics.conversionRate.toFixed(1)}%</p>
          </CardContent>
        </Card>

        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-amber-400" />
              <span className="text-xs uppercase tracking-wider text-surface-400">Win/Loss (12m)</span>
            </div>
            <p className="mt-1 text-2xl font-bold text-foreground">{metrics.winLossRatio12Month.toFixed(2)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Controls Bar */}
      <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* View Toggle */}
            <div className="flex rounded-lg border border-surface-700 overflow-hidden">
              <button
                onClick={() => setViewMode('kanban')}
                className={`flex items-center gap-1 px-3 py-1.5 text-xs transition-colors ${
                  viewMode === 'kanban' ? 'bg-primary-600 text-white' : 'bg-surface-800 text-surface-400 hover:text-foreground'
                }`}
                aria-label="Kanban view"
              >
                <Kanban className="h-3.5 w-3.5" />
                Kanban
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`flex items-center gap-1 px-3 py-1.5 text-xs transition-colors ${
                  viewMode === 'list' ? 'bg-primary-600 text-white' : 'bg-surface-800 text-surface-400 hover:text-foreground'
                }`}
                aria-label="List view"
              >
                <List className="h-3.5 w-3.5" />
                List
              </button>
            </div>

            {/* Search */}
            <div className="relative flex-1 min-w-[180px] max-w-[300px]">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-surface-400" />
              <input
                type="text"
                placeholder="Search clients..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-md border border-surface-700 bg-surface-900 pl-7 pr-3 py-1.5 text-xs text-foreground placeholder:text-surface-500"
                aria-label="Search enquiries"
              />
            </div>

            {/* Filters */}
            <div className="flex items-center gap-2">
              <Filter className="h-3.5 w-3.5 text-surface-400" />
              <select
                value={disciplineFilter}
                onChange={(e) => setDisciplineFilter(e.target.value as PracticeDiscipline | 'all')}
                className="rounded-md border border-surface-700 bg-surface-800 px-2 py-1.5 text-xs text-foreground"
                aria-label="Filter by discipline"
              >
                <option value="all">All Disciplines</option>
                {DISCIPLINES.map((d) => (
                  <option key={d} value={d}>
                    {d.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                  </option>
                ))}
              </select>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'date' | 'value' | 'days')}
                className="rounded-md border border-surface-700 bg-surface-800 px-2 py-1.5 text-xs text-foreground"
                aria-label="Sort by"
              >
                <option value="date">Sort: Date</option>
                <option value="value">Sort: Value</option>
                <option value="days">Sort: Days in Stage</option>
              </select>
            </div>

            {/* Create */}
            {onCreateEnquiry && (
              <Button size="sm" className="gap-1 ml-auto" onClick={onCreateEnquiry}>
                <Plus className="h-4 w-4" />
                New Enquiry
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* View Content */}
      {viewMode === 'kanban' ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4">
          {STAGE_ORDER.map((stage) => (
            <div key={stage} className="space-y-2">
              {/* Column Header */}
              <div className="flex items-center justify-between rounded-lg bg-surface-800/50 px-3 py-2">
                <div className="flex items-center gap-2">
                  <Badge className={STAGE_COLORS[stage]}>{STAGE_LABELS[stage]}</Badge>
                  <span className="text-xs text-surface-400">{byStage[stage].length}</span>
                </div>
                <span className="text-xs text-surface-500">
                  {formatCurrency(byStage[stage].reduce((s, e) => s + e.estimatedFeeValueZAR, 0))}
                </span>
              </div>

              {/* Cards */}
              <div className="space-y-2">
                {byStage[stage].map((enquiry) => {
                  const daysInStage = calculateDaysInStage(enquiry);
                  const transitions = VALID_TRANSITIONS[enquiry.currentStage];

                  return (
                    <Card
                      key={enquiry.id}
                      className="bg-surface-900/70 border-surface-700/50 hover:border-surface-600/70 transition-colors"
                    >
                      <CardContent className="p-3 space-y-2">
                        <p className="text-sm font-medium text-foreground truncate">
                          {enquiry.clientName}
                        </p>
                        <p className="text-xs text-surface-400 line-clamp-2">
                          {truncateText(enquiry.projectDescription, 80)}
                        </p>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-mono text-emerald-400">
                            {formatCurrency(enquiry.estimatedFeeValueZAR)}
                          </span>
                          <span className="text-xs text-surface-500">{daysInStage}d</span>
                        </div>
                        {/* Transition buttons */}
                        {onTransition && transitions.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-1 border-t border-surface-700/30">
                            {transitions.map((target) => (
                              <button
                                key={target}
                                onClick={() => onTransition(enquiry.id, target)}
                                className="rounded bg-surface-700/50 px-2 py-0.5 text-[10px] text-surface-300 hover:bg-surface-600/70 hover:text-foreground transition-colors"
                              >
                                → {STAGE_LABELS[target]}
                              </button>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
                {byStage[stage].length === 0 && (
                  <p className="text-xs text-surface-500 text-center py-4">No enquiries</p>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* List View */
        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-surface-700/50">
                    <TableHead className="text-xs uppercase tracking-wider text-surface-400">Client</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider text-surface-400">Project</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider text-surface-400">Stage</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider text-surface-400">Discipline</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider text-surface-400 text-right">Fee</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider text-surface-400 text-right">Days</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider text-surface-400">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEnquiries.map((enquiry) => {
                    const daysInStage = calculateDaysInStage(enquiry);
                    const transitions = VALID_TRANSITIONS[enquiry.currentStage];

                    return (
                      <TableRow key={enquiry.id} className="border-surface-700/30 hover:bg-surface-700/20">
                        <TableCell className="text-sm text-foreground">{enquiry.clientName}</TableCell>
                        <TableCell className="text-xs text-surface-300 max-w-[200px] truncate">
                          {truncateText(enquiry.projectDescription, 60)}
                        </TableCell>
                        <TableCell>
                          <Badge className={STAGE_COLORS[enquiry.currentStage]}>
                            {STAGE_LABELS[enquiry.currentStage]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-surface-300">
                          {enquiry.discipline.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                        </TableCell>
                        <TableCell className="text-xs font-mono text-emerald-400 text-right">
                          {formatCurrency(enquiry.estimatedFeeValueZAR)}
                        </TableCell>
                        <TableCell className="text-xs text-surface-300 text-right">{daysInStage}</TableCell>
                        <TableCell>
                          {onTransition && transitions.length > 0 && (
                            <select
                              defaultValue=""
                              onChange={(e) => {
                                if (e.target.value) {
                                  onTransition(enquiry.id, e.target.value as EnquiryStage);
                                  e.target.value = '';
                                }
                              }}
                              className="rounded border border-surface-700 bg-surface-800 px-2 py-0.5 text-xs text-foreground"
                              aria-label={`Transition ${enquiry.clientName}`}
                            >
                              <option value="">Move to…</option>
                              {transitions.map((target) => (
                                <option key={target} value={target}>
                                  {STAGE_LABELS[target]}
                                </option>
                              ))}
                            </select>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
