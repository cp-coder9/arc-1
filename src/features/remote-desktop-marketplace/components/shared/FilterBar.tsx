import React from 'react';
import { X } from 'lucide-react';
import { SOFTWARE_CATEGORIES, PRICE_RANGE_BRACKETS, SA_LOCATIONS } from '../../constants';
import type { PriceRangeBracket } from '../../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ActiveFilters {
  categories: string[];
  priceRange: PriceRangeBracket | null;
  locations: string[];
  minRating: number | null;
  availability: 'today' | 'this_week' | 'any' | null;
}

export interface FilterBarProps {
  filters: ActiveFilters;
  onFiltersChange: (filters: ActiveFilters) => void;
}

// ─── Rating Options ───────────────────────────────────────────────────────────

const RATING_OPTIONS = [
  { value: 3, label: '3+ Stars' },
  { value: 4, label: '4+ Stars' },
  { value: 4.5, label: '4.5+ Stars' },
];

const AVAILABILITY_OPTIONS = [
  { value: 'today' as const, label: 'Available Today' },
  { value: 'this_week' as const, label: 'This Week' },
  { value: 'any' as const, label: 'Any Time' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function FilterBar({ filters, onFiltersChange }: FilterBarProps) {
  const [openDropdown, setOpenDropdown] = React.useState<string | null>(null);

  const hasActiveFilters =
    filters.categories.length > 0 ||
    filters.priceRange !== null ||
    filters.locations.length > 0 ||
    filters.minRating !== null ||
    (filters.availability !== null && filters.availability !== 'any');

  const handleClearAll = () => {
    onFiltersChange({
      categories: [],
      priceRange: null,
      locations: [],
      minRating: null,
      availability: null,
    });
  };

  const toggleCategory = (category: string) => {
    const updated = filters.categories.includes(category)
      ? filters.categories.filter((c) => c !== category)
      : [...filters.categories, category];
    onFiltersChange({ ...filters, categories: updated });
  };

  const toggleLocation = (location: string) => {
    const updated = filters.locations.includes(location)
      ? filters.locations.filter((l) => l !== location)
      : [...filters.locations, location];
    onFiltersChange({ ...filters, locations: updated });
  };

  const setPriceRange = (bracket: PriceRangeBracket | null) => {
    onFiltersChange({ ...filters, priceRange: bracket });
  };

  const setMinRating = (rating: number | null) => {
    onFiltersChange({ ...filters, minRating: rating });
  };

  const setAvailability = (value: 'today' | 'this_week' | 'any' | null) => {
    onFiltersChange({ ...filters, availability: value });
  };

  const removeCategory = (category: string) => {
    onFiltersChange({
      ...filters,
      categories: filters.categories.filter((c) => c !== category),
    });
  };

  const removeLocation = (location: string) => {
    onFiltersChange({
      ...filters,
      locations: filters.locations.filter((l) => l !== location),
    });
  };

  const toggleDropdown = (name: string) => {
    setOpenDropdown(openDropdown === name ? null : name);
  };

  // ─── Active Filter Chips ──────────────────────────────────────────────────

  const activeChips: { label: string; onRemove: () => void }[] = [];

  filters.categories.forEach((cat) => {
    activeChips.push({ label: cat, onRemove: () => removeCategory(cat) });
  });

  if (filters.priceRange) {
    const bracket = PRICE_RANGE_BRACKETS.find((b) => b.bracket === filters.priceRange);
    activeChips.push({
      label: bracket?.label ?? filters.priceRange,
      onRemove: () => setPriceRange(null),
    });
  }

  filters.locations.forEach((loc) => {
    activeChips.push({ label: loc, onRemove: () => removeLocation(loc) });
  });

  if (filters.minRating !== null) {
    activeChips.push({
      label: `${filters.minRating}+ Stars`,
      onRemove: () => setMinRating(null),
    });
  }

  if (filters.availability && filters.availability !== 'any') {
    const option = AVAILABILITY_OPTIONS.find((o) => o.value === filters.availability);
    activeChips.push({
      label: option?.label ?? filters.availability,
      onRemove: () => setAvailability(null),
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Filter trigger buttons */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        {/* Software Category */}
        <div style={{ position: 'relative' }}>
          <button
            className="btn"
            onClick={() => toggleDropdown('categories')}
            style={{ fontSize: 13 }}
          >
            Software{filters.categories.length > 0 ? ` (${filters.categories.length})` : ''}
          </button>
          {openDropdown === 'categories' && (
            <DropdownPanel onClose={() => setOpenDropdown(null)}>
              {SOFTWARE_CATEGORIES.map((cat) => (
                <label key={cat} style={dropdownItemStyle}>
                  <input
                    type="checkbox"
                    checked={filters.categories.includes(cat)}
                    onChange={() => toggleCategory(cat)}
                    style={{ accentColor: 'var(--teal)' }}
                  />
                  <span style={{ color: 'var(--ink)', fontSize: 13 }}>{cat}</span>
                </label>
              ))}
            </DropdownPanel>
          )}
        </div>

        {/* Price Range */}
        <div style={{ position: 'relative' }}>
          <button
            className="btn"
            onClick={() => toggleDropdown('price')}
            style={{ fontSize: 13 }}
          >
            Price{filters.priceRange ? ' ✓' : ''}
          </button>
          {openDropdown === 'price' && (
            <DropdownPanel onClose={() => setOpenDropdown(null)}>
              <label style={dropdownItemStyle}>
                <input
                  type="radio"
                  name="priceRange"
                  checked={filters.priceRange === null}
                  onChange={() => setPriceRange(null)}
                  style={{ accentColor: 'var(--teal)' }}
                />
                <span style={{ color: 'var(--ink)', fontSize: 13 }}>Any</span>
              </label>
              {PRICE_RANGE_BRACKETS.map((bracket) => (
                <label key={bracket.bracket} style={dropdownItemStyle}>
                  <input
                    type="radio"
                    name="priceRange"
                    checked={filters.priceRange === bracket.bracket}
                    onChange={() => setPriceRange(bracket.bracket)}
                    style={{ accentColor: 'var(--teal)' }}
                  />
                  <span style={{ color: 'var(--ink)', fontSize: 13 }}>{bracket.label}</span>
                </label>
              ))}
            </DropdownPanel>
          )}
        </div>

        {/* Location */}
        <div style={{ position: 'relative' }}>
          <button
            className="btn"
            onClick={() => toggleDropdown('location')}
            style={{ fontSize: 13 }}
          >
            Location{filters.locations.length > 0 ? ` (${filters.locations.length})` : ''}
          </button>
          {openDropdown === 'location' && (
            <DropdownPanel onClose={() => setOpenDropdown(null)}>
              {SA_LOCATIONS.map((loc) => (
                <label key={loc} style={dropdownItemStyle}>
                  <input
                    type="checkbox"
                    checked={filters.locations.includes(loc)}
                    onChange={() => toggleLocation(loc)}
                    style={{ accentColor: 'var(--teal)' }}
                  />
                  <span style={{ color: 'var(--ink)', fontSize: 13 }}>{loc}</span>
                </label>
              ))}
            </DropdownPanel>
          )}
        </div>

        {/* Min Rating */}
        <div style={{ position: 'relative' }}>
          <button
            className="btn"
            onClick={() => toggleDropdown('rating')}
            style={{ fontSize: 13 }}
          >
            Rating{filters.minRating !== null ? ' ✓' : ''}
          </button>
          {openDropdown === 'rating' && (
            <DropdownPanel onClose={() => setOpenDropdown(null)}>
              <label style={dropdownItemStyle}>
                <input
                  type="radio"
                  name="minRating"
                  checked={filters.minRating === null}
                  onChange={() => setMinRating(null)}
                  style={{ accentColor: 'var(--teal)' }}
                />
                <span style={{ color: 'var(--ink)', fontSize: 13 }}>Any Rating</span>
              </label>
              {RATING_OPTIONS.map((opt) => (
                <label key={opt.value} style={dropdownItemStyle}>
                  <input
                    type="radio"
                    name="minRating"
                    checked={filters.minRating === opt.value}
                    onChange={() => setMinRating(opt.value)}
                    style={{ accentColor: 'var(--teal)' }}
                  />
                  <span style={{ color: 'var(--ink)', fontSize: 13 }}>{opt.label}</span>
                </label>
              ))}
            </DropdownPanel>
          )}
        </div>

        {/* Availability */}
        <div style={{ position: 'relative' }}>
          <button
            className="btn"
            onClick={() => toggleDropdown('availability')}
            style={{ fontSize: 13 }}
          >
            Availability{filters.availability && filters.availability !== 'any' ? ' ✓' : ''}
          </button>
          {openDropdown === 'availability' && (
            <DropdownPanel onClose={() => setOpenDropdown(null)}>
              {AVAILABILITY_OPTIONS.map((opt) => (
                <label key={opt.value} style={dropdownItemStyle}>
                  <input
                    type="radio"
                    name="availability"
                    checked={filters.availability === opt.value}
                    onChange={() => setAvailability(opt.value)}
                    style={{ accentColor: 'var(--teal)' }}
                  />
                  <span style={{ color: 'var(--ink)', fontSize: 13 }}>{opt.label}</span>
                </label>
              ))}
            </DropdownPanel>
          )}
        </div>

        {/* Clear All */}
        {hasActiveFilters && (
          <button
            className="btn"
            onClick={handleClearAll}
            style={{
              fontSize: 13,
              borderColor: 'var(--border)',
              background: 'rgba(255,255,255,.7)',
              color: 'var(--muted)',
            }}
          >
            Clear All Filters
          </button>
        )}
      </div>

      {/* Active filter chips */}
      {activeChips.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {activeChips.map((chip) => (
            <span
              key={chip.label}
              className="pill"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <span className="dot" />
              {chip.label}
              <button
                onClick={chip.onRemove}
                aria-label={`Remove filter: ${chip.label}`}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  color: 'var(--muted)',
                }}
              >
                <X size={14} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Dropdown Panel ───────────────────────────────────────────────────────────

function DropdownPanel({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        top: '100%',
        left: 0,
        marginTop: 4,
        minWidth: 200,
        maxHeight: 280,
        overflowY: 'auto',
        background: 'var(--white)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        boxShadow: 'var(--soft)',
        padding: 8,
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      {children}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const dropdownItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 8px',
  borderRadius: 6,
  cursor: 'pointer',
};

export default FilterBar;
