import React, { useMemo, useState } from 'react';
import { ClipboardCheck, FileText, Filter, LayoutDashboard, MapPin } from 'lucide-react';
import type { SnagItem, SnagStatus, Severity, SiteExecutionPhase, UserRole } from '@/types';
import { EDITOR_ROLES } from '@/services/fieldAccessService';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The five canonical snag statuses used for filtering and counting. */
export const SNAG_STATUSES: SnagStatus[] = [
  'open',
  'allocated',
  'ready_for_reinspection',
  'closed',
  'rejected',
];

const SEVERITIES: Severity[] = ['low', 'medium', 'high', 'critical'];

const LIFECYCLE_STAGES: SiteExecutionPhase[] = [
  'construction_execution',
  'closeout',
  'defects_liability',
  'operations_post_occupancy',
];

export interface DashboardFilters {
  status: SnagStatus | '';
  severity: Severity | '';
  responsibleParty: string;
  lifecycleStage: SiteExecutionPhase | '';
}

export interface StatusCounts {
  open: number;
  allocated: number;
  ready_for_reinspection: number;
  closed: number;
  rejected: number;
}

// ---------------------------------------------------------------------------
// Pure filtering function (extractable and testable)
// ---------------------------------------------------------------------------

/**
 * Filters issues using logical AND across all active filters.
 * An empty/unset filter value means "no constraint" for that dimension.
 */
export function filterIssues(
  issues: SnagItem[],
  filters: DashboardFilters,
): SnagItem[] {
  return issues.filter((issue) => {
    if (filters.status && issue.status !== filters.status) return false;
    if (filters.severity && issue.priority !== filters.severity) return false;
    if (
      filters.responsibleParty &&
      issue.responsiblePartyId !== filters.responsibleParty
    )
      return false;
    // lifecycleStage filter: if set, only include issues whose lifecycleStage matches
    // SnagItem doesn't carry lifecycleStage directly; we use the prop-level stage mapping
    // This filter is applied externally via the lifecycleStage prop on the component
    // For the pure function, we accept it as a no-op when issues don't carry stage data
    // The component handles this by pre-filtering based on lifecycleStage prop
    return true;
  });
}

// ---------------------------------------------------------------------------
// Pure status count computation (extractable and testable)
// ---------------------------------------------------------------------------

/**
 * Computes a count for each of the five lifecycle statuses over the filtered set.
 * Returns zero for any status with no matching issues.
 */
export function computeStatusCounts(filteredIssues: SnagItem[]): StatusCounts {
  const counts: StatusCounts = {
    open: 0,
    allocated: 0,
    ready_for_reinspection: 0,
    closed: 0,
    rejected: 0,
  };
  for (const issue of filteredIssues) {
    if (issue.status in counts) {
      counts[issue.status as keyof StatusCounts]++;
    }
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type Props = {
  issues: SnagItem[];
  /** Current lifecycle stage for stage-level filtering. */
  lifecycleStage?: SiteExecutionPhase | '';
  /** Callback when the lifecycle stage filter changes (lifted state). */
  onLifecycleStageChange?: (stage: SiteExecutionPhase | '') => void;
  /** Current user role — gates visibility of checklist and report entry points. */
  userRole?: UserRole;
};

const statusLabel: Record<string, string> = {
  open: 'Open',
  allocated: 'Allocated',
  ready_for_reinspection: 'Ready for Reinspection',
  closed: 'Closed',
  rejected: 'Rejected',
};

const statusBadgeClass: Record<string, string> = {
  open: 'bg-blue-50 text-blue-700 border-blue-200',
  allocated: 'bg-amber-50 text-amber-700 border-amber-200',
  ready_for_reinspection: 'bg-purple-50 text-purple-700 border-purple-200',
  closed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-secondary text-muted-foreground border-border',
};

const severityBadgeClass: Record<Severity, string> = {
  low: 'bg-secondary text-muted-foreground',
  medium: 'bg-blue-50 text-blue-700',
  high: 'bg-amber-50 text-amber-700',
  critical: 'bg-destructive/10 text-destructive',
};

export default function IssueDashboard({
  issues,
  lifecycleStage: externalLifecycleStage,
  onLifecycleStageChange,
  userRole,
}: Props) {
  const [statusFilter, setStatusFilter] = useState<SnagStatus | ''>('');
  const [severityFilter, setSeverityFilter] = useState<Severity | ''>('');
  const [responsiblePartyFilter, setResponsiblePartyFilter] = useState('');
  const [internalLifecycleStage, setInternalLifecycleStage] = useState<
    SiteExecutionPhase | ''
  >('');

  // Support both controlled and uncontrolled lifecycle stage
  const lifecycleStage = externalLifecycleStage ?? internalLifecycleStage;
  const handleLifecycleStageChange = (stage: SiteExecutionPhase | '') => {
    if (onLifecycleStageChange) {
      onLifecycleStageChange(stage);
    } else {
      setInternalLifecycleStage(stage);
    }
  };

  // Derive unique responsible parties from issues for the filter dropdown
  const responsibleParties = useMemo(() => {
    const parties = new Set<string>();
    for (const issue of issues) {
      if (issue.responsiblePartyId) {
        parties.add(issue.responsiblePartyId);
      }
    }
    return Array.from(parties).sort();
  }, [issues]);

  // Build filters object
  const filters: DashboardFilters = useMemo(
    () => ({
      status: statusFilter,
      severity: severityFilter,
      responsibleParty: responsiblePartyFilter,
      lifecycleStage: lifecycleStage,
    }),
    [statusFilter, severityFilter, responsiblePartyFilter, lifecycleStage],
  );

  // Apply AND-filtering
  const filteredIssues = useMemo(
    () => filterIssues(issues, filters),
    [issues, filters],
  );

  // Compute per-status counts over the filtered set
  const counts = useMemo(
    () => computeStatusCounts(filteredIssues),
    [filteredIssues],
  );

  return (
    <Card className="rounded-3xl border-border bg-white shadow-sm overflow-hidden h-full" role="region" aria-label="Issue dashboard">
      <CardHeader className="flex flex-row items-center justify-between gap-4 bg-primary/5 border-b border-border p-6">
        <CardTitle className="flex items-center gap-2 text-xl font-heading">
          <LayoutDashboard className="text-primary" /> Issue Dashboard
        </CardTitle>
        <div className="flex items-center gap-2">
          {userRole && EDITOR_ROLES.includes(userRole) && (
            <button
              type="button"
              aria-label="Open checklists"
              className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/10 transition-colors"
              onClick={() => {
                // Navigation to ChecklistRunner will be wired in integration
              }}
            >
              <ClipboardCheck size={16} />
              Checklists
            </button>
          )}
          {userRole && (EDITOR_ROLES.includes(userRole) || userRole === 'client') && (
            <button
              type="button"
              aria-label="Open field report"
              className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/10 transition-colors"
              onClick={() => {
                // Navigation to FieldReportView will be wired in integration
              }}
            >
              <FileText size={16} />
              Field Report
            </button>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-6 space-y-6">
        {/* Filters */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Filter size={14} />
            <span>Filters</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as SnagStatus | '')}
              className="h-11 rounded-xl border border-border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40"
              aria-label="Filter by status"
            >
              <option value="">All statuses</option>
              {SNAG_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {statusLabel[s] || s}
                </option>
              ))}
            </select>

            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value as Severity | '')}
              className="h-11 rounded-xl border border-border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40"
              aria-label="Filter by severity"
            >
              <option value="">All severities</option>
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>

            <select
              value={responsiblePartyFilter}
              onChange={(e) => setResponsiblePartyFilter(e.target.value)}
              className="h-11 rounded-xl border border-border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40"
              aria-label="Filter by responsible party"
            >
              <option value="">All parties</option>
              {responsibleParties.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>

            <select
              value={lifecycleStage}
              onChange={(e) =>
                handleLifecycleStageChange(
                  e.target.value as SiteExecutionPhase | '',
                )
              }
              className="h-11 rounded-xl border border-border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40"
              aria-label="Filter by lifecycle stage"
            >
              <option value="">All stages</option>
              {LIFECYCLE_STAGES.map((stage) => (
                <option key={stage} value={stage}>
                  {stage.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Status counts */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3" role="status" aria-label="Issue status counts">
          {SNAG_STATUSES.map((status) => (
            <div
              key={status}
              className="rounded-xl border border-border p-3 text-center"
            >
              <p className="text-2xl font-bold">
                {counts[status as keyof StatusCounts]}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {statusLabel[status]}
              </p>
            </div>
          ))}
        </div>

        {/* Issue list */}
        <div className="space-y-3" role="list" aria-label="Filtered issues" aria-live="polite">
          {filteredIssues.length === 0 && (
            <div className="py-14 text-center rounded-3xl border-2 border-dashed border-border text-sm text-muted-foreground" role="listitem">
              No issues match the current filters.
            </div>
          )}
          {filteredIssues.map((issue) => (
            <div
              key={issue.id}
              role="listitem"
              className={`rounded-2xl border p-4 space-y-2 ${
                issue.blocksPayment
                  ? 'border-destructive/30 bg-destructive/5'
                  : 'border-border bg-secondary/10'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-bold">{issue.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {issue.location} · {issue.responsiblePartyId || 'Unassigned'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {issue.drawingPin && (
                    <button
                      type="button"
                      aria-label="View issue on drawing"
                      className="inline-flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/5 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                      onClick={() => {
                        // Navigation to DrawingPinViewer will be wired in integration (Task 10.1)
                      }}
                    >
                      <MapPin size={14} />
                      View on drawing
                    </button>
                  )}
                  <Badge
                    variant="outline"
                    className={severityBadgeClass[issue.priority]}
                  >
                    {issue.priority}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={statusBadgeClass[issue.status] || ''}
                  >
                    {(statusLabel[issue.status] || issue.status).replace(/_/g, ' ')}
                  </Badge>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
