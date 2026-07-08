/**
 * FormTemplateLibrary — Template browser with search, filter, pagination,
 * and lifecycle-stage recommendations.
 *
 * Uses the useFormTemplateLibrary hook for search/filter/pagination.
 * Renders templates in a grid with category icons, names, metadata,
 * and "Recommended" badges for stage-appropriate templates.
 *
 * Requirements validated: 1.1, 1.2, 1.3, 1.5, 10.1–10.5
 */

import React, { useState, useCallback } from 'react';
import type { FormTemplate, FormCategory } from '@/services/forms/formTypes';
import { useFormTemplateLibrary } from '@/hooks/useFormTemplateLibrary';
import { Search, Filter, FileText, ChevronLeft, ChevronRight } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface Props {
  projectStage?: string;
  projectMunicipality?: string;
}

// ── Category Icon Map ────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<FormCategory, string> = {
  municipal_submission: 'Municipal Submission',
  sacap: 'SACAP',
  contract: 'Contract',
  appointment_letter: 'Appointment Letter',
  power_of_attorney: 'Power of Attorney',
  company_resolution: 'Company Resolution',
  site_instruction: 'Site Instruction',
  variation_order: 'Variation Order',
  payment_certificate: 'Payment Certificate',
  compliance_declaration: 'Compliance Declaration',
  custom: 'Custom',
};

const CATEGORY_ICONS: Record<FormCategory, string> = {
  municipal_submission: '🏛️',
  sacap: '📋',
  contract: '📄',
  appointment_letter: '✉️',
  power_of_attorney: '⚖️',
  company_resolution: '🏢',
  site_instruction: '🔧',
  variation_order: '📝',
  payment_certificate: '💰',
  compliance_declaration: '✅',
  custom: '📁',
};

// ── Helper: Check if template is recommended for current stage ───────────────

function isRecommendedForStage(template: FormTemplate, stage?: string): boolean {
  if (!stage) return false;
  return template.lifecycleStages.includes(stage as any);
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function FormTemplateLibrary({ projectStage, projectMunicipality }: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const {
    templates,
    loading,
    totalPages,
    currentPage,
    error,
    search,
    setFilters,
    nextPage,
    prevPage,
  } = useFormTemplateLibrary(
    { lifecycleStage: projectStage as any },
    projectMunicipality,
  );

  // Split templates into recommended and others
  const recommended = templates.filter((t) => isRecommendedForStage(t, projectStage));
  const others = templates.filter((t) => !isRecommendedForStage(t, projectStage));

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setSearchQuery(value);
      search(value);
    },
    [search],
  );

  const handleCategoryFilter = useCallback(
    (category: FormCategory | undefined) => {
      setFilters({ category });
    },
    [setFilters],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* ─── Search Bar ─────────────────────────────────────────────────── */}
      <div className="panel" style={{ padding: '14px 18px' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(255,255,255,.9)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: '8px 12px',
            }}
          >
            <Search
              style={{ width: 16, height: 16, color: 'var(--muted)', flexShrink: 0 }}
            />
            <input
              type="text"
              placeholder="Search templates by name, category, or municipality..."
              value={searchQuery}
              onChange={handleSearchChange}
              aria-label="Search form templates"
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                fontSize: 13,
                color: 'var(--ink)',
              }}
            />
          </div>
          <button
            className="btn"
            onClick={() => setShowFilters(!showFilters)}
            aria-label="Toggle filters"
            aria-expanded={showFilters}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Filter style={{ width: 14, height: 14 }} />
            Filters
          </button>
        </div>

        {/* Filter row (collapsible) */}
        {showFilters && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
              marginTop: 12,
              paddingTop: 12,
              borderTop: '1px solid var(--border)',
            }}
          >
            <button
              className="pill"
              onClick={() => handleCategoryFilter(undefined)}
              style={{ cursor: 'pointer' }}
            >
              All
            </button>
            {(Object.keys(CATEGORY_LABELS) as FormCategory[]).map((cat) => (
              <button
                key={cat}
                className="pill"
                onClick={() => handleCategoryFilter(cat)}
                style={{ cursor: 'pointer' }}
              >
                {CATEGORY_ICONS[cat]} {CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ─── Loading State ──────────────────────────────────────────────── */}
      {loading && (
        <div className="panel" style={{ textAlign: 'center', padding: '32px 22px' }}>
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>Loading templates...</p>
        </div>
      )}

      {/* ─── Error State ────────────────────────────────────────────────── */}
      {error && (
        <div className="panel" style={{ textAlign: 'center', padding: '32px 22px' }}>
          <p style={{ color: 'var(--red)', fontSize: 13 }}>{error}</p>
        </div>
      )}

      {/* ─── Empty State ────────────────────────────────────────────────── */}
      {!loading && !error && templates.length === 0 && (
        <div className="panel" style={{ textAlign: 'center', padding: '48px 22px' }}>
          <FileText
            style={{
              width: 40,
              height: 40,
              color: 'var(--muted)',
              margin: '0 auto 12px',
            }}
          />
          <p style={{ color: 'var(--ink)', fontSize: 14, fontWeight: 500 }}>
            No templates match your current filters
          </p>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 6 }}>
            Try broadening your search or removing some filter criteria.
          </p>
        </div>
      )}

      {/* ─── Recommended Section ────────────────────────────────────────── */}
      {!loading && !error && recommended.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--deep)',
              padding: '0 4px',
            }}
          >
            Recommended for this stage
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: 12,
            }}
          >
            {recommended.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                isRecommended
              />
            ))}
          </div>
        </div>
      )}

      {/* ─── All Templates Grid ─────────────────────────────────────────── */}
      {!loading && !error && others.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {recommended.length > 0 && (
            <h2
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--muted)',
                padding: '0 4px',
              }}
            >
              All Templates
            </h2>
          )}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: 12,
            }}
          >
            {others.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                isRecommended={false}
              />
            ))}
          </div>
        </div>
      )}

      {/* ─── Pagination Controls ────────────────────────────────────────── */}
      {!loading && !error && totalPages > 1 && (
        <div
          className="panel"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            padding: '12px 18px',
          }}
        >
          <button
            className="btn btn-secondary"
            onClick={prevPage}
            disabled={currentPage <= 1}
            aria-label="Previous page"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              opacity: currentPage <= 1 ? 0.4 : 1,
              cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
            }}
          >
            <ChevronLeft style={{ width: 14, height: 14 }} />
            Prev
          </button>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>
            Page {currentPage} of {totalPages}
          </span>
          <button
            className="btn btn-secondary"
            onClick={nextPage}
            disabled={currentPage >= totalPages}
            aria-label="Next page"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              opacity: currentPage >= totalPages ? 0.4 : 1,
              cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
            }}
          >
            Next
            <ChevronRight style={{ width: 14, height: 14 }} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Template Card ────────────────────────────────────────────────────────────

interface TemplateCardProps {
  template: FormTemplate;
  isRecommended: boolean;
}

function TemplateCard({ template, isRecommended }: TemplateCardProps) {
  return (
    <div
      className="panel"
      style={{
        padding: '16px 18px',
        cursor: 'pointer',
        transition: 'box-shadow 0.15s ease, transform 0.15s ease',
        position: 'relative',
      }}
      role="button"
      tabIndex={0}
      aria-label={`Template: ${template.name}`}
    >
      {/* Recommended badge */}
      {isRecommended && (
        <span
          className="pill pill-success"
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            fontSize: 10,
          }}
        >
          Recommended
        </span>
      )}

      {/* Category icon + name */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{ fontSize: 22, lineHeight: 1 }}>
          {CATEGORY_ICONS[template.category]}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--ink)',
              margin: 0,
              lineHeight: 1.3,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {template.name}
          </p>
          <p
            style={{
              fontSize: 12,
              color: 'var(--muted)',
              margin: '4px 0 0',
            }}
          >
            {CATEGORY_LABELS[template.category]}
          </p>
        </div>
      </div>

      {/* Metadata row */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          marginTop: 12,
          flexWrap: 'wrap',
        }}
      >
        {template.municipalities.length > 0 && (
          <span
            style={{
              fontSize: 11,
              color: 'var(--muted)',
              background: 'rgba(16,32,51,.04)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '2px 8px',
            }}
          >
            {template.municipalities[0]}
            {template.municipalities.length > 1 &&
              ` +${template.municipalities.length - 1}`}
          </span>
        )}
        <span
          style={{
            fontSize: 11,
            color: 'var(--muted)',
            background: 'rgba(16,32,51,.04)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '2px 8px',
          }}
        >
          v{template.version}
        </span>
      </div>
    </div>
  );
}
