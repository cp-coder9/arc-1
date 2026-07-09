import React from 'react';
import type { CatalogueSortOption } from '../../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SortSelectorProps {
  value: CatalogueSortOption;
  onChange: (sort: CatalogueSortOption) => void;
}

// ─── Sort Option Definitions ──────────────────────────────────────────────────

const SORT_OPTIONS: { value: CatalogueSortOption; label: string }[] = [
  { value: 'availability_asc', label: 'Soonest Available' },
  { value: 'price_asc', label: 'Price: Low → High' },
  { value: 'price_desc', label: 'Price: High → Low' },
  { value: 'rating_desc', label: 'Highest Rated' },
  { value: 'newest_desc', label: 'Newest Listed' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function SortSelector({ value, onChange }: SortSelectorProps) {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange(e.target.value as CatalogueSortOption);
  };

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <label
        htmlFor="marketplace-sort"
        style={{ fontSize: 13, color: 'var(--muted)', whiteSpace: 'nowrap' }}
      >
        Sort by
      </label>
      <select
        id="marketplace-sort"
        value={value}
        onChange={handleChange}
        className="btn"
        style={{
          fontSize: 13,
          appearance: 'none',
          paddingRight: 28,
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23657287' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 10px center',
          cursor: 'pointer',
        }}
      >
        {SORT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export default SortSelector;
