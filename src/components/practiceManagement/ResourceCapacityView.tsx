/**
 * ResourceCapacityView — Forward-looking resource capacity planning view.
 *
 * Shows capacity table with team member, available hours, allocated hours, leave,
 * remaining capacity per week/month. Includes over-allocation indicators,
 * forward-looking view toggle (4/8/12 weeks), and pipeline impact as separate visual layer.
 *
 * Renders inside the AppShell 3-column grid using CSS token classes.
 * Follows the Hero → Stat Row → Panels content pattern.
 *
 * Requirements: 8.1, 8.2, 8.4, 8.5, 15.5
 * @module practiceManagement/ResourceCapacityView
 */

import { useState, useMemo } from 'react';
import { Users, AlertTriangle, Calendar, GitBranch } from 'lucide-react';
import type { UserProfile } from '@/types';
import type {
  CapacityView,
  PersonCapacity,
  WeekCapacity,
  OverAllocation,
} from '@/services/practiceManagement/types';

// ─── Props ───────────────────────────────────────────────────────────────────

interface ResourceCapacityViewProps {
  user: UserProfile;
  capacityView?: CapacityView | null;
  overAllocations?: OverAllocation[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

type ViewWeeks = 4 | 8 | 12;

function formatWeekLabel(weekStart: string): string {
  const date = new Date(weekStart);
  return date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
}

function capacityBarColor(remaining: number, total: number): string {
  if (remaining < 0) return 'var(--red)';
  const ratio = remaining / (total || 1);
  if (ratio < 0.2) return 'var(--amber)';
  return 'var(--green)';
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ResourceCapacityView({
  user,
  capacityView,
  overAllocations = [],
}: ResourceCapacityViewProps) {
  const [viewWeeks, setViewWeeks] = useState<ViewWeeks>(4);
  const [showPipelineImpact, setShowPipelineImpact] = useState(false);

  const people: PersonCapacity[] = capacityView?.people ?? [];

  const summary = useMemo(() => {
    if (!capacityView) {
      return {
        totalAvailable: 0,
        totalAllocated: 0,
        utilisation: 0,
        overAllocatedCount: 0,
        teamSize: 0,
      };
    }
    return {
      totalAvailable: capacityView.firmTotalAvailable,
      totalAllocated: capacityView.firmTotalAllocated,
      utilisation: capacityView.firmUtilisationPercent,
      overAllocatedCount: overAllocations.length,
      teamSize: people.length,
    };
  }, [capacityView, overAllocations, people]);

  // Filter weeks for the selected view period
  const getVisibleWeeks = (person: PersonCapacity): WeekCapacity[] => {
    return person.weeks.slice(0, viewWeeks);
  };

  // ─── Empty State ─────────────────────────────────────────────────────────

  if (!capacityView || people.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <section className="panel" style={{ textAlign: 'center', padding: 40 }}>
          <Users size={28} style={{ color: 'var(--muted)', marginBottom: 8 }} />
          <h2 style={{ color: 'var(--ink)', fontSize: 15, marginBottom: 6 }}>
            No Capacity Data
          </h2>
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>
            Resource capacity will appear once team members have allocations and
            availability configured.
          </p>
        </section>
      </div>
    );
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Hero */}
      <div className="hero">
        <div className="hero-header">
          <div>
            <div className="eyebrow">RESOURCE PLANNING</div>
            <h1>Capacity View</h1>
            <p className="sub">
              {summary.teamSize} team member{summary.teamSize !== 1 ? 's' : ''} ·{' '}
              {viewWeeks}-week forward view
            </p>
          </div>
        </div>
        <div className="hero-pills">
          {summary.overAllocatedCount > 0 && (
            <span
              className="pill"
              style={{
                color: 'var(--red)',
                background: 'rgba(217,87,71,.08)',
                borderColor: 'rgba(217,87,71,.18)',
              }}
            >
              <span className="dot" style={{ background: 'var(--red)' }}></span>{' '}
              {summary.overAllocatedCount} Over-allocated
            </span>
          )}
          <span className="pill">
            <span className="dot"></span> {summary.utilisation.toFixed(0)}% Utilisation
          </span>
        </div>
      </div>

      {/* Stat Row */}
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--deep)' }}>
            {summary.totalAvailable.toFixed(0)}h
          </div>
          <div className="stat-label">Total Available</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--ink)' }}>
            {summary.totalAllocated.toFixed(0)}h
          </div>
          <div className="stat-label">Total Allocated</div>
        </div>
        <div className="stat-card">
          <div
            className="stat-value"
            style={{ color: summary.utilisation > 90 ? 'var(--red)' : 'var(--teal)' }}
          >
            {summary.utilisation.toFixed(1)}%
          </div>
          <div className="stat-label">Firm Utilisation</div>
        </div>
        <div className="stat-card">
          <div
            className="stat-value"
            style={{ color: summary.overAllocatedCount > 0 ? 'var(--red)' : 'var(--green)' }}
          >
            {summary.overAllocatedCount}
          </div>
          <div className="stat-label">Over-Allocated</div>
        </div>
      </div>

      {/* View Controls */}
      <section className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>Forward View</h2>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {/* Week toggle buttons */}
            {([4, 8, 12] as ViewWeeks[]).map((weeks) => (
              <button
                key={weeks}
                className={viewWeeks === weeks ? 'btn' : 'btn btn-secondary'}
                onClick={() => setViewWeeks(weeks)}
                style={{ fontSize: 11, padding: '4px 10px', height: 28 }}
              >
                {weeks}w
              </button>
            ))}
            {/* Pipeline impact toggle */}
            <button
              className={showPipelineImpact ? 'btn' : 'btn btn-secondary'}
              onClick={() => setShowPipelineImpact(!showPipelineImpact)}
              style={{ fontSize: 11, padding: '4px 10px', height: 28, marginLeft: 8 }}
            >
              <GitBranch size={12} style={{ marginRight: 4 }} />
              Pipeline
            </button>
          </div>
        </div>
      </section>

      {/* Capacity Table */}
      <section className="panel">
        <h2>Team Capacity</h2>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ position: 'sticky', left: 0, background: 'rgba(255,255,255,.95)', zIndex: 1 }}>
                  Team Member
                </th>
                <th style={{ position: 'sticky', left: 0 }}>Role</th>
                {people[0] &&
                  getVisibleWeeks(people[0]).map((week) => (
                    <th
                      key={week.weekStart}
                      style={{ textAlign: 'center', minWidth: 80 }}
                    >
                      {formatWeekLabel(week.weekStart)}
                    </th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {people.map((person) => {
                const weeks = getVisibleWeeks(person);
                return (
                  <tr key={person.userId}>
                    <td
                      style={{
                        position: 'sticky',
                        left: 0,
                        background: 'rgba(255,255,255,.95)',
                        zIndex: 1,
                        fontSize: 12,
                        fontWeight: 500,
                      }}
                    >
                      {person.displayName}
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'capitalize' }}>
                      {person.role}
                    </td>
                    {weeks.map((week) => {
                      const barColor = capacityBarColor(
                        week.remainingCapacity,
                        week.totalAvailableHours,
                      );
                      const allocPercent =
                        week.totalAvailableHours > 0
                          ? (week.allocatedHours / week.totalAvailableHours) * 100
                          : week.allocatedHours > 0
                            ? 100
                            : 0;
                      const pipelinePercent =
                        showPipelineImpact && week.totalAvailableHours > 0
                          ? (week.pipelineImpactHours / week.totalAvailableHours) * 100
                          : 0;

                      return (
                        <td key={week.weekStart} style={{ textAlign: 'center', padding: '6px 4px' }}>
                          {/* Capacity mini-bar */}
                          <div
                            style={{
                              height: 6,
                              borderRadius: 3,
                              background: 'var(--border)',
                              overflow: 'hidden',
                              marginBottom: 3,
                              position: 'relative',
                            }}
                          >
                            <div
                              style={{
                                height: '100%',
                                width: `${Math.min(allocPercent, 100)}%`,
                                borderRadius: 3,
                                background: barColor,
                              }}
                            />
                            {showPipelineImpact && pipelinePercent > 0 && (
                              <div
                                style={{
                                  position: 'absolute',
                                  top: 0,
                                  left: `${Math.min(allocPercent, 100)}%`,
                                  height: '100%',
                                  width: `${Math.min(pipelinePercent, 100 - Math.min(allocPercent, 100))}%`,
                                  background: 'var(--teal)',
                                  opacity: 0.4,
                                }}
                              />
                            )}
                          </div>
                          {/* Hours display */}
                          <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                            <span style={{ fontWeight: 600, color: barColor }}>
                              {week.allocatedHours.toFixed(0)}
                            </span>
                            <span>/{week.totalAvailableHours.toFixed(0)}h</span>
                          </div>
                          {/* Leave indicator */}
                          {week.leaveHours > 0 && (
                            <div
                              style={{
                                fontSize: 9,
                                color: 'var(--amber)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 2,
                                marginTop: 2,
                              }}
                            >
                              <Calendar size={8} />
                              {week.leaveHours.toFixed(0)}h leave
                            </div>
                          )}
                          {/* Over-allocation warning */}
                          {week.isOverAllocated && (
                            <div
                              style={{
                                fontSize: 9,
                                color: 'var(--red)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 2,
                                marginTop: 2,
                              }}
                            >
                              <AlertTriangle size={8} />
                              Over
                            </div>
                          )}
                          {/* Pipeline impact indicator */}
                          {showPipelineImpact && week.pipelineImpactHours > 0 && (
                            <div
                              style={{
                                fontSize: 9,
                                color: 'var(--teal)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 2,
                                marginTop: 2,
                              }}
                            >
                              <GitBranch size={8} />
                              +{week.pipelineImpactHours.toFixed(0)}h
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Over-Allocation Alerts */}
      {overAllocations.length > 0 && (
        <section className="panel">
          <h2>
            <AlertTriangle size={14} style={{ marginRight: 6, color: 'var(--red)' }} />
            Over-Allocation Alerts
          </h2>
          <table className="table">
            <thead>
              <tr>
                <th>Team Member</th>
                <th>Week</th>
                <th style={{ textAlign: 'right' }}>Allocated</th>
                <th style={{ textAlign: 'right' }}>Available</th>
                <th style={{ textAlign: 'right' }}>Over By</th>
              </tr>
            </thead>
            <tbody>
              {overAllocations.map((item, idx) => (
                <tr key={`${item.userId}-${item.weekStart}-${idx}`}>
                  <td style={{ fontSize: 12, fontWeight: 500 }}>{item.displayName}</td>
                  <td style={{ fontSize: 11, fontFamily: 'monospace' }}>
                    {formatWeekLabel(item.weekStart)}
                  </td>
                  <td
                    style={{
                      textAlign: 'right',
                      fontFamily: 'monospace',
                      fontSize: 11,
                      color: 'var(--red)',
                    }}
                  >
                    {item.allocatedHours.toFixed(1)}h
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 11 }}>
                    {item.availableHours.toFixed(1)}h
                  </td>
                  <td
                    style={{
                      textAlign: 'right',
                      fontFamily: 'monospace',
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'var(--red)',
                    }}
                  >
                    +{item.overBy.toFixed(1)}h
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Pipeline Impact Legend */}
      {showPipelineImpact && (
        <section className="panel">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              fontSize: 11,
              color: 'var(--muted)',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span
                style={{
                  width: 12,
                  height: 6,
                  borderRadius: 3,
                  background: 'var(--green)',
                  display: 'inline-block',
                }}
              />
              Allocated (confirmed)
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span
                style={{
                  width: 12,
                  height: 6,
                  borderRadius: 3,
                  background: 'var(--teal)',
                  opacity: 0.4,
                  display: 'inline-block',
                }}
              />
              Pipeline impact (high-confidence)
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span
                style={{
                  width: 12,
                  height: 6,
                  borderRadius: 3,
                  background: 'var(--border)',
                  display: 'inline-block',
                }}
              />
              Available
            </span>
          </div>
        </section>
      )}
    </div>
  );
}
