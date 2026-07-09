/**
 * MunicipalitySelector — Searchable municipality dropdown
 *
 * Provides a searchable dropdown that filters the municipality list (case-insensitive,
 * minimum 2 characters). Shows loading indicator while profile loads, error message
 * with retry on failure, and fallback profile notice when no matches found.
 *
 * Requirements: 1.1, 1.2, 1.4, 1.5, 1.6
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  listMunicipalities,
  filterMunicipalities,
  getFallbackInfo,
  type MunicipalityListItem,
} from '@/services/refuseArea/municipalityProfileService';

// ── Props ────────────────────────────────────────────────────────────────────

export interface MunicipalitySelectorProps {
  selectedId: string | null;
  loading: boolean;
  error: string | null;
  onSelect: (municipalityId: string) => void;
  onRetry: () => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function MunicipalitySelector({
  selectedId,
  loading,
  error,
  onSelect,
  onRetry,
}: MunicipalitySelectorProps) {
  const [searchText, setSearchText] = useState('');
  const [municipalities, setMunicipalities] = useState<MunicipalityListItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load municipality list on mount
  useEffect(() => {
    let cancelled = false;

    async function fetchList() {
      setListLoading(true);
      setListError(null);
      try {
        const list = await listMunicipalities();
        if (!cancelled) {
          setMunicipalities(list);
          setListLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setListError('Failed to load municipality list');
          setListLoading(false);
        }
      }
    }

    fetchList();
    return () => { cancelled = true; };
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Compute filtered results
  const filtered = filterMunicipalities(searchText, municipalities);
  const showDropdown = dropdownOpen && searchText.length >= 2;
  const noMatches = showDropdown && filtered.length === 0 && !listLoading;

  // Get fallback info for when no matches
  const fallback = getFallbackInfo();

  // Find selected municipality name for display
  const selectedName = municipalities.find((m) => m.id === selectedId)?.name ?? null;

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSearchText(e.target.value);
    setDropdownOpen(true);
  }

  function handleSelect(municipality: MunicipalityListItem) {
    onSelect(municipality.id);
    setSearchText(municipality.name);
    setDropdownOpen(false);
  }

  function handleUseFallback() {
    onSelect(fallback.profileId);
    setSearchText('Generic Fallback Profile');
    setDropdownOpen(false);
  }

  // ── Render: Loading state for profile ──────────────────────────────────────

  if (loading) {
    return (
      <div className="municipality-selector" ref={containerRef}>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--deep)', marginBottom: 6, display: 'block' }}>
          Municipality
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0' }}>
          <span className="loading-spinner" aria-label="Loading municipality profile" />
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>
            Loading municipality profile…
          </span>
        </div>
      </div>
    );
  }

  // ── Render: Error state for profile load ───────────────────────────────────

  if (error) {
    return (
      <div className="municipality-selector" ref={containerRef}>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--deep)', marginBottom: 6, display: 'block' }}>
          Municipality
        </label>
        <div style={{ padding: '10px 0' }}>
          <div style={{ fontSize: 13, color: 'var(--red)', marginBottom: 8 }}>
            {error}
          </div>
          <button
            className="btn"
            onClick={onRetry}
            style={{ fontSize: 12, padding: '6px 14px', height: 32 }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ── Render: Normal state ───────────────────────────────────────────────────

  return (
    <div className="municipality-selector" ref={containerRef} style={{ position: 'relative' }}>
      <label
        htmlFor="municipality-search"
        style={{ fontSize: 12, fontWeight: 600, color: 'var(--deep)', marginBottom: 6, display: 'block' }}
      >
        Municipality
      </label>

      {/* Selected municipality display */}
      {selectedName && !dropdownOpen && (
        <div style={{ fontSize: 13, color: 'var(--ink)', marginBottom: 6 }}>
          <span className="pill" style={{ fontSize: 12 }}>
            <span className="dot"></span> {selectedName}
          </span>
        </div>
      )}

      {/* Search input */}
      <input
        id="municipality-search"
        type="text"
        value={searchText}
        onChange={handleSearchChange}
        onFocus={() => { if (searchText.length >= 2) setDropdownOpen(true); }}
        placeholder={listLoading ? 'Loading municipalities…' : 'Search municipality (min 2 characters)'}
        disabled={listLoading}
        autoComplete="off"
        style={{
          width: '100%',
          padding: '8px 12px',
          fontSize: 13,
          border: '1px solid var(--border)',
          borderRadius: 8,
          background: 'rgba(255,255,255,.7)',
          color: 'var(--ink)',
          outline: 'none',
          fontFamily: 'var(--font)',
        }}
      />

      {/* List loading error */}
      {listError && (
        <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 6 }}>
          {listError}
        </div>
      )}

      {/* Dropdown results */}
      {showDropdown && filtered.length > 0 && (
        <ul
          role="listbox"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 100,
            maxHeight: 200,
            overflowY: 'auto',
            background: '#fff',
            border: '1px solid var(--border)',
            borderRadius: 8,
            boxShadow: 'var(--soft)',
            listStyle: 'none',
            padding: 4,
            margin: '4px 0 0 0',
          }}
        >
          {filtered.map((m) => (
            <li
              key={m.id}
              role="option"
              aria-selected={m.id === selectedId}
              onClick={() => handleSelect(m)}
              style={{
                padding: '8px 12px',
                fontSize: 13,
                cursor: 'pointer',
                borderRadius: 6,
                color: 'var(--ink)',
                background: m.id === selectedId ? 'var(--aqua)' : 'transparent',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--aqua)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = m.id === selectedId ? 'var(--aqua)' : 'transparent'; }}
            >
              {m.name}
            </li>
          ))}
        </ul>
      )}

      {/* No matches — show fallback option */}
      {noMatches && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 100,
            background: '#fff',
            border: '1px solid var(--border)',
            borderRadius: 8,
            boxShadow: 'var(--soft)',
            padding: 12,
            margin: '4px 0 0 0',
          }}
        >
          <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
            No municipalities match your search.
          </p>
          <p style={{ fontSize: 12, color: 'var(--amber)', marginBottom: 8 }}>
            {fallback.notice}
          </p>
          <button
            className="btn-secondary"
            onClick={handleUseFallback}
            style={{
              fontSize: 12,
              padding: '6px 14px',
              height: 32,
              border: '1px solid var(--border)',
              borderRadius: 8,
              background: 'rgba(255,255,255,.7)',
              color: 'var(--ink)',
              cursor: 'pointer',
              fontFamily: 'var(--font)',
            }}
          >
            Use Generic Fallback Profile
          </button>
        </div>
      )}
    </div>
  );
}
