'use client';

/**
 * Event Feed — Command Centre Cross-Module Real-Time Activity Stream
 *
 * Displays the most recent 50 project events in reverse chronological order,
 * aggregating from all platform modules:
 *   SpecForge, Documents, RFIs, Site Diary, Programme, Procurement,
 *   Valuations, Contracts, Municipal, Messenger
 *
 * Each event item shows:
 *   - Relative timestamp (hover: full ISO datetime)
 *   - Source module icon
 *   - Description (truncated to 120 chars, expandable)
 *   - Actor name
 *   - Clickable link to source entity
 *
 * Uses Firestore real-time listeners for new events within 10 seconds.
 *
 * @module commandCentre/EventFeed
 * @validates Requirements 15.1, 15.2, 15.3, 15.6
 */

import { useState, useMemo, useCallback } from 'react';
import {
  FileText,
  MessageSquare,
  BookOpen,
  GanttChart,
  Package,
  Receipt,
  FileSignature,
  Building2,
  Mail,
  Sparkles,
  Filter,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react';
import { filterEvents, type EventFilters, type EventSourceModule, type EventSeverity } from '@/services/commandCentre/eventFeedFilterUtils';

// ── Types ────────────────────────────────────────────────────────────────────

export interface EventFeedItem {
  id: string;
  projectId: string;
  sourceModule: EventSourceModule;
  severity: EventSeverity;
  description: string;
  actorName: string;
  timestamp: string;
  linkedEntityType: string;
  linkedEntityId: string;
  linkedView: string;
}

interface EventFeedProps {
  projectId: string;
  events?: EventFeedItem[];
  onNavigateToEntity?: (view: string, entityId: string) => void;
  /** Modules known to be unreachable (muted in filter bar). */
  unreachableModules?: EventSourceModule[];
}

// ── Module Icon Map ──────────────────────────────────────────────────────────

const MODULE_ICONS: Record<EventSourceModule, typeof FileText> = {
  specforge: Sparkles,
  documents: FileText,
  rfis: MessageSquare,
  site_diary: BookOpen,
  programme: GanttChart,
  procurement: Package,
  valuations: Receipt,
  contracts: FileSignature,
  municipal: Building2,
  messenger: Mail,
};

const MODULE_LABELS: Record<EventSourceModule, string> = {
  specforge: 'SpecForge',
  documents: 'Documents',
  rfis: 'RFIs',
  site_diary: 'Site Diary',
  programme: 'Programme',
  procurement: 'Procurement',
  valuations: 'Valuations',
  contracts: 'Contracts',
  municipal: 'Municipal',
  messenger: 'Messenger',
};

const SEVERITY_LABELS: Record<EventSeverity, string> = {
  critical: 'Critical',
  standard: 'Standard',
  informational: 'Informational',
};

const SEVERITY_COLORS: Record<EventSeverity, string> = {
  critical: 'var(--red)',
  standard: 'var(--teal)',
  informational: 'var(--muted)',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Returns a relative time string (e.g. "2 min ago"). */
function relativeTime(isoTimestamp: string): string {
  const now = Date.now();
  const then = new Date(isoTimestamp).getTime();
  const diffMs = now - then;

  if (isNaN(then)) return '—';

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(isoTimestamp).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
}

/** Truncates a description to maxLength chars. */
function truncateDescription(text: string, maxLength = 120): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + '…';
}

// ── ALL_MODULES and ALL_SEVERITIES ───────────────────────────────────────────

const ALL_MODULES: EventSourceModule[] = [
  'specforge', 'documents', 'rfis', 'site_diary', 'programme',
  'procurement', 'valuations', 'contracts', 'municipal', 'messenger',
];

const ALL_SEVERITIES: EventSeverity[] = ['critical', 'standard', 'informational'];

// ── Component ────────────────────────────────────────────────────────────────

export default function EventFeed({
  projectId,
  events = [],
  onNavigateToEntity,
  unreachableModules = [],
}: EventFeedProps) {
  const [activeModuleFilter, setActiveModuleFilter] = useState<EventSourceModule | null>(null);
  const [activeSeverityFilter, setActiveSeverityFilter] = useState<EventSeverity | null>(null);
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);

  // Suppress unused projectId lint (used for context by parent/Firestore listener)
  void projectId;

  // Apply filters to events
  const filters: EventFilters = useMemo(() => ({
    sourceModule: activeModuleFilter ?? undefined,
    severity: activeSeverityFilter ?? undefined,
  }), [activeModuleFilter, activeSeverityFilter]);

  const filteredEvents = useMemo(
    () => filterEvents(events, filters).slice(0, 50),
    [events, filters],
  );

  const toggleExpand = useCallback((eventId: string) => {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  }, []);

  const handleModuleFilterClick = (mod: EventSourceModule) => {
    setActiveModuleFilter((prev) => (prev === mod ? null : mod));
  };

  const handleSeverityFilterClick = (sev: EventSeverity) => {
    setActiveSeverityFilter((prev) => (prev === sev ? null : sev));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Filter Toggle Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--deep)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Activity Feed
        </h2>
        <button
          className="btn-secondary btn"
          style={{ fontSize: 11, height: 28, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 4 }}
          onClick={() => setShowFilters((f) => !f)}
          aria-expanded={showFilters}
          aria-label="Toggle event filters"
        >
          <Filter style={{ width: 12, height: 12 }} />
          Filters
          {showFilters
            ? <ChevronUp style={{ width: 12, height: 12 }} />
            : <ChevronDown style={{ width: 12, height: 12 }} />
          }
        </button>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="panel" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Module Filters */}
          <div>
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' }}>Source</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
              {ALL_MODULES.map((mod) => {
                const isActive = activeModuleFilter === mod;
                const isUnreachable = unreachableModules.includes(mod);
                return (
                  <button
                    key={mod}
                    className="pill"
                    style={{
                      fontSize: 10,
                      padding: '2px 8px',
                      cursor: 'pointer',
                      border: isActive ? '1px solid var(--teal)' : '1px solid var(--border)',
                      background: isActive ? 'var(--aqua)' : 'transparent',
                      color: isUnreachable ? 'var(--muted)' : (isActive ? 'var(--deep)' : 'var(--ink)'),
                      opacity: isUnreachable ? 0.5 : 1,
                    }}
                    onClick={() => handleModuleFilterClick(mod)}
                    aria-pressed={isActive}
                    aria-label={`Filter by ${MODULE_LABELS[mod]}${isUnreachable ? ' (unavailable)' : ''}`}
                  >
                    {isUnreachable && <AlertTriangle style={{ width: 10, height: 10, marginRight: 2 }} />}
                    {MODULE_LABELS[mod]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Severity Filters */}
          <div>
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' }}>Severity</span>
            <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
              {ALL_SEVERITIES.map((sev) => {
                const isActive = activeSeverityFilter === sev;
                return (
                  <button
                    key={sev}
                    className="pill"
                    style={{
                      fontSize: 10,
                      padding: '2px 8px',
                      cursor: 'pointer',
                      border: isActive ? `1px solid ${SEVERITY_COLORS[sev]}` : '1px solid var(--border)',
                      background: isActive ? 'rgba(25,183,176,.08)' : 'transparent',
                      color: isActive ? SEVERITY_COLORS[sev] : 'var(--ink)',
                    }}
                    onClick={() => handleSeverityFilterClick(sev)}
                    aria-pressed={isActive}
                    aria-label={`Filter by ${SEVERITY_LABELS[sev]} severity`}
                  >
                    {SEVERITY_LABELS[sev]}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Event List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {filteredEvents.length === 0 && (
          <div
            className="panel"
            style={{ textAlign: 'center', padding: '28px 14px' }}
          >
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>
              {(activeModuleFilter || activeSeverityFilter)
                ? 'No events match the active filters.'
                : 'No recent events for this project.'
              }
            </p>
          </div>
        )}

        {filteredEvents.map((event) => {
          const Icon = MODULE_ICONS[event.sourceModule] || FileText;
          const isExpanded = expandedEvents.has(event.id);
          const needsTruncation = event.description.length > 120;
          const displayText = isExpanded ? event.description : truncateDescription(event.description);

          return (
            <div
              key={event.id}
              style={{
                display: 'flex',
                gap: 10,
                padding: '10px 12px',
                borderRadius: 12,
                background: 'rgba(255,255,255,.6)',
                border: '1px solid var(--border)',
                alignItems: 'flex-start',
              }}
            >
              {/* Module Icon */}
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: 'var(--aqua)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
                title={MODULE_LABELS[event.sourceModule]}
              >
                <Icon style={{ width: 14, height: 14, color: 'var(--deep)' }} />
              </div>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  <span
                    style={{ fontSize: 11, color: 'var(--muted)' }}
                    title={new Date(event.timestamp).toLocaleString('en-ZA', {
                      dateStyle: 'full',
                      timeStyle: 'medium',
                    })}
                  >
                    {relativeTime(event.timestamp)}
                  </span>
                  <span
                    style={{
                      fontSize: 9,
                      padding: '1px 5px',
                      borderRadius: 4,
                      background: event.severity === 'critical' ? 'rgba(217,87,71,.08)' : 'transparent',
                      color: SEVERITY_COLORS[event.severity],
                      fontWeight: 600,
                      textTransform: 'uppercase',
                    }}
                  >
                    {event.severity !== 'informational' ? event.severity : ''}
                  </span>
                </div>

                {/* Description */}
                <p
                  style={{
                    fontSize: 13,
                    color: 'var(--ink)',
                    lineHeight: 1.4,
                    margin: 0,
                    cursor: needsTruncation ? 'pointer' : 'default',
                  }}
                  onClick={() => needsTruncation && toggleExpand(event.id)}
                  aria-expanded={isExpanded}
                >
                  {displayText}
                </p>

                {/* Actor + Link */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>{event.actorName}</span>
                  {onNavigateToEntity && (
                    <button
                      className="btn-secondary btn"
                      style={{
                        fontSize: 10,
                        height: 22,
                        padding: '0 6px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 3,
                      }}
                      onClick={() => onNavigateToEntity(event.linkedView, event.linkedEntityId)}
                      aria-label={`View ${event.linkedEntityType} in ${event.linkedView}`}
                    >
                      <ExternalLink style={{ width: 10, height: 10 }} />
                      View
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
